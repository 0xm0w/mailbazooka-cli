import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { apiKeyFromEnvOrFile, recurringLogin } from "../src/config.ts";

test("the key comes from the env before the login file", () => {
  const dir = mkdtempSync(join(tmpdir(), "recurring-cli-"));
  try {
    const env: Record<string, string | undefined> = { RECURRING_LOGIN_DIR: dir };
    assert.equal(apiKeyFromEnvOrFile(env), null);
    const file = recurringLogin("rcr_file-key", env);
    assert.equal(readFileSync(join(dir, "key"), "utf8"), "rcr_file-key");
    assert.equal(apiKeyFromEnvOrFile(env), "rcr_file-key");
    env.RECURRING_API_KEY = "rcr_env-key";
    assert.equal(apiKeyFromEnvOrFile(env), "rcr_env-key");
    delete env.RECURRING_API_KEY;
    // The stored file is mode 600 where the OS supports it (0o600 on POSIX).
    const mode = statSync(file).mode & 0o777;
    assert.ok(mode === 0o600 || process.platform === "win32");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
