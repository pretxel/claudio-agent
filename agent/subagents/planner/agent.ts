import { defineAgent } from "eve";
import { models } from "#lib/model.ts";

export default defineAgent({
  description:
    "Turns a goal plus constraints and research notes into a concrete ordered plan with steps, dates, and dependencies.",
  model: models.planner,
  modelContextWindowTokens: 200_000,
});
