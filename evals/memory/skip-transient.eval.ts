import { defineEval } from "eve/evals";

export default defineEval({
  description: "Today's mood is transient and must not be written to long-term memory.",
  tags: ["memory"],
  async test(t) {
    await t.send("Uf, hoy estoy reventado, dormí fatal");
    t.succeeded();
    t.notCalledTool("remember");
  },
});
