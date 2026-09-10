export const DEFAULT_TIME_ZONE = "Europe/Madrid";

type TemporalContextOptions = {
  now?: Date;
  timeZone?: string;
};

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(configured = process.env.CLAUDIO_TIME_ZONE): string {
  const candidate = configured?.trim() || DEFAULT_TIME_ZONE;
  return isValidTimeZone(candidate) ? candidate : DEFAULT_TIME_ZONE;
}

function dateTimeParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(now);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function renderTemporalContext(options: TemporalContextOptions = {}): string {
  const now = options.now ?? new Date();
  const timeZone = resolveTimeZone(options.timeZone);
  const parts = dateTimeParts(now, timeZone);
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const localTime = `${parts.hour}:${parts.minute}:${parts.second}`;

  return `# Current temporal context

This block is generated at the start of the current turn and is the source of truth for relative dates and times.

- Current UTC instant: ${now.toISOString()}
- Owner's time zone: ${timeZone}
- Owner's local date: ${localDate} (${parts.weekday})
- Owner's local time: ${localTime}
- UTC offset: ${parts.timeZoneName}

Interpret words such as today, tomorrow, yesterday, this morning, and next week relative to this local date and time. Before calling Calendar tools, resolve relative expressions to an absolute date/time in this time zone. Include the resolved absolute date/time in a subagent brief whenever its task depends on time because subagents do not inherit this block. If the owner explicitly gives another location or time zone, use that instead.`;
}
