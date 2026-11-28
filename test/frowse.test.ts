import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFigraniumServer } from "../src/mcp-server.js";

async function connect(baseUrl: string) {
  const server = createFigraniumServer({ baseUrl, apiKey: "test-key" });
  const client = new Client({ name: "frowse-test", version: "1.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  return client;
}

test("Frowse tools drive a browser session through /api/frowse routes", async () => {
  const oldFetch = globalThis.fetch;
  const requests: { path: string; method: string; body: any; apiKey: string | null }[] = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path: url.pathname, method: init?.method || "GET", body, apiKey: new Headers(init?.headers).get("x-api-key") });
    if (url.pathname === "/api/frowse/status") return Response.json({ available: true, version: "0.1.2" });
    if (url.pathname === "/api/frowse/sessions" && init?.method === "DELETE") return Response.json({ closed: ["a"] });
    if (url.pathname.endsWith("/commands")) {
      switch (body.action) {
        case "snapshot": return Response.json({ result: { title: "Example", url: "https://example.com/", summary: "main:\n  link \"More\"" } });
        case "screenshot": return Response.json({ result: { mimeType: "image/png", bytes: 4, data: "UE5H" } });
        default: return Response.json({ result: { ok: body.action } });
      }
    }
    if (init?.method === "DELETE") return Response.json({ closed: true });
    return new Response("Not Found", { status: 404 });
  };

  try {
    const client = await connect("https://figranium.example.com");
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ["frowse_status", "frowse_open", "frowse_snapshot", "frowse_query", "frowse_click", "frowse_fill", "frowse_screenshot", "frowse_command", "frowse_close", "frowse_sessions"]) {
      assert.ok(names.includes(n), `missing ${n}`);
    }
    assert.match(client.getInstructions() || "", /frowse_snapshot/);
    assert.doesNotMatch(client.getInstructions() || "", /headful/i);

    assert.equal(JSON.parse((await client.callTool({ name: "frowse_status", arguments: {} }) as any).content[0].text).available, true);

    await client.callTool({ name: "frowse_open", arguments: { session: "s1", url: "https://example.com" } });
    const snap: any = await client.callTool({ name: "frowse_snapshot", arguments: { session: "s1" } });
    assert.match(snap.content[0].text, /^Example \| https:\/\/example\.com\/\nmain:/);

    await client.callTool({ name: "frowse_click", arguments: { session: "s1", selector: "More link" } });
    await client.callTool({ name: "frowse_get", arguments: { prop: "title" } });
    await client.callTool({ name: "frowse_command", arguments: { session: "s1", action: "eval", args: { js: "1+1" } } });

    const shot: any = await client.callTool({ name: "frowse_screenshot", arguments: { session: "s1", full: true } });
    assert.equal(shot.content[0].type, "image");
    assert.equal(shot.content[0].data, "UE5H");

    // Validation
    assert.equal(((await client.callTool({ name: "frowse_click", arguments: { session: "s1" } })) as any).isError, true);
    assert.equal(((await client.callTool({ name: "frowse_open", arguments: { session: "../x", url: "https://a.com" } })) as any).isError, true);
    assert.equal(((await client.callTool({ name: "frowse_command", arguments: { action: "rm" } })) as any).isError, true);

    await client.callTool({ name: "frowse_close", arguments: { session: "s1" } });
    await client.callTool({ name: "frowse_close", arguments: { all: true } });

    assert.deepEqual(
      requests.map((r) => [r.method, r.path, r.body?.action ?? null]),
      [
        ["GET", "/api/frowse/status", null],
        ["POST", "/api/frowse/sessions/s1/commands", "open"],
        ["POST", "/api/frowse/sessions/s1/commands", "snapshot"],
        ["POST", "/api/frowse/sessions/s1/commands", "click"],
        ["POST", "/api/frowse/sessions/default/commands", "get"],
        ["POST", "/api/frowse/sessions/s1/commands", "eval"],
        ["POST", "/api/frowse/sessions/s1/commands", "screenshot"],
        ["DELETE", "/api/frowse/sessions/s1", null],
        ["DELETE", "/api/frowse/sessions", null],
      ],
    );
    assert.deepEqual(requests[3].body.args, { selector: "More link" });
    assert.deepEqual(requests[5].body.args, { js: "1+1" });
    assert.ok(requests.every((r) => r.apiKey === "test-key"));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("Frowse tools are hidden on Figranium Cloud", async () => {
  const client = await connect("https://cloud.figranium.dev");
  const { tools } = await client.listTools();
  assert.equal(tools.some((t) => t.name.startsWith("frowse_")), false);
  const res: any = await client.callTool({ name: "frowse_status", arguments: {} });
  assert.equal(res.isError, true);
});
