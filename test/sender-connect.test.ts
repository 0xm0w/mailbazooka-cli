import test from "node:test";
import assert from "node:assert/strict";
import { run, HELP } from "../src/index.ts";

function harness(reply: (name: string, args: Record<string, unknown>) => unknown = () => ({ ok: true })) {
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
    return new Response(JSON.stringify(reply(body.name, body.args)), { status: 200 });
  }) as typeof fetch;
  const go = (extraEnv: Record<string, string>, ...a: string[]) =>
    run(["node", "mailbazooka", ...a], { MAILBAZOOKA_API_KEY: "mb_test", MAILBAZOOKA_BASE_URL: "https://app.example.test", ...extraEnv }, io);
  return { out, calls, go, restore: () => { globalThis.fetch = realFetch; } };
}

const SECRET = "re_SUPERSECRET_abcd1234";

test("sender connect resend: key from flag, sent to connect_sender, never echoed", async () => {
  const h = harness(() => ({ ok: true, sender: { provider: "resend", fromAddress: "me@acme.test", keyHint: "••••1234" } }));
  try {
    assert.equal(await h.go({}, "sender", "connect", "--provider", "resend", "--from", "me@acme.test", "--api-key", SECRET), 0);
    assert.deepEqual(h.calls[0], { name: "connect_sender", args: { provider: "resend", from_address: "me@acme.test", api_key: SECRET } });
    assert.ok(!h.out.join("\n").includes(SECRET));
    assert.match(h.out.join("\n"), /connected resend sender me@acme.test \(key ••••1234\)/);
  } finally { h.restore(); }
});

test("sender connect: secrets from env (brevo, ses), never echoed; errors don't echo", async () => {
  const h = harness((_n, args) => (args.provider === "ses" ? { ok: false, error: "ses_rejected" } : { ok: true, verified: true, provider: "brevo" }));
  try {
    assert.equal(await h.go({ MAILBAZOOKA_SENDER_API_KEY: SECRET }, "sender", "connect", "--provider", "brevo", "--from", "a@b.test", "--verify-only"), 0);
    assert.equal(h.calls[0].args.api_key, SECRET);
    assert.equal(h.calls[0].args.verify_only, true);
    assert.equal(await h.go({ MAILBAZOOKA_SES_ACCESS_KEY_ID: "AKIDX", MAILBAZOOKA_SES_SECRET_ACCESS_KEY: SECRET },
      "sender", "connect", "--provider", "ses", "--from", "a@b.test", "--region", "us-east-1"), 1);
    assert.deepEqual(h.calls[1].args, { provider: "ses", from_address: "a@b.test", region: "us-east-1", access_key_id: "AKIDX", secret_access_key: SECRET });
    const text = h.out.join("\n");
    assert.ok(!text.includes(SECRET) && !text.includes("AKIDX"));
    assert.match(text, /verified \(not stored\)/);
    assert.match(text, /sender connect failed: ses_rejected/);
  } finally { h.restore(); }
});

test("sender connect: missing secret refuses without a call; gmail/smtp print the dashboard URL", async () => {
  const h = harness();
  try {
    assert.equal(await h.go({}, "sender", "connect", "--provider", "resend", "--from", "a@b.test"), 2);
    assert.equal(await h.go({}, "sender", "connect", "--provider", "ses", "--from", "a@b.test"), 2);
    assert.equal(await h.go({}, "sender", "connect", "--provider", "mailgun", "--from", "a@b.test"), 2);
    assert.equal(await h.go({}, "sender", "connect", "--provider", "gmail"), 0);
    assert.equal(await h.go({}, "sender", "connect", "--provider", "smtp"), 0);
    assert.equal(h.calls.length, 0);
    assert.equal(h.out.filter((l) => l === "Open: https://app.example.test/dashboard?tab=settings").length, 2);
  } finally { h.restore(); }
});

test("sender daily-stop: validates 1-1800 and prints the enforced limit", async () => {
  const h = harness(() => ({ dailyStop: 1800, enforcedToday: 450 }));
  try {
    for (const bad of ["0", "1801", "1.5", "x"]) assert.equal(await h.go({}, "sender", "daily-stop", bad), 2);
    assert.equal(await h.go({}, "sender", "daily-stop"), 2);
    assert.equal(h.calls.length, 0);
    assert.equal(await h.go({}, "sender", "daily-stop", "1800"), 0);
    assert.deepEqual(h.calls[0], { name: "set_sender_daily_stop", args: { daily_stop: 1800 } });
    assert.match(h.out.join("\n"), /daily stop set to 1800\. Enforced today: 450/);
  } finally { h.restore(); }
});

test("--help lists sender connect and daily-stop", () => {
  assert.match(HELP, /sender connect --provider ses\|brevo\|resend/);
  assert.match(HELP, /sender daily-stop <n>/);
  assert.match(HELP, /gmail\|smtp/);
});
