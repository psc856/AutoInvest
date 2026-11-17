"""Local FastAPI bridge for Kite Connect. Never returns access tokens to clients."""

import json
import csv
import io
import os
import re
import time
import asyncio
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import RLock, Thread
from typing import Any
from zoneinfo import ZoneInfo
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from kiteconnect import KiteConnect
from kiteconnect import KiteTicker
from pydantic import BaseModel, Field, model_validator

load_dotenv()
# Some managed local runtimes inject this unreachable proxy sentinel. Remove only
# that placeholder so Kite and Nifty requests can use a direct connection.
for _proxy_name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
    _proxy_value = os.environ.get(_proxy_name, "")
    try:
        _proxy_url = urlparse(_proxy_value)
        if _proxy_url.hostname in {"127.0.0.1", "localhost", "::1"} and _proxy_url.port == 9:
            os.environ.pop(_proxy_name, None)
    except ValueError:
        pass

app = FastAPI(
    title="Kite Console API",
    version="1.0.0",
    docs_url="/documentation",
    redoc_url="/redoc",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

TOKEN_FILE = Path(__file__).resolve().parent.parent / ".token_store.json"
_lock = RLock()
_kite: KiteConnect | None = None
_instruments: list[dict[str, Any]] | None = None
_scanner_cache: dict[str, Any] | None = None
_scanner_cache_at = 0.0
_scanner_cache_lock = RLock()


class LoginPayload(BaseModel):
    api_key: str = Field(min_length=1, max_length=128)
    api_secret: str = Field(min_length=1, max_length=256)
    request_token: str = Field(min_length=1, max_length=512)


class SignalRequest(BaseModel):
    short_sma: int = Field(default=6, ge=2, le=200)
    long_sma: int = Field(default=30, ge=3, le=300)
    lookback_days: int = Field(default=30, ge=1, le=365)
    max_stocks: int = Field(default=25, ge=1, le=100)

    @model_validator(mode="after")
    def validate_periods(self):
        if self.short_sma >= self.long_sma:
            raise ValueError("Short SMA must be smaller than Long SMA.")
        return self


def _load_saved_session() -> None:
    """Restore a local session between backend restarts; never expose its token."""
    global _kite
    try:
        saved = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
        if saved.get("api_key") and saved.get("access_token"):
            client = KiteConnect(api_key=saved["api_key"])
            client.set_access_token(saved["access_token"])
            _kite = client
    except (OSError, ValueError, KeyError):
        _kite = None


_load_saved_session()


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/auth/status")
def auth_status() -> dict[str, bool]:
    return {"authenticated": _kite is not None}


@app.post("/api/auth/login")
def login(payload: LoginPayload) -> dict[str, bool]:
    global _kite
    with _lock:
        try:
            client = KiteConnect(api_key=payload.api_key.strip())
            session = client.generate_session(
                payload.request_token.strip(), api_secret=payload.api_secret.strip()
            )
            access_token = session.get("access_token")
            if not access_token:
                raise ValueError("Kite did not return an access token.")
            client.set_access_token(access_token)
            TOKEN_FILE.write_text(
                json.dumps({"api_key": payload.api_key.strip(), "access_token": access_token}),
                encoding="utf-8",
            )
            try:
                TOKEN_FILE.chmod(0o600)
            except OSError:
                pass  # Windows does not support POSIX file permissions.
            _kite = client
        except Exception as exc:
            # Show the SDK's useful failure reason while redacting every submitted credential.
            message = str(getattr(exc, "message", str(exc)) or exc)
            for secret_value in (payload.api_key.strip(), payload.api_secret.strip(), payload.request_token.strip()):
                if secret_value:
                    message = message.replace(secret_value, "[redacted]")
            message = re.sub(r"\s+", " ", message).strip()[:320]
            exception_name = type(exc).__name__
            raise HTTPException(
                status_code=400,
                detail=f"Kite login failed ({exception_name}): {message or 'Unknown Kite Connect error.'}",
            ) from exc
    return {"authenticated": True}


@app.get("/api/user/profile")
def user_profile() -> dict[str, Any]:
    if _kite is None:
        raise HTTPException(status_code=401, detail="Please log in to Kite Connect first.")
    try:
        profile = _kite.profile()
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Could not load your profile. Your session may have expired.") from exc
    return {
        "user_name": profile.get("user_name", "—"),
        "user_id": profile.get("user_id", "—"),
        "products": profile.get("products", []),
        "exchanges": profile.get("exchanges", []),
        "email": profile.get("email", ""),
        "broker": profile.get("broker", "Zerodha"),
    }


@app.post("/api/auth/logout")
def logout() -> dict[str, bool]:
    """Forget the local token so the next visit returns to the login screen."""
    global _kite
    with _lock:
        _kite = None
        try:
            TOKEN_FILE.unlink(missing_ok=True)
        except OSError as exc:
            raise HTTPException(status_code=500, detail="Could not clear the local session file.") from exc
    return {"authenticated": False}


NIFTY_100_CSV = "https://www.niftyindices.com/IndexConstituent/ind_nifty100list.csv"
NIFTY_50_CSV = "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"


def _nifty_constituents() -> list[dict[str, str]]:
    """Read the live constituent list published by NSE Indices."""
    try:
        response = requests.get(
            NIFTY_100_CSV,
            headers={"User-Agent": "Mozilla/5.0 (compatible; KiteConsole/1.0)"},
            timeout=20,
        )
        response.raise_for_status()
        reader = csv.DictReader(io.StringIO(response.content.decode("utf-8-sig")))
        rows = []
        for row in reader:
            normalized = {str(key or "").strip().lower(): str(value or "").strip() for key, value in row.items()}
            symbol = normalized.get("symbol")
            company = normalized.get("company name") or normalized.get("companyname") or normalized.get("name")
            if symbol:
                rows.append({"symbol": symbol, "company": company or symbol})
        if not rows:
            raise ValueError("The official constituent CSV contained no symbols.")
        return rows
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not load the Nifty 100 constituent CSV from Nifty Indices.") from exc


def _read_index_csv(url: str, display_name: str) -> list[dict[str, str]]:
    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; KiteConsole/1.0)"}, timeout=20)
        response.raise_for_status()
        reader = csv.DictReader(io.StringIO(response.content.decode("utf-8-sig")))
        result = []
        for row in reader:
            normalized = {str(key or "").strip().lower(): str(value or "").strip() for key, value in row.items()}
            symbol = normalized.get("symbol")
            company = normalized.get("company name") or normalized.get("companyname") or normalized.get("name")
            if symbol:
                result.append({"symbol": symbol, "company": company or symbol})
        if not result:
            raise ValueError("No constituents found")
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not load the official {display_name} constituent CSV.") from exc


