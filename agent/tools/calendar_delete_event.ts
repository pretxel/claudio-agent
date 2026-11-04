import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { googleAuth, googleDelete } from "#lib/google.ts";

export default defineTool({
  description:
    "Delete (cancel) a Google Calendar event by id from calendar_list_events. Guests are notified of the cancellation. Always asks the owner for approval.",
  inputSchema: z.object({
    eventId: z.string().min(1),
    calendarId: z.string().default("primary"),
  }),
  // Irreversible, and it notifies every guest.
  approval: always(),
  async execute({ eventId, calendarId }, ctx) {
    const { token } = await ctx.getToken(googleAuth);
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
    url.searchParams.set("sendUpdates", "all");
    await googleDelete(token, url.toString());
    return { deleted: true, id: eventId };
  },
});
