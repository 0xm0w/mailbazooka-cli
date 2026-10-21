import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The key arrives by env first; the login file is the human fallback.
 * The key never travels as a command-line argument.
 */
export function apiKeyFromEnvOrFile(env: NodeJS.ProcessEnv): string | null {
  if (env.MAILBAZOOKA_API_KEY) return env.MAILBAZOOKA_API_KEY;
  if (env.RECURRING_API_KEY) return env.RECURRING_API_KEY;
  const dir = loginDir(env);
  try {
    return readFileSync(join(dir, "key"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

export function loginDir(env: NodeJS.ProcessEnv): string {
  return env.MAILBAZOOKA_LOGIN_DIR ?? env.RECURRING_LOGIN_DIR ?? join(homedir(), ".recurring");
}

export function recurringLogin(fullKey: string, env: NodeJS.ProcessEnv): string {
  const dir = loginDir(env);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "key");
  writeFileSync(file, fullKey, { encoding: "utf8" });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows ignores the POSIX mode; the file stays user-scope anyway.
  }
  return file;
}
