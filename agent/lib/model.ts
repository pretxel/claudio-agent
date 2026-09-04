import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Cap the output budget per model. Without it OpenRouter assumes the model's
// full max output (64k on Sonnet 4.5) and rejects the call up front whenever
// the account balance can't cover that worst case. The summarizer sits lower
// because gpt-4o-mini tops out at 16384 completion tokens.
export const models = {
  orchestrator: openrouter.chat("anthropic/claude-sonnet-4.5", { maxTokens: 32000 }),
  researcher: openrouter.chat("google/gemini-2.5-flash", { maxTokens: 32000 }),
  planner: openrouter.chat("anthropic/claude-sonnet-4.5", { maxTokens: 32000 }),
  summarizer: openrouter.chat("openai/gpt-4o-mini", { maxTokens: 16000 }),
};
