import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import cron from "node-cron";
import { Monitor } from "./models/Monitor.js";
import {
  getDomainExpiry,
  getSslValidity,
  normalizeAddress,
  checkAvailability,
} from "./services/websiteService.js";
import {
  checkDueMonitors,
  monitorPayload,
  runMonitorCheck,
} from "./services/monitorService.js";

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = origin?.replace(/\/+$/, "");
      const isAllowed =
        !normalizedOrigin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(normalizedOrigin);
      callback(null, isAllowed);
    },
  }),
);
app.use(express.json());
const route = (handler) => (req, res) =>
  Promise.resolve(handler(req, res)).catch((error) =>
    res.status(400).json({ message: error.message || "Request failed." }),
  );

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get(
  "/api/reports/monitors",
  route(async (_req, res) => {
    const monitors = await Monitor.find({ isActive: true }).sort({ updatedAt: -1 });
    res.json(
      monitors.map((monitor) => ({
        address: monitor.address,
        status: monitor.currentStatus,
        last_checked_at: monitor.lastCheckedAt,
      })),
    );
  }),
);
app.get(
  "/api/reports/data",
  route(async (req, res) => {
    const target = await normalizeAddress(req.query.address);
    const isLocalTarget =
      target.host === "localhost" ||
      target.host.endsWith(".localhost") ||
      target.host.endsWith(".test") ||
      target.host === "127.0.0.1" ||
      target.host === "::1";
    const [uptime, domain_expiry, ssl] = await Promise.all([
      checkAvailability(target.address),
      getDomainExpiry(target.host),
      isLocalTarget
        ? Promise.resolve({
            status: "unknown",
            message:
              "SSL certificate checks are unavailable for local development addresses.",
          })
        : getSslValidity(target.host, 443),
    ]);
    const monitor = await Monitor.findOne({ addressHash: target.hash });
    if (monitor?.isActive && monitor.currentStatus !== uptime.status) {
      await runMonitorCheck(monitor);
    }
    res.json({
      domain: target.host,
      uptime: { ...uptime, http_status: uptime.httpStatus },
      domain_expiry,
      ssl,
    });
  }),
);
app.get(
  "/api/reports/monitor",
  route(async (req, res) => {
    const target = await normalizeAddress(req.query.address);
    const monitor = await Monitor.findOne({ addressHash: target.hash });
    if (
      monitor?.isActive &&
      (!monitor.lastCheckedAt ||
        Date.now() - monitor.lastCheckedAt.getTime() >=
          monitor.checkIntervalMinutes * 60000)
    ) {
      await runMonitorCheck(monitor);
    }
    res.json(monitorPayload(monitor));
  }),
);
app.post(
  "/api/reports/monitor",
  route(async (req, res) => {
    const { check_interval_minutes, notification_email } = req.body;
    if (![1, 2, 5, 15].includes(Number(check_interval_minutes)))
      throw new Error("Choose a check interval of 1, 2, 5, or 15 minutes.");
    if (!/^\S+@\S+\.\S+$/.test(String(notification_email || "")))
      throw new Error("Enter a valid notification email.");
    const target = await normalizeAddress(req.body.address);
    let monitor = await Monitor.findOneAndUpdate(
      { addressHash: target.hash },
      {
        address: target.address,
        host: target.host,
        notificationEmail: notification_email,
        checkIntervalMinutes: Number(check_interval_minutes),
        isActive: true,
      },
      { new: true },
    );
    if (!monitor)
      monitor = await Monitor.create({
        address: target.address,
        addressHash: target.hash,
        host: target.host,
        notificationEmail: notification_email,
        checkIntervalMinutes: Number(check_interval_minutes),
      });
    await runMonitorCheck(monitor);
    res.status(201).json(monitorPayload(monitor));
  }),
);
app.post(
  "/api/reports/monitors/batch",
  route(async (req, res) => {
    const addresses = Array.isArray(req.body.addresses)
      ? req.body.addresses.map((address) => String(address).trim()).filter(Boolean)
      : [];
    const { check_interval_minutes, notification_email } = req.body;
    if (!addresses.length || addresses.length > 50)
      throw new Error("Enter between 1 and 50 website addresses.");
    if (![1, 2, 5, 15].includes(Number(check_interval_minutes)))
      throw new Error("Choose a check interval of 1, 2, 5, or 15 minutes.");
    if (!/^\S+@\S+\.\S+$/.test(String(notification_email || "")))
      throw new Error("Enter a valid notification email.");

    const results = await Promise.all(
      addresses.map(async (rawAddress) => {
        try {
          const target = await normalizeAddress(rawAddress);
          let monitor = await Monitor.findOneAndUpdate(
            { addressHash: target.hash },
            {
              address: target.address,
              host: target.host,
              notificationEmail: notification_email,
              checkIntervalMinutes: Number(check_interval_minutes),
              isActive: true,
            },
            { new: true },
          );
          if (!monitor)
            monitor = await Monitor.create({
              address: target.address,
              addressHash: target.hash,
              host: target.host,
              notificationEmail: notification_email,
              checkIntervalMinutes: Number(check_interval_minutes),
            });
          await runMonitorCheck(monitor);
          return { address: target.address, success: true };
        } catch (error) {
          return { address: rawAddress, success: false, message: error.message };
        }
      }),
    );
    res.status(201).json({ results });
  }),
);
app.delete(
  "/api/reports/monitor",
  route(async (req, res) => {
    const target = await normalizeAddress(req.body.address);
    await Monitor.updateOne({ addressHash: target.hash }, { isActive: false });
    res.json({
      message: "Monitoring stopped.",
    });
  }),
);

await mongoose.connect(
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/website_monitoring",
);
cron.schedule("* * * * *", () =>
  checkDueMonitors().catch((error) =>
    console.error("Scheduled monitor check failed", error),
  ),
);
app.listen(Number(process.env.PORT || 4000), () =>
  console.log(
    `API listening on ${process.env.PORT || 4000}; allowed origins: ${allowedOrigins.join(", ") || "any"}`,
  ),
);
