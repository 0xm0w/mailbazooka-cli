#!/usr/bin/env node
import { apiKeyFromEnvOrFile, recurringLogin } from "./config.ts";
import { call, resolveBase, type CliError } from "./api.ts";
import { writeAgentDirective, writeMcpConfig } from "./onboarding.ts";

type Io = {
  log: (line: string) => void;
  err: (line: string) => void;
  render: (text: string) => void;
  readLine: () => Promise<string>;
};

export function run(argv: string[], env: NodeJS.ProcessEnv, io: Io): Promise<number> {
  return dispatch(argv.slice(2), env, io);
}

async function prompt(io: Io, question: string): Promise<string> {
  io.log(question);
  return (await io.readLine()).trim();
}

async function dispatch(argv: string[], env: NodeJS.ProcessEnv, io: Io): Promise<number> {
  let explicitKey: string | undefined;
  const filteredArgv: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--key" && argv[i + 1]) {
      explicitKey = argv[++i].trim();
    } else if (arg.startsWith("--key=")) {
      explicitKey = arg.slice(6).trim();
    } else {
      filteredArgv.push(arg);
    }
  }

  if (explicitKey) {
    env.MAILBAZOOKA_API_KEY = explicitKey;
    env.RECURRING_API_KEY = explicitKey;
  }

  let [command, ...rest] = filteredArgv;

  // Convenience shorthand: if first argument is a key, route to connect
  if (command && (command.startsWith("mb_") || command.startsWith("rcr_"))) {
    explicitKey = command;
    command = "connect";
    rest = [];
  }

  // If invoked with just --key=..., route to connect
  if (!command && explicitKey) {
    command = "connect";
  }

  const base = resolveBase(env);

  switch (command) {
    case "connect": {
      let fullKey = explicitKey || rest[0]?.trim();
      if (!fullKey) {
        io.log("paste the key (it is shown once, in the dashboard's API keys panel):");
        fullKey = (await io.readLine()).trim();
      }
      if (!fullKey) {
        io.err("no key provided");
        return 1;
      }
      const keyFile = recurringLogin(fullKey, env);
      io.log(`[OK] key stored at ${keyFile}`);

      const projectDir = env.PWD || process.cwd();
      const mcpUrl = `${base}/mcp`;
      writeMcpConfig(projectDir, mcpUrl, fullKey);
      io.log("[OK] generated .mcp.json for Cursor, Claude Code, and Windsurf");

      writeAgentDirective(projectDir);
      io.log("[OK] dropped MAILBAZOOKA.md agent directive");

      io.log("");
      io.log("To connect Grok Bot directly in chat or settings:");
      io.log(`  grok mcp add --transport http mailbazooka ${mcpUrl} --header "Authorization: Bearer ${fullKey}"`);
      return 0;
    }

    case "add": {
      const projectDir = env.PWD || process.cwd();
      const key = explicitKey || apiKeyFromEnvOrFile(env);
      if (key) {
        writeMcpConfig(projectDir, `${base}/mcp`, key);
        io.log("[OK] generated .mcp.json");
      }
      writeAgentDirective(projectDir);
      io.log("[OK] dropped MAILBAZOOKA.md agent directive");
      return 0;
    }

    case "login": {
      io.log("paste the key (it is shown once, in the dashboard's API keys panel):");
      const fullKey = (await io.readLine()).trim();
      if (!fullKey) {
        io.err("no key pasted");
        return 1;
      }
      io.log(`key stored at ${recurringLogin(fullKey, env)}`);
      return 0;
    }

    case undefined:
    case "help":
    case "--help":
    case "-h":
      io.log(HELP);
      return 0;

    case "whoami":
    case "status": {
      const result = (await withKey(env, io, (key) => call(base, key, "get_status", {}))) as Record<string, unknown>;
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "metrics": {
      const result = (await withKey(env, io, (key) => call(base, key, "get_metrics", {}))) as Record<string, unknown>;
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "domains": {
      const sub = rest[0];
      if (sub === "add") {
        const domain = rest[1] || (await prompt(io, "domain to add (e.g. acme.com):"));
        if (!domain) {
          io.err("domain is required");
          return 1;
        }
        const result = await withKey(env, io, (key) => call(base, key, "add_domain", { domain }));
        io.log(`[OK] Domain ${domain} registered.`);
        io.render(JSON.stringify(result, null, 2));
        return 0;
      }
      if (sub === "remove" || sub === "delete") {
        const domain = rest[1] || (await prompt(io, "domain to remove:"));
        if (!domain) {
          io.err("domain is required");
          return 1;
        }
        const result = await withKey(env, io, (key) => call(base, key, "remove_domain", { domain }));
        io.log(`[OK] Domain ${domain} removed.`);
        io.render(JSON.stringify(result, null, 2));
        return 0;
      }
      if (sub === "health" || sub === "check") {
        const domain = rest[1] || (await prompt(io, "domain to evaluate health for:"));
        if (!domain) {
          io.err("domain is required");
          return 1;
        }
        const result = await withKey(env, io, (key) => call(base, key, "get_domain_health", { domain }));
        io.render(JSON.stringify(result, null, 2));
        return 0;
      }
      const result = await withKey(env, io, (key) => call(base, key, "list_domains", {}));
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "replies": {
      const result = await withKey(env, io, (key) => call(base, key, "list_inbound_replies", {}));
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "reply": {
      const from = rest[0] || (await prompt(io, "sender email:"));
      if (!from) {
        io.err("sender email is required");
        return 1;
      }
      // This records a reply AND auto-pauses that contact's follow-ups, so the reply text
      // must be given explicitly. There is no canned default.
      const flag = (name: string): string | undefined => {
        const i = rest.indexOf(name);
        return i >= 0 ? rest[i + 1] : undefined;
      };
      const body = flag("--text");
      if (!body) {
        io.err('reply needs the real reply text: mailbazooka reply <email> --text "..." [--subject "..."]. It pauses that contact\'s follow-ups.');
        return 2;
      }
      const subject = flag("--subject") || "Re:";
      const result = await withKey(env, io, (key) =>
        call(base, key, "ingest_inbound_reply", { from, subject, body }),
      );
      io.log(`[OK] Reply from ${from} recorded. Scheduled follow-up steps auto-paused.`);
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "enroll": {
      const email = rest[0] || (await prompt(io, "subscriber email address:"));
      const displayName = rest[1] || "";
      if (!email) {
        io.err("email address is required");
        return 1;
      }
      const result = await withKey(env, io, (key) =>
        call(base, key, "enroll_customer", {
          email,
          display_name: displayName,
          idempotency_key: `cli:${email}:${Date.now()}`,
        }),
      );
      io.log(`[OK] Enrolled ${email} into Heartbeat sequence.`);
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "list": {
      const arg = rest[0];
      const args = arg === "active" ? { status: "active" } : arg === "drafts" ? { status: "draft" } : {};
      const result = await withKey(env, io, (key) => call(base, key, "list_schedules", args));
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "install": {
      const take = (flag: string) => {
        const at = rest.indexOf(flag);
        return at >= 0 ? rest[at + 1] ?? "" : "";
      };
      const product = take("--product") || (await prompt(io, "product name:"));
      const action = take("--action") || (await prompt(io, "the one action new customers should take:"));
      const support = take("--support") || (await prompt(io, "support address (the inbox you actually read):"));
      if (!product || !action || !support) {
        io.err("three values are required: product, one action, support address");
        return 1;
      }
      const result = await withKey(env, io, (key) => call(base, key, "install_heartbeat", {
        product_name: product, one_action: action, support_address: support,
      }));
      io.log("installed as a draft. look in the dashboard's Drafts tab.");
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "arm":
    case "pause": {
      const id = rest[0] ?? "";
      if (!id) {
        io.err(`${command} needs a schedule id; run mailbazooka list`);
        return 1;
      }
      await withKey(env, io, (key) =>
        call(base, key, command === "arm" ? "arm_schedule" : "pause_schedule", { schedule_id: id }));
      io.log(`${command} done`);
      return 0;
    }

    case "sends": {
      const id = rest[0] ?? "";
      if (!id) {
        io.err("sends needs a schedule id; run mailbazooka list");
        return 1;
      }
      const result = await withKey(env, io, (key) => call(base, key, "get_schedule", { id }));
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "sender": {
      // Pauses or resumes only this account's own sender. Never a global killswitch.
      const sub = rest[0] ?? "status";
      const tool = sub === "pause" ? "pause_sender" : sub === "resume" ? "resume_sender" : sub === "status" ? "get_sender" : null;
      if (!tool) {
        io.err("usage: mailbazooka sender [status|pause|resume]");
        return 2;
      }
      const result = await withKey(env, io, (key) => call(base, key, tool, {}));
      if (sub !== "status") io.log(`[OK] sender ${sub === "pause" ? "paused" : "resumed"} (this account only)`);
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "subscribers": {
      const sub = rest[0] ?? "list";
      if (sub === "list") {
        const result = await withKey(env, io, (key) => call(base, key, "list_subscribers", {}));
        io.render(JSON.stringify(result, null, 2));
        return 0;
      }
      if (sub === "remove") {
        const email = rest[1];
        if (!email || email.startsWith("--")) {
          io.err("usage: mailbazooka subscribers remove <email> --yes");
          return 2;
        }
        if (!rest.includes("--yes")) {
          io.err(`this removes ${email} from your sequences and drops their unsent steps. Re-run with --yes to confirm.`);
          return 2;
        }
        const result = await withKey(env, io, (key) => call(base, key, "remove_subscriber", { email, confirm: true }));
        io.log(`[OK] removed ${email}`);
        io.render(JSON.stringify(result, null, 2));
        return 0;
      }
      io.err("usage: mailbazooka subscribers [list|remove <email> --yes]");
      return 2;
    }

    case "broadcast": {
      const sub = rest[0];
      if (sub === "create") {
        const to = (flagValue(rest, "--to") ?? "").split(",").map((e) => e.trim()).filter(Boolean);
        const subject = flagValue(rest, "--subject");
        const body = flagValue(rest, "--body");
        if (to.length === 0 || !subject || !body) {
          io.err('usage: mailbazooka broadcast create --to a@x.com,b@y.com --subject "..." --body "..." [--name "..."] [--at ISO-time] [--tz Area/City]');
          return 2;
        }
        const args: Record<string, unknown> = {
          emails: to,
          subject,
          body,
          idempotency_key: `cli:broadcast:${Date.now()}`,
        };
        const name = flagValue(rest, "--name");
        const at = flagValue(rest, "--at");
        const tz = flagValue(rest, "--tz");
        if (name) args.name = name;
        if (at) args.next_send_at = at;
        if (tz) args.time_zone = tz;
        const result = await withKey(env, io, (key) => call(base, key, "create_schedule", args));
        io.log("[OK] saved as a draft. Arm it with: mailbazooka arm <id>");
        io.render(JSON.stringify(result, null, 2));
        return 0;
      }
      if (sub === "edit") {
        const id = rest[1];
        const args: Record<string, unknown> = { id };
        for (const f of ["subject", "body", "name"]) {
          const v = flagValue(rest, `--${f}`);
          if (v !== undefined) args[f] = v;
        }
        if (!id || id.startsWith("--") || Object.keys(args).length === 1) {
          io.err('usage: mailbazooka broadcast edit <id> [--subject "..."] [--body "..."] [--name "..."] (drafts only; pause first)');
          return 2;
        }
        await withKey(env, io, (key) => call(base, key, "update_schedule", args));
        io.log("[OK] draft updated");
        return 0;
      }
      io.err("usage: mailbazooka broadcast [create|edit] ...");
      return 2;
    }

    case "logs":
    case "events": {
      const limitRaw = flagValue(rest, "--limit");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      const tool = command === "logs" ? "list_dispatches" : "list_events";
      const result = await withKey(env, io, (key) => call(base, key, tool, limit ? { limit } : {}));
      io.render(JSON.stringify(result, null, 2));
      return 0;
    }

    case "plan": {
      const p = (await withKey(env, io, (key) => call(base, key, "get_status", {}))) as {
        tier?: string;
        armed?: { used: number; cap: number };
        recipients?: { used: number; cap: number | null };
        sendsToday?: { used: number; cap: number; label: string };
        enroll?: boolean;
        footer?: boolean;
      };
      io.log(`plan: ${p.tier ?? "unknown"}`);
      if (p.armed) io.log(`armed schedules: ${p.armed.used} / ${p.armed.cap}`);
      if (p.recipients) io.log(`recipients: ${p.recipients.used} / ${p.recipients.cap ?? "no limit"}`);
      if (p.sendsToday) io.log(`sends today: ${p.sendsToday.used} / ${p.sendsToday.cap} (${p.sendsToday.label})`);
      if (p.enroll !== undefined) io.log(`enroll: ${p.enroll ? "on" : "off"} · footer: ${p.footer ? "on" : "off"}`);
      if (p.tier === "free") io.log("upgrade: Premium $5/mo or $48/yr at /premium");
      return 0;
    }

    case "keys": {
      // Keys are created and revoked in the dashboard only (session sign-in). An API key
      // cannot mint or revoke keys, by design.
      io.err("API keys are managed in the dashboard (Keys tab): a key cannot list, create or revoke keys.");
      return 2;
    }

    default:
      io.err(`unknown command: ${command}`);
      return 2;
  }
}

export const HELP = `usage: mailbazooka <command> [--key <key>]   (start with: mailbazooka connect <key>)

setup
  connect [key]                       store your key, write .mcp.json and MAILBAZOOKA.md
  add                                 (re)write .mcp.json and MAILBAZOOKA.md here
  login                               paste and store a key
account
  status | whoami                     account payload (limits, sender, flags)
  plan                                plan and limits summary
  metrics                             sending metrics
sender (this account's own sender; never the global killswitch)
  sender [status]                     show the connected sender
  sender pause | sender resume        pause or resume your sender
schedules and broadcasts
  list [drafts|active]                list schedules
  broadcast create --to a,b --subject "..." --body "..." [--name "..."] [--at ISO] [--tz Area/City]
  broadcast edit <id> [--subject "..."] [--body "..."] [--name "..."]   drafts only
  arm <id> | pause <id>               arm or pause a schedule
  sends <id>                          one schedule and its sends
heartbeat and subscribers
  install [--product --action --support]   install the heartbeat sequence as a draft
  enroll <email> [name]               enroll a subscriber
  subscribers [list]                  list subscribers
  subscribers remove <email> --yes    remove a subscriber and their unsent steps
  replies                             inbound replies
  reply <email> --text "..." [--subject "..."]   record a reply (pauses their follow-ups)
logs
  logs [--limit N]                    recent dispatches (sends, bounces, provider events)
  events [--limit N]                  tracked events
domains
  domains [add <d>|remove <d>|health <d>]
keys
  keys                                managed in the dashboard only (a key cannot manage keys)
help
  help | --help | -h`;

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

async function withKey(
  env: NodeJS.ProcessEnv,
  io: { err: (line: string) => void },
  fn: (key: string) => Promise<unknown>,
): Promise<unknown> {
  const key = apiKeyFromEnvOrFile(env);
  if (!key) {
    io.err("no api key; run mailbazooka connect <key> or set MAILBAZOOKA_API_KEY");
    throw new Error("no api key") as CliError;
  }
  return fn(key);
}

const isMain = typeof import.meta !== "undefined" && (
  (import.meta as unknown as { main?: boolean }).main === true ||
  Boolean(process.argv[1] && (
    process.argv[1].endsWith("index.ts") ||
    process.argv[1].endsWith("index.js") ||
    process.argv[1].endsWith("mailbazooka") ||
    process.argv[1].endsWith("recurring") ||
    process.argv[1].includes("mailbazooka.js")
  ))
);

if (isMain) {
  const { createInterface } = await import("node:readline/promises");
  const readline = createInterface({ input: process.stdin });
  try {
    const io = {
      log: (line: string) => console.log(line),
      err: (line: string) => console.error(line),
      render: (text: string) => process.stdout.write(`${text}\n`),
      readLine: () => readline.question(""),
    };
    process.exitCode = await run(process.argv, process.env, io);
  } catch (err) {
    // A refusal is a message, not a stack: the scope name, the reason, the fix.
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(message);
    process.exitCode = 1;
  } finally {
    readline.close();
  }
}
