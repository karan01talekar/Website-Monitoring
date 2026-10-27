import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
// Set AUTH_TOKEN_SECRET in production. The process-local fallback keeps a local
// development server usable while ensuring its tokens cannot be forged elsewhere.
const tokenSecret = process.env.AUTH_TOKEN_SECRET || randomBytes(32).toString("hex");

if (!process.env.AUTH_TOKEN_SECRET) {
  console.warn("AUTH_TOKEN_SECRET is not set; login tokens will expire when the server restarts.");
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt.toString("base64url")}.${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  const [saltText, keyText] = String(storedHash || "").split(".");
  if (!saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: String(userId), iat: now, exp: now + TOKEN_TTL_SECONDS });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", tokenSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

export function readToken(token) {
  const [header, payload, signature, extra] = String(token || "").split(".");
  if (!header || !payload || !signature || extra) return null;
  const unsigned = `${header}.${payload}`;
  const expected = createHmac("sha256", tokenSecret).update(unsigned).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims.sub && claims.exp > Math.floor(Date.now() / 1000) ? claims : null;
  } catch {
    return null;
  }
}
