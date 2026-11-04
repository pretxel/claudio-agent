// At-most-once guard for webhook deliveries that may be retried. Redis SET NX
// with a TTL when Upstash is configured; an in-process set otherwise.

import { Redis } from "@upstash/redis";

const TTL_SECONDS = 2 * 24 * 60 * 60;
const seen = new Set<string>();
let redis: Redis | null | undefined;

function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

/** True the first time `key` is claimed, false on any repeat within the TTL. */
export async function claimOnce(key: string): Promise<boolean> {
  const r = client();
  if (!r) {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }
  return (await r.set(`claudio:once:${key}`, "1", { nx: true, ex: TTL_SECONDS })) === "OK";
}
