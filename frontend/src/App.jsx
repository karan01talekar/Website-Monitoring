import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiAlertCircle,
  FiArrowUpRight,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiGlobe,
  FiLayout,
  FiMenu,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiX,
  FiLock,
  FiMail,
  FiUser,
  FiEye,
  FiEyeOff,
} from "react-icons/fi";
import api from "./api";

const statusClass = (status) =>
  `status-pill ${["up", "valid"].includes(status) ? "is-good" : ["down", "expired", "invalid"].includes(status) ? "is-bad" : "is-neutral"}`;
const availabilityLabel = (result) =>
  result?.http_status === 403
    ? "Access blocked"
    : result?.http_status === 401
      ? "Login required"
      : result?.http_status === 429
        ? "Rate limited"
        : result?.status || "Unknown";
const availabilityClass = (result) =>
  [401, 403, 429].includes(result?.http_status)
    ? "status-pill is-blocked"
    : statusClass(result?.status);
const availabilityMessage = (result) => {
  if (result?.http_status === 403)
    return "The server responded with HTTP 403 Forbidden. It is reachable, but refused the monitoring service’s request.";
  if (result?.http_status === 401)
    return "The server responded with HTTP 401 Unauthorized. It requires authentication for this URL.";
  if (result?.http_status === 429)
    return "The server responded with HTTP 429 Too Many Requests. It is limiting monitoring requests.";
  return `${result?.message || ""}${result?.http_status ? ` (HTTP ${result.http_status})` : ""}`;
};
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not available";
const relativeDate = (value) => {
  if (!value) return "Not checked yet";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
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
      if (
        !window.localStorage.getItem("wm_auth_token") &&
        currentPath !== "/login" &&
        currentPath !== "/register"
      ) {
        window.history.replaceState({}, "", "/login");
        setPath("/login");
      } else setPath(currentPath);
    };
    window.addEventListener("popstate", onPopState);
    const token = window.localStorage.getItem("wm_auth_token");
    if (!token) {
      setSessionChecked(true);
      if (
        window.location.pathname !== "/login" &&
        window.location.pathname !== "/register"
      ) {
        window.history.replaceState({}, "", "/login");
        setPath("/login");
      }
      return () => window.removeEventListener("popstate", onPopState);
    }
    api
      .get("/auth/me")
      .then(({ data }) => setUser(data.user))
      .catch(() => window.localStorage.removeItem("wm_auth_token"))
      .finally(() => {
        setSessionChecked(true);
        if (
          !window.localStorage.getItem("wm_auth_token") &&
          window.location.pathname !== "/login" &&
          window.location.pathname !== "/register"
        ) {
          window.history.replaceState({}, "", "/login");
          setPath("/login");
        }
      });
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (path === "/login" || path === "/register") {
    return (
      <AuthPage
        mode={path === "/register" ? "register" : "login"}
        onNavigate={navigate}
        onAuthenticated={setUser}
      />
    );
  }
  if (!sessionChecked)
    return <div className="auth-loading">Checking your account…</div>;
  if (!user)
    return (
      <AuthPage mode="login" onNavigate={navigate} onAuthenticated={setUser} />
    );
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
    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      if (isRegister)
        await api.post("/auth/register", { name, email, password });
      const { data } = await api.post("/auth/login", { email, password });
      window.localStorage.setItem("wm_auth_token", data.token);
      onAuthenticated(data.user);
      onNavigate("/");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          `Could not ${isRegister ? "create your account" : "sign in"}. Check your connection and try again.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-showcase">
        <a
          className="auth-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
        >
          <span className="brand-mark">
            <FiActivity />
          </span>
          <span>Website Monitoring</span>
        </a>
        <div className="showcase-content">
          <span className="showcase-kicker">YOUR SERVICES, IN SIGHT</span>
          <h1>Know when it matters.</h1>
          <p>
            Monitor uptime, SSL certificates, and domain health from one clear
            workspace.
          </p>
          <div className="showcase-status">
            <span className="showcase-pulse" />
            <span>
              <strong>Monitoring, made simple</strong>
              <small>One dashboard for your web presence</small>
            </span>
            <FiArrowUpRight />
          </div>
        </div>
        <div className="showcase-foot">
          Reliable visibility for every website.
        </div>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <a
            className="auth-mobile-brand"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              if (window.localStorage.getItem("wm_auth_token")) onNavigate("/");
            }}
          >
            <span className="brand-mark">
              <FiActivity />
            </span>{" "}
            Website Monitoring
          </a>
          <div className="auth-heading">
            <span className="auth-icon">
              {isRegister ? <FiUser /> : <FiLock />}
            </span>
            <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
            <p>
              {isRegister
                ? "Get started with your monitoring workspace."
                : "Sign in to continue to your monitoring workspace."}
            </p>
          </div>
          {error && (
            <div className="auth-error" role="alert">
              <FiAlertCircle /> {error}
            </div>
          )}
          <form className="auth-form" onSubmit={handleSubmit}>
            {isRegister && (
              <label>
                Full name
                <span className="auth-input">
                  <FiUser />
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </span>
              </label>
            )}
            <label>
              Email address
              <span className="auth-input">
                <FiMail />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  maxLength={254}
                  required
                />
              </span>
            </label>
            <label>
              Password
              <span className="auth-input">
                <FiLock />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    isRegister ? "At least 8 characters" : "Enter your password"
                  }
                  minLength={8}
                  maxLength={128}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </span>
            </label>
            {isRegister && (
              <label>
                Confirm password
                <span className="auth-input">
                  <FiLock />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Enter your password again"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </span>
              </label>
            )}
            <button
              className="button button-primary auth-submit"
              disabled={submitting}
            >
              {submitting
                ? "Please wait…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
              <FiArrowUpRight />
            </button>
          </form>
          <p className="auth-switch">
            {isRegister
              ? "Already have an account?"
              : "New to Website Monitoring?"}{" "}
            <a
              href={isRegister ? "/login" : "/register"}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(isRegister ? "/login" : "/register");
              }}
            >
              {isRegister ? "Sign in" : "Create an account"}
            </a>
          </p>
          {window.localStorage.getItem("wm_auth_token") ? (
            <a
              className="auth-back"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("/");
              }}
            >
              ← Back to dashboard
            </a>
          ) : null}
        </div>
        <footer className="auth-copyright">
          © {new Date().getFullYear()} Website Monitoring
        </footer>
      </section>
    </main>
  );
}

function MonitorReport({ report, address, reportCards }) {
  return (
    <section className="surface monitor-report" aria-label="Website report">
      <div className="monitor-report-heading">
        <div>
          <span className="eyebrow">LATEST WEBSITE REPORT</span>
          <h2>{report.domain || address}</h2>
        </div>
        <span className={availabilityClass(report.uptime)}>
          <i /> {availabilityLabel(report.uptime)}
        </span>
      </div>
      <div className="report-grid">
        {reportCards.map(({ name, icon: Icon, result, body }) => (
          <article className="report-card" key={name}>
            <div className="report-card-head">
              <span className="report-icon">
                <Icon />
              </span>
              <span
                className={
                  name === "Live availability"
                    ? availabilityClass(result)
                    : statusClass(result?.status || "unknown")
                }
              >
                <i />{" "}
                {name === "Live availability"
                  ? availabilityLabel(result)
                  : result?.status || "Unknown"}
              </span>
            </div>
            <h4>{name}</h4>
            <p>{body || "Information unavailable"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Dashboard({ user, onSignOut }) {
  const [address, setAddress] = useState("");
  const [report, setReport] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [monitors, setMonitors] = useState([]);
  const [batchAddresses, setBatchAddresses] = useState([""]);
  const [bulkMonitorAddresses, setBulkMonitorAddresses] = useState([]);
  const [batchEmail, setBatchEmail] = useState(user?.email || "");
  const [batchInterval, setBatchInterval] = useState(1);
  const [email, setEmail] = useState(user?.email || "");
  const [interval, setIntervalValue] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const toastTimerRef = useRef(null);
  const [batchOpen, setBatchOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [page, setPage] = useState("overview");
  const [monitorPage, setMonitorPage] = useState(1);
  const [shouldScrollToReport, setShouldScrollToReport] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const reportRef = useRef(null);

  function showToast(text, isError = false) {
    setToast(text);
    setToastError(isError);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 4500);
  }

  useEffect(
    () => () => window.clearTimeout(toastTimerRef.current),
    [],
  );

  const pageTitles = {
    overview: "Overview",
    monitors: "Monitors",
    incidents: "Incidents",
    bulk: "Check multiple websites",
  };

  function selectPage(nextPage) {
    setPage(nextPage);
    setMobileNavOpen(false);
  }

  const loadMonitors = useCallback(async () => {
    try {
      const { data } = await api.get("/reports/monitors");
      setMonitors(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch {
      setMessage(
        "Could not load monitors. Check that the monitoring service is reachable.",
      );
      setError(true);
    }
  }, []);

  const getMonitor = useCallback(
    async (target) => {
      if (!target?.trim()) {
        setMonitor(null);
        return;
      }
      try {
        const { data } = await api.get("/reports/monitor", {
          params: { address: target },
        });
        setMonitor(data.monitor || null);
        if (data.monitor) {
          setEmail(user?.email || data.monitor.notification_email || "");
          setIntervalValue(data.monitor.check_interval_minutes || 1);
          if (data.monitor.status) {
            setReport((current) =>
              current
                ? {
                    ...current,
                    uptime: {
                      ...current.uptime,
                      status: data.monitor.status,
                      message:
                        current.uptime?.http_status === 403
                          ? availabilityMessage(current.uptime)
                          : data.monitor.status === "down"
                            ? "Scheduled checks report this site as unavailable."
                            : `Monitored website is up. Last checked ${formatDate(data.monitor.last_checked_at)}.`,
                    },
                  }
                : current,
            );
          }
        }
      } catch {
        setMonitor(null);
      }
    },
    [user?.email],
  );

  const check = useCallback(
    async (target = address) => {
      const value = target.trim();
      if (!value) {
        setMessage("Enter a website address to run a check.");
        setError(true);
        return;
      }
      setAddress(value);
      setReport(null);
      setLoading(true);
      setMessage("");
      setError(false);
      try {
        const { data } = await api.get("/reports/data", {
          params: { address: value },
        });
        setReport(data);
        await getMonitor(value);
      } catch (requestError) {
        setMessage(
          requestError.response?.data?.message ||
            "Could not check this website. Verify the URL and try again.",
        );
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [address, getMonitor],
  );

  function viewMonitorReport(target) {
    setShouldScrollToReport(true);
    selectPage("monitors");
    check(target);
  }

  useEffect(() => {
    if (!shouldScrollToReport || loading) return;
    if (page === "monitors" && report) {
      reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setShouldScrollToReport(false);
  }, [loading, page, report, shouldScrollToReport]);

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
    setSaving(true);
    setMessage("");
    setError(false);
    try {
      const { data } = await api.post("/reports/monitor", {
        address,
        notification_email: email,
        check_interval_minutes: Number(interval),
      });
      setMonitor(data.monitor);
      await loadMonitors();
      setMessage("");
      const alert = data.alert_email;
      if (data.monitor?.status !== "down") {
        showToast("Website added. It is currently up, so no alert email was needed.");
      } else if (alert?.status === "accepted") {
        showToast(`Website added. Gmail SMTP accepted the alert for this down check. Another alert will be sent on each down check.`);
      } else {
        showToast(
          `Website added, but the downtime alert was not sent${alert?.message ? `: ${alert.message}` : ". Check the backend SMTP configuration."}`,
          true,
        );
      }
    } catch (requestError) {
      setMessage(
        requestError.response?.data?.message ||
          "Could not start monitoring. Check the email and try again.",
      );
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function stopMonitoring() {
    setSaving(true);
    setMessage("");
    setError(false);
    try {
      await api.delete("/reports/monitor", { data: { address } });
      setMonitor((current) =>
        current ? { ...current, is_active: false } : current,
      );
      await loadMonitors();
      setMessage("Monitoring stopped.");
    } catch (requestError) {
      setMessage(
        requestError.response?.data?.message || "Could not stop monitoring.",
      );
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function startBatchMonitoring(event) {
    event.preventDefault();
    const addresses = batchAddresses.map((item) => item.trim()).filter(Boolean);
    if (!addresses.length) {
      setMessage("Add at least one website address.");
      setError(true);
      return;
    }
    setBatchSaving(true);
    setMessage("");
    setError(false);
    try {
      const { data } = await api.post("/reports/monitors/batch", {
        addresses,
        notification_email: batchEmail,
        check_interval_minutes: Number(batchInterval),
      });
      const results = data.results || [];
      const failures = results.filter((item) => !item.success);
      const added = results.length - failures.length;
      const successfulAddresses = results
        .filter((item) => item.success && item.address)
        .map((item) => item.address);
      setBulkMonitorAddresses((current) => [
        ...new Set([...current, ...successfulAddresses]),
      ]);
      await loadMonitors();
      const firstSuccess = results.find((item) => item.success);
      if (firstSuccess?.address) await check(firstSuccess.address);
      const alertFailures = results.filter(
        (item) =>
          item.success &&
          ["failed", "not_configured", "no_recipient"].includes(
            item.alert_email?.status,
          ),
      );
      const acceptedAlerts = results.filter(
        (item) => item.alert_email?.status === "accepted",
      ).length;
      if (added > 0) {
        if (alertFailures.length) {
          const reason = alertFailures[0].alert_email?.message;
          showToast(
            `${added} website(s) added, but ${alertFailures.length} downtime alert(s) were not sent${reason ? `: ${reason}` : ". Check the backend SMTP configuration."}`,
            true,
          );
        } else if (acceptedAlerts) {
          showToast(`${added} website(s) added. Gmail SMTP accepted alerts for ${acceptedAlerts} down check(s); another alert is sent on each down check.`);
        } else {
          showToast(`${added} website(s) added. Alerts are submitted when a check detects downtime.`);
        }
      }
      setMessage(
        failures.length
          ? `${failures.length} website(s) could not be added. ${failures[0]?.message || ""}`
          : "",
      );
      setError(Boolean(failures.length));
      if (!failures.length) {
        setBatchAddresses([""]);
        setBatchOpen(false);
      }
    } catch (requestError) {
      setMessage(
        requestError.response?.data?.message ||
          "Could not start the monitors. Please try again.",
      );
      setError(true);
    } finally {
      setBatchSaving(false);
    }
  }

  const activeCount = monitors.filter(
    (item) => item.is_active !== false,
  ).length;
  const downMonitors = monitors.filter((item) => item.status === "down");
  const downCount = downMonitors.length;
  const monitorPageSize = 8;
  const monitorPageCount = Math.max(
    1,
    Math.ceil(monitors.length / monitorPageSize),
  );
  const currentMonitorPage = Math.min(monitorPage, monitorPageCount);
  const visibleMonitors = monitors.slice(
    (currentMonitorPage - 1) * monitorPageSize,
    currentMonitorPage * monitorPageSize,
  );
  const operationalPercent = monitors.length
    ? Math.round(
        (monitors.filter((item) => item.status === "up").length /
          monitors.length) *
          100,
      )
    : null;
  const reportCards = useMemo(
    () =>
      report
        ? [
            {
              name: "Domain expiry",
              icon: FiClock,
              result: report.domain_expiry,
              body: report.domain_expiry?.expires_at
                ? `${formatDate(report.domain_expiry.expires_at)} · ${report.domain_expiry.days_remaining} days remaining`
                : report.domain_expiry?.message,
            },
            {
              name: "SSL certificate",
              icon: FiShield,
              result: report.ssl,
              body: report.ssl?.expires_at
                ? `Expires ${formatDate(report.ssl.expires_at)} · ${report.ssl.days_remaining} days remaining${report.ssl.issuer ? ` · ${report.ssl.issuer}` : ""}`
                : report.ssl?.message,
            },
            {
              name: "Live availability",
              icon: FiActivity,
              result: report.uptime,
              body: availabilityMessage(report.uptime),
            },
          ]
        : [],
    [report],
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <FiActivity />
          </span>
          <span>
            <strong>Website Monitoring</strong>
            <small>· WORKSPACE</small>
          </span>
          <button
            className="mobile-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
          >
            <FiX />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-dot" />
          <span>
            <small>WORKSPACE</small>
            <strong>Production</strong>
          </span>
          {/* <FiChevronDown /> */}
        </div>
        <p className="nav-label">MONITORING</p>
        <nav className="navigation">
          <a
            className={`nav-item ${page === "overview" ? "active" : ""}`}
            href="#overview"
            onClick={(event) => {
              event.preventDefault();
              selectPage("overview");
            }}
          >
            <FiLayout /> Overview
          </a>
          <a
            className={`nav-item ${page === "bulk" ? "active" : ""}`}
            href="#bulk-check"
            onClick={(event) => {
              event.preventDefault();
              selectPage("bulk");
            }}
          >
            <FiShield /> Check multiple websites
          </a>
          <a
            className={`nav-item ${page === "monitors" ? "active" : ""}`}
            href="#monitors"
            onClick={(event) => {
              event.preventDefault();
              selectPage("monitors");
            }}
          >
            <FiGlobe /> Monitors{" "}
            <span className="nav-count">{monitors.length}</span>
          </a>
          <a
            className={`nav-item ${page === "incidents" ? "active" : ""}`}
            href="#incidents"
            onClick={(event) => {
              event.preventDefault();
              selectPage("incidents");
            }}
          >
            <FiAlertCircle /> Incidents{" "}
            {downCount > 0 && (
              <span className="nav-count warning-count">{downCount}</span>
            )}
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="profile-avatar">
            {user?.name
              ?.split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase() || "WM"}
          </span>
          <span>
            <strong>{user?.name || "Guest workspace"}</strong>
            <small>{user?.email || "Sign in to your account"}</small>
          </span>
          {user ? (
            <button
              className="signout-button"
              onClick={onSignOut}
              title="Sign out"
            >
              Sign out
            </button>
          ) : (
            <a className="signin-link" href="/login">
              Sign in
            </a>
          )}
        </div>
      </aside>
      {mobileNavOpen && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <main className="main-content" id="overview">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <FiMenu />
          </button>
          <div className="breadcrumb">
            Monitoring <span>/</span> <strong>Overview</strong>
          </div>
          <div className="top-actions">
            <span className="refresh-label">
              <span className="live-dot" /> Auto-refresh · 30 sec
            </span>
            <button
              className="icon-button"
              onClick={loadMonitors}
              aria-label="Refresh monitor list"
            >
              <FiRefreshCw />
            </button>
            {!user && (
              <a className="button button-secondary top-signin" href="/login">
                Sign in
              </a>
            )}
            <a
              className="button button-primary top-add"
              href="#monitors"
              onClick={(event) => {
                event.preventDefault();
                selectPage("monitors");
              }}
            >
              <FiPlus /> Add monitor
            </a>
          </div>
        </header>

        <div className={`page-wrap page-view page-view-${page}`}>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                {new Date()
                  .toLocaleDateString([], {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                  .toUpperCase()}
              </div>
              <h1>{pageTitles[page]}</h1>
              <p>
                {page === "overview"
                  ? "Here’s the health of your websites and services."
                  : page === "monitors"
                    ? "Manage and review all monitored websites."
                    : page === "incidents"
                      ? "Review websites that are currently unavailable."
                      : "Run availability, SSL and domain checks for multiple websites."}
              </p>
            </div>
            <div className="last-updated">
              {lastUpdated
                ? `Updated ${relativeDate(lastUpdated)}`
                : "Connecting to monitoring service"}
            </div>
          </section>

          {message && (
            <div
              className={`notice ${error ? "notice-error" : "notice-success"}`}
              role="status"
            >
              <span>{error ? <FiAlertCircle /> : <FiCheckCircle />}</span>
              <p>{message}</p>
              <button
                onClick={() => setMessage("")}
                aria-label="Dismiss message"
              >
                <FiX />
              </button>
            </div>
          )}

      {toast && (
        <div className={`toast-message ${toastError ? "toast-error" : ""}`} role={toastError ? "alert" : "status"} aria-live="polite">
          {toastError ? <FiAlertCircle /> : <FiCheckCircle />}
          <span>{toast}</span>
          <button
            onClick={() => {
              window.clearTimeout(toastTimerRef.current);
              setToast("");
            }}
            aria-label="Dismiss notification"
          >
            <FiX />
          </button>
        </div>
      )}

          {page === "overview" && (
            <section className="metric-grid" aria-label="Monitoring summary">
              <article className="metric-card">
                <div className="metric-top">
                  <span>Total monitors</span>
                  <span className="metric-icon blue">
                    <FiGlobe />
                  </span>
                </div>
                <strong>{monitors.length}</strong>
                <small>{activeCount} active monitors</small>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Operational</span>
                  <span className="metric-icon green">
                    <FiCheckCircle />
                  </span>
                </div>
                <strong>
                  {monitors.length ? `${operationalPercent}%` : "—"}
                </strong>
                <small>
                  {monitors.filter((item) => item.status === "up").length}{" "}
                  services available
                </small>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Needs attention</span>
                  <span className="metric-icon red">
                    <FiAlertCircle />
                  </span>
                </div>
                <strong>{downCount}</strong>
                <small>
                  {downCount ? "Down monitors" : "All systems operational"}
                </small>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Last refresh</span>
                  <span className="metric-icon violet">
                    <FiRefreshCw />
                  </span>
                </div>
                <strong className="metric-date">
                  {lastUpdated
                    ? lastUpdated.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </strong>
                <small>Monitor status updates automatically</small>
              </article>
            </section>
          )}

          {(page === "monitors" || page === "incidents") && (
            <section className="content-grid single-page-grid">
              {page === "monitors" && (
                <>
                  <div className="monitor-summary surface">
                    <span className="summary-icon">
                      <FiGlobe />
                    </span>
                    <div>
                      <strong>{monitors.length} websites monitored</strong>
                      <small>Checks run automatically every 30 seconds</small>
                    </div>
                    <span className="summary-status">
                      <i /> {activeCount} active
                    </span>
                  </div>
                  <article className="surface monitor-surface" id="monitors">
                    <div className="surface-heading">
                      <div>
                        <h2>Monitors</h2>
                        <p>Current status of your websites and services</p>
                      </div>
                      <button
                        className="button button-secondary"
                        onClick={() => {
                          setAddress("");
                          setReport(null);
                          setMonitor(null);
                          selectPage("overview");
                        }}
                      >
                        <FiPlus /> Add monitor
                      </button>
                    </div>
                    {monitors.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>WEBSITE</th>
                              <th>STATUS</th>
                              <th>LAST CHECKED</th>
                              <th>CHECK INTERVAL</th>
                              <th>ACTION</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleMonitors.map((item) => (
                              <tr key={item.address}>
                                <td>
                                  <button
                                    className="site-cell"
                                    onClick={() => {
                                      viewMonitorReport(item.address);
                                    }}
                                  >
                                    <span className="site-icon">
                                      <FiGlobe />
                                    </span>
                                    <span>
                                      <strong>
                                        {item.address.replace(
                                          /^https?:\/\//,
                                          "",
                                        )}
                                      </strong>
                                      <small>{item.address}</small>
                                    </span>
                                  </button>
                                </td>
                                <td>
                                  <span
                                    className={statusClass(
                                      item.status || "unknown",
                                    )}
                                  >
                                    <i />
                                    {item.status || "Pending"}
                                  </span>
                                </td>
                                <td>{relativeDate(item.last_checked_at)}</td>
                                <td>
                                  {item.check_interval_minutes
                                    ? `Every ${item.check_interval_minutes} min`
                                    : "—"}
                                </td>
                                <td>
                                  <button
                                    className="table-action"
                                    onClick={() => {
                                      viewMonitorReport(item.address);
                                    }}
                                  >
                                    View report <FiArrowUpRight />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-state">
                        <span className="empty-icon">
                          <FiGlobe />
                        </span>
                        <strong>
                          {lastUpdated
                            ? "No monitors yet"
                            : "Loading your monitors"}
                        </strong>
                        <p>
                          {lastUpdated
                            ? "Add a website to begin tracking availability and health."
                            : "Connecting to the monitoring service…"}
                        </p>
                        <a
                          className="button button-primary"
                          href="#checks"
                          onClick={(event) => {
                            event.preventDefault();
                            selectPage("overview");
                          }}
                        >
                          <FiPlus /> Add your first monitor
                        </a>
                      </div>
                    )}
                    {monitors.length > 0 && (
                      <div className="table-pagination">
                        <span>
                          Showing{" "}
                          {(currentMonitorPage - 1) * monitorPageSize + 1}–
                          {Math.min(
                            currentMonitorPage * monitorPageSize,
                            monitors.length,
                          )}{" "}
                          of {monitors.length}
                        </span>
                        <div>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() =>
                              setMonitorPage((value) => Math.max(1, value - 1))
                            }
                            disabled={currentMonitorPage === 1}
                          >
                            Previous
                          </button>
                          <span>
                            Page {currentMonitorPage} of {monitorPageCount}
                          </span>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() =>
                              setMonitorPage((value) =>
                                Math.min(monitorPageCount, value + 1),
                              )
                            }
                            disabled={currentMonitorPage === monitorPageCount}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                  {loading && address && (
                    <div className="monitor-report-loading">
                      <FiRefreshCw className="spin" /> Checking {address}…
                    </div>
                  )}
                  {report && (
                    <div className="report-scroll-target" ref={reportRef}>
                      <MonitorReport
                        report={report}
                        address={address}
                        reportCards={reportCards}
                      />
                    </div>
                  )}
                </>
              )}

              {page === "incidents" && (
                <>
                  <div
                    className={`incident-summary ${downCount ? "has-incidents" : "all-clear"}`}
                  >
                    <span className="incident-summary-icon">
                      {downCount ? <FiAlertCircle /> : <FiCheckCircle />}
                    </span>
                    <div>
                      <strong>
                        {downCount
                          ? `${downCount} website${downCount === 1 ? "" : "s"} need attention`
                          : "All monitored websites are operational"}
                      </strong>
                      <small>
                        {downCount
                          ? "Review the active incidents below."
                          : "We’ll show new incidents here as soon as a monitor reports a problem."}
                      </small>
                    </div>
                    <span className="incident-summary-count">{downCount}</span>
                  </div>
                  <article className="surface incident-surface" id="incidents">
                    <div className="surface-heading">
                      <div>
                        <h2>Incidents</h2>
                        <p>Only websites currently reporting down</p>
                      </div>
                      <span
                        className={
                          downCount
                            ? "health-live health-down-label"
                            : "health-live"
                        }
                      >
                        <i /> {downCount} down
                      </span>
                    </div>
                    {downMonitors.length ? (
                      <div className="health-list">
                        {downMonitors.map((item) => (
                          <div className="health-row" key={item.address}>
                            <span className="health-indicator health-down" />{" "}
                            <span className="health-name">
                              {item.address.replace(/^https?:\/\//, "")}
                            </span>
                            <span className={statusClass("down")}>Down</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="health-empty">
                        <FiCheckCircle />
                        <span>
                          {monitors.length
                            ? "No active incidents. None of your websites are reporting down."
                            : "Your incidents will appear here when you add monitors."}
                        </span>
                      </div>
                    )}
                    <div className="health-footer">
                      <span>
                        <span className="live-dot" /> Polling every 30 seconds
                      </span>
                      <span>{downCount} active</span>
                    </div>
                  </article>
                </>
              )}
            </section>
          )}

          {page === "overview" && (
            <section className="surface check-surface" id="checks">
              <div className="surface-heading">
                <div>
                  <h2>Check a website</h2>
                  <p>
                    Run an on-demand availability, SSL and domain expiry check.
                  </p>
                </div>
                <span className="check-heading-icon">
                  <FiSearch />
                </span>
              </div>
              <form
                className="check-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  check();
                }}
              >
                <label className="sr-only" htmlFor="website-address">
                  Website URL
                </label>
                <div className="url-input-wrap">
                  <FiGlobe />
                  <input
                    id="website-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="https://example.com"
                    type="url"
                  />
                </div>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <FiRefreshCw className="spin" /> Checking…
                    </>
                  ) : (
                    <>
                      <FiSearch /> Check website
                    </>
                  )}
                </button>
              </form>
              {report && (
                <div className="report-area">
                  <div className="report-title">
                    <div>
                      <span className="eyebrow">LATEST CHECK</span>
                      <h3>{report.domain || address}</h3>
                    </div>
                    <span className={availabilityClass(report.uptime)}>
                      <i />
                      {availabilityLabel(report.uptime)}
                    </span>
                  </div>
                  <div className="report-grid">
                    {reportCards.map(({ name, icon: Icon, result, body }) => (
                      <article className="report-card" key={name}>
                        <div className="report-card-head">
                          <span className="report-icon">
                            <Icon />
                          </span>
                          <span
                            className={
                              name === "Live availability"
                                ? availabilityClass(result)
                                : statusClass(result?.status || "unknown")
                            }
                          >
                            <i />
                            {name === "Live availability"
                              ? availabilityLabel(result)
                              : result?.status || "Unknown"}
                          </span>
                        </div>
                        <h4>{name}</h4>
                        <p>{body || "Information unavailable"}</p>
                      </article>
                    ))}
                  </div>
                  <div className="monitor-settings">
                    <div className="settings-heading">
                      <div>
                        <h3>Uptime monitoring</h3>
                        <p>
                          Get notified when this website becomes unavailable.
                        </p>
                      </div>
                      {monitor?.is_active && (
                        <span className="status-pill is-good">
                          <i /> Monitoring active
                        </span>
                      )}
                    </div>
                    <form className="settings-form" onSubmit={startMonitoring}>
                      <label>
                        Alert email
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="alerts@example.com"
                        />
                      </label>
                      <label>
                        Check interval
                        <select
                          value={interval}
                          onChange={(event) =>
                            setIntervalValue(event.target.value)
                          }
                        >
                          <option value="1">Every 1 minute</option>
                          <option value="2">Every 2 minutes</option>
                          <option value="5">Every 5 minutes</option>
                          <option value="15">Every 15 minutes</option>
                        </select>
                      </label>
                      <div className="settings-actions">
                        <button
                          className="button button-primary"
                          disabled={saving}
                        >
                          {saving
                            ? "Saving…"
                            : monitor?.is_active
                              ? "Update monitor"
                              : "Start monitoring"}
                        </button>
                        {monitor?.is_active && (
                          <button
                            className="button button-danger"
                            type="button"
                            onClick={stopMonitoring}
                            disabled={saving}
                          >
                            Stop monitoring
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>
          )}

          {page === "bulk" && (
            <section className="surface batch-surface" id="bulk-check">
              <div className="bulk-intro">
                <span className="bulk-intro-icon">
                  <FiShield />
                </span>
                <div>
                  <span className="eyebrow">BULK MONITORING</span>
                  <h2>Check and monitor a list of websites</h2>
                  <p>
                    Paste one URL per line. We’ll add each site to your
                    monitoring workspace.
                  </p>
                </div>
              </div>
              <button
                className="batch-toggle"
                onClick={() => setBatchOpen((value) => !value)}
                aria-expanded={batchOpen}
              >
                <span className="batch-icon">
                  <FiPlus />
                </span>
                <span>
                  <strong>Monitor multiple websites</strong>
                  <small>
                    Add several URLs at once using the same alert settings.
                  </small>
                </span>
                <FiChevronDown className={batchOpen ? "chevron-open" : ""} />
              </button>
              {batchOpen && (
                <form className="batch-form" onSubmit={startBatchMonitoring}>
                  <div className="batch-addresses">
                    <span className="batch-addresses-label">
                      Website addresses
                    </span>
                    {batchAddresses.map((batchAddress, index) => (
                      <div className="batch-address-row" key={index}>
                        <input
                          type="url"
                          value={batchAddress}
                          onChange={(event) =>
                            setBatchAddresses((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? event.target.value : item,
                              ),
                            )
                          }
                          placeholder="https://example.com"
                          required
                        />
                        {index === batchAddresses.length - 1 ? (
                          <button
                            className="batch-address-add"
                            type="button"
                            aria-label="Add another website address"
                            onClick={() =>
                              setBatchAddresses((current) => [...current, ""])
                            }
                          >
                            <FiPlus />
                          </button>
                        ) : (
                          <button
                            className="batch-address-remove"
                            type="button"
                            aria-label={`Remove website address ${index + 1}`}
                            onClick={() =>
                              setBatchAddresses((current) =>
                                current.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              )
                            }
                          >
                            <FiX />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="batch-options">
                    <label>
                      Alert email
                      <input
                        type="email"
                        value={batchEmail}
                        onChange={(event) => setBatchEmail(event.target.value)}
                        placeholder="alerts@example.com"
                        required
                      />
                    </label>
                    <label>
                      Check interval
                      <select
                        value={batchInterval}
                        onChange={(event) =>
                          setBatchInterval(event.target.value)
                        }
                      >
                        <option value="1">Every 1 minute</option>
                        <option value="2">Every 2 minutes</option>
                        <option value="5">Every 5 minutes</option>
                        <option value="15">Every 15 minutes</option>
                      </select>
                    </label>
                  </div>
                  <button
                    className="button button-primary"
                    disabled={batchSaving}
                  >
                    {batchSaving ? "Adding monitors…" : "Start all monitors"}
                  </button>
                </form>
              )}
              {bulkMonitorAddresses.length > 0 && (
                <div className="bulk-monitor-list">
                  <div className="bulk-list-heading">
                    <div>
                      <span className="eyebrow">THIS WORKSPACE</span>
                      <h3>Monitored websites</h3>
                    </div>
                    <span className="bulk-list-count">
                      {bulkMonitorAddresses.length} sites
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>WEBSITE</th>
                          <th>STATUS</th>
                          <th>CHECK INTERVAL</th>
                          <th>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkMonitorAddresses.map((monitorAddress) => {
                          const item = monitors.find(
                            (monitorItem) =>
                              monitorItem.address === monitorAddress,
                          );
                          return (
                            <tr key={monitorAddress}>
                              <td>
                                <span className="site-cell bulk-site-cell">
                                  <span className="site-icon">
                                    <FiGlobe />
                                  </span>
                                  <span>
                                    <strong>
                                      {monitorAddress.replace(
                                        /^https?:\/\//,
                                        "",
                                      )}
                                    </strong>
                                    <small>{monitorAddress}</small>
                                  </span>
                                </span>
                              </td>
                              <td>
                                <span
                                  className={statusClass(
                                    item?.status || "unknown",
                                  )}
                                >
                                  <i />
                                  {item?.status || "Pending"}
                                </span>
                              </td>
                              <td>
                                {item?.check_interval_minutes
                                  ? `Every ${item.check_interval_minutes} min`
                                  : "—"}
                              </td>
                              <td>
                                <button
                                  className="table-action"
                                  type="button"
                                  onClick={() => check(monitorAddress)}
                                >
                                  View report <FiArrowUpRight />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {loading && bulkMonitorAddresses.includes(address) && (
                    <div className="monitor-report-loading">
                      <FiRefreshCw className="spin" /> Checking {address}…
                    </div>
                  )}
                  {report && bulkMonitorAddresses.includes(address) && (
                    <MonitorReport
                      report={report}
                      address={address}
                      reportCards={reportCards}
                    />
                  )}
                </div>
              )}
            </section>
          )}

          <footer className="page-footer">
            <span>
              <FiActivity /> Website Monitoring
            </span>
            <span>
              {lastUpdated
                ? `Last updated ${formatDate(lastUpdated)}`
                : "Waiting for monitor data"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
