import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMemoryStore, MAX_KEY_LENGTH, MAX_VALUE_LENGTH } from "#lib/memory-store.ts";
import { requireCaller } from "#lib/memory-scope.ts";

export default defineTool({
  description:
    "Save one stable fact or preference about the owner to long-term memory so it is available in every future conversation, on every channel. Use it when the owner says to remember something, or states a durable fact (a person, a place, a routine, a preference). Re-using an existing key overwrites that memory.",
  inputSchema: z.object({
    key: z
      .string()
      .min(1)
      .max(MAX_KEY_LENGTH)
      .describe("Short stable identifier, e.g. 'hermana.nombre', 'trabajo.horario', 'preferencia.cafe'."),
    value: z.string().min(1).max(MAX_VALUE_LENGTH).describe("The fact, in one or two sentences, in the owner's language."),
  }),
  async execute({ key, value }, ctx) {
    const source = requireCaller(ctx);
    const memory = await getMemoryStore().put({ key, value, source });
    return { saved: memory, persistent: getMemoryStore().persistent };
  },
});
