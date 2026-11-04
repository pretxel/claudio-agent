import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { googleAuth, googlePatch } from "#lib/google.ts";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export default defineTool({
  description:
    "Change an existing Google Calendar event: move it, rename it, or edit its details. Only the fields you pass change. Get the event id from calendar_list_events. attendees replaces the whole guest list, so pass every guest that should stay. Guests are notified of the change. Always asks the owner for approval.",
  inputSchema: z.object({
    eventId: z.string().min(1),
    calendarId: z.string().default("primary"),
    title: z.string().min(1).optional(),
    start: z.string().optional().describe("RFC3339 datetime with offset, or YYYY-MM-DD for an all-day event."),
    end: z.string().optional().describe("RFC3339 datetime with offset, or YYYY-MM-DD for an all-day event."),
    timeZone: z.string().optional().describe("IANA zone for timed start/end, e.g. Europe/Madrid."),
    description: z.string().optional(),
    location: z.string().optional(),
    attendees: z.array(z.string().email()).optional().describe("The complete new guest list."),
  }),
  // Moving or editing an event can notify other people and is easy to get wrong.
  approval: always(),
  async execute(input, ctx) {
    const { token } = await ctx.getToken(googleAuth);
    const bound = (value: string) =>
      DATE_ONLY.test(value)
        ? { date: value, dateTime: null }
        : { dateTime: value, date: null, ...(input.timeZone ? { timeZone: input.timeZone } : {}) };

    const patch = {
      ...(input.title !== undefined ? { summary: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.start !== undefined ? { start: bound(input.start) } : {}),
      ...(input.end !== undefined ? { end: bound(input.end) } : {}),
      ...(input.attendees !== undefined ? { attendees: input.attendees.map((email) => ({ email })) } : {}),
    };
    if (Object.keys(patch).length === 0) throw new Error("Nothing to change: pass at least one field.");

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    );
    url.searchParams.set("sendUpdates", "all");

    const updated = await googlePatch<{
      id: string;
      summary?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>(token, url.toString(), patch);

    return {
      id: updated.id,
      title: updated.summary ?? null,
      start: updated.start?.dateTime ?? updated.start?.date ?? null,
      end: updated.end?.dateTime ?? updated.end?.date ?? null,
      link: updated.htmlLink ?? null,
    };
  },
});
