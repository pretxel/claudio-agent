import {
  defaultTelegramAuth,
  telegramChannel,
  type TelegramMessage,
} from "eve/channels/telegram";

// The bot speaks for the owner's Google account, so only the owner may talk to
// it. Comma-separated Telegram user ids; run `node scripts/telegram.mjs whoami`
// to find yours.
const allowedUserIds = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

function isOwner(message: TelegramMessage): boolean {
  const userId = message.from?.id;
  return Boolean(userId && allowedUserIds.includes(userId));
}

export default telegramChannel({
  credentials: {
    botToken: () => process.env.TELEGRAM_BOT_TOKEN!,
    webhookSecretToken: () => process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN!,
  },
  // Replaces the default dispatch gate: private chats from the owner only.
  // Returning null drops the update without a reply.
  onMessage(_ctx, message) {
    if (allowedUserIds.length === 0) return null;
    if (message.chat.type !== "private") return null;
    if (!isOwner(message)) return null;
    return { auth: defaultTelegramAuth(message) };
  },
});
