import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMemoryStore, MAX_KEY_LENGTH } from "#lib/memory-store.ts";
import { requireCaller } from "#lib/memory-scope.ts";

export default defineTool({
  description:
    "Delete one long-term memory by key. Use it when the owner says a remembered fact is wrong or no longer applies, or asks you to forget something. Check the key against the long-term memory list first.",
  inputSchema: z.object({
    key: z.string().min(1).max(MAX_KEY_LENGTH),
  }),
  async execute({ key }, ctx) {
    requireCaller(ctx);
    const deleted = await getMemoryStore().delete(key);
    return { key, deleted };
  },
});