def _get_nse_instruments(client: KiteConnect) -> list[dict[str, Any]]:
    global _instruments
    if _instruments is None:
        try:
            _instruments = client.instruments("NSE")
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Could not load NSE instruments from Kite Connect.") from exc
    return _instruments


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(str(value)).date()


@app.get("/api/scanner-data")
def scanner_data() -> dict[str, Any]:
    """Build and cache the daily candles and instrument metadata used by Algo Signals."""
    global _scanner_cache, _scanner_cache_at
    if _kite is None:
        raise HTTPException(status_code=401, detail="Please log in to Kite Connect first.")
    with _scanner_cache_lock:
        if _scanner_cache and time.monotonic() - _scanner_cache_at < 900:
            return _scanner_cache

        nifty100 = _read_index_csv(NIFTY_100_CSV, "Nifty 100")
        nifty50_symbols = {item["symbol"] for item in _read_index_csv(NIFTY_50_CSV, "Nifty 50")}
        instruments = _get_nse_instruments(_kite)
        token_by_symbol = {
            item.get("tradingsymbol"): item
            for item in instruments
            if item.get("exchange") == "NSE" and item.get("tradingsymbol") and item.get("instrument_token")
        }
        today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
        start = today - timedelta(days=150)
        stocks: list[dict[str, Any]] = []
        missing: list[str] = []
        for member in nifty100:
            instrument = token_by_symbol.get(member["symbol"])
            if not instrument:
                missing.append(member["symbol"])
                continue
            try:
                history = _kite.historical_data(instrument["instrument_token"], start, today, "day", continuous=False, oi=False)
                candles = [{
                    "date": _as_date(candle["date"]).isoformat(),
                    "open": float(candle["open"]),
                    "high": float(candle["high"]),
                    "low": float(candle["low"]),
                    "close": float(candle["close"]),
                    "volume": float(candle["volume"]),
                } for candle in history]
                if not candles:
                    missing.append(member["symbol"])
                    continue
                stocks.append({
                    "symbol": member["symbol"],
                    "companyName": member["company"],
                    "instrument_token": int(instrument["instrument_token"]),
                    "nifty50": member["symbol"] in nifty50_symbols,
                    "nifty100": True,
                    "niftyFlags": (["Nifty 50"] if member["symbol"] in nifty50_symbols else []) + ["Nifty 100"],
                    "candles": candles,
                })
            except Exception:
                missing.append(member["symbol"])
            time.sleep(0.35)

        if not stocks:
            raise HTTPException(status_code=502, detail="Kite did not return daily candles for the Nifty 100 universe.")
        _scanner_cache = {
            "metadata": {
                "index": "Nifty 100",
                "source": NIFTY_100_CSV,
                "asOf": today.isoformat(),
                "cachedAt": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds"),
                "stockCount": len(stocks),
                "missingSymbols": missing,
            },
            "stocks": stocks,
        }
        _scanner_cache_at = time.monotonic()
        return _scanner_cache


