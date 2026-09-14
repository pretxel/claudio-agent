// One-time and repeating reminders for the owner.
//
// Same backing store as long-term memory (Upstash Redis). Delivery timing lives
// in QStash (see reminder-queue.ts); this store is the source of truth for what
// is still pending. Without Redis credentials an in-process store keeps the
// tools working locally, but nothing persists.

import { Redis } from "@upstash/redis";
import { localParts, zonedToUtc } from "#lib/zoned-time.ts";

export const REPEATS = ["none", "daily", "weekdays", "weekly"] as const;
export type Repeat = (typeof REPEATS)[number];

export const MAX_REMINDERS = 200;
export const MAX_REMINDER_TEXT = 500;

export interface Reminder {
  readonly id: string;
  readonly text: string;
  /** ISO timestamp of the next time it should fire. */
  readonly dueAt: string;
  readonly repeat: Repeat;
  readonly createdAt: string;
  /** Which channel/principal created it, for auditing. */
  readonly source?: string;
  /** QStash message that will fire the current occurrence. */
  readonly messageId?: string;
}

export interface ReminderStore {
  readonly persistent: boolean;
  /** Build and store a new reminder. */
  create(input: { text: string; dueAt: Date; repeat: Repeat; source?: string }): Promise<Reminder>;
  get(id: string): Promise<Reminder | null>;
  /** Pending reminders, soonest first. */
  list(limit?: number): Promise<Reminder[]>;
  save(reminder: Reminder): Promise<void>;
  delete(id: string): Promise<boolean>;
}

export function normalizeReminderText(raw: string): string {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) throw new Error("Reminder text must not be empty.");
  if (text.length > MAX_REMINDER_TEXT) throw new Error(`Reminder text exceeds ${MAX_REMINDER_TEXT} characters.`);
  return text;
}

/**
 * The first occurrence strictly after `after`, keeping the local wall-clock time
 * of `previous` in `timeZone`. Returns null for one-time reminders.
 */
export function nextOccurrence(previous: Date, repeat: Repeat, after: Date, timeZone: string): Date | null {
  if (repeat === "none") return null;
  const base = localParts(previous, timeZone);
  const step = repeat === "weekly" ? 7 : 1;
  for (let offset = step; ; offset += step) {
    const candidate = zonedToUtc({ ...base, day: base.day + offset }, timeZone);
    if (repeat === "weekdays") {
      const weekday = localParts(candidate, timeZone).weekday;
      if (weekday === 0 || weekday === 6) continue;
    }
    if (candidate > after) return candidate;
  }
}

function buildReminder(input: { text: string; dueAt: Date; repeat: Repeat; source?: string }): Reminder {
  if (Number.isNaN(input.dueAt.getTime())) throw new Error("Reminder time is not a valid date.");
  return {
    id: crypto.randomUUID().slice(0, 8),
    text: normalizeReminderText(input.text),
    dueAt: input.dueAt.toISOString(),
    repeat: input.repeat,
    createdAt: new Date().toISOString(),
    source: input.source,
  };
}

const bySoonest = (a: Reminder, b: Reminder) => a.dueAt.localeCompare(b.dueAt);

export class InMemoryReminderStore implements ReminderStore {
  readonly persistent = false;
  private readonly items = new Map<string, Reminder>();

  async create(input: { text: string; dueAt: Date; repeat: Repeat; source?: string }): Promise<Reminder> {
    if (this.items.size >= MAX_REMINDERS) throw new Error(`Too many reminders (${MAX_REMINDERS}). Cancel some first.`);
    const reminder = buildReminder(input);
    this.items.set(reminder.id, reminder);
    return reminder;
  }

  async get(id: string): Promise<Reminder | null> {
    return this.items.get(id) ?? null;
  }

  async list(limit = 50): Promise<Reminder[]> {
    return [...this.items.values()].sort(bySoonest).slice(0, limit);
  }

  async save(reminder: Reminder): Promise<void> {
    this.items.set(reminder.id, reminder);
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}

/** One Redis hash: field = reminder id, value = JSON-encoded Reminder. */
export class RedisReminderStore implements ReminderStore {
  readonly persistent = true;
  private readonly redis: Redis;
  private readonly hashKey = "claudio:reminders";

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async create(input: { text: string; dueAt: Date; repeat: Repeat; source?: string }): Promise<Reminder> {
    if ((await this.redis.hlen(this.hashKey)) >= MAX_REMINDERS) {
      throw new Error(`Too many reminders (${MAX_REMINDERS}). Cancel some first.`);
    }
    const reminder = buildReminder(input);
    await this.save(reminder);
    return reminder;
  }

  async get(id: string): Promise<Reminder | null> {
    return parse(await this.redis.hget<Reminder | string>(this.hashKey, id));
  }

  async list(limit = 50): Promise<Reminder[]> {
    const all = (await this.redis.hgetall<Record<string, Reminder | string>>(this.hashKey)) ?? {};
    return Object.values(all)
      .map(parse)
      .filter((r): r is Reminder => r !== null)
      .sort(bySoonest)
      .slice(0, limit);
  }

  async save(reminder: Reminder): Promise<void> {
    await this.redis.hset(this.hashKey, { [reminder.id]: reminder });
  }

  async delete(id: string): Promise<boolean> {
    return (await this.redis.hdel(this.hashKey, id)) > 0;
  }
}

function parse(value: Reminder | string | null | undefined): Reminder | null {
  if (!value) return null;
  const reminder = typeof value === "string" ? (JSON.parse(value) as Reminder) : value;
  return typeof reminder.id === "string" && typeof reminder.dueAt === "string" ? reminder : null;
}

let store: ReminderStore | undefined;

/** Test/dev hook: replace the store used by tools and the delivery route. */
export function configureReminderStore(next: ReminderStore | undefined): void {
  store = next;
}

export function getReminderStore(): ReminderStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    store = new RedisReminderStore(new Redis({ url, token }));
  } else {
    console.warn("[reminders] No Upstash credentials (UPSTASH_REDIS_REST_URL/KV_REST_API_URL); reminders will not persist.");
    store = new InMemoryReminderStore();
  }
  return store;
}
