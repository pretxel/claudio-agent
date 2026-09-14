import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireCaller } from "#lib/memory-scope.ts";
import { getReminderQueue } from "#lib/reminder-queue.ts";
import { getReminderStore } from "#lib/reminder-store.ts";

export default defineTool({
  description:
    "Cancel a pending reminder by id (from reminder_list). A repeating reminder stops for good. List first when the owner's request matches more than one.",
  inputSchema: z.object({
    id: z.string().min(1).describe("Reminder id from reminder_list."),
  }),
  async execute({ id }, ctx) {
    requireCaller(ctx);
    const store = getReminderStore();
    const reminder = await store.get(id);
    if (!reminder) return { cancelled: false, reason: "No pending reminder with that id." };
    if (reminder.messageId) await getReminderQueue().cancel(reminder.messageId);
    await store.delete(id);
    return { cancelled: true, reminder: { id, text: reminder.text, dueAt: reminder.dueAt, repeat: reminder.repeat } };
  },
});
