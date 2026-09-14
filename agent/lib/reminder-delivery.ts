// What happens when a reminder's QStash message arrives. Kept free of HTTP and
// Telegram so it can be tested with fakes.
//
// QStash delivers at least once and retries on any thrown error, so every step
// is safe to repeat: a message whose `dueAt` no longer matches the store is
// stale and ignored, and the next occurrence is enqueued with a deduplication id.

import { nextOccurrence, type Reminder, type ReminderStore } from "#lib/reminder-store.ts";
import type { ReminderPayload, ReminderQueue } from "#lib/reminder-queue.ts";

/** Tolerate QStash firing slightly early. */
const EARLY_TOLERANCE_MS = 60_000;

export type FireOutcome = "delivered" | "rescheduled" | "deferred" | "missing" | "stale";

export interface FireDeps {
  store: ReminderStore;
  queue: ReminderQueue;
  send: (text: string) => Promise<void>;
  timeZone: string;
  now?: Date;
}

export function reminderMessage(reminder: Reminder): string {
  return `Recordatorio: ${reminder.text}`;
}

export async function fireReminder(payload: ReminderPayload, deps: FireDeps): Promise<FireOutcome> {
  const now = deps.now ?? new Date();
  const reminder = await deps.store.get(payload.id);
  if (!reminder) return "missing";
  if (reminder.dueAt !== payload.dueAt) return "stale";

  // A hop for a reminder beyond QStash's delay cap: queue the next leg.
  if (Date.parse(reminder.dueAt) - now.getTime() > EARLY_TOLERANCE_MS) {
    const messageId = await deps.queue.enqueue(reminder, now);
    await deps.store.save({ ...reminder, messageId });
    return "deferred";
  }

  await deps.send(reminderMessage(reminder));

  const next = nextOccurrence(new Date(reminder.dueAt), reminder.repeat, now, deps.timeZone);
  if (!next) {
    await deps.store.delete(reminder.id);
    return "delivered";
  }

  const upcoming: Reminder = { ...reminder, dueAt: next.toISOString(), messageId: undefined };
  const messageId = await deps.queue.enqueue(upcoming, now);
  await deps.store.save({ ...upcoming, messageId });
  return "rescheduled";
}
