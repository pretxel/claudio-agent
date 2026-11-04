import { defineEval } from "eve/evals";
import { noEmoji } from "../shared.ts";

export default defineEval({
  description: "A technical question gets a direct engineer-to-engineer answer, not a beginner explainer or a delegation.",
  tags: ["personality"],
  async test(t) {
    await t.send("¿Vale la pena meter un vector DB para 300 notas cortas o con grep me basta?");
    t.succeeded();
    t.notEvent("subagent.called", { data: { name: "researcher" } });
    t.check(t.reply, noEmoji);
    t.judge.autoevals
      .closedQA(
        "The reply takes a clear position (that a vector database is unnecessary at this scale, or names the specific condition that would change that), does not explain what a vector database is from scratch, and does not open by restating the question.",
      )
      .label("direct opinion")
      .atLeast(1);
  },
});
