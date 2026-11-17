import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFigraniumServer } from "../src/mcp-server.js";

test("Folate tools replace headful mode and call /api/folate endpoints", async () => {
  const oldFetch = globalThis.fetch;
  const requests: { path: string; method: string; body: any; apiKey: string | null }[] = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const apiKey = new Headers(init?.headers).get("x-api-key");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path: url.pathname, method: init?.method || "GET", body, apiKey });

    if (url.pathname === "/api/folate/status") {
      return Response.json({ available: true, mode: "local", providers: ["CPUExecutionProvider"] });
    }
    if (url.pathname === "/api/folate/resolve") {
      return Response.json({
        selector: "#search-btn",
        score: 0.98,
        logit: 4.1,
        element: "<button id='search-btn'>Search</button>",
        matches: [{ selector: "#search-btn", score: 0.98 }],
      });
    }
    return new Response("Not Found", { status: 404 });
  };

  const server = createFigraniumServer({ baseUrl: "https://figranium.example.com", apiKey: "test-key" });
  const client = new Client({ name: "folate-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const instructions = client.getInstructions() || "";
    assert.match(instructions, /folate_resolve/);
    assert.doesNotMatch(instructions, /headful/i);

    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);
    assert.ok(toolNames.includes("folate_resolve"));
    assert.ok(toolNames.includes("folate_status"));

    const createTaskTool = tools.find((t) => t.name === "create_task");
    const modeEnum = (createTaskTool?.inputSchema as any)?.properties?.mode?.enum;
    assert.deepEqual(modeEnum, ["scrape", "agent"]);

    const headfulRejected = await client.callTool({
      name: "create_task",
      arguments: { name: "Debug", url: "https://example.com", mode: "headful" },
    });
    assert.equal(headfulRejected.isError, true);

    const invalidResolve = await client.callTool({
      name: "folate_resolve",
      arguments: { query: "   ", html: "<html></html>" },
    });
    assert.equal(invalidResolve.isError, true);

    const statusResult = await client.callTool({ name: "folate_status", arguments: {} });
    assert.notEqual(statusResult.isError, true);
    const statusJson = JSON.parse((statusResult.content as any)[0].text);
    assert.equal(statusJson.available, true);

    const resolveResult = await client.callTool({
      name: "folate_resolve",
      arguments: {
        query: "click Search button",
        html: "<button id='search-btn'>Search</button>",
        topK: 3,
        maxCandidates: 48,
      },
    });
    assert.notEqual(resolveResult.isError, true);
    const resolveJson = JSON.parse((resolveResult.content as any)[0].text);
    assert.equal(resolveJson.selector, "#search-btn");

    assert.deepEqual(
      requests.map((r) => [r.method, r.path, r.apiKey]),
      [
        ["GET", "/api/folate/status", "test-key"],
        ["POST", "/api/folate/resolve", "test-key"],
      ]
    );
    assert.deepEqual(requests[1].body, {
      query: "click Search button",
      html: "<button id='search-btn'>Search</button>",
      topK: 3,
      maxCandidates: 48,
    });

    const outOfRangeTopK = await client.callTool({
      name: "folate_resolve",
      arguments: { query: "click Search button", html: "<button>Search</button>", topK: 25 },
    });
    assert.equal(outOfRangeTopK.isError, true);

    const blankHtml = await client.callTool({
      name: "folate_resolve",
      arguments: { query: "click Search button", html: "   \n  " },
    });
    assert.equal(blankHtml.isError, true);
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = oldFetch;
  }
});

test("Folate tools surface HTTP 503/400 errors cleanly and support agent task creation flow", async () => {
  const oldFetch = globalThis.fetch;
  let failNextResolve = true;
  let createdTaskBody: any = null;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/folate/resolve") {
      if (failNextResolve) {
        failNextResolve = false;
        return Response.json({ error: "FOLATE_UNAVAILABLE" }, { status: 503 });
      }
      return Response.json({
        selector: "[data-testid='submit-order']",
        score: 0.95,
        logit: 3.8,
        element: "<button data-testid='submit-order'>Submit Order</button>",
        matches: [{ selector: "[data-testid='submit-order']", score: 0.95 }],
      });
    }
    if (url.pathname === "/api/v1/tasks" && init?.method === "POST") {
      createdTaskBody = JSON.parse(String(init.body));
      return Response.json({ id: "task_folate_1", ...createdTaskBody });
    }
    return new Response("Not Found", { status: 404 });
  };

  const server = createFigraniumServer({ baseUrl: "https://cloud.figranium.dev", apiKey: "test-key" });
  const client = new Client({ name: "folate-agent-flow-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // 1. Verify agent-facing guidance in both instructions and create_task description
    const instructions = client.getInstructions() || "";
    assert.match(instructions, /Always use Folate when finding selectors/);
    const { tools } = await client.listTools();
    const createTaskDesc = tools.find((t) => t.name === "create_task")?.description || "";
    assert.match(createTaskDesc, /folate_resolve/);

    // 2. Verify 503 FOLATE_UNAVAILABLE is surfaced as an MCP tool error
    const unavailable = await client.callTool({
      name: "folate_resolve",
      arguments: { query: "Submit Order button", html: "<button data-testid='submit-order'>Submit Order</button>" },
    });
    assert.equal(unavailable.isError, true);
    assert.match((unavailable.content as any)[0].text, /503/);
    assert.match((unavailable.content as any)[0].text, /FOLATE_UNAVAILABLE/);

    // 3. Verify agent resolves selector via folate_resolve and creates task with it
    const resolved = await client.callTool({
      name: "folate_resolve",
      arguments: { query: "Submit Order button", html: "<button data-testid='submit-order'>Submit Order</button>" },
    });
    assert.notEqual(resolved.isError, true);
    const { selector } = JSON.parse((resolved.content as any)[0].text);

    const created = await client.callTool({
      name: "create_task",
      arguments: {
        name: "Checkout",
        url: "https://example.com/checkout",
        mode: "agent",
        actions: [
          { type: "click", selector },
          { type: "wait_selector", selector: "folate: order confirmation banner" },
        ],
      },
    });
    assert.notEqual(created.isError, true);
    assert.equal(createdTaskBody.actions[0].selector, "[data-testid='submit-order']");
    assert.equal(createdTaskBody.actions[1].selector, "folate: order confirmation banner");
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = oldFetch;
  }
});
