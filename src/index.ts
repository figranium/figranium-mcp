#!/usr/bin/env node
import process from "process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFigraniumServer } from "./mcp-server.js";

const baseUrl = (process.env.FIGRANIUM_BASE_URL || "http://localhost:11345").replace(/\/+$/, "");
const apiKey = process.env.FIGRANIUM_API_KEY;

if (!apiKey) {
  console.error("Missing required environment variable: FIGRANIUM_API_KEY.");
  console.error("Set FIGRANIUM_API_KEY before running, or configure your editor integration.");
  console.error("Example: FIGRANIUM_API_KEY=YOUR_API_KEY npx -y figranium-mcp");
  process.exit(1);
}

const configuredApiKey = apiKey;

async function start() {
  const server = createFigraniumServer({ baseUrl, apiKey: configuredApiKey });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Figranium MCP Server is running...");
}

start().catch((error) => {
  console.error("Failed to start Figranium MCP Server:", error);
  process.exit(1);
});
