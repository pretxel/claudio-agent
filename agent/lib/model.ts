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

// Each cap sits at the model's own ceiling: Sonnet 4.5 and Haiku 4.5 both top
// out at 64000 completion tokens. Setting them explicitly keeps the request
// bounded — OpenRouter otherwise assumes the ceiling anyway and, when a call
// falls back off BYOK onto credits, rejects it up front if the balance can't
// cover that worst case.
export const models = {
  orchestrator: openrouter.chat("anthropic/claude-sonnet-4.5", { maxTokens: 64000, provider: bedrockOnly }),
  researcher: openrouter.chat("anthropic/claude-haiku-4.5", { maxTokens: 64000, provider: bedrockOnly }),
  planner: openrouter.chat("anthropic/claude-sonnet-4.5", { maxTokens: 64000, provider: bedrockOnly }),
  summarizer: openrouter.chat("anthropic/claude-haiku-4.5", { maxTokens: 64000, provider: bedrockOnly }),
};
