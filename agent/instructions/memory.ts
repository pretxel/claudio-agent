// Loads the owner's long-term memories into the system prompt at the start of
// every turn, so a fact remembered in an earlier turn (or another channel) is
// visible in this one.

import { defineDynamic, defineInstructions } from "eve/instructions";
import { getMemoryStore } from "#lib/memory-store.ts";
import { renderMemoryInstructions } from "#lib/memory-prompt.ts";

export default defineDynamic({
  events: {
    "turn.started": async () => {
      const store = getMemoryStore();
      try {
        const memories = await store.list(100);
        return defineInstructions({ markdown: renderMemoryInstructions(memories, { persistent: store.persistent }) });
      } catch (error) {
        console.error("[memory] failed to load memories", error);
        return defineInstructions({
          markdown: "# Long-term memory\n\nThe memory store is unreachable right now; answer without it and mention it only if the owner asks you to remember or recall something.",
        });
      }
    },
  },
});
