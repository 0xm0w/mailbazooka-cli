import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/index.ts";

test("cli help renders usage with all primary commands", async () => {
  const lines: string[] = [];
  const io = {
    log: (l: string) => lines.push(l),
    err: (l: string) => lines.push(`ERR:${l}`),
    render: (t: string) => lines.push(t),
    readLine: async () => "",
  };

  const code = await run(["node", "mailbazooka", "help"], {}, io);
  assert.equal(code, 0);
  assert.match(lines[0], /mailbazooka connect/);
  assert.match(lines[0], /status/);
  assert.match(lines[0], /domains/);
  assert.match(lines[0], /health/);
  assert.match(lines[0], /metrics/);
  assert.match(lines[0], /replies/);
  assert.match(lines[0], /reply <email>/);
  assert.match(lines[0], /enroll/);
});

test("cli commands require api key when not provided", async () => {
  const errs: string[] = [];
  const io = {
    log: () => {},
    err: (l: string) => errs.push(l),
    render: () => {},
    readLine: async () => "",
  };

  let threw = false;
  try {
    await run(["node", "mailbazooka", "status"], {}, io);
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
  assert.match(errs[0], /no api key/);
});

test("cli replies and domains health commands require api key", async () => {
  const errs: string[] = [];
  const io = {
    log: () => {},
    err: (l: string) => errs.push(l),
    render: () => {},
    readLine: async () => "",
  };

  let threwReplies = false;
  try {
    await run(["node", "mailbazooka", "replies"], {}, io);
  } catch {
    threwReplies = true;
  }
  assert.equal(threwReplies, true);

  let threwHealth = false;
  try {
    await run(["node", "mailbazooka", "domains", "health", "example.com"], {}, io);
  } catch {
    threwHealth = true;
  }
  assert.equal(threwHealth, true);
});


test("reply refuses to record a reply without explicit --text (no canned default)", async () => {
  const errs: string[] = [];
  const io = { log: () => {}, err: (l: string) => errs.push(l), render: () => {}, readLine: async () => "" };
  const code = await run(["node", "mailbazooka", "reply", "lead@example.com"], { MAILBAZOOKA_API_KEY: "mb_x" }, io);
  assert.equal(code, 2);
  assert.match(errs[0], /--text/);
});

test("reply with --text posts exactly that text", async () => {
  const calls: unknown[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const io = { log: () => {}, err: () => {}, render: () => {}, readLine: async () => "" };
    const code = await run(["node", "mailbazooka", "reply", "lead@example.com", "--text", "Yes please", "--subject", "Re: hi"],
      { MAILBAZOOKA_API_KEY: "mb_x" }, io);
    assert.equal(code, 0);
    const c = calls[0] as { name: string; args: { from: string; subject: string; body: string } };
    assert.equal(c.name, "ingest_inbound_reply");
    assert.deepEqual(c.args, { from: "lead@example.com", subject: "Re: hi", body: "Yes please" });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("user-facing errors use the mailbazooka name", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/index.ts", "src/api.ts"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /run recurring/);
  }
});
