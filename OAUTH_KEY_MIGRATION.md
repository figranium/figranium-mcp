# OAuth encryption-key migration

The original `FIGRANIUM_OAUTH_ENCRYPTION_KEY` remains the legacy key. Never replace it in Vercel until all legacy ciphertext is migrated.

1. Add `FIGRANIUM_OAUTH_NEW_ENCRYPTION_KEY` in Vercel Production (a separate 32-byte key). Do not change the existing key.
2. Deploy dual-key support and verify that existing OAuth access tokens still resolve. With no primary flag, new connections continue to use v1.
3. Set `FIGRANIUM_OAUTH_KEY_PRIMARY=new` in Vercel Production and redeploy. New connections now use v2, while existing v1 records remain readable.
4. Before any bulk rotation, take a Neon restore point, prevent older Vercel deployments from writing new v1 credentials, and verify the database's actual `oauth_connections(id,api_key_ciphertext)` schema.
5. Run a separately authenticated, one-time server-side migration **inside the Vercel environment** that calls `reencryptLegacySecret` on each row and uses a compare-and-swap update (`WHERE id=$2 AND api_key_ciphertext=$3`). Never export plaintext, and do not expose a public migration endpoint without robust authentication and rate limiting.
6. Verify zero remaining v1 records and decrypt a sample of v2 records. Set the same new key and `FIGRANIUM_OAUTH_KEY_PRIMARY=new` on Cloudflare; test OAuth and MCP before domain cutover.
7. After cutover, remove legacy key dependencies only after all pending authorization requests signed by the legacy key have expired and existing connections have been verified.

Important: OAuth authorization state signing intentionally stays on the legacy key during transition, to avoid invalidating in-flight authorization requests. Before retiring the old key, migrate signing to an independently managed stable secret or a verified new-key strategy.

The `reencryptLegacySecret` function is a cryptographic migration primitive; this change does not execute a database migration or expose a migration endpoint.
