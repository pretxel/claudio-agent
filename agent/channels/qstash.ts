// Callbacks from Upstash QStash: a reminder coming due, and the daily morning
// brief schedule. Every request must carry a valid Upstash-Signature.

import { defineChannel, POST } from "eve/channels";
import { Receiver } from "@upstash/qstash";
import { z } from "zod";
import { renderMorningBriefPrompt } from "#lib/morning-brief.ts";
import { ownerChatId } from "#lib/owner-chat.ts";
import { fireReminder } from "#lib/reminder-delivery.ts";
import { getReminderQueue, MORNING_BRIEF_ROUTE, REMINDER_ROUTE } from "#lib/reminder-queue.ts";
import { getReminderStore } from "#lib/reminder-store.ts";
import { sendTelegramText } from "#lib/telegram-media.ts";
import { resolveTimeZone } from "#lib/temporal-context.ts";
import telegram from "./telegram.ts";

const payloadSchema = z.object({ id: z.string().min(1), dueAt: z.string().min(1) });

/** Returns the raw body when the signature is valid, otherwise null. */
async function verifiedBody(request: Request): Promise<string | null> {
  const signature = request.headers.get("upstash-signature");
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signature || !currentSigningKey || !nextSigningKey) return null;

  const body = await request.text();
  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    return (await receiver.verify({ signature, body, clockTolerance: 5 })) ? body : null;
  } catch {
    return null;
  }
}

const unauthorized = () => new Response("invalid signature", { status: 401 });

export default defineChannel({
  routes: [
    POST(REMINDER_ROUTE, async (request) => {
      const body = await verifiedBody(request);
      if (body === null) return unauthorized();

      const parsed = payloadSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return new Response("bad payload", { status: 400 });

      // Errors propagate as 500 so QStash retries the delivery.
      const outcome = await fireReminder(parsed.data, {
        store: getReminderStore(),
        queue: getReminderQueue(),
        send: (text) => sendTelegramText({ chatId: ownerChatId(), text }),
        timeZone: resolveTimeZone(),
      });
      return Response.json({ outcome });
    }),

    POST(MORNING_BRIEF_ROUTE, async (request, { to, waitUntil }) => {
      if ((await verifiedBody(request)) === null) return unauthorized();

      const prompt = renderMorningBriefPrompt({
        now: new Date(),
        timeZone: resolveTimeZone(),
        reminders: await getReminderStore().list(),
      });
      waitUntil(
        to(telegram, { chatId: ownerChatId() }).send(prompt, {
          auth: { authenticator: "qstash", principalType: "service", principalId: "morning-brief", attributes: {} },
        }),
      );
      return Response.json({ started: true });
    }),
  ],
});
