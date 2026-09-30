import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerTelegramAuth } from "#lib/owner-chat.ts";

test("morning brief runs as the owner's Telegram user principal", () => {
  process.env.TELEGRAM_OWNER_CHAT_ID = "12345";
  const auth = ownerTelegramAuth();
  assert.equal(auth.principalType, "user");
  assert.equal(auth.authenticator, "telegram-webhook");
  assert.equal(auth.principalId, "telegram:12345");
});
