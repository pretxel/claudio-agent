import { defineTool } from "eve/tools";
import { z } from "zod";
import { googleAuth, googlePost } from "#lib/google.ts";

export default defineTool({
  description:
    "Create an event on Google Calendar. Use RFC3339 times with an offset (2026-09-02T10:00:00-06:00) or set allDay with plain dates.",
  inputSchema: z.object({
    title: z.string().min(1),
    start: z.string().describe("RFC3339 datetime, or YYYY-MM-DD when allDay."),
    end: z.string().describe("RFC3339 datetime, or YYYY-MM-DD when allDay."),
    allDay: z.boolean().default(false),
    timeZone: z.string().optional().describe("IANA zone, e.g. America/Mexico_City."),
    description: z.string().optional(),
    location: z.string().optional(),
    attendees: z.array(z.string().email()).optional(),
    calendarId: z.string().default("primary"),
  }),
  async execute(input, ctx) {
    const { token } = await ctx.getToken(googleAuth);
    const bound = (value: string) =>
      input.allDay
        ? { date: value }
        : { dateTime: value, ...(input.timeZone ? { timeZone: input.timeZone } : {}) };

    const created = await googlePost<{ id: string; htmlLink?: string }>(
      token,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`,
      {
        summary: input.title,
        description: input.description,
        location: input.location,
        start: bound(input.start),
        end: bound(input.end),
        attendees: input.attendees?.map((email) => ({ email })),
      },
    );

    return { id: created.id, link: created.htmlLink ?? null, title: input.title };
  },
});
