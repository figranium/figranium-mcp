import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFigraniumServer } from "../src/mcp-server.js";

test("v0.21 selector variables and conditions are exposed and preserved by create/update", async () => {
  const originalFetch = globalThis.fetch;
  const submitted: Record<string, any>[] = [];
  globalThis.fetch = async (_input, init) => {
    submitted.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "task_selector" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const server = createFigraniumServer({ baseUrl: "http://localhost:11345", apiKey: "test" });
  const client = new Client({ name: "selector-schema-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const types = ["string", "number", "boolean", "selector"];
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    for (const name of ["create_task", "task_update"]) {
      const tool = listed.tools.find((item) => item.name === name);
      assert.ok(tool, `Missing ${name} tool`);
      const props = tool.inputSchema.properties as Record<string, any>;
      assert.deepEqual(props.variables.additionalProperties.properties.type.enum, types);
      assert.deepEqual(props.actions.items.properties.conditionVarType.enum, types);
    }

    const resource = await client.readResource({ uri: "figranium://schemas/task-v1.json" });
    const entry = resource.contents[0];
    assert.ok(entry && "text" in entry);
    const schema = JSON.parse(entry.text);
    assert.deepEqual(schema.properties.variables.additionalProperties.properties.type.enum, types);
    assert.deepEqual(schema.properties.actions.items.properties.conditionVarType.enum, types);

    const actions = [
      { type: "if", conditionVar: "target", conditionVarType: "selector", conditionOp: "exists" },
      { type: "end" },
    ];
    const variables = { target: { type: "selector", value: ".submit" } };
    const created = await client.callTool({
      name: "create_task",
      arguments: { name: "Selector Task", url: "https://example.com", mode: "agent", actions, variables },
    });
    assert.notEqual(created.isError, true);
    const updated = await client.callTool({
      name: "task_update",
      arguments: { taskId: "task_selector", actions, variables },
    });
    assert.notEqual(updated.isError, true);
    assert.equal(submitted.length, 2);
    for (const payload of submitted) {
      assert.equal(payload.variables.target.type, "selector");
      assert.equal(payload.variables.target.value, ".submit");
      assert.equal(payload.actions[0].conditionVarType, "selector");
      assert.equal(payload.actions[0].conditionOp, "exists");
    }
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = originalFetch;
  }
});
