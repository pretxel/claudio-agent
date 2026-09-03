import { defineTool } from "eve/tools";
import { z } from "zod";
import { tavilyExtract } from "#lib/tavily.ts";

export default defineTool({
  description:
    "Fetch the full text of pages found by web_search, when the search extract is too short to answer the question.",
  inputSchema: z.object({
    urls: z.array(z.string().url()).min(1).max(5),
    maxCharsPerPage: z.number().int().min(500).max(20_000).default(6_000),
  }),
  async execute({ urls, maxCharsPerPage }) {
    const data = await tavilyExtract(urls);

    return {
      pages: (data.results ?? []).map((page) => ({
        url: page.url,
        text: (page.raw_content ?? "").slice(0, maxCharsPerPage),
        truncated: (page.raw_content ?? "").length > maxCharsPerPage,
      })),
      failed: (data.failed_results ?? []).map((failure) => ({
        url: failure.url,
        error: failure.error ?? "unknown",
      })),
    };
  },
});
