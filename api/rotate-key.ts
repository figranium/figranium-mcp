import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { reencryptLegacySecret } from "../src/security.js";
import { sql } from "../src/neon.js";

const LIMIT = 25;
const respond = (res: ServerResponse, status: number, data: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
};

function authorized(req: IncomingMessage): boolean {
  const secret = process.env.FIGRANIUM_OAUTH_MIGRATION_TOKEN;
  const supplied = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.headers.authorization || "")?.[1];
  if (!secret || !supplied) return false;
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return respond(res, 405, { error: "method_not_allowed" });
  if (!authorized(req)) return respond(res, 404, { error: "not_found" });
  if (process.env.FIGRANIUM_OAUTH_KEY_PRIMARY !== "new") {
    return respond(res, 409, { error: "new_key_not_primary" });
  }
  try {
    const rows = await sql<{ id: string; api_key_ciphertext: string }>(
      "SELECT id, api_key_ciphertext FROM oauth_connections WHERE api_key_ciphertext LIKE 'v1.%' ORDER BY id LIMIT $1",
      [LIMIT]
    );
    let migrated = 0;
    let conflicts = 0;
    for (const row of rows) {
      const next = reencryptLegacySecret(row.api_key_ciphertext);
      if (!next) continue;
      const updated = await sql<{ id: string }>(
        "UPDATE oauth_connections SET api_key_ciphertext=$1 WHERE id=$2 AND api_key_ciphertext=$3 RETURNING id",
        [next, row.id, row.api_key_ciphertext]
      );
      if (updated.length === 1) migrated++;
      else conflicts++;
    }
    const remaining = await sql<{ count: string }>(
      "SELECT count(*)::text AS count FROM oauth_connections WHERE api_key_ciphertext LIKE 'v1.%'"
    );
    return respond(res, 200, { migrated, conflicts, remaining: Number(remaining[0]?.count ?? 0), batchSize: LIMIT });
  } catch (error) {
    console.error("OAuth rotation failed", error instanceof Error ? error.name : "unknown");
    return respond(res, 500, { error: "rotation_failed" });
  }
}
