import { defineAgent } from "eve";
import { models } from "#lib/model.ts";

export default defineAgent({
  description:
    "Condenses long text, research notes, or a plan into a short brief that keeps every decision-relevant detail.",
  model: models.summarizer,
  modelContextWindowTokens: 200_000,
});
