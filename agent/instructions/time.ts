// Gives every turn a fresh clock so relative dates remain correct in long-lived sessions.
import { defineDynamic, defineInstructions } from "eve/instructions";
import { renderTemporalContext } from "#lib/temporal-context.ts";

export default defineDynamic({
  events: {
    "turn.started": () =>
      defineInstructions({
        markdown: renderTemporalContext(),
      }),
  },
});
