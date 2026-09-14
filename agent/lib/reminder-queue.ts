// Delivery timing for reminders. Each pending occurrence is one delayed QStash
// message that calls back into the agent's `/eve/v1/qstash/reminder` route at
// the due time, so the agent needs no per-minute cron (Vercel Hobby allows only
// daily crons).

import { Client } from "@upstash/qstash";
import type { Reminder } from "#lib/reminder-store.ts";

export const REMINDER_ROUTE = "/eve/v1/qstash/reminder";
export const MORNING_BRIEF_ROUTE = "/eve/v1/qstash/morning-brief";

/** QStash's free plan caps message delay at 7 days; later reminders hop. */
const DEFAULT_MAX_DELAY_DAYS = 7;

export interface ReminderPayload {
  readonly id: string;
  /** The occurrence this message fires; a mismatch with the store means it is stale. */
  readonly dueAt: string;
}

export interface ReminderQueue {
  /** Schedule the reminder's current occurrence. Returns the message id, or undefined when queueing is not configured. */
  enqueue(reminder: Reminder, now?: Date): Promise<string | undefined>;
  cancel(messageId: string): Promise<void>;
}

/** Public origin of the deployment, without a trailing slash. */
export function publicBaseUrl(): string | null {
  const explicit = process.env.CLAUDIO_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

export function maxDelayMs(): number {
  const days = Number(process.env.QSTASH_MAX_DELAY_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : DEFAULT_MAX_DELAY_DAYS) * 864e5;
}

/**
 * When QStash should deliver: the due time, or the furthest allowed hop for
 * reminders beyond the delay cap (the route re-queues them on arrival). A small
 * margin keeps the hop inside the cap after network latency.
 */
export function deliveryTime(dueAt: Date, now: Date): Date {
  const latest = now.getTime() + maxDelayMs() - 60_000;
  return new Date(Math.min(dueAt.getTime(), latest));
}

export class QStashReminderQueue implements ReminderQueue {
  private readonly client: Client;
  private readonly url: string;

  constructor(client: Client, baseUrl: string) {
    this.client = client;
    this.url = `${baseUrl}${REMINDER_ROUTE}`;
  }

  async enqueue(reminder: Reminder, now = new Date()): Promise<string> {
    const deliverAt = deliveryTime(new Date(reminder.dueAt), now);
    const body: ReminderPayload = { id: reminder.id, dueAt: reminder.dueAt };
    const result = await this.client.publishJSON({
      url: this.url,
      body,
      notBefore: Math.floor(deliverAt.getTime() / 1000),
      // A retried enqueue for the same occurrence and hop must not double-deliver.
      deduplicationId: `${reminder.id}-${Date.parse(reminder.dueAt)}-${deliverAt.getTime()}`,
    });
    return result.messageId;
  }

  async cancel(messageId: string): Promise<void> {
    try {
      await this.client.messages.cancel(messageId);
    } catch (error) {
      // Already delivered or cancelled: nothing left to stop.
      console.warn(`[reminders] could not cancel QStash message ${messageId}`, error);
    }
  }
}

class UnconfiguredReminderQueue implements ReminderQueue {
  async enqueue(): Promise<undefined> {
    return undefined;
  }
  async cancel(): Promise<void> {}
}

let queue: ReminderQueue | undefined;

/** Test/dev hook: replace the queue used by tools and the delivery route. */
export function configureReminderQueue(next: ReminderQueue | undefined): void {
  queue = next;
}

export function getReminderQueue(): ReminderQueue {
  if (queue) return queue;
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = publicBaseUrl();
  if (token && baseUrl) {
    queue = new QStashReminderQueue(new Client({ token, baseUrl: process.env.QSTASH_URL }), baseUrl);
  } else {
    console.warn("[reminders] QSTASH_TOKEN or CLAUDIO_PUBLIC_URL missing; reminders are stored but will not be delivered.");
    queue = new UnconfiguredReminderQueue();
  }
  return queue;
}
