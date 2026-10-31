# Migrate Figranium MCP OAuth encryption keys

This procedure requires the old encryption key to remain set in Vercel. Never paste secrets into GitHub or chat.

1. In Vercel Production, retain `FIGRANIUM_OAUTH_ENCRYPTION_KEY`. Add `FIGRANIUM_OAUTH_NEW_ENCRYPTION_KEY` (new 32-byte key). Deploy this change and verify existing MCP OAuth clients.
2. Create a Neon restore point before rotating any records. Generate a separate admin token using `openssl rand -hex 32`. Add it to Vercel Production as `FIGRANIUM_OAUTH_MIGRATION_TOKEN`.
3. Set `FIGRANIUM_OAUTH_KEY_PRIMARY=new` in Vercel Production, redeploy, and verify new OAuth connections work. New credentials now use v2. Authorization state is signed with the new key, while verification temporarily accepts old signatures.
4. Invoke the migration only over HTTPS. Set `MIGRATION_TOKEN` in your local shell (read securely without echoing it) and run:

   `curl --fail-with-body -sS -X POST -H "Authorization: Bearer ${MIGRATION_TOKEN}" https://mcp.figranium.dev/api/rotate-key`

   Repeat until `remaining` is zero. Each invocation migrates at most 25 rows, with a conditional update to avoid overwriting concurrent changes. No API keys are returned. A failure stops the batch; investigate rather than retrying indefinitely.
5. Confirm the count with a read-only Neon query: `SELECT count(*) FROM oauth_connections WHERE api_key_ciphertext LIKE 'v1.%';`. It must be zero. Check that there are no unknown ciphertext formats and verify live OAuth token refresh and MCP calls.
6. Configure Cloudflare with `DATABASE_URL`, `FIGRANIUM_OAUTH_NEW_ENCRYPTION_KEY`, and `FIGRANIUM_OAUTH_KEY_PRIMARY=new`; test on workers.dev. The original encryption key is not required on Cloudflare after all v1 rows are migrated.
7. Move the domain only after runtime validation. Remove the temporary `api/rotate-key.ts` endpoint and `FIGRANIUM_OAUTH_MIGRATION_TOKEN` after successful cutover.

Do not delete the original key from Vercel until cutover is verified. Prevent older Vercel deployments from creating new v1 records during migration. Use a maintenance window if necessary.

The endpoint is only accessible to holders of the migration token and is intentionally absent from the Cloudflare Worker routing table. Protect the token as a production administrator credential.
