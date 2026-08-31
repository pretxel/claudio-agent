import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Single place to pick OpenRouter models for the orchestrator and subagents.
export const models = {
  orchestrator: openrouter.chat("anthropic/claude-sonnet-4.5"),
  researcher: openrouter.chat("google/gemini-2.5-flash"),
  planner: openrouter.chat("anthropic/claude-sonnet-4.5"),
  summarizer: openrouter.chat("openai/gpt-4o-mini"),
};
