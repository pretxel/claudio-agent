import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "A reminder without a time makes Claudio ask for one instead of guessing.",
  tags: ["routing", "reminders"],
  async test(t) {
    await t.send("Recuérdame lo del banco");
    t.succeeded();
    t.notCalledTool("reminder_create");
    t.notCalledTool("calendar_create_event");
    t.check(t.reply, includes("?")).label("asks a question");
  },
});
