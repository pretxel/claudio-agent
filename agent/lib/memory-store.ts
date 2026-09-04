// Long-term memory for the owner: a small key/value set that survives sessions
// and is shared by every channel (iOS app, Telegram, dev REPL).
//
// Storage is Upstash Redis provisioned through the Vercel Marketplace. When the
// REST credentials are absent (local dev without `vercel env pull`), an
// in-process store keeps the tools working but nothing persists.

import { Redis } from "@upstash/redis";

export interface Memory {
  readonly key: string;
  readonly value: string;
  /** ISO timestamp of the last write. */
  readonly updatedAt: string;
  /** Which channel/principal wrote it, for auditing. */
  readonly source?: string;
}

export interface MemoryStore {
  readonly persistent: boolean;
  list(limit?: number): Promise<Memory[]>;
  put(input: { key: string; value: string; source?: string }): Promise<Memory>;
  delete(key: string): Promise<boolean>;
  count(): Promise<number>;
}

/** Single owner, single scope: every channel authenticates the same person. */
export const MEMORY_SCOPE = "owner";
export const MAX_MEMORIES = 300;
export const MAX_KEY_LENGTH = 80;
export const MAX_VALUE_LENGTH = 2000;

const KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,79}$/;

/** Lower-case, collapse anything that is not [a-z0-9_.-] into "_", trim to the max length. */
export function normalizeKey(raw: string): string {
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9.]+/g, "_")
    .replace(/[_.]*\.[_.]*/g, ".")
    .replace(/_{2,}/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, MAX_KEY_LENGTH);
  if (!KEY_PATTERN.test(key)) throw new Error(`Invalid memory key "${raw}".`);
  return key;
}

export function normalizeValue(raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) throw new Error("Memory value must not be empty.");
  if (value.length > MAX_VALUE_LENGTH) throw new Error(`Memory value exceeds ${MAX_VALUE_LENGTH} characters.`);
  return value;
}

function byRecency(a: Memory, b: Memory): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

async function guardCapacity(store: MemoryStore, key: string): Promise<void> {
  const existing = await store.list(MAX_MEMORIES + 1);
  if (existing.length >= MAX_MEMORIES && !existing.some((m) => m.key === key)) {
    throw new Error(`Memory is full (${MAX_MEMORIES} entries). Forget something first.`);
  }
}

export class InMemoryMemoryStore implements MemoryStore {
  readonly persistent = false;
  private readonly items = new Map<string, Memory>();

  async list(limit = 100): Promise<Memory[]> {
    return [...this.items.values()].sort(byRecency).slice(0, limit);
  }

  async put(input: { key: string; value: string; source?: string }): Promise<Memory> {
    const key = normalizeKey(input.key);
    await guardCapacity(this, key);
    const memory: Memory = { key, value: normalizeValue(input.value), updatedAt: new Date().toISOString(), source: input.source };
    this.items.set(key, memory);
    return memory;
  }

  async delete(rawKey: string): Promise<boolean> {
    return this.items.delete(normalizeKey(rawKey));
  }

  async count(): Promise<number> {
    return this.items.size;
  }
}

/** One Redis hash per scope: field = key, value = JSON-encoded Memory. */
export class RedisMemoryStore implements MemoryStore {
  readonly persistent = true;
  private readonly hashKey: string;
  private readonly redis: Redis;

  constructor(redis: Redis, scope: string = MEMORY_SCOPE) {
    this.redis = redis;
    this.hashKey = `claudio:memory:${scope}`;
  }

  async list(limit = 100): Promise<Memory[]> {
    const all = (await this.redis.hgetall<Record<string, Memory | string>>(this.hashKey)) ?? {};
    const memories = Object.values(all)
      .map((v) => (typeof v === "string" ? (JSON.parse(v) as Memory) : v))
      .filter((m): m is Memory => Boolean(m && typeof m.key === "string" && typeof m.value === "string"));
    return memories.sort(byRecency).slice(0, limit);
  }

  async put(input: { key: string; value: string; source?: string }): Promise<Memory> {
    const key = normalizeKey(input.key);
    await guardCapacity(this, key);
    const memory: Memory = { key, value: normalizeValue(input.value), updatedAt: new Date().toISOString(), source: input.source };
    await this.redis.hset(this.hashKey, { [key]: memory });
    return memory;
  }

  async delete(rawKey: string): Promise<boolean> {
    return (await this.redis.hdel(this.hashKey, normalizeKey(rawKey))) > 0;
  }

  async count(): Promise<number> {
    return this.redis.hlen(this.hashKey);
  }
}

let store: MemoryStore | undefined;

/** Test/dev hook: replace the store used by tools and instructions. */
export function configureMemoryStore(next: MemoryStore | undefined): void {
  store = next;
}

export function getMemoryStore(): MemoryStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    store = new RedisMemoryStore(new Redis({ url, token }));
  } else {
    console.warn("[memory] No Upstash credentials (UPSTASH_REDIS_REST_URL/KV_REST_API_URL); memories will not persist.");
    store = new InMemoryMemoryStore();
  }
  return store;
}
