import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ENERGY_SCOPES,
  InMemoryEnergyTokenStore,
  buildAuthorizeUrl,
  createPkce,
  createEnergyAuth,
  type EnergyAuthConfig,
} from "#lib/energy-auth.ts";

const config: EnergyAuthConfig = {
  issuer: "https://id.example.com/realms/energy-mcp",
  clientId: "claudio-agent",
  resource: "https://api.example.com/mcp",
};
const META = {
  authorization_endpoint: `${config.issuer}/protocol/openid-connect/auth`,
  token_endpoint: `${config.issuer}/protocol/openid-connect/token`,
};

function fakeFetch(handlers: Record<string, (body: URLSearchParams) => { status?: number; json: unknown }>) {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const fn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = new URLSearchParams(String(init?.body ?? ""));
    calls.push({ url, body });
    const key = Object.keys(handlers).find((k) => url.endsWith(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    const { status = 200, json } = handlers[key]!(body);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}

const discovery = { "/.well-known/openid-configuration": () => ({ json: META }) };

test("PKCE challenge is the S256 of the verifier", () => {
  const { verifier, challenge } = createPkce();
  assert.ok(verifier.length >= 43);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
});

test("authorize URL asks for the MCP scopes, offline access, PKCE and the resource", () => {
  const url = new URL(buildAuthorizeUrl(META.authorization_endpoint, config, { callbackUrl: "https://agent.example/cb/abc", challenge: "c", state: "s" }));
  assert.equal(url.origin + url.pathname, META.authorization_endpoint);
  assert.equal(url.searchParams.get("client_id"), "claudio-agent");
  assert.equal(url.searchParams.get("redirect_uri"), "https://agent.example/cb/abc");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("resource"), config.resource);
  const scopes = url.searchParams.get("scope")!.split(" ");
  for (const s of [...ENERGY_SCOPES, "offline_access"]) assert.ok(scopes.includes(s), s);
});

test("getToken returns a fresh stored token without calling the IdP", async () => {
  const store = new InMemoryEnergyTokenStore();
  await store.save({ accessToken: "A", refreshToken: "R", expiresAt: Date.now() + 10 * 60_000 });
  const { fn, calls } = fakeFetch({});
  const auth = createEnergyAuth({ config, store, fetch: fn });
  assert.equal((await auth.getToken()).token, "A");
  assert.equal(calls.length, 0);
});

test("getToken refreshes an expiring token and stores the rotated refresh token", async () => {
  const store = new InMemoryEnergyTokenStore();
  await store.save({ accessToken: "OLD", refreshToken: "R1", expiresAt: Date.now() + 5_000 });
  const { fn, calls } = fakeFetch({
    ...discovery,
    "/token": (body) => {
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "R1");
      return { json: { access_token: "NEW", refresh_token: "R2", expires_in: 300 } };
    },
  });
  const auth = createEnergyAuth({ config, store, fetch: fn });
  assert.equal((await auth.getToken()).token, "NEW");
  assert.equal((await store.load())?.refreshToken, "R2");
  assert.equal(calls.filter((c) => c.url.endsWith("/token")).length, 1);
});

test("getToken asks for authorization when there is no grant or the refresh token was revoked", async () => {
  const empty = createEnergyAuth({ config, store: new InMemoryEnergyTokenStore(), fetch: fakeFetch({}).fn });
  await assert.rejects(empty.getToken(), (e: Error) => e.name === "ConnectionAuthorizationRequiredError");

  const store = new InMemoryEnergyTokenStore();
  await store.save({ accessToken: "OLD", refreshToken: "REVOKED", expiresAt: 0 });
  const revoked = createEnergyAuth({
    config,
    store,
    fetch: fakeFetch({ ...discovery, "/token": () => ({ status: 400, json: { error: "invalid_grant" } }) }).fn,
  });
  await assert.rejects(revoked.getToken(), (e: Error) => e.name === "ConnectionAuthorizationRequiredError");
  assert.equal(await store.load(), null);
});

test("authorization round trip: start builds the URL, complete checks state and stores tokens", async () => {
  const store = new InMemoryEnergyTokenStore();
  const { fn } = fakeFetch({
    ...discovery,
    "/token": (body) => {
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code"), "CODE");
      assert.equal(body.get("redirect_uri"), "https://agent.example/cb/abc");
      assert.ok(body.get("code_verifier"));
      return { json: { access_token: "A", refresh_token: "R", expires_in: 300 } };
    },
  });
  const auth = createEnergyAuth({ config, store, fetch: fn });
  const started = await auth.startAuthorization({ callbackUrl: "https://agent.example/cb/abc" });
  const state = new URL(started.challenge.url!).searchParams.get("state")!;
  const expires = Date.parse(started.challenge.expiresAt);
  assert.ok(expires > Date.now() && expires <= Date.now() + 10 * 60_000 + 1_000, "sign-in link expires within 10 minutes");

  await assert.rejects(
    auth.completeAuthorization({ resume: started.resume, callback: { params: { code: "CODE", state: "forged" }, method: "GET" } }),
    (e: Error) => e.name === "ConnectionAuthorizationFailedError",
  );
  const done = await auth.completeAuthorization({ resume: started.resume, callback: { params: { code: "CODE", state }, method: "GET" } });
  assert.equal(done.token, "A");
  assert.equal((await store.load())?.refreshToken, "R");
});

test("a denied consent is a terminal failure", async () => {
  const auth = createEnergyAuth({ config, store: new InMemoryEnergyTokenStore(), fetch: fakeFetch(discovery).fn });
  const started = await auth.startAuthorization({ callbackUrl: "https://agent.example/cb/abc" });
  await assert.rejects(
    auth.completeAuthorization({ resume: started.resume, callback: { params: { error: "access_denied" }, method: "GET" } }),
    (e: Error & { retryable?: boolean }) => e.name === "ConnectionAuthorizationFailedError" && e.retryable === false,
  );
});
