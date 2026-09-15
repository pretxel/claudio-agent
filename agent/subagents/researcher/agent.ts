import { defineAgent } from "eve";
import { models } from "#lib/model.ts";

export default defineAgent({
  description:
    "Gathers facts, options, comparisons, and references on a topic before the assistant answers or plans.",
  model: models.researcher,
  modelContextWindowTokens: 200_000,
});
