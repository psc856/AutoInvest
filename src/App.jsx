import { useCallback, useEffect, useState } from 'react'
import { Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, BarChart3, Check, CircleHelp, Command, Fingerprint, KeyRound, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Moon, Radio, RefreshCw, ScanLine, ShieldCheck, SlidersHorizontal, Sun, UserRound } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options) {
  const response = await fetch(`${API}${path}`, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Something went wrong. Please try again.')
  return data
}

function extractRequestToken(input) {
  const value = input.trim()
  if (!value.includes('request_token=')) return value
  try {
    const url = new URL(value)
    return url.searchParams.get('request_token') || value
  } catch {
    const query = value.slice(value.indexOf('request_token=')).split('#')[0]
    return new URLSearchParams(query).get('request_token') || value
  }
}

function Brand({ compact = false }) {
  return <div className="brand"><div className="brand-mark"><Activity size={19} strokeWidth={2.4} /></div>{!compact && <span>Kite<span className="brand-light">Console</span></span>}</div>
}

function ThemeToggle({ theme, onToggle }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return <button type="button" className="theme-toggle" onClick={onToggle} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}<span>{nextTheme}</span></button>
}

function Login({ onLogin, busy, error, theme, onThemeToggle }) {
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [requestToken, setRequestToken] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const submit = (e) => { e.preventDefault(); onLogin({ api_key: apiKey, api_secret: apiSecret, request_token: extractRequestToken(requestToken) }) }

  return <main className="login-page">
    <div className="login-top"><Brand /><div className="login-top-actions"><span className="secure-note"><LockKeyhole size={13} /> PRIVATE LOCAL SESSION</span><ThemeToggle theme={theme} onToggle={onThemeToggle} /></div></div>
    <div className="login-layout">
      <section className="login-copy">
        <div className="eyebrow"><span className="live-dot" /> YOUR TRADING WORKSPACE</div>
        <h1>A clearer view<br />of your <span>markets.</span></h1>
        <p>Sign in to Kite on your other device, then paste the request token here. Your access token stays on this app’s backend.</p>
        <div className="trust-row"><div className="trust-icon"><ShieldCheck size={17} /></div><div><strong>Built for your privacy</strong><small>Secure local connection to Kite Connect</small></div></div>
        <div className="decoration-grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      </section>
      <section className="login-card">
        <div className="card-heading"><div className="card-icon"><KeyRound size={19} /></div><div><h2>Connect your account</h2><p>Enter your Kite Connect credentials</p></div></div>
        <form onSubmit={submit}>
          <label htmlFor="api-key">API key</label><div className="input-wrap"><Command size={16} /><input id="api-key" autoComplete="off" placeholder="Your Kite Connect API key" value={apiKey} onChange={e => setApiKey(e.target.value)} required /></div>
          <label htmlFor="api-secret">API secret</label><div className="input-wrap"><Fingerprint size={16} /><input id="api-secret" type={showSecret ? 'text' : 'password'} autoComplete="new-password" placeholder="Your API secret" value={apiSecret} onChange={e => setApiSecret(e.target.value)} required /><button className="input-action" type="button" onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Show'}</button></div>
          <div className="label-line"><label htmlFor="request-token">Request token</label><a href="https://kite.trade/docs/connect/v3/user/" target="_blank" rel="noreferrer">Where to find it</a></div><div className="input-wrap"><LockKeyhole size={16} /><input id="request-token" autoComplete="off" placeholder="Paste token or the full callback URL" value={requestToken} onChange={e => setRequestToken(e.target.value)} required /></div><small className="token-hint">Use the same API key and secret that created this token. You can paste the full callback URL too.</small>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button login-button" type="submit" disabled={busy || !apiKey.trim() || !apiSecret.trim() || !requestToken.trim()}>{busy ? <><LoaderCircle size={17} className="spin" /> Connecting securely…</> : <>Connect to Kite <ArrowRight size={17} /></>}</button>
        </form>
        <div className="privacy-note"><ShieldCheck size={15} /><span>Your API secret and request token are sent to the backend for this exchange and are never saved.</span></div>
        <div className="redirect-note"><span>Using another device?</span><small>Sign in to Kite there, copy its request_token value, then paste it above. Request tokens are short-lived, so connect soon after generating one.</small></div>
      </section>
    </div>
    <div className="login-footer"><span>© {new Date().getFullYear()} Kite Console</span><span><span className="footer-dot" /> Local connection active</span></div>
  </main>
}

