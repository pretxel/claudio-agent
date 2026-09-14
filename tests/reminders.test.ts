import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { localDayBounds, zonedToUtc } from "#lib/zoned-time.ts";
import {
  InMemoryReminderStore,
  RedisReminderStore,
  configureReminderStore,
  nextOccurrence,
  type Reminder,
} from "#lib/reminder-store.ts";
import { configureReminderQueue, deliveryTime, type ReminderQueue } from "#lib/reminder-queue.ts";
import { fireReminder } from "#lib/reminder-delivery.ts";
import { renderMorningBriefPrompt } from "#lib/morning-brief.ts";
import reminderCreate from "#tools/reminder_create.ts";
import reminderList from "#tools/reminder_list.ts";
import reminderCancel from "#tools/reminder_cancel.ts";

const TZ = "Europe/Madrid";
const ctx = {
  session: { auth: { current: { authenticator: "api-key", principalType: "user", principalId: "owner", attributes: {} } } },
} as never;
const anonymous = { session: { auth: { current: undefined } } } as never;

type Tool = { execute(input: unknown, ctx: never): Promise<unknown> };
const run = (tool: unknown, input: unknown, c: never = ctx) => (tool as Tool).execute(input, c);

class FakeQueue implements ReminderQueue {
  enqueued: Reminder[] = [];
  cancelled: string[] = [];
  async enqueue(reminder: Reminder): Promise<string> {
    this.enqueued.push(reminder);
    return `msg-${this.enqueued.length}`;
  }
  async cancel(messageId: string): Promise<void> {
    this.cancelled.push(messageId);
  }
}

let store: InMemoryReminderStore;
let queue: FakeQueue;
beforeEach(() => {
  store = new InMemoryReminderStore();
  queue = new FakeQueue();
  configureReminderStore(store);
  configureReminderQueue(queue);
});

test("zonedToUtc maps Madrid wall time to UTC in summer and winter", () => {
  assert.equal(zonedToUtc({ year: 2026, month: 9, day: 15, hour: 9, minute: 0 }, TZ).toISOString(), "2026-09-15T07:00:00.000Z");
  assert.equal(zonedToUtc({ year: 2026, month: 12, day: 15, hour: 9, minute: 0 }, TZ).toISOString(), "2026-12-15T08:00:00.000Z");
  // Day overflow rolls into the next month.
  assert.equal(zonedToUtc({ year: 2026, month: 9, day: 31, hour: 9, minute: 0 }, TZ).toISOString(), "2026-10-01T07:00:00.000Z");
});

