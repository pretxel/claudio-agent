import { defineTool } from "eve/tools";
import { z } from "zod";
import { googleAuth, googleGet, googlePost } from "#lib/google.ts";
import { buildRawEmail, replySubject } from "#lib/mime.ts";

type Original = {
  threadId: string;
  payload?: { headers?: { name: string; value: string }[] };
};

export default defineTool({
  description:
    "Save a plain-text email as a Gmail draft for the owner to review and send himself. It never sends. To answer a message, pass replyToMessageId (from gmail_search) and the draft lands in that thread with 'Re:' and threading headers.",
  inputSchema: z.object({
    to: z.array(z.string().email()).min(1),
    cc: z.array(z.string().email()).optional(),
    subject: z.string().optional().describe("Required for a new email; ignored when replying (the original subject is reused)."),
    body: z.string().min(1).describe("Plain text. No Markdown."),
    replyToMessageId: z.string().optional().describe("Gmail message id being answered."),
  }),
  async execute({ to, cc, subject, body, replyToMessageId }, ctx) {
    const { token } = await ctx.getToken(googleAuth);

    let threadId: string | undefined;
    let finalSubject = subject?.trim() ?? "";
    let inReplyTo: string | undefined;
    let references: string | undefined;

    if (replyToMessageId) {
      const original = await googleGet<Original>(
        token,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(replyToMessageId)}`,
        { format: "metadata" },
      );
      const header = (name: string) =>
        original.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value;
      threadId = original.threadId;
      finalSubject = replySubject(header("subject") ?? finalSubject);
      inReplyTo = header("message-id");
      references = [header("references"), inReplyTo].filter(Boolean).join(" ") || undefined;
    }

    if (!finalSubject) throw new Error("A new email needs a subject.");

    const raw = buildRawEmail({ to, cc, subject: finalSubject, body, inReplyTo, references });
    const draft = await googlePost<{ id: string; message?: { id: string; threadId?: string } }>(
      token,
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      { message: { raw, ...(threadId ? { threadId } : {}) } },
    );

    return {
      draftId: draft.id,
      threadId: draft.message?.threadId ?? threadId ?? null,
      subject: finalSubject,
      to,
      cc: cc ?? [],
      sent: false,
      link: "https://mail.google.com/mail/u/0/#drafts",
    };
  },
});
