import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFigraniumServer } from "../src/mcp-server.js";

test("server overview is concise while operational guidance is in MCP instructions", async () => {
  const server = createFigraniumServer({ baseUrl: "https://cloud.figranium.dev", apiKey: "test" });
  const client = new Client({ name: "overview-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const overview = client.getServerVersion()?.description;
    assert.ok(overview && overview.includes("Figranium") && overview.length < 300);
    assert.doesNotMatch(overview, /SYSTEM INSTRUCTIONS|VARIABLE TEMPLATING/);
    assert.match(client.getInstructions() || "", /VARIABLE TEMPLATING SYNTAX/);
    assert.match(client.getInstructions() || "", /TASK VALIDATION/);
  } finally { await client.close(); await server.close(); }
});