@app.get("/api/scanner-ohlc")
def scanner_ohlc(tokens: str = Query(min_length=1, max_length=5000)) -> dict[str, Any]:
    if _kite is None:
        raise HTTPException(status_code=401, detail="Please log in to Kite Connect first.")
    requested = {int(value) for value in tokens.split(",") if value.strip().isdigit()}
    instruments = _get_nse_instruments(_kite)
    symbols = [f"NSE:{item['tradingsymbol']}" for item in instruments if item.get("instrument_token") in requested]
    try:
        quotes = _kite.quote(symbols) if symbols else {}
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not load the Kite OHLC price snapshot.") from exc
    return {"prices": {str(value.get("instrument_token")): value.get("last_price") for value in quotes.values() if value.get("instrument_token") is not None and value.get("last_price") is not None}}


@app.websocket("/ws/ticks")
async def live_ticks(websocket: WebSocket, tokens: str = Query(min_length=1), mode: str = "full") -> None:
    await websocket.accept()
    if _kite is None:
        await websocket.send_json({"type": "status", "status": "unauthenticated"})
        await websocket.close(code=4401)
        return
    token_list = sorted({int(value) for value in tokens.split(",") if value.strip().isdigit()})
    if not token_list or len(token_list) > 100:
        await websocket.send_json({"type": "status", "status": "invalid subscription"})
        await websocket.close(code=4400)
        return

    loop = asyncio.get_running_loop()
    messages: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    ticker = KiteTicker(_kite.api_key, _kite.access_token)
    ticker.on_connect = lambda ws, response: (ws.subscribe(token_list), ws.set_mode(ws.MODE_FULL if mode == "full" else ws.MODE_LTP, token_list), loop.call_soon_threadsafe(messages.put_nowait, {"type": "status", "status": "connected"}))
    ticker.on_ticks = lambda ws, ticks: loop.call_soon_threadsafe(messages.put_nowait, {"type": "ticks", "ticks": [{"instrument_token": tick.get("instrument_token"), "last_price": tick.get("last_price")} for tick in ticks]})
    ticker.on_close = lambda ws, code, reason: loop.call_soon_threadsafe(messages.put_nowait, {"type": "status", "status": "disconnected"})
    ticker.on_error = lambda ws, code, reason: loop.call_soon_threadsafe(messages.put_nowait, {"type": "status", "status": "reconnecting"})
    Thread(target=lambda: ticker.connect(threaded=False), daemon=True).start()
    await websocket.send_json({"type": "status", "status": "connecting"})
    try:
        while True:
            await websocket.send_json(await messages.get())
    except WebSocketDisconnect:
        pass
    finally:
        try:
            ticker.close()
        except Exception:
            pass


