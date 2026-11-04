import { defineEval } from "eve/evals";
import { noEmoji, noUsted } from "../shared.ts";

export default defineEval({
  description: "A casual greeting gets a short, friendly Spanish reply with no tools and the right register.",
  tags: ["personality", "fast"],
  async test(t) {
    await t.send("Qué onda Claudio, ¿cómo vas?");
    t.succeeded();
    t.usedNoTools();
    t.check(t.reply, noEmoji);
    t.check(t.reply, noUsted);
    t.judge.autoevals
      .closedQA(
        "The reply is in Spanish, addresses the user as 'tú', is at most three short sentences, and any word the assistant uses about itself takes masculine grammatical agreement (e.g. 'listo', not 'lista').",
      )
      .label("register")
      .atLeast(1);
  },
});
