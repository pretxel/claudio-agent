import { defineEval } from "eve/evals";

export default defineEval({
  description: "'Recuérdame' with a time creates a reminder at that local time in Madrid, not a calendar event.",
  tags: ["routing", "reminders"],
  async test(t) {
    await t.send("Recuérdame mañana a las 9 llamar al banco");
    t.succeeded();
    // Tracked, not gated: the skill carries the offset and repeat rules.
    t.loadedSkill("reminders").soft();
    t.calledTool("reminder_create", {
      input: {
        text: /banco/i,
        // 09:00 Madrid local time: +01:00 in winter, +02:00 in summer.
        dueAt: /T09:00(:00(\.0+)?)?\+0[12]:00$/,
        repeat: (value: unknown) => value === undefined || value === "none",
      },
      count: 1,
    });
    t.notCalledTool("calendar_create_event");
  },
});
