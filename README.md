# Kite Console

A glass-style React dashboard with switchable dark and light themes and a FastAPI bridge to Zerodha Kite Connect. Enter your API key, API secret, and request token. The backend exchanges the request token for an access token and never returns it to the frontend. Local development saves the session in an ignored file; Vercel uses Upstash Redis with the access token encrypted at rest.

The Signals tab loads the current Nifty 100 members from the [official NSE Indices constituent CSV](https://www.niftyindices.com/IndexConstituent/ind_nifty100list.csv), maps each symbol to Kite's NSE instrument list, and scans daily candles for bullish and bearish crossovers. It uses closed daily candles and ranks the newest crossovers first. A full scan checks the whole current index and can take around 35 seconds due to Kite historical-data request pacing; **Max stocks** controls how many matching signals are shown.

## Requirements

- Node.js 18 or newer and npm
- Python 3.10 or newer
- A Zerodha account and Kite Connect app (API key and API secret)

## Run locally

Open two terminals in the project folder.

### 1. Start FastAPI

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks virtual environment activation, run `.venv\Scripts\python.exe -m pip install -r requirements.txt`, then start the API with `.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000`.

### 2. Start the frontend

```powershell
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite server connects to FastAPI at `http://localhost:8000`. To use another backend URL, set `VITE_API_URL` in a local `.env` file before starting Vite.

## Connect your Kite account

1. Sign in to Kite Connect on the device where your Kite app is configured and copy the `request_token` value from the redirect URL.
2. Paste the short-lived request token into Kite Console on this device with your API key and API secret, then select **Connect to Kite**.
3. The backend exchanges the token and the dashboard opens to your User profile. It fetches your name, user ID, products, and exchanges through the backend profile endpoint.

Kite request tokens expire within minutes, so paste and submit one soon after generating it on the other device. The generated access token is valid for the trading day; after it expires, generate a fresh request token and repeat the manual paste. See the [Kite Connect login flow](https://kite.trade/docs/connect/v3/user/) for the official steps.

## Local session and customization

- Locally, FastAPI stores the current API key and access token in `.token_store.json` in the project root. That file is excluded by `.gitignore`; keep it private and never commit it. The API secret and request token are not saved. On Vercel, connect Upstash Redis to the backend project and set `KITE_TOKEN_ENCRYPTION_KEY`; the access token is encrypted before storage.
- On backend startup, the saved token is restored so restarting Vite, refreshing the page, or changing frontend code does not require another Kite login. Use **Sign out** in the sidebar to clear the saved session. A session may still expire according to Kite's token policy.
- The browser sends the API key, API secret, and pasted request token to the local backend for the exchange. The access token is never returned to the browser.
- The API binds to `127.0.0.1` in the commands above and accepts browser requests from the local Vite development URL. Keep it local; this sample does not include user authentication or production deployment controls.
- Main design tokens and responsive styles live in `src/styles.css`; dashboard structure and tabs live in `src/App.jsx`.

## API routes

- `GET /api/health` — local API health
- `GET /api/auth/status` — reports whether a saved session is present
- `POST /api/auth/login` — exchanges the request token and persists the access token; returns only an authenticated flag
- `POST /api/auth/logout` — clears the local session
- `GET /api/user/profile` — fetches the current Kite profile
- `POST /api/signals` — reads current Nifty 100 constituents and returns SMA crossovers. JSON fields: `short_sma` (default 6), `long_sma` (default 30), `lookback_days` (default 30), and `max_stocks` (default 25).
- `GET /api/scanner-data` — caches Nifty 100 metadata and 150 calendar days of daily candles for the Algo Signals scanner (15-minute cache).
- `GET /api/scanner-ohlc?tokens=...` — returns an OHLC last-price snapshot for currently triggered stocks.
- `WS /ws/ticks?tokens=...&mode=full` — streams live Kite ticks for the currently triggered stocks only.
