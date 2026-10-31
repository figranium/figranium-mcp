# Fresh OAuth database for Cloudflare MCP

Figranium MCP uses the existing OAuth schema but starts with empty OAuth records. No encryption-key migration is supported.

## Recommended: isolated fresh Neon database

Create a new Neon database or branch for MCP, apply the existing OAuth schema/migrations from this repository, and set the Cloudflare Worker's `DATABASE_URL` to the new database. Do not reuse or truncate a database containing unrelated Figranium application data.

Generate a new 32-byte key using `openssl rand -hex 32` and configure **only** `FIGRANIUM_OAUTH_ENCRYPTION_KEY` on Cloudflare. This is the sole encryption and authorization-state signing key.

Use `OAUTH_ISSUER=https://mcp.figranium.dev`. Deploy and verify the Worker and OAuth discovery/registration/PKCE/token flows before moving the domain. Existing clients must re-register/re-authorize; old access and refresh tokens are invalid in the new database.

After Cloudflare cutover, remove Vercel's legacy OAuth key, new encryption key, primary selector, and migration token from the retired Vercel project. Never copy old encrypted rows to the new database.

No automatic database deletion is performed by this change.
