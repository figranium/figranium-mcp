import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchAuthenticatedTemplate } from "../src/template-http.js";

async function serve(handler: RequestListener): Promise<{ url: string; server: Server }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("template requests reject cross-origin redirects without leaking x-api-key", async () => {
  let leaked = false;
  let originalHeader: string | undefined;
  const destination = await serve((_request, response) => {
    leaked = true;
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"items":[]}');
  });
  const source = await serve((request, response) => {
    originalHeader = request.headers["x-api-key"] as string | undefined;
    response.writeHead(302, { location: `${destination.url}/stolen` });
    response.end();
  });
  try {
    await assert.rejects(
      fetchAuthenticatedTemplate(`${source.url}/api/templates`, "test-secret"),
      /refused HTTP redirect \(302\)/,
    );
    assert.equal(originalHeader, "test-secret");
    assert.equal(leaked, false);
  } finally {
    await Promise.all([close(source.server), close(destination.server)]);
  }
});

test("template requests still parse normal JSON responses", async () => {
  const source = await serve((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"items":[{"id":"template-1"}]}');
  });
  try {
    assert.deepEqual(
      await fetchAuthenticatedTemplate(`${source.url}/api/templates`, "test-secret"),
      { items: [{ id: "template-1" }] },
    );
  } finally {
    await close(source.server);
  }
});
