import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFigraniumServer } from "../src/mcp-server.js";

test("Cloud routes Task operations with scoped credentials and reports queued executions", async () => {
  const oldFetch = globalThis.fetch;
  const requests: {path: string, method: string, body: any}[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(new Headers(init?.headers).get("x-api-key"), "test-key");
    requests.push({ path: url.pathname, method: init?.method || "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    const result = url.pathname === "/api/v1/tasks" && !init?.body ? [{ id: "123", name: "Example", url: "https://example.com", mode: "agent", actions: [{type:"click", selector:"#go"}] }] : url.pathname === "/api/executions" ? { executions: [] } : { id: "123", status: "queued" };
    return Response.json(result);
  };
  const server = createFigraniumServer({ baseUrl: "https://cloud.figranium.dev", apiKey: "test-key" });
  const client = new Client({ name: "cloud-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b); await client.connect(a);
    const tools = await client.listTools();
    assert.ok(!tools.tools.some(t => t.name.startsWith("schedule_") || t.name === "list_cabinets"));
    for (const [name, args] of [
      ["task_list", {}], ["create_task", {name:"Example", url:"https://example.com", mode:"agent"}],
      ["task_update", {taskId:"123", name:"New"}], ["task_delete", {taskId:"123"}],
      ["task_execute", {taskId:"123"}], ["execution_list", {}],
    ] as const) assert.notEqual((await client.callTool({name, arguments: args})).isError, true, name);
    const rejected = await client.callTool({name:"task_execute", arguments:{taskId:"123", variables:{x:"y"}}});
    assert.equal(rejected.isError, true);
    assert.equal(requests[3].body.actions[0].selector, "#go");
    assert.equal(requests[3].body.name, "New");
    assert.deepEqual(requests.map(r => [r.method,r.path]), [["GET","/api/v1/tasks"],["POST","/api/v1/tasks"],["GET","/api/v1/tasks"],["PUT","/api/v1/tasks/123"],["DELETE","/api/v1/tasks/123"],["POST","/api/v1/executions"],["GET","/api/executions"]]);
  } finally { await client.close(); await server.close(); globalThis.fetch = oldFetch; }
});
