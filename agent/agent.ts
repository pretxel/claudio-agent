import { defineAgent } from "eve";
import { models } from "#lib/model.ts";

export default defineAgent({
  model: models.orchestrator,
  modelContextWindowTokens: 200_000,
});
