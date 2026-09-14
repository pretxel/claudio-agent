import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireCaller } from "#lib/memory-scope.ts";
import { getReminderStore } from "#lib/reminder-store.ts";

export default defineTool({
  description: "List the owner's pending reminders, soonest first, with their ids for reminder_cancel.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(100).default(20),
  }),
  async execute({ limit }, ctx) {
    requireCaller(ctx);
    const reminders = await getReminderStore().list(limit);
    return {
      count: reminders.length,
      reminders: reminders.map(({ id, text, dueAt, repeat }) => ({ id, text, dueAt, repeat })),
    };
  },
});
