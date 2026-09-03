// Telegram Bot API helpers for the parts eve's channel does not cover:
// downloading an inbound voice note and sending one back.

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  return token;
}

/** Resolve a Telegram file id and download its bytes. */
export async function downloadTelegramFile(fileId: string): Promise<ArrayBuffer> {
  const token = botToken();

  const lookup = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const meta = (await lookup.json()) as {
    ok: boolean;
    description?: string;
    result?: { file_path?: string };
  };
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(`getFile failed: ${meta.description ?? "no file_path"}`);
  }

  const file = await fetch(
    `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`,
  );
  if (!file.ok) throw new Error(`file download failed (${file.status})`);
  return file.arrayBuffer();
}

/** Send an OGG/Opus clip as a Telegram voice note. */
export async function sendTelegramVoice(input: {
  chatId: string;
  audio: ArrayBuffer;
  caption?: string;
  messageThreadId?: number;
}): Promise<void> {
  const form = new FormData();
  form.append("chat_id", input.chatId);
  form.append("voice", new Blob([input.audio], { type: "audio/ogg" }), "reply.ogg");
  if (input.caption) form.append("caption", input.caption.slice(0, 1024));
  if (input.messageThreadId !== undefined) {
    form.append("message_thread_id", String(input.messageThreadId));
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken()}/sendVoice`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`sendVoice failed: ${data.description ?? res.status}`);
}
