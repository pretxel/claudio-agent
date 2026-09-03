import {
  defaultTelegramAuth,
  telegramChannel,
  type TelegramMessage,
} from "eve/channels/telegram";
import { synthesizeSpeech, transcribeAudio } from "#lib/elevenlabs.ts";
import { downloadTelegramFile, sendTelegramVoice } from "#lib/telegram-media.ts";

// The bot speaks for the owner's Google account, so only the owner may talk to
// it. Comma-separated Telegram user ids; run `node scripts/telegram.mjs whoami`
// to find yours.
const allowedUserIds = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

// "always" (default) speaks every reply, "off" stays text-only.
const voiceReplies = (process.env.TELEGRAM_VOICE_REPLY ?? "always").toLowerCase();

// ElevenLabs bills per character, so long answers stay text-only.
const VOICE_REPLY_MAX_CHARS = 1200;

type TelegramAudio = { file_id?: string; mime_type?: string };

/** eve's channel parses photos and documents only, so dig voice out of `raw`. */
function inboundAudio(message: TelegramMessage): TelegramAudio | undefined {
  const raw = message.raw as Record<string, unknown>;
  for (const key of ["voice", "audio", "video_note"]) {
    const value = raw[key];
    if (value && typeof value === "object") return value as TelegramAudio;
  }
  return undefined;
}

export default telegramChannel({
  credentials: {
    botToken: () => process.env.TELEGRAM_BOT_TOKEN!,
    webhookSecretToken: () => process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN!,
  },
  // Replaces the default dispatch gate: private chats from the owner only.
  // Returning null drops the update without a reply.
  async onMessage(ctx, message) {
    if (allowedUserIds.length === 0) return null;
    if (message.chat.type !== "private") return null;
    const userId = message.from?.id;
    if (!userId || !allowedUserIds.includes(userId)) return null;

    const audio = inboundAudio(message);
    if (audio?.file_id) {
      await ctx.telegram.startTyping();
      try {
        const bytes = await downloadTelegramFile(audio.file_id);
        const transcript = await transcribeAudio(bytes, audio.mime_type ?? "audio/ogg");
        if (!transcript) {
          await ctx.telegram.post("No pude entender el audio. ¿Lo repites?");
          return null;
        }
        // A voice note carries no text, so the turn would otherwise be empty.
        (message as { text: string }).text = transcript;
        return {
          auth: defaultTelegramAuth(message),
          context: [`<voice_note>transcript: ${transcript}</voice_note>`],
        };
      } catch (error) {
        await ctx.telegram.post(
          `No pude transcribir el audio: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    }

    if ((message.text || message.caption).trim().length === 0) return null;
    await ctx.telegram.startTyping();
    return { auth: defaultTelegramAuth(message) };
  },
  events: {
    // Speak the reply, then always post the text so it stays readable.
    async "message.completed"(data, channel) {
      if (data.finishReason === "tool-calls" || !data.message) return;

      const text = typeof data.message === "string" ? data.message : String(data.message);
      const chatId = channel.state.chatId;

      if (voiceReplies !== "off" && chatId && text.length <= VOICE_REPLY_MAX_CHARS) {
        try {
          await sendTelegramVoice({
            chatId,
            audio: await synthesizeSpeech(text),
            messageThreadId: channel.state.messageThreadId ?? undefined,
          });
        } catch (error) {
          console.error("voice reply failed, falling back to text", error);
        }
      }

      await channel.telegram.post(data.message);
    },
  },
});
