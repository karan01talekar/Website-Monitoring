import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiActivity, FiAlertCircle, FiArrowDownRight, FiArrowUpRight, FiBell,
  FiCheckCircle, FiChevronDown, FiClock, FiGlobe, FiLayout, FiMenu,
  FiPlus, FiRefreshCw, FiSearch, FiSettings, FiShield, FiX,
  FiLock, FiMail, FiUser, FiEye, FiEyeOff,
} from "react-icons/fi";
import api from "./api";

const statusClass = (status) => `status-pill ${["up", "valid"].includes(status) ? "is-good" : ["down", "expired", "invalid"].includes(status) ? "is-bad" : "is-neutral"}`;
const formatDate = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not available";
const relativeDate = (value) => {
  if (!value) return "Not checked yet";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.floor(hours / 24)} days ago`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [path, setPath] = useState(window.location.pathname);

  function navigate(nextPath) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }

  useEffect(() => {
    const onPopState = () => {
      const currentPath = window.location.pathname;
      if (!window.localStorage.getItem("wm_auth_token") && currentPath !== "/login" && currentPath !== "/register") {
        window.history.replaceState({}, "", "/login");
        setPath("/login");
      } else setPath(currentPath);
    };
    window.addEventListener("popstate", onPopState);
    const token = window.localStorage.getItem("wm_auth_token");
    if (!token) {
      setSessionChecked(true);
      if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
        window.history.replaceState({}, "", "/login");
        setPath("/login");
      }
      return () => window.removeEventListener("popstate", onPopState);
    }
    api.get("/auth/me").then(({ data }) => setUser(data.user)).catch(() => window.localStorage.removeItem("wm_auth_token")).finally(() => {
      setSessionChecked(true);
      if (!window.localStorage.getItem("wm_auth_token") && window.location.pathname !== "/login" && window.location.pathname !== "/register") {
        window.history.replaceState({}, "", "/login");
        setPath("/login");
      }
    });
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (path === "/login" || path === "/register") {
    return <AuthPage mode={path === "/register" ? "register" : "login"} onNavigate={navigate} onAuthenticated={setUser} />;
  }
  if (!sessionChecked) return <div className="auth-loading">Checking your account…</div>;
  if (!user) return <AuthPage mode="login" onNavigate={navigate} onAuthenticated={setUser} />;
  const signOut = () => {
    window.localStorage.removeItem("wm_auth_token");
    setUser(null);
    navigate("/login");
  };
  return <Dashboard user={user} onSignOut={signOut} />;
}

function AuthPage({ mode, onNavigate, onAuthenticated }) {
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirmPassword) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    try {
      if (isRegister) await api.post("/auth/register", { name, email, password });
      const { data } = await api.post("/auth/login", { email, password });
      window.localStorage.setItem("wm_auth_token", data.token);
      onAuthenticated(data.user);
      onNavigate("/");
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Could not ${isRegister ? "create your account" : "sign in"}. Check your connection and try again.`);
    } finally { setSubmitting(false); }
  }

  return (
    <main className="auth-layout">
      <section className="auth-showcase">
        <a className="auth-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }}><span className="brand-mark"><FiActivity /></span><span>Website Monitoring</span></a>
        <div className="showcase-content"><span className="showcase-kicker">YOUR SERVICES, IN SIGHT</span><h1>Know when it matters.</h1><p>Monitor uptime, SSL certificates, and domain health from one clear workspace.</p><div className="showcase-status"><span className="showcase-pulse" /><span><strong>Monitoring, made simple</strong><small>One dashboard for your web presence</small></span><FiArrowUpRight /></div></div>
        <div className="showcase-foot">Reliable visibility for every website.</div>
      </section>
      <section className="auth-main"><div className="auth-card">
        <a className="auth-mobile-brand" href="/" onClick={(event) => { event.preventDefault(); if (window.localStorage.getItem("wm_auth_token")) onNavigate("/"); }}><span className="brand-mark"><FiActivity /></span> Website Monitoring</a>
        <div className="auth-heading"><span className="auth-icon">{isRegister ? <FiUser /> : <FiLock />}</span><h2>{isRegister ? "Create your account" : "Welcome back"}</h2><p>{isRegister ? "Get started with your monitoring workspace." : "Sign in to continue to your monitoring workspace."}</p></div>
        {error && <div className="auth-error" role="alert"><FiAlertCircle /> {error}</div>}
        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && <label>Full name<span className="auth-input"><FiUser /><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" minLength={2} maxLength={100} required /></span></label>}
          <label>Email address<span className="auth-input"><FiMail /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" maxLength={254} required /></span></label>
          <label>Password<span className="auth-input"><FiLock /><input type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? "At least 8 characters" : "Enter your password"} minLength={8} maxLength={128} required /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <FiEyeOff /> : <FiEye />}</button></span></label>
          {isRegister && <label>Confirm password<span className="auth-input"><FiLock /><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" minLength={8} maxLength={128} required /></span></label>}
          <button className="button button-primary auth-submit" disabled={submitting}>{submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}<FiArrowUpRight /></button>
        </form>
        <p className="auth-switch">{isRegister ? "Already have an account?" : "New to Website Monitoring?"} <a href={isRegister ? "/login" : "/register"} onClick={(event) => { event.preventDefault(); onNavigate(isRegister ? "/login" : "/register"); }}>{isRegister ? "Sign in" : "Create an account"}</a></p>
        {window.localStorage.getItem("wm_auth_token") ? <a className="auth-back" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }}>← Back to dashboard</a> : null}
      </div><footer className="auth-copyright">© {new Date().getFullYear()} Website Monitoring</footer></section>
    </main>
  );
}

