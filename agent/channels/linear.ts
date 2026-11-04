// Linear Agent Sessions: mention or delegate to Claudio from a Linear issue and
// it answers in the ticket. Also turns Issue/Comment webhooks into Telegram
// notices when someone assigns Edsel a ticket or mentions him.
//
// Only the owner may drive a session: Claudio acts with his Gmail, Calendar,
// and memory, and the workspace has other people in it.

import { connectLinearCredentials } from "@vercel/connect/eve";
import { defaultLinearAuth, linearChannel } from "eve/channels/linear";
import {
  agentSessionActorId,
  LINEAR_TURN_CONTEXT,
  linearNotification,
  linearOwner,
  NOT_OWNER_REPLY,
} from "#lib/linear-owner.ts";
import { claimOnce } from "#lib/once.ts";
import { ownerChatId } from "#lib/owner-chat.ts";
import { sendTelegramText } from "#lib/telegram-media.ts";
import { renderTurnClock } from "#lib/temporal-context.ts";

const CONNECTOR = process.env.LINEAR_CONNECTOR?.trim() || "linear/claudio-agent";

export default linearChannel({
  credentials: connectLinearCredentials(CONNECTOR),

  async onAgentSession(ctx, event) {
    if (event.action !== "created" && event.action !== "prompted") return null;

    if (agentSessionActorId(event) !== linearOwner().userId) {
      // Answer once when the session opens; ignore follow-ups. No turn runs.
      if (event.action === "created") {
        await ctx.linear.createActivity({ type: "response", body: NOT_OWNER_REPLY }).catch((error) => {
          console.error("[linear] could not post the not-owner reply", error);
        });
      }
      return null;
    }

    return { auth: defaultLinearAuth(event), context: [renderTurnClock(), LINEAR_TURN_CONTEXT] };
  },

  async onDataWebhook(event) {
    const text = linearNotification(event.raw, linearOwner());
    if (!text) return;
    // Linear retries deliveries; never notify twice for the same one.
    const key = event.delivery.id ? `linear:${event.delivery.id}` : undefined;
    if (key && !(await claimOnce(key))) return;
    try {
      await sendTelegramText({ chatId: ownerChatId(), text });
    } catch (error) {
      console.error("[linear] Telegram notification failed", error);
    }
  },
});
