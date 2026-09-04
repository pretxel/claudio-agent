import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Each cap sits at the model's own ceiling: Sonnet 4.5 tops out at 64000
// completion tokens, gpt-4o-mini at 16384. Setting them explicitly keeps the
// request bounded — OpenRouter otherwise assumes the ceiling anyway and, when
// a call falls back off BYOK onto credits, rejects it up front if the balance
// can't cover that worst case.
export const models = {
  orchestrator: openrouter.chat("anthropic/claude-sonnet-4.5", { maxTokens: 64000 }),
  researcher: openrouter.chat("google/gemini-2.5-flash", { maxTokens: 64000 }),
  planner: openrouter.chat("anthropic/claude-sonnet-4.5", { maxTokens: 64000 }),
  summarizer: openrouter.chat("openai/gpt-4o-mini", { maxTokens: 16000 }),
};
