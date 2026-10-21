import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { run } from "../src/index.ts";

test("cli connect writes key, generates .mcp.json, and drops MAILBAZOOKA.md", async () => {
  const dir = mkdtempSync(join(tmpdir(), "recurring-onboarding-"));
  const logs: string[] = [];
  const errors: string[] = [];

  const io = {
    log: (line: string) => logs.push(line),
    err: (line: string) => errors.push(line),
    render: () => {},
    readLine: async () => "dummy",
  };

  const env: NodeJS.ProcessEnv = {
    RECURRING_LOGIN_DIR: dir,
    PWD: dir,
    RECURRING_BASE_URL: "https://api.mailbazooka.com",
  };

  try {
    const code = await run(
      ["node", "recurring", "connect", "mb_live_test_api_key_123"],
      env,
      io,
    );
    assert.equal(code, 0);

    // Verify key was saved
    const savedKey = readFileSync(join(dir, "key"), "utf8");
    assert.equal(savedKey, "mb_live_test_api_key_123");

    // Verify .mcp.json was written
    const mcpRaw = readFileSync(join(dir, ".mcp.json"), "utf8");
    const mcp = JSON.parse(mcpRaw) as {
      mcpServers: { mailbazooka: { url: string; headers: { Authorization: string } } };
    };
    assert.equal(mcp.mcpServers.mailbazooka.url, "https://api.mailbazooka.com/mcp");
    assert.equal(
      mcp.mcpServers.mailbazooka.headers.Authorization,
      "Bearer mb_live_test_api_key_123",
    );

    // Verify MAILBAZOOKA.md was dropped
    const directive = readFileSync(join(dir, "MAILBAZOOKA.md"), "utf8");
    assert.ok(directive.includes("MAILBAZOOKA.md"));
    assert.ok(directive.includes("enroll_customer"));
    assert.ok(directive.includes("install_heartbeat"));

    // Verify Grok Bot connection hint was logged
    const joinedLogs = logs.join("\n");
    assert.ok(joinedLogs.includes("grok mcp add --transport http mailbazooka"));
    assert.ok(joinedLogs.includes("https://api.mailbazooka.com/mcp"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli connect accepts --key=... flag and shorthand key argument", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mailbazooka-flag-"));
  const logs: string[] = [];
  const errors: string[] = [];

  const io = {
    log: (line: string) => logs.push(line),
    err: (line: string) => errors.push(line),
    render: () => {},
    readLine: async () => "dummy",
  };

  const env: NodeJS.ProcessEnv = {
    MAILBAZOOKA_LOGIN_DIR: dir,
    PWD: dir,
    MAILBAZOOKA_BASE_URL: "https://api.mailbazooka.com",
  };

  try {
    const code = await run(
      ["node", "mailbazooka", "connect", "--key=mb_live_flag_key_456"],
      env,
      io,
    );
    assert.equal(code, 0);
    assert.equal(readFileSync(join(dir, "key"), "utf8"), "mb_live_flag_key_456");

    const code2 = await run(
      ["node", "mailbazooka", "mb_live_shorthand_key_789"],
      env,
      io,
    );
    assert.equal(code2, 0);
    assert.equal(readFileSync(join(dir, "key"), "utf8"), "mb_live_shorthand_key_789");

    // Test space-separated --key flag and merging with existing .mcp.json
    const code3 = await run(
      ["node", "mailbazooka", "connect", "--key", "mb_live_space_key_101"],
      env,
      io,
    );
    assert.equal(code3, 0);
    assert.equal(readFileSync(join(dir, "key"), "utf8"), "mb_live_space_key_101");

    const mcpRaw = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")) as {
      mcpServers: { mailbazooka: { url: string; headers: { Authorization: string } } };
    };
    assert.equal(mcpRaw.mcpServers.mailbazooka.url, "https://api.mailbazooka.com/mcp");
    assert.equal(mcpRaw.mcpServers.mailbazooka.headers.Authorization, "Bearer mb_live_space_key_101");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
