import net from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createFigraniumServer } from "./mcp-server.js";

type HttpRequest = IncomingMessage & { body?: unknown };

const BASE_URL_HEADER = "x-figranium-base-url";
const API_KEY_HEADER = "x-figranium-api-key";

function configureCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Figranium-Base-URL, X-Figranium-API-Key, Mcp-Protocol-Version, Mcp-Session-Id",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractApiKey(req: IncomingMessage): string | undefined {
  const explicit = headerValue(req, API_KEY_HEADER)?.trim();
  if (explicit) return explicit;

  const authorization = headerValue(req, "authorization")?.trim();
  if (!authorization) return undefined;

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || undefined;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function validateBaseUrl(rawBaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error("X-Figranium-Base-URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("X-Figranium-Base-URL must use http:// or https://.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("X-Figranium-Base-URL must not contain embedded credentials.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("The hosted MCP server can only connect to publicly reachable Figranium instances.");
  }

  const ipVersion = net.isIP(hostname);
  if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    throw new Error("The hosted MCP server can only connect to publicly reachable Figranium instances.");
  }

  return parsed.toString().replace(/\/+$/, "");
}

function respondJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export async function handleMcpHttpRequest(req: HttpRequest, res: ServerResponse) {
  configureCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const rawBaseUrl = headerValue(req, BASE_URL_HEADER)?.trim();
  const apiKey = extractApiKey(req);

  if (!rawBaseUrl || !apiKey) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="Figranium MCP"');
    respondJson(res, 401, {
      error: "Figranium credentials are required.",
      required: {
        baseUrl: "X-Figranium-Base-URL",
        apiKey: "Authorization: Bearer <FIGRANIUM_API_KEY> or X-Figranium-API-Key",
      },
    });
    return;
  }

  let baseUrl: string;
  try {
    baseUrl = validateBaseUrl(rawBaseUrl);
  } catch (error) {
    respondJson(res, 400, {
      error: error instanceof Error ? error.message : "Invalid Figranium base URL.",
    });
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
      respondJson(res, 500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
