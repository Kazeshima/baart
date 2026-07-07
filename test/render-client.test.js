import assert from "node:assert/strict";
import test from "node:test";
import { readJsonResponse, usesTauriRenderTransport } from "../video/render-client.js";

test("render transport detects the Tauri runtime", () => {
  const original = globalThis.isTauri;
  globalThis.isTauri = true;
  assert.equal(usesTauriRenderTransport(), true);
  if (original === undefined) delete globalThis.isTauri;
  else globalThis.isTauri = original;
  assert.equal(usesTauriRenderTransport(), Boolean(original));
});

test("HTTP render transport accepts JSON and reports server errors", async () => {
  const success = new Response(JSON.stringify({ id: "job-1", kind: "render", status: "queued" }), {
    status: 202,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  const parsed = await readJsonResponse(success);
  assert.equal(parsed.id, "job-1");
  assert.equal(parsed.kind, "render");

  const failure = new Response(JSON.stringify({ error: "renderer failed" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(readJsonResponse(failure), /renderer failed/);
});

test("HTTP render transport rejects HTML even with a successful status", async () => {
  const response = new Response("<!doctype html><title>BAART</title>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
  await assert.rejects(readJsonResponse(response), /non-JSON|text\/html/);
});
