import React, { useCallback, useEffect, useState } from "react";
import { Head } from "@inertiajs/react";
import { FiRefreshCw, FiSearch, FiLock } from "react-icons/fi";
import api from "../../api";

type CheckResult = {
    status: string;
    is_valid?: boolean;
    has_expired?: boolean;
    message?: string;
    valid_from?: string;
    expires_at?: string;
    days_remaining?: number;
    issuer?: string;
    http_status?: number;
    running_since?: string;
};

type SiteReport = {
    domain: string;
    domain_expiry: CheckResult;
    ssl: CheckResult;
    uptime: CheckResult;
};

type MonitorState = {
    address: string;
    notification_email: string | null;
    status: string | null;
    check_interval_minutes: number;
    is_active: boolean;
    downtime_count: number;
    last_checked_at: string | null;
    last_status_changed_at: string | null;
    last_downtime: {
        started_at: string;
        duration_seconds: number | null;
        ongoing: boolean;
    } | null;
    downtime_records?: {
        started_at: string;
        recovered_at: string | null;
        duration_seconds: number | null;
        ongoing: boolean;
    }[];
};

const statusStyles: Record<string, string> = {
    valid: "bg-green-100 text-green-800",
    up: "bg-green-100 text-green-800",
    expired: "bg-red-100 text-red-800",
    invalid: "bg-red-100 text-red-800",
    down: "bg-red-100 text-red-800",
    unknown: "bg-gray-100 text-gray-700",
};

function formatExpiry(check?: CheckResult) {
    if (!check?.expires_at) {
        return check?.message || "Expiry information unavailable";
    }

    const date = new Date(check.expires_at).toLocaleString();
    const days = check.days_remaining;
    if (check.has_expired || check.status === "expired") {
        return `Expired ${date}`;
    }

    return `${date}${typeof days === "number" ? ` (${days} days remaining)` : ""}`;
}

function formatSslValidity(check?: CheckResult) {
    if (!check) {
        return "SSL certificate information unavailable";
    }

    if (!check.expires_at) {
        return check.message || "SSL certificate information unavailable";
    }

    const validFrom = check.valid_from
        ? new Date(check.valid_from).toLocaleString()
        : null;
    const expiresAt = new Date(check.expires_at).toLocaleString();
    const details = [
        validFrom ? `Valid from ${validFrom}` : null,
        `Expires ${expiresAt}`,
        typeof check.days_remaining === "number"
            ? `${check.days_remaining} days remaining`
            : null,
        check.issuer ? `Issued by ${check.issuer}` : null,
        check.message,
    ];

    return details.filter(Boolean).join(" · ");
}

function formatDuration(totalSeconds: number) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return [
        days > 0 ? `${days}d` : null,
        hours > 0 ? `${hours}h` : null,
        minutes > 0 ? `${minutes}m` : null,
        days === 0 ? `${remainingSeconds}s` : null,
    ]
        .filter(Boolean)
        .join(" ");
}

function formatTimestamp(timestamp?: string | null) {
    return timestamp ? new Date(timestamp).toLocaleString() : "Not available";
}

function normalizeMonitorAddress(address: string) {
    const trimmedAddress = address.trim();
    const input = /^https?:\/\//i.test(trimmedAddress)
        ? trimmedAddress
        : `${/^(localhost(?:\.|:|$)|127(?:\.|:)|\[::1\](?::|$)|::1(?::|$)|[^/]+\.test(?::|\/|$))/i.test(trimmedAddress) ? "http" : "https"}://${trimmedAddress}`;

    try {
        const url = new URL(input);
        const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
        const path = url.pathname === "/" ? "" : url.pathname;
        return `${url.protocol.toLowerCase()}//${hostname}${url.port ? `:${url.port}` : ""}${path}${url.search}`;
    } catch {
        return null;
    }
}

function isCurrentMonitorAddress(monitorAddress: string | null | undefined, address: string) {
    return Boolean(
        monitorAddress &&
        normalizeMonitorAddress(monitorAddress) === normalizeMonitorAddress(address)
    );
}

