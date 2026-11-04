// Stable guidance about time. The exact clock travels with each inbound message
// as `<current_time>` context (see renderTurnClock), not here: anything that
// changes per turn in the system prompt defeats the prompt cache.
import { defineDynamic, defineInstructions } from "eve/instructions";
import { renderTemporalGuidance } from "#lib/temporal-context.ts";

export default defineDynamic({
  events: {
    "session.started": () => defineInstructions({ markdown: renderTemporalGuidance() }),
  },
});
