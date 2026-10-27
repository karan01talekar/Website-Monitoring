import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import cron from "node-cron";
import { Monitor } from "./models/Monitor.js";
import { User } from "./models/User.js";
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
import { createToken, hashPassword, readToken, verifyPassword } from "./services/authService.js";

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
    res.status(error.code === 11000 ? 409 : error.statusCode || 400).json({
      message: error.code === 11000 ? "An account with this email already exists." : error.message || "Request failed.",
    }),
  );
const authenticate = (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const claims = authorization.startsWith("Bearer ") ? readToken(authorization.slice(7)) : null;
  if (!claims) return res.status(401).json({ message: "Sign in to access this resource." });
  User.findById(claims.sub)
    .then((user) => {
      if (!user) return res.status(401).json({ message: "Account no longer exists." });
      req.user = user;
      next();
    })
    .catch(next);
};

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.post(
  "/api/auth/register",
  route(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || name.length > 100)
      return res.status(400).json({ message: "Name must be between 2 and 100 characters." });
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
      return res.status(400).json({ message: "Enter a valid email address." });
    if (password.length < 8 || password.length > 128)
      return res.status(400).json({ message: "Password must be between 8 and 128 characters." });
    if (await User.exists({ email }))
      return res.status(409).json({ message: "An account with this email already exists." });
    const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
    const firstAccount = await User.findOne().sort({ createdAt: 1, _id: 1 });
    if (firstAccount?.id === user.id) {
      // Monitors created before accounts existed have no owner. Let the initial
      // account adopt them so adding authentication does not hide existing data.
      await Monitor.updateMany(
        { $or: [{ userId: { $exists: false } }, { userId: null }] },
        { $set: { userId: user._id } },
      );
    }
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
  }),
);
app.post(
  "/api/auth/login",
  route(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return res.status(401).json({ message: "Email or password is incorrect." });
    res.json({
      token: createToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    });
  }),
);
app.get(
  "/api/auth/me",
  route(async (req, res) => {
    const authorization = req.get("authorization") || "";
    const claims = authorization.startsWith("Bearer ") ? readToken(authorization.slice(7)) : null;
    if (!claims) return res.status(401).json({ message: "Sign in to continue." });
    const user = await User.findById(claims.sub);
    if (!user) return res.status(401).json({ message: "Account no longer exists." });
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  }),
);
app.use("/api/reports", authenticate);
app.get(
  "/api/reports/monitors",
  route(async (_req, res) => {
    const monitors = await Monitor.find({ userId: _req.user.id, isActive: true }).sort({ updatedAt: -1 });
    res.json(
      monitors.map((monitor) => ({
        address: monitor.address,
        status: monitor.currentStatus,
        last_checked_at: monitor.lastCheckedAt,
        check_interval_minutes: monitor.checkIntervalMinutes,
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
    const monitor = await Monitor.findOne({ userId: req.user.id, addressHash: target.hash });
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
    const monitor = await Monitor.findOne({ userId: req.user.id, addressHash: target.hash });
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
      { userId: req.user.id, addressHash: target.hash },
      {
        userId: req.user.id,
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
        userId: req.user.id,
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
            { userId: req.user.id, addressHash: target.hash },
            {
              userId: req.user.id,
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
              userId: req.user.id,
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
    await Monitor.updateOne({ userId: req.user.id, addressHash: target.hash }, { isActive: false });
    res.json({
      message: "Monitoring stopped.",
    });
  }),
);

await mongoose.connect(
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/website_monitoring",
  { autoIndex: false },
);
await User.collection.createIndex({ email: 1 }, { unique: true });
const monitorIndexes = await Monitor.collection.indexes().catch((error) => {
  if (error.code === 26) return [];
  throw error;
});
const oldGlobalAddressIndex = monitorIndexes.find(
  (index) => index.unique && Object.keys(index.key).length === 1 && index.key.addressHash === 1,
);
if (oldGlobalAddressIndex) await Monitor.collection.dropIndex(oldGlobalAddressIndex.name);
await Monitor.collection.createIndex({ addressHash: 1 });
await Monitor.collection.createIndex({ userId: 1, addressHash: 1 }, { unique: true });
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
