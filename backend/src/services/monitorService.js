import axios from "axios";
import { Monitor } from "../models/Monitor.js";
import { checkAvailability } from "./websiteService.js";

const mailer = (process.env.MAIL_MAILER || "brevo").toLowerCase();
const brevoApiKey = process.env.BREVO_API_KEY;
const mailFrom = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_FROM;
const rawMailFromName = process.env.MAIL_FROM_NAME;
const mailFromName = rawMailFromName?.trim();
const mailConfigured = mailer === "brevo" && brevoApiKey && mailFrom;

if (!mailConfigured) {
  console.warn(
    "Alert email is disabled: configure MAIL_MAILER=brevo, BREVO_API_KEY, and MAIL_FROM_ADDRESS.",
  );
}

async function sendAlertEmail({ to, subject, text }) {
  const { data } = await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { email: mailFrom, ...(mailFromName ? { name: mailFromName } : {}) },
      to: [{ email: to }],
      subject,
      textContent: text,
    },
    {
      timeout: 10000,
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    },
  );
  return data;
}

export async function runMonitorCheck(monitor) {
  const checkedAt = new Date(); const result = await checkAvailability(monitor.address);
  const previousStatus = monitor.currentStatus;
  const changed = previousStatus !== result.status;
  const newDowntime = result.status === "down" && previousStatus !== "down";
  if (changed) monitor.events.push({ status: result.status, previousStatus, checkedAt, message: result.message });
  monitor.currentStatus = result.status; monitor.lastCheckedAt = checkedAt;
  if (changed) monitor.lastStatusChangedAt = checkedAt;
  if (newDowntime) { monitor.lastDownAt = checkedAt; monitor.lastDownDurationSeconds = undefined; monitor.downAlertSentAt = undefined; monitor.downtimeCount += 1; }
  if (result.status === "up" && previousStatus === "down" && monitor.lastDownAt) {
    const duration = Math.max(0, Math.floor((checkedAt - monitor.lastDownAt) / 1000));
    monitor.lastDownDurationSeconds = duration; monitor.events[monitor.events.length - 1].downDurationSeconds = duration;
  }
  monitor.events = monitor.events.slice(-200); await monitor.save();
  const needsDownAlert = result.status === "down";
  let alertEmail = {
    status: result.status === "down" ? "pending" : "not_needed",
  };
  if (needsDownAlert && monitor.notificationEmail) {
    if (!mailConfigured) {
      alertEmail = { status: "not_configured" };
      console.error("Alert email skipped: Brevo API configuration is incomplete.");
    } else {
      try {
        const info = await sendAlertEmail({
          to: monitor.notificationEmail,
          subject: `Website down alert: ${monitor.address}`,
          text: `The monitored website ${monitor.address} was detected as down at ${checkedAt.toISOString()}.\n\nDetails: ${result.message}`,
        });
        monitor.downAlertSentAt = new Date();
        await monitor.save();
        alertEmail = { status: "accepted", messageId: info.messageId };
        console.info("Down check alert email accepted by Brevo", {
          address: monitor.address,
          messageId: info.messageId,
        });
      } catch (error) {
        alertEmail = { status: "failed", message: error.message };
        console.error("Alert email failed", error.code || "SMTP_ERROR", error.message);
      }
    }
  } else if (needsDownAlert) {
    alertEmail = { status: "no_recipient" };
  }
  return { monitor, alertEmail };
}

export async function checkDueMonitors() {
  const monitors = await Monitor.find({ isActive: true }); const now = Date.now();
  await Promise.all(monitors.filter((monitor) => !monitor.lastCheckedAt || now - monitor.lastCheckedAt.getTime() >= monitor.checkIntervalMinutes * 60000).map(runMonitorCheck));
}

export function monitorPayload(monitor) {
  if (!monitor) return { monitor: null, events: [] };
  const events = [...monitor.events].sort((a, b) => b.checkedAt - a.checkedAt).slice(0, 20);
  const all = [...monitor.events].sort((a, b) => a.checkedAt - b.checkedAt); let open; const downtimeRecords = [];
  for (const event of all) { if (event.status === "down" && event.previousStatus !== "down") open = { started_at: event.checkedAt, recovered_at: null, duration_seconds: null, ongoing: true }; if (event.status === "up" && event.previousStatus === "down" && open) { open.recovered_at = event.checkedAt; open.duration_seconds = event.downDurationSeconds ?? Math.floor((event.checkedAt - open.started_at) / 1000); open.ongoing = false; downtimeRecords.unshift(open); open = null; } }
  if (open) downtimeRecords.unshift(open);
  const lastDowntime = monitor.lastDownAt ? { started_at: monitor.currentStatus === "down" ? monitor.lastStatusChangedAt || monitor.lastDownAt : monitor.lastDownAt, duration_seconds: monitor.lastDownDurationSeconds, ongoing: monitor.currentStatus === "down" } : null;
  return { monitor: { address: monitor.address, notification_email: monitor.notificationEmail, status: monitor.currentStatus, check_interval_minutes: monitor.checkIntervalMinutes, is_active: monitor.isActive, downtime_count: monitor.downtimeCount, last_checked_at: monitor.lastCheckedAt, last_status_changed_at: monitor.lastStatusChangedAt, last_downtime: lastDowntime, downtime_records: downtimeRecords }, events };
}
