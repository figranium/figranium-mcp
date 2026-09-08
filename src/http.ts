import process from "process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createFigraniumServer } from "./mcp-server.js";

type HttpRequest = IncomingMessage & { body?: unknown };

function configureCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

export async function handleMcpHttpRequest(req: HttpRequest, res: ServerResponse) {
  configureCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const baseUrl = (process.env.FIGRANIUM_BASE_URL || "http://localhost:11345").replace(/\/+$/, "");
  const apiKey = process.env.FIGRANIUM_API_KEY;

  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "FIGRANIUM_API_KEY is not configured on the hosted MCP server." }));
    return;
  }

  const server = createFigraniumServer({ baseUrl, apiKey });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Failed to handle Figranium MCP HTTP request:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
