import { defineTool } from "eve/tools";
import { z } from "zod";
import { googleGet } from "#lib/google.ts";

type Part = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: Part[];
};

type Message = {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: Part & { headers?: { name: string; value: string }[] };
};

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

/** Depth-first search for the first part matching a mime type. */
function findPart(part: Part | undefined, mimeType: string): Part | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default defineTool({
  description:
    "Read one Gmail message by id, including its plain-text body. Get ids from gmail_search.",
  inputSchema: z.object({
    messageId: z.string().min(1),
    maxBodyChars: z.number().int().min(500).max(50_000).default(8_000),
  }),
  async execute({ messageId, maxBodyChars }) {
    const message = await googleGet<Message>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      { format: "full" },
    );

    const headers = message.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name)?.value ?? null;

    const text = findPart(message.payload, "text/plain");
    const html = findPart(message.payload, "text/html");
    const raw = text?.body?.data
      ? decode(text.body.data)
      : html?.body?.data
        ? stripHtml(decode(html.body.data))
        : (message.snippet ?? "");

    const body = raw.slice(0, maxBodyChars);

    return {
      id: message.id,
      threadId: message.threadId,
      from: header("from"),
      to: header("to"),
      cc: header("cc"),
      subject: header("subject"),
      date: header("date"),
      body,
      truncated: raw.length > body.length,
    };
  },
});
