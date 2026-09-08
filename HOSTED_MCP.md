# Hosted MCP

The hosted Figranium MCP gateway is designed to be served from `https://mcp.figranium.dev/mcp`.

Each caller supplies credentials for their own publicly reachable Figranium instance on every request. The hosted gateway does not use a shared Figranium instance and does not persist user credentials.

Required request headers:

- `X-Figranium-Base-URL: https://your-figranium-instance.example.com`
- `Authorization: Bearer <your Figranium API key>`

`X-Figranium-API-Key` is also accepted as an alternative to the Bearer header.

Localhost and private IP literals are rejected by the hosted gateway.
