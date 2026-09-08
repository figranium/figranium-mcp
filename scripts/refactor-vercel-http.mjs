import fs from "node:fs";

const sourcePath = "src/index.ts";
const source = fs.readFileSync(sourcePath, "utf8");

const configStartMarker = "const BASE_URL = (process.env.FIGRANIUM_BASE_URL || \"http://localhost:11345\").replace(/\\/+$/, \"\");";
const systemMarker = "const SYSTEM_INSTRUCTIONS = `";
const startMarker = "/**\n * Start the MCP Server using stdio transport\n */";

const configStart = source.indexOf(configStartMarker);
const systemStart = source.indexOf(systemMarker);
const startBlock = source.indexOf(startMarker);

if (configStart === -1 || systemStart === -1 || startBlock === -1) {
  throw new Error("Could not find one or more expected markers in src/index.ts");
}

let shared = source
  .replace(/^#!\/usr\/bin\/env node\n/, "")
  .replace('import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";\n', "");

const sharedConfigStart = shared.indexOf(configStartMarker);
const sharedSystemStart = shared.indexOf(systemMarker);
const sharedStartBlock = shared.indexOf(startMarker);

const factoryPrelude = `export interface FigraniumServerConfig {\n  baseUrl: string;\n  apiKey: string;\n}\n\nexport function createFigraniumServer({ baseUrl, apiKey }: FigraniumServerConfig) {\n  const BASE_URL = baseUrl.replace(/\\/+$/, \"\");\n  const API_KEY = apiKey;\n\n  // Use the official SDK for all communication with the Figranium API.\n  const figranium = new Figranium({\n    baseUrl: BASE_URL,\n    apiKey: API_KEY,\n    apiKeyHeader: \"x-api-key\",\n  });\n\n`;

shared =
  shared.slice(0, sharedConfigStart) +
  factoryPrelude +
  shared.slice(sharedSystemStart, sharedStartBlock) +
  "  return server;\n}\n";

fs.writeFileSync("src/mcp-server.ts", shared);

const stdioEntrypoint = `#!/usr/bin/env node\nimport process from \"process\";\nimport { StdioServerTransport } from \"@modelcontextprotocol/sdk/server/stdio.js\";\nimport { createFigraniumServer } from \"./mcp-server.js\";\n\nconst baseUrl = (process.env.FIGRANIUM_BASE_URL || \"http://localhost:11345\").replace(/\\/+$/, \"\");\nconst apiKey = process.env.FIGRANIUM_API_KEY;\n\nif (!apiKey) {\n  console.error(\"Missing required environment variable: FIGRANIUM_API_KEY.\");\n  console.error(\"Set FIGRANIUM_API_KEY before running, or configure your editor integration.\");\n  console.error(\"Example: FIGRANIUM_API_KEY=YOUR_API_KEY npx -y figranium-mcp\");\n  process.exit(1);\n}\n\nconst configuredApiKey = apiKey;\n\nasync function start() {\n  const server = createFigraniumServer({ baseUrl, apiKey: configuredApiKey });\n  const transport = new StdioServerTransport();\n  await server.connect(transport);\n  console.error(\"Figranium MCP Server is running...\");\n}\n\nstart().catch((error) => {\n  console.error(\"Failed to start Figranium MCP Server:\", error);\n  process.exit(1);\n});\n`;

fs.writeFileSync(sourcePath, stdioEntrypoint);

const httpEntrypoint = `import process from \"process\";\nimport type { IncomingMessage, ServerResponse } from \"node:http\";\nimport { StreamableHTTPServerTransport } from \"@modelcontextprotocol/sdk/server/streamableHttp.js\";\nimport { createFigraniumServer } from \"./mcp-server.js\";\n\ntype HttpRequest = IncomingMessage & { body?: unknown };\n\nfunction configureCors(res: ServerResponse) {\n  res.setHeader(\"Access-Control-Allow-Origin\", \"*\");\n  res.setHeader(\"Access-Control-Allow-Methods\", \"GET, POST, DELETE, OPTIONS\");\n  res.setHeader(\"Access-Control-Allow-Headers\", \"Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Session-Id\");\n  res.setHeader(\"Access-Control-Expose-Headers\", \"Mcp-Session-Id\");\n}\n\nexport async function handleMcpHttpRequest(req: HttpRequest, res: ServerResponse) {\n  configureCors(res);\n\n  if (req.method === \"OPTIONS\") {\n    res.statusCode = 204;\n    res.end();\n    return;\n  }\n\n  const baseUrl = (process.env.FIGRANIUM_BASE_URL || \"http://localhost:11345\").replace(/\\/+$/, \"\");\n  const apiKey = process.env.FIGRANIUM_API_KEY;\n\n  if (!apiKey) {\n    res.statusCode = 500;\n    res.setHeader(\"Content-Type\", \"application/json\");\n    res.end(JSON.stringify({ error: \"FIGRANIUM_API_KEY is not configured on the hosted MCP server.\" }));\n    return;\n  }\n\n  const server = createFigraniumServer({ baseUrl, apiKey });\n  const transport = new StreamableHTTPServerTransport({\n    sessionIdGenerator: undefined,\n    enableJsonResponse: true,\n  });\n\n  try {\n    await server.connect(transport);\n    await transport.handleRequest(req, res, req.body);\n  } catch (error) {\n    console.error(\"Failed to handle Figranium MCP HTTP request:\", error);\n    if (!res.headersSent) {\n      res.statusCode = 500;\n      res.setHeader(\"Content-Type\", \"application/json\");\n      res.end(JSON.stringify({\n        jsonrpc: \"2.0\",\n        error: { code: -32603, message: \"Internal server error\" },\n        id: null,\n      }));\n    } else if (!res.writableEnded) {\n      res.end();\n    }\n  } finally {\n    await transport.close().catch(() => undefined);\n    await server.close().catch(() => undefined);\n  }\n}\n`;

fs.writeFileSync("src/http.ts", httpEntrypoint);

fs.mkdirSync("api", { recursive: true });
fs.writeFileSync(
  "api/mcp.ts",
  `import type { IncomingMessage, ServerResponse } from \"node:http\";\nimport { handleMcpHttpRequest } from \"../src/http.js\";\n\ntype VercelRequest = IncomingMessage & { body?: unknown };\n\nexport default async function handler(req: VercelRequest, res: ServerResponse) {\n  await handleMcpHttpRequest(req, res);\n}\n`,
);

fs.writeFileSync(
  "vercel.json",
  `${JSON.stringify({ rewrites: [{ source: "/mcp", destination: "/api/mcp" }] }, null, 2)}\n`,
);

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.dependencies["@modelcontextprotocol/sdk"] = "^1.30.0";
fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

console.log("Prepared stdio + Streamable HTTP transport split for Vercel.");
