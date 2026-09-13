import crypto from "node:crypto";
import net from "node:net";

const VERSION = "v1";

function secretKey(): Buffer {
  const raw = process.env.FIGRANIUM_OAUTH_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("FIGRANIUM_OAUTH_ENCRYPTION_KEY is required");
  const hex = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : undefined;
  const base64 = !hex ? Buffer.from(raw, "base64") : undefined;
  const key = hex ?? base64!;
  if (key.length !== 32) throw new Error("FIGRANIUM_OAUTH_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(value: string): string {
  const [version, ivRaw, tagRaw, cipherRaw] = value.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !cipherRaw) throw new Error("Unsupported encrypted secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function hashOpaqueSecret(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("base64url");
}

export function randomOpaqueSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

export function validatePkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const actual = crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
  return timingSafeEqualStrings(actual, challenge);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "::" || h === "::1" || h.startsWith("fc") || h.startsWith("fd") ||
    h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb");
}

export function validatePublicBaseUrl(raw: string): string {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("Figranium URL must be a valid absolute URL."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Figranium URL must use http:// or https://.");
  if (parsed.username || parsed.password) throw new Error("Figranium URL must not contain embedded credentials.");
  if (parsed.search || parsed.hash) throw new Error("Figranium URL must not contain a query string or fragment.");
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) throw new Error("Only publicly reachable Figranium instances are allowed.");
  const ip = net.isIP(host);
  if ((ip === 4 && isPrivateIpv4(host)) || (ip === 6 && isPrivateIpv6(host))) throw new Error("Only publicly reachable Figranium instances are allowed.");
  return parsed.toString().replace(/\/+$/, "");
}

export function issuerFromEnv(): string {
  const raw = process.env.OAUTH_ISSUER?.trim() || "https://mcp.figranium.dev";
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("OAUTH_ISSUER must use https://");
  return url.toString().replace(/\/+$/, "");
}

function authorizationSigningKey(): Buffer {
  return crypto.createHmac("sha256", secretKey()).update("figranium-oauth-authorization-state-v1").digest();
}

export function signAuthorizationRequest(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", authorizationSigningKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyAuthorizationRequest<T extends Record<string, unknown>>(token: string): T {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Invalid authorization request");
  const expected = crypto.createHmac("sha256", authorizationSigningKey()).update(body).digest("base64url");
  if (!timingSafeEqualStrings(expected, sig)) throw new Error("Invalid authorization request signature");
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  const exp = Number(parsed.exp ?? 0);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now()/1000)) throw new Error("Authorization request expired");
  return parsed;
}
