# Cloudflare Worker deployment

The hosted MCP service runs separately from the npm STDIO entry point.

1. Run `npm ci && npm run build && npm test`.
2. Run `npx wrangler deploy --dry-run` to verify bundling.
3. Set `DATABASE_URL` and `FIGRANIUM_OAUTH_ENCRYPTION_KEY` with `npx wrangler secret put NAME`. **Reuse the existing production Neon database and encryption key.**
4. Deploy with `npx wrangler deploy` to the temporary workers.dev address.
5. Verify OAuth metadata, registration, PKCE authorization and token exchange, refresh, revocation, and a real MCP tool call. Verify an existing OAuth token still works.
6. Only then attach `mcp.figranium.dev` to the Worker and remove the conflicting Vercel route.

Cloudflare Builds: build command `npm run build`; deploy command `npx wrangler deploy`. Install Wrangler in devDependencies and commit the updated lockfile before configuring automated builds.

The Worker routes MCP and OAuth through the existing Node-compatible handlers. It bundles AGENT_SPEC.md so MCP resource reads do not depend on a Worker filesystem. The npm STDIO entry point is unchanged.

**Not yet production verified:** the Cloudflare Node HTTP bridge, Neon OAuth persistence, and MCP streaming must pass live tests before the domain cutover.
