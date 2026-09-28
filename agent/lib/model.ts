import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

// Authenticates with a Bedrock API key (bearer token) instead of SigV4 IAM
// credentials. Region comes from AWS_REGION, which Vercel sets to the
// function's region, so the models use global cross-region inference profiles
// that are callable from any commercial region.
const bedrock = createAmazonBedrock({
  apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
  region: process.env.AWS_REGION,
});

export const models = {
  orchestrator: bedrock("global.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  researcher: bedrock("global.anthropic.claude-haiku-4-5-20251001-v1:0"),
  planner: bedrock("global.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  summarizer: bedrock("global.anthropic.claude-haiku-4-5-20251001-v1:0"),
};
