import { defineEvalConfig } from "eve/evals";
import { models } from "#lib/model.ts";

// Run through `npm run eval`, never bare `eve eval`: the wrapper blanks the
// Redis and QStash credentials so memories and reminders stay in-process.
export default defineEvalConfig({
  judge: { model: models.judge },
  maxConcurrency: 4,
  timeoutMs: 180_000,
});
