import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFigraniumServer } from "../src/mcp-server.js";

test("v0.21 Baserow output and cron are discoverable and survive task creation", async () => {
  const originalFetch = globalThis.fetch;
  let submitted: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    submitted = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "task-test" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const server = createFigraniumServer({ baseUrl: "http://localhost:11345", apiKey: "test" });
  const client = new Client({ name: "baserow-schema-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    for (const name of ["create_task", "task_update"]) {
      const tool = tools.tools.find((item) => item.name === name);
      assert.ok(tool, `Missing ${name} tool`);
      const props = tool.inputSchema.properties as Record<string, any>;
      assert.equal(props.output.properties.provider.const, "baserow");
      assert.deepEqual(props.output.required, ["provider", "credentialId", "tableId"]);
      assert.equal(props.schedule.properties.cron.type, "string");
    }

    const resource = await client.readResource({ uri: "figranium://schemas/task-v1.json" });
    const entry = resource.contents[0];
    assert.ok(entry && "text" in entry);
    const schema = JSON.parse(entry.text);
    assert.equal(schema.properties.output.properties.provider.const, "baserow");
    assert.equal(schema.properties.schedule.properties.cron.type, "string");

    const output = {
      provider: "baserow",
      credentialId: "credential-1",
      databaseId: "database-1",
      tableId: "table-1",
      dedicated: true,
      onError: "fail",
    };
    const result = await client.callTool({
      name: "create_task",
      arguments: {
        name: "Baserow export",
        url: "https://example.com",
        mode: "agent",
        output,
        schedule: { enabled: false, cron: "0 9 * * *" },
      },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(submitted?.output, output);
    assert.deepEqual(submitted?.schedule, { enabled: false, cron: "0 9 * * *" });
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = originalFetch;
  }
});
