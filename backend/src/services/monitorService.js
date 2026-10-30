import nodemailer from "nodemailer";
import { Monitor } from "../models/Monitor.js";
import { checkAvailability } from "./websiteService.js";

const smtpHost = process.env.SMTP_HOST || process.env.MAIL_HOST;
const smtpPort = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
const smtpUser = process.env.SMTP_USER || process.env.MAIL_USERNAME;
const smtpPass = process.env.SMTP_PASS || process.env.MAIL_PASSWORD;
const encryption = (
  process.env.SMTP_ENCRYPTION || process.env.MAIL_ENCRYPTION || ""
).toLowerCase();
const mailFrom = process.env.MAIL_FROM || process.env.MAIL_FROM_ADDRESS || smtpUser;
const mailFromName = process.env.MAIL_FROM_NAME;
const formattedMailFrom = mailFromName && mailFrom
  ? { name: mailFromName, address: mailFrom }
  : mailFrom;
const transporter = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure:
        process.env.SMTP_SECURE === "true" ||
        encryption === "ssl" ||
        smtpPort === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    })
  : null;

if (!transporter) {
  console.warn("SMTP alert email is disabled: SMTP_HOST or MAIL_HOST is missing.");
} else if (!smtpUser || !smtpPass) {
  console.warn("SMTP alert email may fail: SMTP credentials are incomplete.");
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
  if (newDowntime && monitor.notificationEmail) {
    if (!transporter) {
      console.error("Alert email skipped: SMTP is not configured.");
    } else {
      try {
        const info = await transporter.sendMail({
          from: formattedMailFrom,
          to: monitor.notificationEmail,
          subject: `Website down alert: ${monitor.address}`,
          text: `The monitored website ${monitor.address} was detected as down at ${checkedAt.toISOString()}.\n\nDetails: ${result.message}`,
        });
        monitor.downAlertSentAt = new Date();
        await monitor.save();
        console.info("Alert email accepted by SMTP", {
          address: monitor.address,
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
        });
      } catch (error) {
        console.error("Alert email failed", error.code || "SMTP_ERROR", error.message);
      }
    }
  }
  return monitor;
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
