import { defineEval } from "eve/evals";

export default defineEval({
  description: "'De lunes a viernes' maps to the weekdays repeat.",
  tags: ["routing", "reminders"],
  async test(t) {
    await t.send("Avísame de lunes a viernes a las 8:30 que tome la vitamina D");
    t.succeeded();
    t.calledTool("reminder_create", {
      input: { repeat: "weekdays", dueAt: /T08:30(:00(\.0+)?)?\+0[12]:00$/ },
      count: 1,
    });
  },
});