@app.post("/api/signals")
def generate_signals(payload: SignalRequest) -> dict[str, Any]:
    """Scan the current Nifty 100 universe for the latest daily SMA crossovers."""
    if _kite is None:
        raise HTTPException(status_code=401, detail="Please log in to Kite Connect first.")

    constituents = _nifty_constituents()
    instruments = _get_nse_instruments(_kite)
    token_by_symbol = {
        item.get("tradingsymbol"): item.get("instrument_token")
        for item in instruments
        if item.get("exchange") == "NSE" and item.get("tradingsymbol") and item.get("instrument_token")
    }
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    from_date = today - timedelta(days=payload.lookback_days + payload.long_sma * 2 + 14)
    earliest_signal = today - timedelta(days=payload.lookback_days)
    signals: list[dict[str, Any]] = []
    scanned = 0
    skipped = 0

    for stock in constituents:
        token = token_by_symbol.get(stock["symbol"])
        if not token:
            skipped += 1
            continue
        try:
            candles = _kite.historical_data(token, from_date, today, "day", continuous=False, oi=False)
            # Ignore today's incomplete daily candle so signals are based on closed sessions.
            candles = [c for c in candles if _as_date(c["date"]) < today]
            scanned += 1
        except Exception:
            skipped += 1
            time.sleep(0.35)
            continue

        closes = [float(c["close"]) for c in candles]
        latest_signal = None
        for index in range(payload.long_sma, len(candles)):
            signal_date = _as_date(candles[index]["date"])
            if signal_date < earliest_signal:
                continue
            short_now = sum(closes[index - payload.short_sma + 1:index + 1]) / payload.short_sma
            long_now = sum(closes[index - payload.long_sma + 1:index + 1]) / payload.long_sma
            short_before = sum(closes[index - payload.short_sma:index]) / payload.short_sma
            long_before = sum(closes[index - payload.long_sma:index]) / payload.long_sma
            direction = None
            if short_before <= long_before and short_now > long_now:
                direction = "Bullish"
            elif short_before >= long_before and short_now < long_now:
                direction = "Bearish"
            if direction:
                latest_signal = {
                    "ticker": stock["symbol"],
                    "company": stock["company"],
                    "crossover_type": direction,
                    "crossover_date": signal_date.isoformat(),
                    "close": round(closes[index], 2),
                    "short_sma": round(short_now, 2),
                    "long_sma": round(long_now, 2),
                    "_date": signal_date,
                }
        if latest_signal:
            signals.append(latest_signal)
        # Kite API permits only a few historical requests per second.
        time.sleep(0.35)

    signals.sort(key=lambda item: (item["_date"], item["ticker"]), reverse=True)
    results = [{key: value for key, value in item.items() if key != "_date"} for item in signals[:payload.max_stocks]]
    return {
        "results": results,
        "total_signals": len(signals),
        "scanned": scanned,
        "skipped": skipped,
        "as_of": today.isoformat(),
        "short_sma": payload.short_sma,
        "long_sma": payload.long_sma,
        "lookback_days": payload.lookback_days,
    }
