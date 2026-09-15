import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Every request is pinned to Amazon Bedrock so it bills against the Bedrock
// key configured in OpenRouter (BYOK). With fallbacks off, OpenRouter returns
// an error instead of silently routing to Anthropic, Vertex, or Azure, which is
// why every model here must be one Bedrock serves. To stop OpenRouter falling
// back from the BYOK key onto its own credits, enable "Always use this key" on
// the Bedrock integration at https://openrouter.ai/settings/integrations.
const bedrockOnly = {
  only: ["amazon-bedrock"],
  allow_fallbacks: false,
};

// OpenRouter checks every request's worst case (maxTokens at full price)
// against the credit balance before routing, and rejects it up front when the
// balance can't cover it. Replies here are short Telegram messages, so 8000
// keeps that check small instead of the models' 64000 ceiling.
export const models = {
  orchestrator: openrouter.chat("anthropic/claude-sonnet-4.5", { maxTokens: 8000, provider: bedrockOnly }),
  researcher: openrouter.chat("anthropic/claude-haiku-4.5", { maxTokens: 8000, provider: bedrockOnly }),
  planner: openrouter.chat("anthropic/claude-sonnet-4.5", { maxTokens: 8000, provider: bedrockOnly }),
  summarizer: openrouter.chat("anthropic/claude-haiku-4.5", { maxTokens: 8000, provider: bedrockOnly }),
};
