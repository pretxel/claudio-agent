// Telegram bot setup helper.
//
//   node scripts/telegram.mjs whoami                 # print your Telegram user id
//   node scripts/telegram.mjs set-webhook <url>      # register the eve webhook
//   node scripts/telegram.mjs info                   # current webhook status
//   node scripts/telegram.mjs delete-webhook         # unregister
//
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET_TOKEN from the
// environment, or from .env.local when they are not set.

import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // No .env.local — rely on the ambient environment.
  }
}

loadEnvLocal();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN (get one from @BotFather).");
  process.exit(1);
}

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`${method} failed:`, data.description ?? data);
    process.exit(1);
  }
  return data.result;
}

const [command, arg] = process.argv.slice(2);

switch (command) {
  case "whoami": {
    // getUpdates only works while no webhook is registered.
    await api("deleteWebhook");
    const me = await api("getMe");
    console.log(`\nBot: @${me.username}`);
    console.log("Send it any message in a private chat. Polling for 60s...\n");

    const senders = new Map();
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && senders.size === 0) {
      const updates = await api("getUpdates", {
        allowed_updates: ["message"],
        timeout: 10,
      });
      for (const update of updates) {
        const from = update.message?.from;
        if (from) senders.set(String(from.id), from.username ?? from.first_name ?? "");
      }
      if (senders.size === 0) process.stdout.write(".");
    }

    if (senders.size === 0) {
      console.log("\n\nNo messages seen. Message the bot, then run this again.");
      process.exit(1);
    }

    console.log("\n\nAdd to .env.local:\n");
    console.log(`TELEGRAM_ALLOWED_USER_IDS=${[...senders.keys()].join(",")}`);
    for (const [id, name] of senders) console.log(`  ${id}  ${name}`);
    console.log("\nWebhook was removed — re-register it with set-webhook.");
    process.exit(0);
  }

  case "set-webhook": {
    if (!arg) {
      console.error("Usage: node scripts/telegram.mjs set-webhook https://host/eve/v1/telegram");
      process.exit(1);
    }
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
    if (!secret) {
      console.error("Set TELEGRAM_WEBHOOK_SECRET_TOKEN first (any secret you choose).");
      process.exit(1);
    }
    await api("setWebhook", {
      url: arg,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
    });
    console.log(`Webhook registered: ${arg}`);
    break;
  }

  case "info": {
    console.log(await api("getWebhookInfo"));
    break;
  }

  case "delete-webhook": {
    await api("deleteWebhook");
    console.log("Webhook removed.");
    break;
  }

  default:
    console.error("Commands: whoami | set-webhook <url> | info | delete-webhook");
    process.exit(1);
}
