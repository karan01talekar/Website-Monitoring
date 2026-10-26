import { useCallback, useEffect, useState } from "react";
import { FiActivity, FiRefreshCw, FiSearch, FiXCircle } from "react-icons/fi";
import api from "./api";

const statusClass = (status) =>
  `badge ${["up", "valid"].includes(status) ? "good" : ["down", "expired", "invalid"].includes(status) ? "bad" : "neutral"}`;
const formatDate = (value) =>
  value ? new Date(value).toLocaleString() : "Not available";

export default function App() {
  const [address, setAddress] = useState("");
  const [report, setReport] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [batchAddresses, setBatchAddresses] = useState("");
  const [batchEmail, setBatchEmail] = useState("");
  const [batchInterval, setBatchInterval] = useState(1);
  const [batchSaving, setBatchSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [interval, setIntervalValue] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const getMonitor = useCallback(async (target) => {
    if (!target.trim()) return setMonitor(null);
    try {
      const { data } = await api.get("/reports/monitor", {
        params: { address: target },
      });
      setMonitor(data.monitor);
      if (data.monitor) {
        setEmail(data.monitor.notification_email || "");
        setIntervalValue(data.monitor.check_interval_minutes);
        if (data.monitor.status) {
          setReport((current) =>
            current
              ? {
                  ...current,
                  uptime: {
                    ...current.uptime,
                    status: data.monitor.status,
                    message:
                      data.monitor.status === "down"
                        ? "The scheduled website check reports this site is down."
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
  }, []);
  const check = useCallback(
    async (target = address) => {
      if (!target.trim()) return setMessage("Enter a website address.");
      setLoading(true);
      setMessage("");
      try {
        const { data } = await api.get("/reports/data", {
          params: { address: target },
        });
        setReport(data);
        await getMonitor(target);
      } catch (error) {
        setMessage(
          error.response?.data?.message || "Could not check this website.",
        );
      } finally {
        setLoading(false);
      }
    },
    [address, getMonitor],
  );
  useEffect(() => {
    const timer = window.setInterval(() => getMonitor(address), 10000);
    return () => window.clearInterval(timer);
  }, [address, getMonitor]);
  async function startMonitoring() {
    setSaving(true);
    setMessage("");
    try {
      const { data } = await api.post("/reports/monitor", {
        address,
        notification_email: email,
        check_interval_minutes: Number(interval),
      });
      setMonitor(data.monitor);
      setMessage("Monitoring is active.");
    } catch (error) {
      setMessage(
        error.response?.data?.message || "Could not start monitoring.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function stopMonitoring() {
    try {
      await api.delete("/reports/monitor", { data: { address } });
      setMonitor((current) =>
        current ? { ...current, is_active: false } : current,
      );
      setMessage("Monitoring stopped.");
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not stop monitoring.");
    }
  }
  async function startBatchMonitoring() {
    const addresses = batchAddresses.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (!addresses.length) return setMessage("Enter at least one website address.");
    setBatchSaving(true);
    setMessage("");
    try {
      const { data } = await api.post("/reports/monitors/batch", {
        addresses,
        notification_email: batchEmail,
        check_interval_minutes: Number(batchInterval),
      });
      const failures = data.results.filter((result) => !result.success);
      const successes = data.results.length - failures.length;
      const firstAddedAddress = data.results.find((result) => result.success)?.address;
      if (firstAddedAddress) {
        setAddress(firstAddedAddress);
        await check(firstAddedAddress);
      }
      setMessage(
        failures.length
          ? `${successes} URL(s) started. ${failures.length} could not be added: ${failures[0].message}`
          : `${successes} URL(s) are now being monitored.`,
      );
      if (!failures.length) setBatchAddresses("");
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not start monitoring the URLs.");
    } finally {
      setBatchSaving(false);
    }
  }
  const cards = report
    ? [
        {
          name: "Domain expiry",
          check: report.domain_expiry,
          body: report.domain_expiry.expires_at
            ? `${formatDate(report.domain_expiry.expires_at)} · ${report.domain_expiry.days_remaining} days remaining`
            : report.domain_expiry.message,
        },
        {
          name: "SSL certificate",
          check: report.ssl,
          body: report.ssl.expires_at
            ? `Expires ${formatDate(report.ssl.expires_at)} · ${report.ssl.days_remaining} days remaining${report.ssl.issuer ? ` · ${report.ssl.issuer}` : ""}`
            : report.ssl.message,
        },
        {
          name: "Live availability",
          check: report.uptime,
          body: `${report.uptime.message || ""}${report.uptime.http_status ? ` (HTTP ${report.uptime.http_status})` : ""}`,
        },
      ]
    : [];
  return (
    <main>
      <header>
        <div>
          <FiActivity />
          <span>Website Monitoring</span>
        </div>
        <p>Website status, SSL validity, domain expiry, and downtime alerts.</p>
      </header>
      <section className="panel" style={{ display: "none" }}>
        <label>Website address</label>
        <div className="search">
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && check()}
            placeholder="Enter a public website URL"
          />
          <button onClick={() => check()} disabled={loading}>
            {loading ? <FiRefreshCw className="spin" /> : <FiSearch />}{" "}
            {loading ? "Checking" : "Check website"}
          </button>
        </div>
      </section>
      <section className="panel batch-panel">
        <div className="title">
          <div>
            <h2>Website addresses</h2>
            <p>Enter one or more public website addresses, one per line. The same alert email and interval apply to each URL.</p>
          </div>
        </div>
        <textarea
          value={batchAddresses}
          onChange={(event) => setBatchAddresses(event.target.value)}
          placeholder="Enter one public website URL per line"
          rows="5"
        />
        <div className="form">
          <label>
            Alert email
            <input type="email" value={batchEmail} onChange={(event) => setBatchEmail(event.target.value)} placeholder="alerts@example.com" />
          </label>
          <label>
            Check every
            <select value={batchInterval} onChange={(event) => setBatchInterval(event.target.value)}>
              <option value="1">1 minute</option>
              <option value="2">2 minutes</option>
              <option value="5">5 minutes</option>
              <option value="15">15 minutes</option>
            </select>
          </label>
          <button onClick={startBatchMonitoring} disabled={batchSaving}>{batchSaving ? "Adding…" : "Start all monitors"}</button>
        </div>
      </section>
      {message && <p className="message">{message}</p>}
      {report && (
        <>
          <section className="summary">
            <h1>{report.domain}</h1>
          </section>
          <section className="cards">
            {cards.map(({ name, check: result, body }) => (
              <article key={name}>
                <div className="title">
                  <h2>{name}</h2>
                  <span className={statusClass(result.status)}>
                    {result.status}
                  </span>
                </div>
                <p>{body || "Information unavailable"}</p>
              </article>
            ))}
          </section>
          <section className="panel">
            <div className="title">
              <div>
                <h2>Uptime monitoring</h2>
                <p>
                  Scheduled checks send an email when this website becomes
                  unavailable.
                </p>
              </div>
              {monitor?.is_active && <span className="badge good">Active</span>}
            </div>
            <div className="form">
              <label>
                Alert email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="alerts@example.com"
                />
              </label>
              <label>
                Check every
                <select
                  value={interval}
                  onChange={(event) => setIntervalValue(event.target.value)}
                >
                  <option value="1">1 minute</option>
                  <option value="2">2 minutes</option>
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                </select>
              </label>
              <button onClick={startMonitoring} disabled={saving}>
                {saving
                  ? "Saving…"
                  : monitor?.is_active
                    ? "Update monitoring"
                    : "Start monitoring"}
              </button>
              {monitor?.is_active && (
                <button className="danger" onClick={stopMonitoring}>
                  <FiXCircle /> Stop
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
