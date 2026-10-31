import crypto from "node:crypto";
import net from "node:net";

const LEGACY_VERSION = "v1";
const NEW_VERSION = "v2";

function decodeKey(raw: string | undefined, name: string): Buffer {
  if (!raw?.trim()) throw new Error(`${name} is required`);
  const input = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(input) ? Buffer.from(input, "hex") : Buffer.from(input, "base64");
  if (key.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes`);
  return key;
}

function legacyKey(): Buffer {
  return decodeKey(process.env.FIGRANIUM_OAUTH_ENCRYPTION_KEY, "FIGRANIUM_OAUTH_ENCRYPTION_KEY");
}

function newKey(): Buffer {
  return decodeKey(process.env.FIGRANIUM_OAUTH_NEW_ENCRYPTION_KEY, "FIGRANIUM_OAUTH_NEW_ENCRYPTION_KEY");
}

function useNewKey(): boolean {
  return process.env.FIGRANIUM_OAUTH_KEY_PRIMARY === "new";
}

function seal(plaintext: string, key: Buffer, version: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function open(value: string, key: Buffer): string {
  const [version, ivRaw, tagRaw, cipherRaw, extra] = value.split(".");
  if ((version !== LEGACY_VERSION && version !== NEW_VERSION) || !ivRaw || !tagRaw || !cipherRaw || extra) {
    throw new Error("Unsupported encrypted secret format");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptSecret(plaintext: string): string {
  return useNewKey() ? seal(plaintext, newKey(), NEW_VERSION) : seal(plaintext, legacyKey(), LEGACY_VERSION);
}

export function decryptSecret(value: string): string {
  if (value.startsWith(NEW_VERSION + ".")) return open(value, newKey());
  if (value.startsWith(LEGACY_VERSION + ".")) return open(value, legacyKey());
  throw new Error("Unsupported encrypted secret format");
}

export function reencryptLegacySecret(value: string): string | undefined {
  if (!useNewKey()) throw new Error("New encryption key must be primary before rotation");
  if (value.startsWith(NEW_VERSION + ".")) {
    open(value, newKey());
    return undefined;
  }
  if (!value.startsWith(LEGACY_VERSION + ".")) throw new Error("Unsupported encrypted secret format");
  const plaintext = open(value, legacyKey());
  const rotated = seal(plaintext, newKey(), NEW_VERSION);
  if (open(rotated, newKey()) !== plaintext) throw new Error("Key rotation verification failed");
  return rotated;
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
  return crypto.createHmac("sha256", legacyKey()).update("figranium-oauth-authorization-state-v1").digest();
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