test("localDayBounds spans the local day, including the 25-hour DST day", () => {
  const { start, end, date } = localDayBounds(new Date("2026-10-25T10:00:00Z"), TZ);
  assert.equal(date, "2026-10-25");
  assert.equal(start.toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-25T23:00:00.000Z");
});

test("daily reminders keep local time across the October DST change", () => {
  const previous = new Date("2026-10-24T07:00:00Z"); // 09:00 CEST
  const next = nextOccurrence(previous, "daily", previous, TZ);
  assert.equal(next?.toISOString(), "2026-10-25T08:00:00.000Z"); // 09:00 CET
});

test("weekdays skip the weekend, weekly adds seven days, none stops", () => {
  const friday = new Date("2026-09-18T07:00:00Z");
  assert.equal(nextOccurrence(friday, "weekdays", friday, TZ)?.toISOString(), "2026-09-21T07:00:00.000Z");
  assert.equal(nextOccurrence(friday, "weekly", friday, TZ)?.toISOString(), "2026-09-25T07:00:00.000Z");
  assert.equal(nextOccurrence(friday, "none", friday, TZ), null);
});

test("nextOccurrence catches up past missed occurrences", () => {
  const previous = new Date("2026-09-10T07:00:00Z");
  const now = new Date("2026-09-14T12:00:00Z");
  assert.equal(nextOccurrence(previous, "daily", now, TZ)?.toISOString(), "2026-09-15T07:00:00.000Z");
});

test("deliveryTime hops reminders beyond the QStash delay cap", () => {
  const now = new Date("2026-09-14T00:00:00Z");
  const soon = new Date("2026-09-15T00:00:00Z");
  assert.equal(deliveryTime(soon, now).toISOString(), soon.toISOString());
  const far = new Date("2026-12-01T00:00:00Z");
  assert.ok(deliveryTime(far, now).getTime() <= now.getTime() + 7 * 864e5);
});

test("reminder_create stores, enqueues and records the message id", async () => {
  const out = (await run(reminderCreate, { text: " llamar  a mamá ", dueAt: "2099-01-01T09:00:00+01:00", repeat: "none" })) as {
    reminder: { id: string; text: string; dueAt: string };
    delivery: string;
  };
  assert.equal(out.reminder.text, "llamar a mamá");
  assert.equal(out.reminder.dueAt, "2099-01-01T08:00:00.000Z");
  assert.equal(out.delivery, "scheduled");
  assert.equal((await store.get(out.reminder.id))?.messageId, "msg-1");
});

test("reminder_create rejects past times and anonymous callers", async () => {
  await assert.rejects(run(reminderCreate, { text: "x", dueAt: "2020-01-01T09:00:00+01:00", repeat: "none" }), /in the past/);
  await assert.rejects(run(reminderCreate, { text: "x", dueAt: "2099-01-01T09:00:00+01:00", repeat: "none" }, anonymous), /authenticated/);
});

test("reminder_create rolls back the stored reminder when enqueueing fails", async () => {
  configureReminderQueue({ enqueue: async () => { throw new Error("qstash down"); }, cancel: async () => {} });
  await assert.rejects(run(reminderCreate, { text: "x", dueAt: "2099-01-01T09:00:00+01:00", repeat: "none" }), /qstash down/);
  assert.equal((await store.list()).length, 0);
});

test("reminder_list and reminder_cancel round trip and cancel the QStash message", async () => {
  const created = (await run(reminderCreate, { text: "a", dueAt: "2099-01-01T09:00:00+01:00", repeat: "daily" })) as { reminder: { id: string } };
  const listed = (await run(reminderList, { limit: 10 })) as { count: number };
  assert.equal(listed.count, 1);
  const cancelled = (await run(reminderCancel, { id: created.reminder.id })) as { cancelled: boolean };
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(queue.cancelled, ["msg-1"]);
  assert.equal(((await run(reminderCancel, { id: created.reminder.id })) as { cancelled: boolean }).cancelled, false);
});

test("fireReminder delivers a one-time reminder and deletes it", async () => {
  const reminder = await store.create({ text: "tomar agua", dueAt: new Date("2026-09-14T10:00:00Z"), repeat: "none" });
  const sent: string[] = [];
  const outcome = await fireReminder(
    { id: reminder.id, dueAt: reminder.dueAt },
    { store, queue, send: async (t) => void sent.push(t), timeZone: TZ, now: new Date("2026-09-14T10:00:05Z") },
  );
  assert.equal(outcome, "delivered");
  assert.deepEqual(sent, ["Recordatorio: tomar agua"]);
  assert.equal(await store.get(reminder.id), null);
});

test("fireReminder reschedules a repeating reminder and ignores the stale duplicate", async () => {
  const reminder = await store.create({ text: "gym", dueAt: new Date("2026-09-14T16:00:00Z"), repeat: "daily" });
  const sent: string[] = [];
  const deps = { store, queue, send: async (t: string) => void sent.push(t), timeZone: TZ, now: new Date("2026-09-14T16:00:01Z") };
  const payload = { id: reminder.id, dueAt: reminder.dueAt };

  assert.equal(await fireReminder(payload, deps), "rescheduled");
  const stored = await store.get(reminder.id);
  assert.equal(stored?.dueAt, "2026-09-15T16:00:00.000Z");
  assert.equal(stored?.messageId, "msg-1");

  // QStash redelivers the same message: nothing is sent twice.
  assert.equal(await fireReminder(payload, deps), "stale");
  assert.equal(sent.length, 1);
});

test("fireReminder re-queues an early hop without sending", async () => {
  const reminder = await store.create({ text: "renovar pasaporte", dueAt: new Date("2026-12-01T09:00:00Z"), repeat: "none" });
  const sent: string[] = [];
  const outcome = await fireReminder(
    { id: reminder.id, dueAt: reminder.dueAt },
    { store, queue, send: async (t) => void sent.push(t), timeZone: TZ, now: new Date("2026-09-21T09:00:00Z") },
  );
  assert.equal(outcome, "deferred");
  assert.equal(sent.length, 0);
  assert.equal(queue.enqueued.length, 1);
});

test("fireReminder keeps the reminder when sending fails so QStash can retry", async () => {
  const reminder = await store.create({ text: "x", dueAt: new Date("2026-09-14T10:00:00Z"), repeat: "none" });
  await assert.rejects(
    fireReminder(
      { id: reminder.id, dueAt: reminder.dueAt },
      { store, queue, send: async () => { throw new Error("telegram down"); }, timeZone: TZ, now: new Date("2026-09-14T10:00:00Z") },
    ),
    /telegram down/,
  );
  assert.ok(await store.get(reminder.id));
});

test("redis reminder store round trips through the hash", async () => {
  const hash: Record<string, unknown> = {};
  const fakeRedis = {
    async hget(_k: string, field: string) { return hash[field] ?? null; },
    async hgetall() { return { ...hash }; },
    async hset(_k: string, fields: Record<string, unknown>) { Object.assign(hash, fields); return 1; },
    async hdel(_k: string, field: string) { const had = field in hash; delete hash[field]; return had ? 1 : 0; },
    async hlen() { return Object.keys(hash).length; },
  };
  const redisStore = new RedisReminderStore(fakeRedis as never);
  const later = await redisStore.create({ text: "later", dueAt: new Date("2026-09-20T10:00:00Z"), repeat: "none" });
  const sooner = await redisStore.create({ text: "sooner", dueAt: new Date("2026-09-15T10:00:00Z"), repeat: "weekly" });
  assert.deepEqual((await redisStore.list()).map((r) => r.id), [sooner.id, later.id]);
  assert.equal((await redisStore.get(sooner.id))?.repeat, "weekly");
  assert.equal(await redisStore.delete(later.id), true);
  assert.equal(await redisStore.get(later.id), null);
});

test("morning brief prompt pins today's bounds and includes only today's reminders", async () => {
  const today = await store.create({ text: "dentista", dueAt: new Date("2026-09-14T15:00:00Z"), repeat: "none" });
  await store.create({ text: "mañana", dueAt: new Date("2026-09-15T15:00:00Z"), repeat: "none" });
  const prompt = renderMorningBriefPrompt({ now: new Date("2026-09-14T06:00:00Z"), timeZone: TZ, reminders: await store.list() });
  assert.match(prompt, /Hoy es 2026-09-14 en Europe\/Madrid/);
  assert.match(prompt, /timeMin=2026-09-13T22:00:00.000Z y timeMax=2026-09-14T22:00:00.000Z/);
  assert.match(prompt, new RegExp(`"id": "${today.id}"`));
  assert.doesNotMatch(prompt, /"text": "mañana"/);
});
