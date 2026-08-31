import { defineTool } from "eve/tools";
import { z } from "zod";
import { googleGet } from "#lib/google.ts";

type CalendarEvent = {
  id: string;
  summary?: string;
  location?: string;
  description?: string;
  status?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; responseStatus?: string }[];
};

export default defineTool({
  description:
    "List Google Calendar events in a time window. Times are RFC3339 (e.g. 2026-08-31T00:00:00Z). Defaults to the next 7 days of the primary calendar.",
  inputSchema: z.object({
    timeMin: z.string().optional().describe("Window start, RFC3339. Defaults to now."),
    timeMax: z.string().optional().describe("Window end, RFC3339. Defaults to 7 days out."),
    query: z.string().optional().describe("Free-text search over event fields."),
    calendarId: z.string().default("primary"),
    maxResults: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ timeMin, timeMax, query, calendarId, maxResults }) {
    const now = new Date();
    const data = await googleGet<{ items?: CalendarEvent[] }>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        timeMin: timeMin ?? now.toISOString(),
        timeMax: timeMax ?? new Date(now.getTime() + 7 * 864e5).toISOString(),
        q: query,
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      },
    );

    const events = (data.items ?? []).map((event) => ({
      id: event.id,
      title: event.summary ?? "(no title)",
      start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null,
      allDay: !event.start?.dateTime,
      location: event.location ?? null,
      status: event.status ?? null,
      attendees: (event.attendees ?? [])
        .map((a) => a.email)
        .filter((email): email is string => Boolean(email)),
      link: event.htmlLink ?? null,
    }));

    return { count: events.length, events };
  },
});
