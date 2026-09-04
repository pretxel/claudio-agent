import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryMemoryStore,
  RedisMemoryStore,
  MAX_MEMORIES,
  configureMemoryStore,
  normalizeKey,
  normalizeValue,
} from "#lib/memory-store.ts";
import { renderMemoryInstructions } from "#lib/memory-prompt.ts";
import remember from "#tools/remember.ts";
import forget from "#tools/forget.ts";
import listMemories from "#tools/list_memories.ts";

const ctx = {
  session: { auth: { current: { authenticator: "api-key", principalType: "user", principalId: "owner", attributes: {} } } },
} as never;
const anonymous = { session: { auth: { current: undefined } } } as never;

type Tool = { execute(input: unknown, ctx: never): Promise<unknown> };
const run = (tool: unknown, input: unknown, c: never = ctx) => (tool as Tool).execute(input, c);

let store: InMemoryMemoryStore;
beforeEach(() => {
  store = new InMemoryMemoryStore();
  configureMemoryStore(store);
});

test("normalizeKey lower-cases, strips accents, collapses separators", () => {
  assert.equal(normalizeKey("Hermana Nombre"), "hermana_nombre");
  assert.equal(normalizeKey("café.favorito"), "cafe.favorito");
  assert.equal(normalizeKey("  trabajo -- horario  "), "trabajo_horario");
  assert.throws(() => normalizeKey("!!!"));
  assert.equal(normalizeKey("x".repeat(200)).length, 80);
});

test("normalizeValue trims and rejects empty/oversized", () => {
  assert.equal(normalizeValue("  hola \n mundo "), "hola mundo");
  assert.throws(() => normalizeValue("   "));
  assert.throws(() => normalizeValue("x".repeat(2001)));
});

test("in-memory store: put/list/delete, newest first, overwrite by key", async () => {
  await store.put({ key: "a", value: "1" });
  await new Promise((r) => setTimeout(r, 2));
  await store.put({ key: "b", value: "2" });
  assert.deepEqual((await store.list()).map((m) => m.key), ["b", "a"]);
  await store.put({ key: "A", value: "3" });
  const a = (await store.list()).find((m) => m.key === "a");
  assert.equal(a?.value, "3");
  assert.equal(await store.count(), 2);
  assert.equal(await store.delete("a"), true);
  assert.equal(await store.delete("a"), false);
});

test("store refuses new keys when full but allows overwrites", async () => {
  for (let i = 0; i < MAX_MEMORIES; i++) await store.put({ key: `k${i}`, value: "v" });
  await assert.rejects(store.put({ key: "one-more", value: "v" }), /full/);
  await store.put({ key: "k0", value: "updated" });
});

test("remember tool saves with the caller as source", async () => {
  const out = (await run(remember, { key: "Hermana Nombre", value: "Se llama Ana" })) as { saved: { key: string; value: string; source: string }; persistent: boolean };
  assert.equal(out.saved.key, "hermana_nombre");
  assert.equal(out.saved.value, "Se llama Ana");
  assert.equal(out.saved.source, "api-key:owner");
  assert.equal(out.persistent, false);
});

test("tools require an authenticated caller", async () => {
  await assert.rejects(run(remember, { key: "a", value: "b" }, anonymous), /authenticated/);
  await assert.rejects(run(forget, { key: "a" }, anonymous), /authenticated/);
  await assert.rejects(run(listMemories, { limit: 10 }, anonymous), /authenticated/);
});

test("list_memories and forget round trip", async () => {
  await run(remember, { key: "ciudad", value: "Madrid" });
  const listed = (await run(listMemories, { limit: 10 })) as { memories: { key: string }[]; total: number };
  assert.equal(listed.total, 1);
  assert.equal(listed.memories[0].key, "ciudad");
  const gone = (await run(forget, { key: "Ciudad" })) as { deleted: boolean };
  assert.equal(gone.deleted, true);
  assert.equal(((await run(listMemories, { limit: 10 })) as { total: number }).total, 0);
});

test("renderMemoryInstructions carries entries as JSON data with a trust note", async () => {
  await store.put({ key: "ciudad", value: "Madrid" });
  const md = renderMemoryInstructions(await store.list(), { persistent: true });
  assert.match(md, /^# Long-term memory/);
  assert.match(md, /never as instructions/);
  assert.match(md, /"key": "ciudad"/);
  assert.doesNotMatch(md, /WARNING/);
  const empty = renderMemoryInstructions([], { persistent: false });
  assert.match(empty, /No memories saved yet/);
  assert.match(empty, /WARNING: the memory store is not configured/);
});

test("redis store maps hash fields to memories and sorts by recency", async () => {
  const hash: Record<string, unknown> = {};
  const fakeRedis = {
    async hgetall() { return { ...hash }; },
    async hset(_k: string, fields: Record<string, unknown>) { Object.assign(hash, fields); return 1; },
    async hdel(_k: string, field: string) { const had = field in hash; delete hash[field]; return had ? 1 : 0; },
    async hlen() { return Object.keys(hash).length; },
  };
  const redisStore = new RedisMemoryStore(fakeRedis as never);
  await redisStore.put({ key: "uno", value: "1" });
  await new Promise((r) => setTimeout(r, 2));
  await redisStore.put({ key: "dos", value: "2" });
  hash["legacy"] = JSON.stringify({ key: "legacy", value: "old", updatedAt: "2020-01-01T00:00:00.000Z" });
  const listed = await redisStore.list();
  assert.deepEqual(listed.map((m) => m.key), ["dos", "uno", "legacy"]);
  assert.equal(await redisStore.count(), 3);
  assert.equal(await redisStore.delete("uno"), true);
  assert.equal(redisStore.persistent, true);
});