export default function Index({
    defaultAddress,
}: {
    defaultAddress: string;
}) {
    const [report, setReport] = useState<SiteReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [address, setAddress] = useState(defaultAddress || "");
    const [now, setNow] = useState(Date.now());
    const [monitor, setMonitor] = useState<MonitorState | null>(null);
    const [downtimePage, setDowntimePage] = useState(1);
    const [notificationEmail, setNotificationEmail] = useState("");
    const [monitorInterval, setMonitorInterval] = useState(1);
    const [monitorSaving, setMonitorSaving] = useState(false);
    const [monitorError, setMonitorError] = useState("");

    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, []);

    const refreshReport = useCallback(async (addressToCheck: string) => {
        if (!addressToCheck.trim()) {
            setReport(null);
            setLoading(false);
            setError("");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const response = await api.get("/reports/data", {
                params: { address: addressToCheck },
            });
            setReport(response.data);
        } catch (requestError) {
            console.error("Failed to load site reports:", requestError);
            const responseError = requestError as {
                response?: { data?: { errors?: { address?: string[] } } };
            };
            setError(
                responseError.response?.data?.errors?.address?.[0] ||
                    "Could not load the site report. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    const refreshMonitor = useCallback(async (addressToCheck: string) => {
        if (!addressToCheck.trim()) {
            setMonitor(null);
            return;
        }

        try {
            const response = await api.get("/reports/monitor", {
                params: { address: addressToCheck },
            });
            const nextMonitor = response.data.monitor as MonitorState | null;
            setMonitor(nextMonitor);
            if (nextMonitor) {
                setMonitorInterval(nextMonitor.check_interval_minutes);
                setMonitorError("");
                if (nextMonitor.status) {
                    setReport((current) => current
                        ? {
                            ...current,
                            uptime: {
                                ...current.uptime,
                                status: nextMonitor.status as string,
                                message: nextMonitor.status === "down"
                                    ? "The scheduled website check reports this site is down."
                                    : `Monitored site is up. Last checked ${formatTimestamp(nextMonitor.last_checked_at)}.`,
                            },
                        }
                        : current);
                }
            }
        } catch (requestError) {
            console.error("Failed to load website monitoring status:", requestError);
            setMonitorError("Could not load saved monitoring history.");
        }
    }, []);

    useEffect(() => {
        refreshReport(defaultAddress || "");
    }, [defaultAddress, refreshReport]);

    useEffect(() => {
        refreshMonitor(address);
    }, [address, refreshMonitor]);

    useEffect(() => {
        setDowntimePage(1);
    }, [address]);

    useEffect(() => {
        setNotificationEmail(
            monitor && isCurrentMonitorAddress(monitor.address, address)
                ? monitor.notification_email || ""
                : ""
        );
    }, [monitor?.address, address]);

    useEffect(() => {
        if (!monitor || !monitor.is_active || !isCurrentMonitorAddress(monitor.address, address)) {
            return;
        }
        const refresh = () => {
            refreshMonitor(address);
        };
        const intervalId = window.setInterval(refresh, 10_000);
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                refresh();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [address, monitor?.is_active, monitor?.address, refreshMonitor]);

    const startMonitoring = async () => {
        setMonitorSaving(true);
        setMonitorError("");
        try {
            const response = await api.post("/reports/monitor", {
                address,
                check_interval_minutes: monitorInterval,
                notification_email: notificationEmail,
            });
            setMonitor(response.data.monitor);
        } catch (requestError) {
            console.error("Failed to save website monitoring:", requestError);
            const responseError = requestError as {
                response?: { data?: { errors?: { address?: string[]; check_interval_minutes?: string[]; notification_email?: string[] } } };
            };
            setMonitorError(
                responseError.response?.data?.errors?.address?.[0] ||
                responseError.response?.data?.errors?.check_interval_minutes?.[0] ||
                responseError.response?.data?.errors?.notification_email?.[0] ||
                "Could not start monitoring this website."
            );
        } finally {
            setMonitorSaving(false);
        }
    };

    const stopMonitoring = async () => {
        setMonitorSaving(true);
        setMonitorError("");
        try {
            await api.delete("/reports/monitor", { data: { address } });
            setMonitor(null);
        } catch (requestError) {
            console.error("Failed to stop website monitoring:", requestError);
            setMonitorError("Could not stop monitoring this website.");
        } finally {
            setMonitorSaving(false);
        }
    };

    const cards = report
        ? [
              {
                  title: "Domain expiry",
                  detail: formatExpiry(report.domain_expiry),
                  check: report.domain_expiry,
              },
              {
                  title: "SSL certificate validity",
                  detail: formatSslValidity(report.ssl),
                  check: report.ssl,
              },
              {
                  title: "Website uptime",
                  detail:
                      report.uptime.status !== "up"
                          ? report.uptime.message || "Website is not responding"
                          : report.uptime.running_since
                            ? `Running for ${formatDuration(
                                  (now - new Date(report.uptime.running_since).getTime()) / 1000
                              )} (since ${new Date(report.uptime.running_since).toLocaleString()})`
                            : report.uptime.message || `Website responded`,
                  check: report.uptime,
              },
          ]
        : [];
    const downtimeRecords = monitor?.downtime_records || [];
    const downtimePageSize = 10;
    const downtimeTotalPages = Math.max(1, Math.ceil(downtimeRecords.length / downtimePageSize));
    const visibleDowntimeRecords = downtimeRecords.slice(
        (downtimePage - 1) * downtimePageSize,
        downtimePage * downtimePageSize
    );

    return (
        <div className="content-area min-h-screen bg-gray-50">
            <Head title="Site Reports" />
            <div className="w-full">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">Site Reports</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Domain, certificate, and live availability
                            {report?.domain ? ` (${report.domain})` : ""}.
                        </p>
                    </div>
                </div>

                <form
                    className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row"
                    onSubmit={(event) => {
                        event.preventDefault();
                        refreshReport(address);
                    }}
                >
                    <div className="relative flex-1 flex items-center">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <FiLock className="text-gray-500" />
                        </div>
                        <input
                            id="report-address"
                            type="text"
                            value={address}
                            onChange={(event) => setAddress(event.target.value)}
                            title="Enter the website URL to check"
                            placeholder="Enter website URL"
                            autoComplete="url"
                            className="min-w-0 w-full rounded-md border border-gray-200 bg-gray-50 pl-9 pr-32 py-2 text-sm text-gray-700 outline-none cursor-default font-mono select-all"
                        />
                        <span className="absolute right-3 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-medium">
                            Website URL
                        </span>
                    </div>
                    <button
                        type="submit"
                        disabled={loading || !address.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <FiRefreshCw className={loading ? "animate-spin" : ""} />
                        Ping Website
                    </button>
                </form>

                <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <label htmlFor="monitor-interval" className="mb-1 block text-sm font-medium text-gray-700">
                                Website status Monitor
                            </label>
                            <select
                                id="monitor-interval"
                                value={monitorInterval}
                                onChange={(event) => setMonitorInterval(Number(event.target.value))}
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:max-w-xs"
                            >
                                {[1, 2, 5, 15].map((minutes) => (
                                    <option key={minutes} value={minutes}>
                                        Every {minutes} {minutes === 1 ? "minute" : "minutes"}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label htmlFor="monitor-notification-email" className="mb-1 block text-sm font-medium text-gray-700">
                                Down alert email
                            </label>
                            <input
                                id="monitor-notification-email"
                                type="email"
                                required
                                maxLength={255}
                                value={notificationEmail}
                                onChange={(event) => setNotificationEmail(event.target.value)}
                                placeholder="name@example.com"
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={startMonitoring}
                            disabled={monitorSaving || !address.trim()}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isCurrentMonitorAddress(monitor?.address, address) && monitor?.is_active
                                ? "Update monitoring"
                                : "Start monitoring"}
                        </button>
                        {isCurrentMonitorAddress(monitor?.address, address) && monitor?.is_active && (
                            <button
                                type="button"
                                onClick={stopMonitoring}
                                disabled={monitorSaving}
                                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Stop
                            </button>
                        )}
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                        Background checks continue while you are away when Laravel's scheduler is running.
                    </p>

                    {monitorError && (
                        <p role="alert" className="mt-3 text-sm text-red-700">{monitorError}</p>
                    )}

                    {isCurrentMonitorAddress(monitor?.address, address) && monitor && (
                        <div className="mt-5 border-t border-gray-100 pt-4">
                            <h2 className="text-base font-semibold text-gray-800">Monitoring history</h2>
                            <p className="mt-2 text-sm text-gray-600">
                                Current monitored status:{" "}
                                <span className="font-semibold capitalize">{monitor.status || "pending"}</span>
                                {" · "}
                                Website down {monitor.downtime_count} {monitor.downtime_count === 1 ? "time" : "times"}
                                {monitor.is_active
                                    ? ` · Last checked: ${formatTimestamp(monitor.last_checked_at)}`
                                    : " · Monitoring stopped; saved history is retained."}
                               
                            </p>
                            {monitor.last_downtime ? (
                                <p className="mt-2 text-sm text-gray-600">
                                    Last down: {formatTimestamp(monitor.last_downtime.started_at)}
                                    {" · "}
                                    {monitor.last_downtime.ongoing
                                        ? `Ongoing for ${formatDuration((now - new Date(monitor.last_downtime.started_at).getTime()) / 1000)}`
                                        : `Duration ${formatDuration(monitor.last_downtime.duration_seconds || 0)}`}
                                </p>
                            ) : (
                                <p className="mt-2 text-sm text-gray-600">
                                    No downtime has been recorded since monitoring started.
                                </p>
                            )}

                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                                    <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                                        <tr>
                                            <th scope="col" className="px-4 py-3 font-medium">Down since</th>
                                            <th scope="col" className="px-4 py-3 font-medium">Recovered at</th>
                                            <th scope="col" className="px-4 py-3 font-medium">Duration</th>
                                            <th scope="col" className="px-4 py-3 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
                                        {downtimeRecords.length > 0 ? (
                                            visibleDowntimeRecords.map((record, index) => (
                                                <tr key={`${record.started_at}-${index}`}>
                                                    <td className="whitespace-nowrap px-4 py-3">{formatTimestamp(record.started_at)}</td>
                                                    <td className="whitespace-nowrap px-4 py-3">{record.recovered_at ? formatTimestamp(record.recovered_at) : "—"}</td>
                                                    <td className="whitespace-nowrap px-4 py-3">
                                                        {record.ongoing
                                                            ? `Ongoing for ${formatDuration((now - new Date(record.started_at).getTime()) / 1000)}`
                                                            : formatDuration(record.duration_seconds || 0)}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3">
                                                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${record.ongoing ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}`}>
                                                            {record.ongoing ? "Ongoing" : "Recovered"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                                                    No downtime records yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {downtimeRecords.length > downtimePageSize && (
                                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                                    <p className="text-gray-500">
                                        Showing {(downtimePage - 1) * downtimePageSize + 1}–
                                        {Math.min(downtimePage * downtimePageSize, downtimeRecords.length)} of{" "}
                                        {downtimeRecords.length} records
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setDowntimePage((page) => Math.max(1, page - 1))}
                                            disabled={downtimePage === 1}
                                            className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Previous
                                        </button>
                                        <span className="whitespace-nowrap text-gray-600">
                                            Page {downtimePage} of {downtimeTotalPages}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setDowntimePage((page) => Math.min(downtimeTotalPages, page + 1))}
                                            disabled={downtimePage === downtimeTotalPages}
                                            className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </section>

                {error && (
                    <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                    {cards.map(({ title, detail, check }) => (
                        <section key={title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="text-base font-semibold text-gray-800">{title}</h2>
                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[check.status] || statusStyles.unknown}`}>
                                    {check.status}
                                </span>
                            </div>
                            <p className="mt-4 min-h-12 break-words text-sm text-gray-600">
                                {loading ? "Checking..." : detail}
                            </p>
                        </section>
                    ))}
                    {loading && cards.length === 0 && [1, 2, 3].map((card) => (
                        <div key={card} className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white" />
                    ))}
                </div>
            </div>
        </div>
    );
}
