import { defineTool } from "eve/tools";
import { z } from "zod";
import { filterMemories, getMemoryStore, MAX_MEMORIES } from "#lib/memory-store.ts";
import { requireCaller } from "#lib/memory-scope.ts";

export default defineTool({
  description:
    "Read long-term memory, newest first. Recent memories are already in your context each turn; call this when the owner asks what you remember, when you need an older entry listed by key only in your context, or when you need exact keys to forget or overwrite one. Pass query to filter by a key or a word.",
  inputSchema: z.object({
    query: z.string().optional().describe("Key, key prefix, or word to match in keys and values (case- and accent-insensitive)."),
    limit: z.number().int().min(1).max(MAX_MEMORIES).default(100),
  }),
  async execute({ query, limit }, ctx) {
    requireCaller(ctx);
    const store = getMemoryStore();
    const all = await store.list(MAX_MEMORIES);
    const matched = query ? filterMemories(all, query) : all;
    return { memories: matched.slice(0, limit), matched: matched.length, total: all.length, persistent: store.persistent };
  },
});
