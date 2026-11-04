// Runs `eve eval` with the side-effecting stores switched off.
//
// .env.local carries the real Upstash Redis and QStash credentials, so a plain
// `eve eval` would write test memories into the owner's real memory and send
// test reminders to his Telegram. eve's dev loader never overrides a variable
// that is already set, so blanking them here makes memory and reminders fall
// back to their in-process stores for the whole run.
//
// Usage: npm run eval [-- <eve eval args>]   e.g. npm run eval -- safety --verbose

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const ISOLATED = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "QSTASH_TOKEN",
  "QSTASH_URL",
];

const args = process.argv.slice(2);

if (args.some((a) => a === "--url" || a.startsWith("--url=")) && process.env.EVAL_ALLOW_REMOTE !== "1") {
  console.error(
    "Refusing --url: a deployed target uses its own real Redis, QStash and Google credentials, so evals there " +
      "write real memories and reminders. Set EVAL_ALLOW_REMOTE=1 if that is what you want.",
  );
  process.exit(2);
}

function fileEnv(name) {
  try {
    return parseEnv(readFileSync(name, "utf8"));
  } catch {
    return {};
  }
}

const hasBedrockKey =
  Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK) ||
  [".env.local", ".env"].some((f) => Boolean(fileEnv(f).AWS_BEARER_TOKEN_BEDROCK));
if (!hasBedrockKey) {
  console.error(
    "AWS_BEARER_TOKEN_BEDROCK is not set (shell or .env.local). Evals run the real agent and judge on Bedrock; " +
      "add the key to .env.local first.",
  );
  process.exit(2);
}

const env = { ...process.env };
for (const name of ISOLATED) env[name] = "";

const child = spawn("npx", ["eve", "eval", ...args], { stdio: "inherit", env });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
