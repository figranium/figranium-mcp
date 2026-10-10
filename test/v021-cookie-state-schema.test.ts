import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFigraniumServer } from "../src/mcp-server.js";

test("v0.21 cookieStateId is discoverable in MCP tool and resource schemas", async () => {
  const server = createFigraniumServer({ baseUrl: "http://localhost:11345", apiKey: "test" });
  const client = new Client({ name: "schema-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    const create = tools.tools.find((item) => item.name === "create_task");
    const update = tools.tools.find((item) => item.name === "task_update");
    const createProperties = create?.inputSchema.properties as Record<string, unknown> | undefined;
    const updateProperties = update?.inputSchema.properties as Record<string, unknown> | undefined;
    assert.deepEqual((createProperties?.cookieStateId as { type: unknown }).type, ["string", "null"]);
    assert.deepEqual((updateProperties?.cookieStateId as { type: unknown }).type, ["string", "null"]);
    const resource = await client.readResource({ uri: "figranium://schemas/task-v1.json" });
    const contents = resource.contents[0];
    assert.ok(contents && "text" in contents);
    const schema = JSON.parse(contents.text);
    assert.deepEqual(schema.properties.cookieStateId.type, ["string", "null"]);
  } finally {
    await client.close();
    await server.close();
  }
});
