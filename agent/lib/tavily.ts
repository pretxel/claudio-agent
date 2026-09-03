// Tavily web search and page extraction.
// https://docs.tavily.com — one key, two endpoints the agent cares about.

const API = "https://api.tavily.com";

function apiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("Missing TAVILY_API_KEY. See README \"Web search\".");
  return key;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Tavily ${path} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
}

export interface TavilySearchResponse {
  answer?: string;
  results?: TavilyResult[];
}

export function tavilySearch(input: {
  query: string;
  maxResults: number;
  searchDepth: "basic" | "advanced";
  topic: "general" | "news";
  includeAnswer: boolean;
  days?: number;
  includeDomains?: string[];
}): Promise<TavilySearchResponse> {
  return call<TavilySearchResponse>("/search", {
    query: input.query,
    max_results: input.maxResults,
    search_depth: input.searchDepth,
    topic: input.topic,
    include_answer: input.includeAnswer,
    days: input.topic === "news" ? input.days : undefined,
    include_domains: input.includeDomains,
  });
}

export interface TavilyExtractResponse {
  results?: { url: string; raw_content?: string }[];
  failed_results?: { url: string; error?: string }[];
}

export function tavilyExtract(urls: string[]): Promise<TavilyExtractResponse> {
  return call<TavilyExtractResponse>("/extract", { urls });
}
