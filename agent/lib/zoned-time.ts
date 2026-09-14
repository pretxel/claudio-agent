// Wall-clock arithmetic in the owner's time zone. Reminders repeat "every day at
// 09:00 local", which must stay at 09:00 across daylight-saving changes, so the
// math happens on local calendar fields and is converted back to UTC last.

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

/** Milliseconds the zone is ahead of UTC at `instant`. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/**
 * The UTC instant at which the zone's wall clock reads the given fields.
 * Day overflow is normalized (day 32 rolls into the next month). A wall time
 * skipped by a spring-forward gap resolves to the instant just after the gap.
 */
export function zonedToUtc(
  fields: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const wall = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute);
  let guess = wall - offsetMs(new Date(wall), timeZone);
  const corrected = wall - offsetMs(new Date(guess), timeZone);
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

/** UTC bounds of the owner's local calendar day containing `instant`. */
export function localDayBounds(instant: Date, timeZone: string): { start: Date; end: Date; date: string } {
  const p = localParts(instant, timeZone);
  const start = zonedToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 }, timeZone);
  const end = zonedToUtc({ year: p.year, month: p.month, day: p.day + 1, hour: 0, minute: 0 }, timeZone);
  const date = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { start, end, date };
}
