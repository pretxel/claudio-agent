import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMemoryStore } from "#lib/memory-store.ts";
import { requireCaller } from "#lib/memory-scope.ts";

export default defineTool({
  description:
    "List everything saved in long-term memory, newest first. The current memories are already in your context each turn; call this only when the owner asks what you remember or you need the exact keys to forget or overwrite one.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(300).default(100),
  }),
  async execute({ limit }, ctx) {
    requireCaller(ctx);
    const store = getMemoryStore();
    return { memories: await store.list(limit), total: await store.count(), persistent: store.persistent };
  },
});
