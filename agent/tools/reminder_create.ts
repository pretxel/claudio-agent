import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireCaller } from "#lib/memory-scope.ts";
import { getReminderQueue } from "#lib/reminder-queue.ts";
import { getReminderStore, MAX_REMINDER_TEXT, REPEATS } from "#lib/reminder-store.ts";

export default defineTool({
  description:
    "Schedule a reminder that Claudio sends to the owner on Telegram at a given time. Resolve relative times ('mañana a las 9', 'en 20 minutos') against the current temporal context first. Repeating reminders keep the same local time.",
  inputSchema: z.object({
    text: z.string().min(1).max(MAX_REMINDER_TEXT).describe("What to remind the owner about, in their language, e.g. 'llamar a mamá'."),
    dueAt: z
      .string()
      .datetime({ offset: true })
      .describe("When to fire, ISO 8601 with an explicit offset, e.g. 2026-09-15T09:00:00+02:00."),
    repeat: z.enum(REPEATS).default("none").describe("none, daily, weekdays (Mon–Fri) or weekly."),
  }),
  async execute({ text, dueAt, repeat }, ctx) {
    const source = requireCaller(ctx);
    const due = new Date(dueAt);
    if (due.getTime() < Date.now() - 60_000) {
      throw new Error(`${dueAt} is in the past. Pick a future time.`);
    }

    const store = getReminderStore();
    const reminder = await store.create({ text, dueAt: due, repeat, source });
    let messageId: string | undefined;
    try {
      messageId = await getReminderQueue().enqueue(reminder);
    } catch (error) {
      await store.delete(reminder.id);
      throw error;
    }
    if (messageId) await store.save({ ...reminder, messageId });

    return {
      reminder: { id: reminder.id, text: reminder.text, dueAt: reminder.dueAt, repeat: reminder.repeat },
      delivery: messageId ? "scheduled" : "not configured: stored only, it will not be sent",
      persistent: store.persistent,
    };
  },
});
