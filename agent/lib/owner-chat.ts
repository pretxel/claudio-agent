// Where proactive messages (reminders, the morning brief) go. In a private
// Telegram chat the chat id equals the user id, so the first allowed user is
// the default.

export function ownerChatId(): string {
  const explicit = process.env.TELEGRAM_OWNER_CHAT_ID?.trim();
  if (explicit) return explicit;
  const first = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .find(Boolean);
  if (!first) throw new Error("Set TELEGRAM_OWNER_CHAT_ID or TELEGRAM_ALLOWED_USER_IDS to deliver proactive messages.");
  return first;
}

/**
 * Session auth for proactive runs (the morning brief), shaped exactly like
 * eve's defaultTelegramAuth for the owner's private chat. Google is a
 * user-scoped connection, so a run needs a "user" principal or every Calendar
 * and Gmail call fails with principal_required; and memory is keyed by
 * authenticator + principal id, so matching Telegram keeps the same memories.
 */
export function ownerTelegramAuth() {
  const chatId = ownerChatId();
  return {
    authenticator: "telegram-webhook",
    issuer: "telegram",
    principalType: "user" as const,
    principalId: `telegram:${chatId}`,
    attributes: { chat_id: chatId, chat_type: "private", user_id: chatId },
  };
}
