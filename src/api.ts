/** One command is one API call. The bearer key rides the header, never an argument. */
export async function call(
  base: string,
  key: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/tools`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ name, args }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: "unparseable_response" };
  }
  if (!res.ok) {
    const failure = body as { error?: string; scope?: string; reason?: string };
    if (failure.error === "scope") {
      throw new CliError(`missing scope: ${failure.scope}\nthe founder turns this switch on in the dashboard`);
    }
    if (failure.error === "refusal") {
      throw new CliError(`refused: ${failure.reason}`);
    }
    if (failure.error === "revoked") {
      throw new CliError("this key is revoked; run mailbazooka connect <key> with a fresh one");
    }
    if (failure.error === "invalid_key") {
      throw new CliError("this key is not valid; run mailbazooka connect <key> with a key from the dashboard");
    }
    if (failure.error === "no_key") {
      throw new CliError("no key presented; run mailbazooka connect <key>");
    }
    throw new CliError(`the api refused (${res.status}): ${text}`);
  }
  return body;
}

export class CliError extends Error {}

export function resolveBase(env: NodeJS.ProcessEnv): string {
  return env.MAILBAZOOKA_API_BASE ?? env.MAILBAZOOKA_BASE_URL ?? env.RECURRING_API_BASE ?? env.RECURRING_BASE_URL ?? "https://justfuckinguseburnaddress.com";
}
