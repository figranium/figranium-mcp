import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { handleMcpHttpRequest } from "../dist/http.js";
import { handleOAuthHttpRequest } from "../dist/oauth.js";
import agentSpec from "../AGENT_SPEC.md";

globalThis.__FIGRANIUM_AGENT_SPEC = agentSpec;

const oauthPaths = new Set([
  "/authorize", "/token", "/register", "/revoke",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server",
]);

let handler;
function getHandler() {
  if (handler) return handler;
  const server = createServer((req, res) => {
    const path = new URL(req.url || "/", "http://localhost").pathname;
    const operation = path === "/mcp" ? handleMcpHttpRequest
      : oauthPaths.has(path) ? handleOAuthHttpRequest
      : null;
    if (!operation) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    Promise.resolve(operation(req, res)).catch((error) => {
      console.error("MCP request failed", error instanceof Error ? error.name : "unknown_error");
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Internal server error" }));
      } else if (!res.writableEnded) res.end();
    });
  });
  server.listen(3000);
  handler = httpServerHandler({ port: 3000 });
  return handler;
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/index.html") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }
    if (!oauthPaths.has(path) && path !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }
    return getHandler().fetch(request, env, ctx);
  },
};
