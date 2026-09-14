import { defineTool } from "eve/tools";
import { z } from "zod";
import { googleAuth, googleGet } from "#lib/google.ts";

type Message = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

const header = (message: Message, name: string) =>
  message.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? null;

export default defineTool({
  description:
    "Search the owner's Gmail with standard Gmail query syntax (e.g. 'is:unread from:bank newer_than:7d'). Returns headers and snippets, not full bodies — use gmail_read_message for that.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Gmail search query."),
    maxResults: z.number().int().min(1).max(25).default(10),
  }),
  async execute({ query, maxResults }, ctx) {
    const { token } = await ctx.getToken(googleAuth);
    const list = await googleGet<{ messages?: { id: string }[] }>(
      token,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      { q: query, maxResults },
    );

    const messages = await Promise.all(
      (list.messages ?? []).map((ref) =>
        googleGet<Message>(
          token,
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}`,
          { format: "metadata" },
        ),
      ),
    );

    return {
      count: messages.length,
      messages: messages.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        from: header(message, "from"),
        to: header(message, "to"),
        subject: header(message, "subject"),
        date: header(message, "date"),
        snippet: message.snippet ?? null,
      })),
    };
  },
});
