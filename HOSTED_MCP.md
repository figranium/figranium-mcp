# Hosted MCP (`mcp.figranium.dev`)

The hosted endpoint supports two authentication modes:

1. **OAuth 2.1 (recommended for Claude and ChatGPT)** — clients connect to `https://mcp.figranium.dev/mcp`, discover OAuth through RFC 9728 protected-resource metadata, and authorize a public self-hosted Figranium instance through the hosted authorization page.
2. **Legacy headers (fully backwards compatible)** — send `X-Figranium-Base-URL` plus either `X-Figranium-API-Key` or `Authorization: Bearer <FIGRANIUM_API_KEY>`.

## OAuth endpoints

- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` — RFC 9728 resource metadata
- `/.well-known/oauth-authorization-server` — RFC 8414 authorization-server metadata
- `/authorize` — authorization-code flow and the Figranium connection UI
- `/token` — authorization-code + refresh-token grants
- `/register` — RFC 7591 Dynamic Client Registration for compatibility with current MCP clients
- `/revoke` — RFC 7009 token revocation
- `/mcp` — protected MCP resource

PKCE `S256` and the RFC 8707 `resource=https://mcp.figranium.dev/mcp` parameter are required. Authorization responses include `iss` for RFC 9207 mix-up protection. Refresh tokens are rotated on every refresh. Access tokens, refresh tokens, authorization codes, and confidential-client secrets are stored only as SHA-256 hashes.

The July 28, 2026 MCP authorization specification prefers Client ID Metadata Documents (CIMD) over DCR. This server deliberately does **not** advertise CIMD yet because securely dereferencing attacker-controlled client metadata URLs requires DNS-aware SSRF/rebinding controls that are not currently available in this Vercel deployment. DCR remains supported by the current MCP specification for backward compatibility and is the interoperable registration path here.

## Required environment variables

- `DATABASE_URL` — Neon Postgres connection string.
- `FIGRANIUM_OAUTH_ENCRYPTION_KEY` — exactly 32 random bytes encoded as base64, or 64 hexadecimal characters. Used only for AES-256-GCM encryption of Figranium API keys and signing short-lived authorization form payloads.
- `OAUTH_ISSUER` — optional; defaults to `https://mcp.figranium.dev`. Production must use HTTPS.

Never commit these values. Run `migrations/001_oauth.sql` once against the Neon database before enabling OAuth.

## Data and security model

Each successful authorization creates a connection row containing the validated public Figranium URL and an AES-256-GCM encrypted API key. OAuth bearer tokens resolve to that connection on `/mcp`; the API key is decrypted only in memory immediately before creating the existing Figranium MCP server. Plaintext API keys, OAuth tokens, authorization codes, and client secrets are never written to the database or intentionally logged.

The authorization form validates credentials with a read-only `GET /api/tasks` request. Existing private-IP/localhost SSRF protections remain in force. Redirect URIs are exact-match validated. Public clients use PKCE; confidential DCR clients may additionally use `client_secret_basic`.

All durable OAuth state lives in Neon, so the flow is safe across Vercel serverless instances and cold starts.

## Validation

Run:

```bash
npm test
npm run build
```

The unit tests cover encryption, signed authorization requests, PKCE, and SSRF URL validation. The test suite also runs an in-process end-to-end OAuth flow with deterministic fake Neon/Figranium endpoints: DCR → authorization + PKCE → token exchange → authenticated MCP `initialize` → refresh rotation → revocation. Production deployment still requires applying the migration to a real Neon database and configuring the environment variables above.