function Dashboard({ user, onSignOut }) {
  const [address, setAddress] = useState("");
  const [report, setReport] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [monitors, setMonitors] = useState([]);
  const [batchAddresses, setBatchAddresses] = useState("");
  const [batchEmail, setBatchEmail] = useState("");
  const [batchInterval, setBatchInterval] = useState(1);
  const [email, setEmail] = useState("");
  const [interval, setIntervalValue] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadMonitors = useCallback(async () => {
    try {
      const { data } = await api.get("/reports/monitors");
      setMonitors(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch {
      setMessage("Could not load monitors. Check that the monitoring service is reachable.");
      setError(true);
    }
  }, []);

  const getMonitor = useCallback(async (target) => {
    if (!target?.trim()) { setMonitor(null); return; }
    try {
      const { data } = await api.get("/reports/monitor", { params: { address: target } });
      setMonitor(data.monitor || null);
      if (data.monitor) {
        setEmail(data.monitor.notification_email || "");
        setIntervalValue(data.monitor.check_interval_minutes || 1);
        if (data.monitor.status) {
          setReport((current) => current ? { ...current, uptime: { ...current.uptime, status: data.monitor.status, message: data.monitor.status === "down" ? "Scheduled checks report this site as unavailable." : `Monitored website is up. Last checked ${formatDate(data.monitor.last_checked_at)}.` } } : current);
        }
      }
    } catch { setMonitor(null); }
  }, []);

  const check = useCallback(async (target = address) => {
    const value = target.trim();
    if (!value) { setMessage("Enter a website address to run a check."); setError(true); return; }
    setAddress(value);
    setLoading(true); setMessage(""); setError(false);
    try {
      const { data } = await api.get("/reports/data", { params: { address: value } });
      setReport(data);
      await getMonitor(value);
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || "Could not check this website. Verify the URL and try again.");
      setError(true);
    } finally { setLoading(false); }
  }, [address, getMonitor]);

  useEffect(() => {
    loadMonitors();
    const timer = window.setInterval(() => {
      loadMonitors();
      if (address) getMonitor(address);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [address, getMonitor, loadMonitors]);

  async function startMonitoring(event) {
    event?.preventDefault();
    setSaving(true); setMessage(""); setError(false);
    try {
      const { data } = await api.post("/reports/monitor", { address, notification_email: email, check_interval_minutes: Number(interval) });
      setMonitor(data.monitor);
      await loadMonitors();
      setMessage("Monitoring is active. The monitor list has been refreshed.");
    } catch (requestError) {
      setMessage(requestError.response?.data?.message || "Could not start monitoring. Check the email and try again."); setError(true);
    } finally { setSaving(false); }
  }

  async function stopMonitoring() {
    setSaving(true); setMessage(""); setError(false);
    try {
      await api.delete("/reports/monitor", { data: { address } });
      setMonitor((current) => current ? { ...current, is_active: false } : current);
      await loadMonitors(); setMessage("Monitoring stopped.");
    } catch (requestError) { setMessage(requestError.response?.data?.message || "Could not stop monitoring."); setError(true); }
    finally { setSaving(false); }
  }

  async function startBatchMonitoring(event) {
    event.preventDefault();
    const addresses = batchAddresses.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!addresses.length) { setMessage("Add at least one website address."); setError(true); return; }
    setBatchSaving(true); setMessage(""); setError(false);
    try {
      const { data } = await api.post("/reports/monitors/batch", { addresses, notification_email: batchEmail, check_interval_minutes: Number(batchInterval) });
      const results = data.results || [];
      const failures = results.filter((item) => !item.success);
      const added = results.length - failures.length;
      await loadMonitors();
      const firstSuccess = results.find((item) => item.success);
      if (firstSuccess?.address) await check(firstSuccess.address);
      setMessage(failures.length ? `${added} monitor(s) started; ${failures.length} could not be added. ${failures[0]?.message || ""}` : `${added} monitor(s) started successfully.`);
      setError(Boolean(failures.length));
      if (!failures.length) { setBatchAddresses(""); setBatchOpen(false); }
    } catch (requestError) { setMessage(requestError.response?.data?.message || "Could not start the monitors. Please try again."); setError(true); }
    finally { setBatchSaving(false); }
  }

  const activeCount = monitors.filter((item) => item.is_active !== false).length;
  const downCount = monitors.filter((item) => item.status === "down").length;
  const operationalPercent = monitors.length ? Math.round((monitors.filter((item) => item.status === "up").length / monitors.length) * 100) : null;
  const reportCards = useMemo(() => report ? [
    { name: "Domain expiry", icon: FiClock, result: report.domain_expiry, body: report.domain_expiry?.expires_at ? `${formatDate(report.domain_expiry.expires_at)} · ${report.domain_expiry.days_remaining} days remaining` : report.domain_expiry?.message },
    { name: "SSL certificate", icon: FiShield, result: report.ssl, body: report.ssl?.expires_at ? `Expires ${formatDate(report.ssl.expires_at)} · ${report.ssl.days_remaining} days remaining${report.ssl.issuer ? ` · ${report.ssl.issuer}` : ""}` : report.ssl?.message },
    { name: "Live availability", icon: FiActivity, result: report.uptime, body: `${report.uptime?.message || ""}${report.uptime?.http_status ? ` (HTTP ${report.uptime.http_status})` : ""}` },
  ] : [], [report]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><FiActivity /></span><span><strong>Website Monitoring</strong><small>ACMECORP · WORKSPACE</small></span><button className="mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu"><FiX /></button></div>
        <div className="workspace-switch"><span className="workspace-dot" /><span><small>WORKSPACE</small><strong>AcmeCorp Production</strong></span><FiChevronDown /></div>
        <p className="nav-label">MONITORING</p>
        <nav className="navigation">
          <a className="nav-item active" href="#overview" onClick={() => setMobileNavOpen(false)}><FiLayout /> Overview</a>
          <a className="nav-item" href="#monitors" onClick={() => setMobileNavOpen(false)}><FiGlobe /> Monitors <span className="nav-count">{monitors.length}</span></a>
          <a className="nav-item" href="#incidents" onClick={() => setMobileNavOpen(false)}><FiAlertCircle /> Incidents {downCount > 0 && <span className="nav-count warning-count">{downCount}</span>}</a>
          <a className="nav-item" href="#checks" onClick={() => setMobileNavOpen(false)}><FiShield /> Website checks</a>
          <a className="nav-item" href="#settings" onClick={() => setMobileNavOpen(false)}><FiSettings /> Settings</a>
        </nav>
        <div className="sidebar-bottom"><span className="profile-avatar">{user?.name?.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "WM"}</span><span><strong>{user?.name || "Guest workspace"}</strong><small>{user?.email || "Sign in to your account"}</small></span>{user ? <button className="signout-button" onClick={onSignOut} title="Sign out">Sign out</button> : <a className="signin-link" href="/login">Sign in</a>}</div>
      </aside>
      {mobileNavOpen && <button className="mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <main className="main-content" id="overview">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open menu"><FiMenu /></button>
          <div className="breadcrumb">Monitoring <span>/</span> <strong>Overview</strong></div>
          <div className="top-actions"><span className="refresh-label"><span className="live-dot" /> Auto-refresh · 30 sec</span><button className="icon-button" onClick={loadMonitors} aria-label="Refresh monitor list"><FiRefreshCw /></button>{!user && <a className="button button-secondary top-signin" href="/login">Sign in</a>}<a className="button button-primary top-add" href="#checks"><FiPlus /> Add monitor</a></div>
        </header>

        <div className="page-wrap">
          <section className="page-heading"><div><div className="eyebrow">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</div><h1>Overview</h1><p>Here’s the health of your websites and services.</p></div><div className="last-updated">{lastUpdated ? `Updated ${relativeDate(lastUpdated)}` : "Connecting to monitoring service"}</div></section>

          {message && <div className={`notice ${error ? "notice-error" : "notice-success"}`} role="status"><span>{error ? <FiAlertCircle /> : <FiCheckCircle />}</span><p>{message}</p><button onClick={() => setMessage("")} aria-label="Dismiss message"><FiX /></button></div>}

          <section className="metric-grid" aria-label="Monitoring summary">
            <article className="metric-card"><div className="metric-top"><span>Total monitors</span><span className="metric-icon blue"><FiGlobe /></span></div><strong>{monitors.length}</strong><small>{activeCount} active monitors</small></article>
            <article className="metric-card"><div className="metric-top"><span>Operational</span><span className="metric-icon green"><FiCheckCircle /></span></div><strong>{monitors.length ? `${operationalPercent}%` : "—"}</strong><small>{monitors.filter((item) => item.status === "up").length} services available</small></article>
            <article className="metric-card"><div className="metric-top"><span>Needs attention</span><span className="metric-icon red"><FiAlertCircle /></span></div><strong>{downCount}</strong><small>{downCount ? "Down monitors" : "All systems operational"}</small></article>
            <article className="metric-card"><div className="metric-top"><span>Last refresh</span><span className="metric-icon violet"><FiRefreshCw /></span></div><strong className="metric-date">{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</strong><small>Monitor status updates automatically</small></article>
          </section>

          <section className="content-grid">
            <article className="surface monitor-surface" id="monitors">
              <div className="surface-heading"><div><h2>Monitors</h2><p>Current status of your websites and services</p></div><button className="button button-secondary" onClick={() => { setAddress(""); setReport(null); setMonitor(null); document.getElementById("website-address")?.focus(); }}><FiPlus /> Add monitor</button></div>
              {monitors.length ? <div className="table-wrap"><table><thead><tr><th>WEBSITE</th><th>STATUS</th><th>LAST CHECKED</th><th>CHECK INTERVAL</th><th>ACTION</th></tr></thead><tbody>{monitors.map((item) => <tr key={item.address}><td><button className="site-cell" onClick={() => { setAddress(item.address); check(item.address); }}><span className="site-icon"><FiGlobe /></span><span><strong>{item.address.replace(/^https?:\/\//, "")}</strong><small>{item.address}</small></span></button></td><td><span className={statusClass(item.status || "unknown")}><i />{item.status || "Pending"}</span></td><td>{relativeDate(item.last_checked_at)}</td><td>{item.check_interval_minutes ? `Every ${item.check_interval_minutes} min` : "—"}</td><td><button className="table-action" onClick={() => { setAddress(item.address); check(item.address); }}>View report <FiArrowUpRight /></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon"><FiGlobe /></span><strong>{lastUpdated ? "No monitors yet" : "Loading your monitors"}</strong><p>{lastUpdated ? "Add a website to begin tracking availability and health." : "Connecting to the monitoring service…"}</p><a className="button button-primary" href="#checks"><FiPlus /> Add your first monitor</a></div>}
            </article>

            <article className="surface incident-surface" id="incidents">
              <div className="surface-heading"><div><h2>Service health</h2><p>Live status from your monitored websites</p></div><span className="health-live"><i /> Live</span></div>
              {monitors.length ? <div className="health-list">{monitors.slice(0, 6).map((item) => <div className="health-row" key={item.address}><span className={`health-indicator ${item.status === "up" ? "health-up" : item.status === "down" ? "health-down" : "health-unknown"}`} /> <span className="health-name">{item.address.replace(/^https?:\/\//, "")}</span><span className={statusClass(item.status || "unknown")}>{item.status || "Pending"}</span></div>)}</div> : <div className="health-empty"><FiActivity /><span>Your service status will appear here when you add a monitor.</span></div>}
              <div className="health-footer"><span><span className="live-dot" /> Polling every 30 seconds</span><span>{monitors.length} tracked</span></div>
            </article>
          </section>

          <section className="surface check-surface" id="checks">
            <div className="surface-heading"><div><h2>Check a website</h2><p>Run an on-demand availability, SSL and domain expiry check.</p></div><span className="check-heading-icon"><FiSearch /></span></div>
            <form className="check-form" onSubmit={(event) => { event.preventDefault(); check(); }}><label className="sr-only" htmlFor="website-address">Website URL</label><div className="url-input-wrap"><FiGlobe /><input id="website-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="https://example.com" type="url" /></div><button className="button button-primary" type="submit" disabled={loading}>{loading ? <><FiRefreshCw className="spin" /> Checking…</> : <><FiSearch /> Check website</>}</button></form>
            {report && <div className="report-area"><div className="report-title"><div><span className="eyebrow">LATEST CHECK</span><h3>{report.domain || address}</h3></div><span className={statusClass(report.uptime?.status || "unknown")}><i />{report.uptime?.status || "Checked"}</span></div><div className="report-grid">{reportCards.map(({ name, icon: Icon, result, body }) => <article className="report-card" key={name}><div className="report-card-head"><span className="report-icon"><Icon /></span><span className={statusClass(result?.status || "unknown")}><i />{result?.status || "Unknown"}</span></div><h4>{name}</h4><p>{body || "Information unavailable"}</p></article>)}</div>
              <div className="monitor-settings"><div className="settings-heading"><div><h3>Uptime monitoring</h3><p>Get notified when this website becomes unavailable.</p></div>{monitor?.is_active && <span className="status-pill is-good"><i /> Monitoring active</span>}</div><form className="settings-form" onSubmit={startMonitoring}><label>Alert email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alerts@example.com" /></label><label>Check interval<select value={interval} onChange={(event) => setIntervalValue(event.target.value)}><option value="1">Every 1 minute</option><option value="2">Every 2 minutes</option><option value="5">Every 5 minutes</option><option value="15">Every 15 minutes</option></select></label><div className="settings-actions"><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : monitor?.is_active ? "Update monitor" : "Start monitoring"}</button>{monitor?.is_active && <button className="button button-danger" type="button" onClick={stopMonitoring} disabled={saving}>Stop monitoring</button>}</div></form></div>
            </div>}
          </section>

          <section className="surface batch-surface" id="settings"><button className="batch-toggle" onClick={() => setBatchOpen((value) => !value)} aria-expanded={batchOpen}><span className="batch-icon"><FiPlus /></span><span><strong>Monitor multiple websites</strong><small>Add several URLs at once using the same alert settings.</small></span><FiChevronDown className={batchOpen ? "chevron-open" : ""} /></button>{batchOpen && <form className="batch-form" onSubmit={startBatchMonitoring}><label>Website addresses<textarea rows="4" value={batchAddresses} onChange={(event) => setBatchAddresses(event.target.value)} placeholder={"https://example.com\nhttps://api.example.com"} required /></label><div className="batch-options"><label>Alert email<input type="email" value={batchEmail} onChange={(event) => setBatchEmail(event.target.value)} placeholder="alerts@example.com" required /></label><label>Check interval<select value={batchInterval} onChange={(event) => setBatchInterval(event.target.value)}><option value="1">Every 1 minute</option><option value="2">Every 2 minutes</option><option value="5">Every 5 minutes</option><option value="15">Every 15 minutes</option></select></label></div><button className="button button-primary" disabled={batchSaving}>{batchSaving ? "Adding monitors…" : "Start all monitors"}</button></form>}</section>

          <footer className="page-footer"><span><FiActivity /> Website Monitoring</span><span>{lastUpdated ? `Last updated ${formatDate(lastUpdated)}` : "Waiting for monitor data"}</span></footer>
        </div>
      </main>
    </div>
  );
}
