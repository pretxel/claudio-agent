import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "A durable fact is saved with a stable key and is visible from a brand-new session.",
  tags: ["memory"],
  async test(t) {
    await t.send("Acuérdate de que mi sobrina se llama Ximena Aurora");
    t.succeeded();
    t.calledTool("remember", { input: { key: /sobrin/i, value: /Ximena/ } });

    // A fresh session has no chat history: the name can only come from memory.
    const other = t.newSession();
    const recall = await other.send("¿Cómo se llama mi sobrina?");
    other.succeeded();
    t.check(recall.message, includes("Ximena")).label("recalled across sessions");
  },
});
