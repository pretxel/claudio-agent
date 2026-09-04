import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { apiKeyAuth, isValidApiKey } from "#lib/api-key-auth.ts";

const KEY = "s3cret-key-123";

function req(auth?: string): Request {
  return new Request("https://agent.test/eve/v1/session", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  process.env.CLIENT_API_KEY = KEY;
});

test("valid key authenticates as owner", async () => {
  assert.equal(isValidApiKey(req(`Bearer ${KEY}`)), true);
  const ctx = await apiKeyAuth()(req(`Bearer ${KEY}`));
  assert.deepEqual(ctx, {
    authenticator: "api-key",
    principalType: "user",
    principalId: "owner",
    attributes: {},
  });
});

test("wrong key returns null", async () => {
  assert.equal(isValidApiKey(req("Bearer nope")), false);
  assert.equal(await apiKeyAuth()(req("Bearer nope")), null);
});

test("same-length wrong key returns null", () => {
  assert.equal(isValidApiKey(req(`Bearer ${"x".repeat(KEY.length)}`)), false);
});

test("missing env never authenticates", () => {
  delete process.env.CLIENT_API_KEY;
  assert.equal(isValidApiKey(req(`Bearer ${KEY}`)), false);
  process.env.CLIENT_API_KEY = "";
  assert.equal(isValidApiKey(req("Bearer ")), false);
});

test("malformed headers return null", () => {
  assert.equal(isValidApiKey(req()), false);
  assert.equal(isValidApiKey(req("Basic abc")), false);
  assert.equal(isValidApiKey(req("Bearer")), false);
  assert.equal(isValidApiKey(req(KEY)), false);
});

test("scheme is case-insensitive", () => {
  assert.equal(isValidApiKey(req(`bearer ${KEY}`)), true);
});