function Dashboard({ onLogout, theme, onThemeToggle }) {
  const [tab, setTab] = useState('User')
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadProfile = useCallback(async () => {
    setLoading(true); setError('')
    try { setProfile(await request('/api/user/profile')) } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { loadProfile() }, [loadProfile])
  const tabs = [{ name: 'Overview', icon: LayoutDashboard }, { name: 'User', icon: UserRound }, { name: 'Signals', icon: Radio }, { name: 'Algo Signals', icon: ScanLine }, { name: 'Activity', icon: BarChart3 }]

  return <div className="dashboard-shell">
    <aside className="sidebar"><Brand /><div className="side-section-label">WORKSPACE</div><nav>{tabs.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${tab === name ? 'active' : ''}`} onClick={() => setTab(name)}><Icon size={17} /><span>{name}</span>{name === 'User' && <span className="nav-indicator" />}</button>)}</nav><div className="sidebar-bottom"><div className="help-link"><CircleHelp size={16} /><span>Need a hand?</span><ArrowUpRight size={14} /></div><div className="sidebar-user"><div className="avatar">{profile?.user_name?.slice(0, 1) || 'K'}</div><div className="side-user-name"><strong>{profile?.user_name || 'Kite account'}</strong><small>{profile?.user_id || 'Connected workspace'}</small></div><button className="icon-button" aria-label="Sign out" onClick={onLogout}><LogOut size={16} /></button></div></div></aside>
    <main className="dashboard-main"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{tab}</strong></div><div className="top-actions"><div className="connection-pill"><span className="live-dot" /> Connected</div><ThemeToggle theme={theme} onToggle={onThemeToggle} /><button className="icon-button top-avatar" title="Account"><UserRound size={17} /></button></div></header>
      <div className="content-area"><div className="page-title-row"><div><div className="eyebrow page-eyebrow">{tab === 'Signals' ? 'MARKET SCANNER' : tab === 'Algo Signals' ? 'ALGO SIGNALS' : 'ACCOUNT MANAGEMENT'}</div><h1>{tab === 'User' ? 'Your profile' : tab === 'Algo Signals' ? 'High-volume breakout and retest setups' : tab}</h1><p>{tab === 'User' ? 'Your Zerodha account details and permissions.' : tab === 'Overview' ? 'Your connected trading workspace at a glance.' : tab === 'Signals' ? 'Find recent moving average crossovers across Nifty 100.' : tab === 'Algo Signals' ? 'Daily volume breakouts that return to retest the breakout midpoint.' : 'Recent account activity will appear here.'}</p></div>{tab === 'User' && <button className="secondary-button" onClick={loadProfile} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>}</div>
        {tab === 'User' ? <>
          <div className="profile-banner"><div className="banner-glow" /><div className="banner-main"><div className="profile-avatar">{profile?.user_name?.slice(0, 1) || <UserRound size={25} />}</div><div><span className="banner-overline">ZERODHA ACCOUNT</span><h2>{loading ? 'Loading profile…' : profile?.user_name || 'Account profile'}</h2><span className="account-id">{profile?.user_id ? `User ID · ${profile.user_id}` : 'Your connected account'}</span></div></div><div className="verified-badge"><BadgeCheck size={15} /> Verified connection</div></div>
          {error ? <div className="error-panel"><div><strong>We couldn’t load your profile</strong><p>{error}</p></div><button className="secondary-button" onClick={loadProfile}><RefreshCw size={15} /> Try again</button></div> : <div className="profile-grid">
            <section className="info-card identity-card"><div className="section-title"><div className="section-icon"><UserRound size={17} /></div><div><h3>Account details</h3><p>Identity linked to this session</p></div></div><div className="details-list"><Detail label="Full name" value={profile?.user_name} loading={loading} /><Detail label="User ID" value={profile?.user_id} mono loading={loading} /><Detail label="Email address" value={profile?.email} loading={loading} /></div></section>
            <section className="info-card"><div className="section-title"><div className="section-icon green"><ArrowDownLeft size={17} /></div><div><h3>Products</h3><p>Products enabled for your account</p></div></div><ChipList values={profile?.products} loading={loading} empty="No products available" /></section>
            <section className="info-card exchanges-card"><div className="section-title"><div className="section-icon violet"><BarChart3 size={17} /></div><div><h3>Exchanges</h3><p>Markets available to your account</p></div></div><ChipList values={profile?.exchanges} loading={loading} empty="No exchanges available" /></section>
          </div>}
          <div className="security-callout"><div className="security-check"><Check size={15} /></div><div><strong>Your session is stored locally</strong><p>Kite access tokens are kept on the backend and are never sent to your browser.</p></div><LockKeyhole className="callout-lock" size={17} /></div>
        </> : tab === 'Signals' ? <SignalsPanel /> : tab === 'Algo Signals' ? <AlgoSignalsPanel /> : <section className="empty-state"><div className="empty-icon">{tab === 'Overview' ? <BarChart3 size={24} /> : <Activity size={24} />}</div><h2>{tab === 'Overview' ? 'Your workspace is ready' : 'No activity yet'}</h2><p>{tab === 'Overview' ? 'Your account is connected. Your profile and permissions are available in the User tab.' : 'This space is ready for account activity and updates.'}</p><button className="secondary-button" onClick={() => setTab('User')}>View your profile <ArrowRight size={15} /></button></section>}
      </div><footer className="dashboard-footer"><span>Kite Console <span className="footer-sep">·</span> Private workspace</span><span><span className="live-dot" /> API connection healthy</span></footer>
    </main>
  </div>
}

function SignalsPanel() {
  const [settings, setSettings] = useState({ short_sma: 6, long_sma: 30, lookback_days: 30, max_stocks: 25 })
  const [payload, setPayload] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (key) => (event) => setSettings(current => ({ ...current, [key]: Number(event.target.value) }))
  const generate = async (event) => {
    event.preventDefault()
    if (settings.short_sma >= settings.long_sma) { setError('Short SMA must be smaller than Long SMA.'); return }
    setBusy(true); setError('')
    try {
      const data = await request('/api/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      setPayload(data)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const money = (value) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  const dateLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const fields = [
    { key: 'short_sma', label: 'Short SMA', min: 2, max: 200, unit: 'sessions' },
    { key: 'long_sma', label: 'Long SMA', min: 3, max: 300, unit: 'sessions' },
    { key: 'lookback_days', label: 'Lookback days', min: 1, max: 365, unit: 'days' },
    { key: 'max_stocks', label: 'Max stocks', min: 1, max: 100, unit: 'stocks' },
  ]
  return <div className="signals-page">
    <section className="scanner-card">
      <div className="scanner-card-head"><div className="scanner-icon"><SlidersHorizontal size={17} /></div><div><h2>Scanner settings</h2><p>Choose the moving average periods and signal window</p></div></div>
      <form onSubmit={generate}>
        <div className="scanner-fields">{fields.map(field => <label className="scanner-field" key={field.key}><span>{field.label}</span><div className="number-control"><input type="number" min={field.min} max={field.max} value={settings[field.key]} onChange={update(field.key)} required /><span>{field.unit}</span></div></label>)}</div>
        <div className="scanner-actions"><span className="scanner-hint"><span className="live-dot" /> Scans the current Nifty 100 constituents</span><button className="primary-button generate-button" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={16} className="spin" /> Scanning stocks…</> : <><Radio size={16} /> Generate signals</>}</button></div>
      </form>
      {error && <div className="form-error scanner-error" role="alert">{error}</div>}
    </section>
    <div className="signals-results-head"><div><h2>{payload ? 'Crossover signals' : 'Signal results'}</h2><p>{payload ? `Ranked by most recent crossover · ${payload.scanned} stocks scanned` : 'Bullish and bearish crossovers will appear here.'}</p></div>{payload && <div className="result-count"><strong>{payload.results.length}</strong><span>of {payload.total_signals} signals</span></div>}</div>
    {payload?.results?.length ? <div className="signals-table-wrap"><table className="signals-table"><thead><tr><th>Rank</th><th>Ticker</th><th>Company</th><th>Crossover type</th><th>Crossover date</th><th className="numeric">Close</th><th className="numeric">SMA {payload.short_sma}</th><th className="numeric">SMA {payload.long_sma}</th></tr></thead><tbody>{payload.results.map((row, index) => <tr key={`${row.ticker}-${row.crossover_date}`}><td><span className="rank-pill">{String(index + 1).padStart(2, '0')}</span></td><td><strong className="ticker-cell">{row.ticker}</strong></td><td className="company-cell">{row.company}</td><td><span className={`signal-type ${row.crossover_type.toLowerCase()}`}><span />{row.crossover_type}</span></td><td className="date-cell">{dateLabel(row.crossover_date)}</td><td className="numeric price-cell">₹{money(row.close)}</td><td className="numeric">₹{money(row.short_sma)}</td><td className="numeric">₹{money(row.long_sma)}</td></tr>)}</tbody></table></div> : payload ? <div className="no-signals"><div className="no-signals-icon"><Radio size={20} /></div><strong>No crossovers found</strong><p>No Nifty 100 stock crossed these moving averages in the last {payload.lookback_days} days. Try widening the lookback window.</p></div> : <div className="signals-placeholder"><div className="placeholder-icon"><Radio size={23} /></div><strong>Ready when you are</strong><p>Generate a scan to find the latest bullish and bearish SMA crossovers in the Nifty 100.</p></div>}
    {payload && <div className="scanner-footnote"><span className="live-dot" /> Data as of {dateLabel(payload.as_of)} · Daily candles from Kite Connect · {payload.skipped} unavailable or unmapped</div>}
  </div>
}

const ALGO_PARAMS = { volumeLookback: 20, volumeMultiplier: 3, priceLookback: 20, maxBreakoutAge: 20, midpointTolerance: 1 }

function normalizeScannerStock(stock) {
  const candles = (Array.isArray(stock.candles) ? stock.candles : []).map(candle => {
    const rawDate = String(candle.date ?? '')
    const date = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : new Date(rawDate).toISOString().slice(0, 10)
    return { date, open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume) }
  }).filter(candle => Number.isFinite(Date.parse(candle.date)))
  candles.sort((a, b) => a.date.localeCompare(b.date))
  return { ...stock, symbol: String(stock.symbol ?? ''), companyName: stock.companyName ?? stock.company_name ?? stock.company ?? stock.symbol ?? '', instrument_token: Number(stock.instrument_token), candles }
}

function scanBreakoutRetests(rawStocks) {
  const stocks = rawStocks.map(normalizeScannerStock)
  const results = []
  for (const stock of stocks) {
    const candles = stock.candles
    if (candles.length < 25) continue
    const lastIndex = candles.length - 1
    const earliestEligible = Math.max(ALGO_PARAMS.priceLookback, lastIndex - ALGO_PARAMS.maxBreakoutAge)
    for (let bIndex = lastIndex - 1; bIndex >= earliestEligible; bIndex -= 1) {
      const previous = candles.slice(bIndex - ALGO_PARAMS.priceLookback, bIndex)
      const breakout = candles[bIndex]
      if (previous.length !== ALGO_PARAMS.volumeLookback || !previous.every(c => Number.isFinite(c.volume) && Number.isFinite(c.high))) continue
      const averageVolume = previous.reduce((sum, candle) => sum + candle.volume, 0) / ALGO_PARAMS.volumeLookback
      const previousHigh = Math.max(...previous.map(candle => candle.high))
      if (!(averageVolume > 0) || ![breakout.open, breakout.close, breakout.high, breakout.low, breakout.volume].every(Number.isFinite)) continue
      if (!(breakout.close > breakout.open && breakout.volume >= ALGO_PARAMS.volumeMultiplier * averageVolume && breakout.close > previousHigh)) continue
      const subsequent = candles.slice(bIndex + 1)
      if (!subsequent.length || !subsequent.every(candle => Number.isFinite(candle.high))) continue
      const maxPriceAfter = Math.max(...subsequent.map(candle => candle.high))
      if (!(maxPriceAfter > breakout.high)) continue
      const midpoint = (breakout.high + breakout.low) / 2
      const latest = candles[lastIndex]
      if (!(midpoint > 0) || !Number.isFinite(latest.close)) continue
      const distanceFromMidpoint = ((latest.close - midpoint) / midpoint) * 100
      const daysSince = lastIndex - bIndex
      if (Math.abs(distanceFromMidpoint) > ALGO_PARAMS.midpointTolerance || daysSince > ALGO_PARAMS.maxBreakoutAge) continue
      results.push({
        symbol: stock.symbol,
        companyName: stock.companyName,
        instrument_token: stock.instrument_token,
        currentPrice: latest.close,
        breakoutDate: breakout.date,
        bIndex,
        daysSince,
        breakoutLow: breakout.low,
        breakoutHigh: breakout.high,
        midpoint,
        distanceFromMidpoint,
        volMultiple: breakout.volume / averageVolume,
        prevHigh: previousHigh,
        maxPriceAfter,
        returnFromCloseToSubHigh: ((maxPriceAfter - breakout.close) / breakout.close) * 100,
        retracementHigh: ((maxPriceAfter - latest.close) / maxPriceAfter) * 100,
        candles,
      })
      break
    }
  }
  results.sort((a, b) => a.daysSince - b.daysSince || Math.abs(a.distanceFromMidpoint) - Math.abs(b.distanceFromMidpoint))
  return { stocks, results }
}

function AlgoSignalsPanel() {
  const [stocks, setStocks] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [livePrices, setLivePrices] = useState({})
  const [snapshotPrices, setSnapshotPrices] = useState({})
  const [tickStatus, setTickStatus] = useState('connecting')

  const runScanner = async (source = stocks) => {
    setRunning(true)
    try {
      const scan = scanBreakoutRetests(source)
      setStocks(scan.stocks)
      setResults(scan.results)
      setSelected(null)
      setLivePrices({})
      setSnapshotPrices({})
      setTickStatus('connecting')
    } catch (e) { setError(e.message || 'Could not scan the cached candles.') }
    finally { setRunning(false) }
  }

  useEffect(() => {
    let active = true
    request('/api/scanner-data').then(data => {
      if (!active) return
      if (!Array.isArray(data.stocks)) throw new Error('Scanner data response did not include a stocks list.')
      const scan = scanBreakoutRetests(data.stocks)
      setStocks(scan.stocks)
      setResults(scan.results)
      setError('')
      setLoading(false)
    }).catch(e => { if (active) { setError(e.message); setLoading(false) } })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!results.length) { setTickStatus('no active setups'); return undefined }
    const tokens = [...new Set(results.map(result => result.instrument_token).filter(Number.isFinite))]
    if (!tokens.length) { setTickStatus('instrument tokens unavailable'); return undefined }
    let alive = true
    const tokenQuery = tokens.join(',')
    request(`/api/scanner-ohlc?tokens=${encodeURIComponent(tokenQuery)}`).then(data => {
      if (alive) setSnapshotPrices(data.prices || {})
    }).catch(() => {})
    const wsBase = API.replace(/^http/, 'ws')
    const socket = new WebSocket(`${wsBase}/ws/ticks?tokens=${encodeURIComponent(tokenQuery)}&mode=full`)
    socket.onopen = () => { if (alive) setTickStatus('subscribed · awaiting ticks') }
    socket.onmessage = event => {
      if (!alive) return
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'status') setTickStatus(message.status)
        if (message.type === 'ticks') setLivePrices(current => {
          const next = { ...current }
          for (const tick of message.ticks || []) if (tick.instrument_token && Number.isFinite(Number(tick.last_price))) next[tick.instrument_token] = Number(tick.last_price)
          return next
        })
      } catch { /* ignore malformed tick messages */ }
    }
    socket.onerror = () => { if (alive) setTickStatus('snapshot fallback · live feed unavailable') }
    socket.onclose = () => { if (alive) setTickStatus(current => current === 'connected' ? 'disconnected · snapshot fallback' : current) }
    return () => { alive = false; socket.close() }
  }, [results])

  const priceFor = (result) => livePrices[result.instrument_token] ?? snapshotPrices[result.instrument_token] ?? result.currentPrice
  const signedPercent = value => `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}%`
  const currency = value => `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`

  return <div className="algo-signals-page">
    <div className="algo-summary">
      <div className="algo-summary-metric"><span className="summary-icon breakout"><ScanLine size={17} /></span><div><strong>{loading ? '—' : results.length}</strong><small>Triggered breakouts</small></div></div>
      <div className="summary-divider" />
      <div className="algo-summary-metric"><span className="summary-icon stocks"><BarChart3 size={17} /></span><div><strong>{loading ? '—' : stocks.length}</strong><small>Stocks scanned</small></div></div>
      <div className="summary-divider" />
      <div className="algo-live-status"><span className={`live-dot ${tickStatus === 'connected' ? '' : 'status-soft'}`} /><div><strong>Live tick subscription</strong><small>{loading ? 'waiting for scan' : tickStatus}</small></div></div>
      <button className="secondary-button algo-run-button" onClick={() => runScanner()} disabled={loading || running}>{running ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}{running ? 'Scanning…' : 'Run scanner'}</button>
    </div>
    <div className="algo-parameters"><span>VOLUME LOOKBACK <strong>20 candles</strong></span><i /><span>VOLUME TRIGGER <strong>3× average</strong></span><i /><span>BREAKOUT AGE <strong>≤ 20 candles</strong></span><i /><span>MIDPOINT TOLERANCE <strong>±1%</strong></span></div>
    {error && <div className="algo-error" role="alert"><strong>Scanner data error</strong><span>{error}</span></div>}
    <section className="breakouts-card"><header className="breakouts-heading"><div><div className="eyebrow page-eyebrow">ALGO SCANNER</div><h2>Triggered Breakouts</h2></div><span className="breakouts-tag"><span className="live-dot" /> RETEST WATCHLIST</span></header>
      {loading ? <div className="algo-state"><LoaderCircle size={19} className="spin" /><span>Loading scanner cache...</span></div> : results.length === 0 && !error ? <div className="algo-state empty"><div className="placeholder-icon"><ScanLine size={21} /></div><strong>No breakout retest setups match the current parameters.</strong></div> : results.length > 0 ? <div className="breakouts-table-scroll"><table className="breakouts-table"><thead><tr><th>Rank</th><th>Symbol</th><th className="num">Current Price</th><th>Breakout Date</th><th className="num">Age</th><th className="num">Breakout Vol</th><th className="num">Retest Distance</th><th className="num">Peak Gains</th><th className="num">Retracement</th></tr></thead><tbody>{results.map((row, index) => <tr key={`${row.symbol}-${row.breakoutDate}`} className={selected === row.symbol ? 'selected' : ''} onClick={() => setSelected(row.symbol)}><td><span className="algo-rank">{index + 1}</span></td><td><strong className="algo-symbol">{row.symbol}</strong><small className="algo-company">{row.companyName}</small></td><td className="num algo-price">{currency(priceFor(row))}</td><td className="algo-date">{row.breakoutDate}</td><td className="num">{row.daysSince}<span className="age-unit"> candles</span></td><td className="num"><span className="volume-multiple">{row.volMultiple.toFixed(2)}x</span></td><td className={`num ${row.distanceFromMidpoint < 0 ? 'negative-value' : 'positive-value'}`}>{signedPercent(row.distanceFromMidpoint)}</td><td className="num positive-value">{signedPercent(row.returnFromCloseToSubHigh)}</td><td className="num">{signedPercent(row.retracementHigh)}</td></tr>)}</tbody></table></div> : null}
    </section>
  </div>
}

function Detail({ label, value, loading, mono }) {
  return <div className="detail-row"><span>{label}</span>{loading ? <span className="skeleton" /> : <strong className={mono ? 'mono' : ''}>{value || '—'}</strong>}</div>
}

function ChipList({ values, loading, empty }) {
  if (loading) return <div className="chip-row"><span className="skeleton chip-skeleton" /><span className="skeleton chip-skeleton" /></div>
  if (!values?.length) return <p className="empty-chips">{empty}</p>
  return <div className="chip-row">{values.map(value => <span className="data-chip" key={value}><span />{value}</span>)}</div>
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('kite-console-theme') || 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('kite-console-theme', theme)
  }, [theme])
  useEffect(() => {
    request('/api/auth/status').then(({ authenticated: value }) => setAuthenticated(value)).catch(() => {}).finally(() => setChecking(false))
  }, [])
  const login = async (values) => {
    setBusy(true); setError('')
    try {
      await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) })
      setAuthenticated(true)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const logout = async () => {
    try { await request('/api/auth/logout', { method: 'POST' }) } catch { /* keep the UI recoverable if the API is offline */ }
    setAuthenticated(false)
  }
  if (checking) return <div className="boot-screen"><Brand /><LoaderCircle size={20} className="spin" /></div>
  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark')
  return authenticated ? <Dashboard onLogout={logout} theme={theme} onThemeToggle={toggleTheme} /> : <Login onLogin={login} busy={busy} error={error} theme={theme} onThemeToggle={toggleTheme} />
}
