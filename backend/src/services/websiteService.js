import axios from "axios";
import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import tls from "tls";

const privateIpv4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
const isPrivateIp = (ip) => ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:") || privateIpv4.test(ip);

export async function normalizeAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Enter a website address to check.");
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try { url = new URL(candidate); } catch { throw new Error("Enter a valid HTTP or HTTPS website address."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || raw.length > 2048) {
    throw new Error("Enter a valid HTTP or HTTPS website address without credentials.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowLocal = process.env.ALLOW_LOCAL_TARGETS === "true";
  const isLocalHost = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".test") || (net.isIP(host) && isPrivateIp(host));
  if (url.port && !["80", "443"].includes(url.port) && !(allowLocal && isLocalHost)) {
    throw new Error("Public website checks support standard HTTP and HTTPS ports only.");
  }
  if (!allowLocal) {
    if (net.isIP(host) && isPrivateIp(host)) throw new Error("Local or private network targets are not allowed.");
    const records = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!records.length || records.some(({ address }) => isPrivateIp(address))) throw new Error("The address must resolve to a public website.");
  }
  url.hostname = host;
  if (url.pathname === "/") url.pathname = "";
  return { address: url.toString().replace(/\/$/, ""), host, hash: crypto.createHash("sha256").update(url.toString().replace(/\/$/, "")).digest("hex"), url };
}

export async function checkAvailability(address) {
  try {
    const response = await axios.get(address, { timeout: 8000, maxRedirects: 0, validateStatus: () => true });
    return { status: response.status >= 200 && response.status < 400 ? "up" : "down", httpStatus: response.status, message: `Website responded with HTTP ${response.status}.` };
  } catch (error) {
    return { status: "down", message: error.code === "ECONNABORTED" ? "The website check timed out." : "The website did not respond to the scheduled check." };
  }
}

function registeredDomain(host) {
  const parts = host.split(".");
  return parts.length < 3 ? host : parts.slice(-2).join(".");
}

export async function getDomainExpiry(host) {
  if (net.isIP(host) || !host.includes(".")) return { status: "unknown", message: "Domain expiry is unavailable for this address." };
  try {
    const { data } = await axios.get(`https://rdap.org/domain/${encodeURIComponent(registeredDomain(host))}`, { timeout: 6000, headers: { Accept: "application/rdap+json" } });
    const expiration = data.events?.find((event) => event.eventAction?.toLowerCase() === "expiration")?.eventDate;
    if (!expiration) return { status: "unknown", message: "No domain expiration date was published." };
    const expiresAt = new Date(expiration);
    const daysRemaining = Math.ceil((expiresAt - Date.now()) / 86400000);
    return { status: daysRemaining <= 0 ? "expired" : "valid", source: "rdap", expires_at: expiresAt.toISOString(), days_remaining: daysRemaining, has_expired: daysRemaining <= 0 };
  } catch { return { status: "unknown", message: "Domain expiry information is unavailable." }; }
}

export function getSslValidity(host, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 6000 }, () => {
      const cert = socket.getPeerCertificate(); socket.end();
      if (!cert?.valid_to) return resolve({ status: "unknown", message: "SSL certificate details are unavailable." });
      const expiresAt = new Date(cert.valid_to); const daysRemaining = Math.round((expiresAt - Date.now()) / 86400000);
      resolve({ status: daysRemaining < 0 ? "expired" : "valid", is_valid: daysRemaining >= 0, valid_from: new Date(cert.valid_from).toISOString(), expires_at: expiresAt.toISOString(), days_remaining: daysRemaining, issuer: cert.issuer?.O || cert.issuer?.CN });
    });
    socket.on("error", () => resolve({ status: "unknown", message: "The SSL certificate could not be read." }));
    socket.on("timeout", () => { socket.destroy(); resolve({ status: "unknown", message: "The SSL certificate check timed out." }); });
  });
}
