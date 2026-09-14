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
