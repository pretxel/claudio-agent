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

/**
 * Stable system-prompt guidance about time. It must not change between turns:
 * eve puts dynamic instructions at the end of the system prompt and the prompt
 * cache covers the conversation only while the system prefix is identical, so a
 * per-turn clock here would re-bill the whole history on every message.
 */
export function renderTemporalGuidance(options: { timeZone?: string } = {}): string {
  const timeZone = resolveTimeZone(options.timeZone);
  return `# Time

The owner's time zone is ${timeZone}. Each message from the owner arrives with a \`<current_time>\` block carrying the exact instant, local date, local time, and UTC offset at that moment. The most recent \`<current_time>\` block is the source of truth; older ones in the conversation are stale.

Interpret words such as today, tomorrow, yesterday, this morning, and next week relative to that local date and time. Before calling Calendar or reminder tools, resolve relative expressions to an absolute date/time in this time zone with the offset from that block. Include the resolved absolute date/time in a subagent brief whenever its task depends on time, because subagents do not see these blocks. If the owner explicitly gives another location or time zone, use that instead.`;
}

/** Per-message clock, sent as turn context so it lands in history instead of the system prompt. */
export function renderTurnClock(options: TemporalContextOptions = {}): string {
  const now = options.now ?? new Date();
  const timeZone = resolveTimeZone(options.timeZone);
  const parts = dateTimeParts(now, timeZone);
  return `<current_time>
utc: ${now.toISOString()}
local: ${parts.year}-${parts.month}-${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}:${parts.second}
time_zone: ${timeZone}
utc_offset: ${parts.timeZoneName}
</current_time>`;
}
