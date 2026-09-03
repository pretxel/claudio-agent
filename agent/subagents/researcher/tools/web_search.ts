import { defineTool } from "eve/tools";
import { z } from "zod";
import { tavilySearch } from "#lib/tavily.ts";

export default defineTool({
  description:
    "Search the web with Tavily. Use it for anything you cannot state confidently from memory: current events, prices, docs, whether something still exists. Returns ranked results with a short extract and the source URL.",
  inputSchema: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(10).default(5),
    topic: z
      .enum(["general", "news"])
      .default("general")
      .describe("Use 'news' for recent events; it enables the days window."),
    days: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe("How far back to look, news topic only."),
    searchDepth: z
      .enum(["basic", "advanced"])
      .default("basic")
      .describe("'advanced' digs deeper and costs more; use it when basic came back thin."),
  }),
  async execute({ query, maxResults, topic, days, searchDepth }) {
    const data = await tavilySearch({
      query,
      maxResults,
      searchDepth,
      topic,
      includeAnswer: true,
      days,
    });

    return {
      query,
      answer: data.answer ?? null,
      results: (data.results ?? []).map((result) => ({
        title: result.title,
        url: result.url,
        published: result.published_date ?? null,
        extract: result.content.slice(0, 1200),
      })),
    };
  },
});
