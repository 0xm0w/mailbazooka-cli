import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeMcpConfig(projectDir: string, mcpUrl: string, apiKey: string): string {
  const filePath = join(projectDir, ".mcp.json");
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    // Fresh file
  }
  const mcpServers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  mcpServers.mailbazooka = {
    url: mcpUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };
  existing.mcpServers = mcpServers;
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n", "utf8");
  return filePath;
}

export function writeAgentDirective(projectDir: string): string {
  const content = `# MAILBAZOOKA.md
Lifecycle & Transactional Email Specification for AI Agents.

This workspace connects to Mailbazooka for lifecycle dispatch.

## Core Rules for Agents
1. When a user registers, signs up, or signs in for the first time, call \`track_event\` with event \`user.signup\` (or \`enroll_customer\`).
2. Do not write flashy marketing newsletters. Write personal, plain-text emails from founders.
3. Every sequence email must have one clear, singular call to action.
4. Suppress future onboarding steps when a user activates.

## Available MCP Tools
- \`track_event\`: Ingests an event (e.g. \`user.signup\`, \`auth.signin\`) to automatically trigger immediate welcome emails.
- \`list_events\`: Lists real-time event activity received via webhooks, SDK, or MCP.
- \`list_triggers\`: Inspects event-to-sequence automation mappings.
- \`create_trigger\`: Creates or updates trigger mappings from event name to sequences.
- \`install_heartbeat\`: Sets up the 5-step customer retention sequence draft.
- \`enroll_customer\`: Enrolls one user with email & display name into the sequence.
- \`create_schedule\`: Creates a one-off plain text broadcast draft.
- \`arm_schedule\`: Activates a draft broadcast or sequence.
- \`pause_schedule\`: Pauses an active sequence or broadcast.
- \`list_schedules\`: Checks live and draft schedules.
- \`list_sends\`: Inspects dispatch logs and provider message IDs.
- \`connect_sender\`: Connects the customer's own SES, Brevo, or Resend account. Mailbazooka does not host sending.

## Bring your own sender
The customer sends from their own provider account, key, and domain. Call \`connect_sender\` with \`provider\` (\`ses\`, \`brevo\`, or \`resend\`), \`from_address\`, and either \`api_key\` or \`region\` plus \`access_key_id\` and \`secret_access_key\`. Pass \`verify_only: true\` to check the key without storing it. The stored credential is encrypted. Responses show the last four characters of the key.

## Inbound Webhook Gateways
- Clerk: \`/api/webhooks/clerk/<slug>\` (Event: \`user.created\`)
- Supabase: \`/api/webhooks/supabase/<slug>\` (Table: \`auth.users\`, Event: \`INSERT\`)
- Developer SDK: \`@mailbazooka/sdk\` (\`mb.track("user.signup", { email })\`)
`;
  const filePath = join(projectDir, "MAILBAZOOKA.md");
  writeFileSync(filePath, content, "utf8");
  return filePath;
}
