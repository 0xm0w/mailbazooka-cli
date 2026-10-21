import test from "node:test";
import assert from "node:assert/strict";
import { run, HELP } from "../src/index.ts";

function harness() {
  const out: string[] = [];
  const io = {
    log: (l: string) => out.push(l),
    err: (l: string) => out.push(`ERR:${l}`),
    render: (t: string) => out.push(t),
    readLine: async () => "",
  };
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    const reply = body.name === "get_status"
      ? { tier: "free", armed: { used: 0, cap: 1 }, recipients: { used: 3, cap: 50 }, sendsToday: { used: 1, cap: 100, label: "Workspace" }, enroll: true, footer: true }
      : { ok: true };
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
  const env = { MAILBAZOOKA_API_KEY: "mb_test", MAILBAZOOKA_BASE_URL: "https://api.example.test" };
  const go = (...a: string[]) => run(["node", "mailbazooka", ...a], { ...env }, io);
  return { out, calls, go, restore: () => { globalThis.fetch = realFetch; } };
}

test("--help lists every command", async () => {
  const h = harness();
  try {
    assert.equal(await h.go("--help"), 0);
    for (const c of ["connect", "status", "plan", "sender pause", "sender resume", "subscribers remove <email> --yes", "broadcast create", "broadcast edit", "logs", "events", "keys", "domains", "reply <email>", "enroll", "arm <id>"]) {
      assert.ok(h.out[0].includes(c), c);
    }
    assert.equal(h.out[0], HELP);
    assert.equal(h.calls.length, 0);
  } finally { h.restore(); }
});

test("sender status/pause/resume call only the account sender tools", async () => {
  const h = harness();
  try {
    await h.go("sender");
    await h.go("sender", "pause");
    await h.go("sender", "resume");
    assert.deepEqual(h.calls.map((c) => c.name), ["get_sender", "pause_sender", "resume_sender"]);
    assert.equal(await h.go("sender", "killswitch"), 2);
    assert.equal(h.calls.length, 3);
  } finally { h.restore(); }
});

test("subscribers remove needs --yes", async () => {
  const h = harness();
  try {
    assert.equal(await h.go("subscribers", "remove", "a@x.com"), 2);
    assert.equal(h.calls.length, 0);
    assert.equal(await h.go("subscribers", "remove", "a@x.com", "--yes"), 0);
    assert.deepEqual(h.calls[0], { name: "remove_subscriber", args: { email: "a@x.com", confirm: true } });
    await h.go("subscribers");
    assert.equal(h.calls[1].name, "list_subscribers");
  } finally { h.restore(); }
});

test("broadcast create/edit, logs, events, plan, keys", async () => {
  const h = harness();
  try {
    assert.equal(await h.go("broadcast", "create", "--to", "a@x.com, b@y.com", "--subject", "Hi", "--body", "Text", "--tz", "Asia/Manila"), 0);
    const c = h.calls[0];
    assert.equal(c.name, "create_schedule");
    assert.deepEqual(c.args.emails, ["a@x.com", "b@y.com"]);
    assert.equal(c.args.time_zone, "Asia/Manila");
    assert.match(String(c.args.idempotency_key), /^cli:broadcast:/);
    assert.equal(await h.go("broadcast", "create", "--subject", "x"), 2);
    assert.equal(await h.go("broadcast", "edit", "sch_1", "--subject", "New"), 0);
    assert.deepEqual(h.calls[1], { name: "update_schedule", args: { id: "sch_1", subject: "New" } });
    assert.equal(await h.go("broadcast", "edit", "sch_1"), 2);
    await h.go("logs", "--limit", "5");
    await h.go("events");
    assert.deepEqual(h.calls.slice(2).map((x) => [x.name, x.args]), [["list_dispatches", { limit: 5 }], ["list_events", {}]]);
    h.out.length = 0;
    assert.equal(await h.go("plan"), 0);
    assert.ok(h.out.includes("plan: free"));
    assert.ok(h.out.includes("sends today: 1 / 100 (Workspace)"));
    const before = h.calls.length;
    assert.equal(await h.go("keys"), 2);
    assert.equal(h.calls.length, before);
  } finally { h.restore(); }
});
