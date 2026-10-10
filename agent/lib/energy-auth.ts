// OAuth for the Energy MCP connection (the owner's electricity invoices and consumption).
//
// Energy MCP authorizes with Keycloak: authorization code + PKCE (S256) for a pre-registered
// public client. Vercel Connect is not used because the provider is a custom Keycloak issuer
// without dynamic client registration. eve owns the callback URL and parks the turn while the
// owner signs in; this module builds the authorize URL, exchanges the code, keeps the tokens in
// Upstash Redis and refreshes them.

import { createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  ConnectionAuthorizationFailedError,
  ConnectionAuthorizationRequiredError,
  type AuthorizationCallback,
} from "eve/connections";

export const ENERGY_CONNECTION = "energy";
/** Scopes Energy MCP checks per tool. The dashboard grant decides what is actually allowed. */
export const ENERGY_SCOPES = ["invoices:read", "consumption:read", "documents:read", "sync:write"] as const;

export interface EnergyAuthConfig {
  /** Keycloak realm issuer, e.g. https://identity…/realms/energy-mcp */
  readonly issuer: string;
  readonly clientId: string;
  /** Canonical MCP resource URL (RFC 8707 `resource`). */
  readonly resource: string;
}

export function energyAuthConfig(env: NodeJS.ProcessEnv = process.env): EnergyAuthConfig {
  return {
    issuer: env.ENERGY_OAUTH_ISSUER ?? "https://identity-production-3f80.up.railway.app/realms/energy-mcp",
    clientId: env.ENERGY_OAUTH_CLIENT_ID ?? "claudio-agent",
    resource: env.ENERGY_MCP_URL ?? "https://backend-production-7a47.up.railway.app/mcp",
  };
}

// ------------------------------------------------------------------------------------ tokens

export interface EnergyTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  /** Milliseconds since epoch. */
  readonly expiresAt: number;
}

export interface EnergyTokenStore {
  load(): Promise<EnergyTokens | null>;
  save(tokens: EnergyTokens): Promise<void>;
  clear(): Promise<void>;
}

/** Single-owner agent: one grant shared by every channel (iOS, Telegram, morning brief). */
const TOKEN_KEY = "claudio:energy:oauth:owner";

export class RedisEnergyTokenStore implements EnergyTokenStore {
  private readonly redis: Redis;
  constructor(redis: Redis) {
    this.redis = redis;
  }
  async load() {
    const raw = await this.redis.get<EnergyTokens | string>(TOKEN_KEY);
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as EnergyTokens) : raw;
  }
  async save(tokens: EnergyTokens) {
    await this.redis.set(TOKEN_KEY, tokens);
  }
  async clear() {
    await this.redis.del(TOKEN_KEY);
  }
}

/** Process-local fallback for dev without Upstash credentials: nothing persists across restarts. */
export class InMemoryEnergyTokenStore implements EnergyTokenStore {
  private tokens: EnergyTokens | null = null;
  async load() {
    return this.tokens;
  }
  async save(tokens: EnergyTokens) {
    this.tokens = tokens;
  }
  async clear() {
    this.tokens = null;
  }
}

export function defaultEnergyTokenStore(env: NodeJS.ProcessEnv = process.env): EnergyTokenStore {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? new RedisEnergyTokenStore(new Redis({ url, token })) : new InMemoryEnergyTokenStore();
}

// -------------------------------------------------------------------------------------- PKCE

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function buildAuthorizeUrl(
  authorizationEndpoint: string,
  config: EnergyAuthConfig,
  opts: { callbackUrl: string; challenge: string; state: string },
): string {
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: opts.callbackUrl,
    scope: ["openid", "offline_access", ...ENERGY_SCOPES].join(" "),
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    state: opts.state,
    resource: config.resource,
    ui_locales: "es",
  }).toString();
  return url.toString();
}

// ------------------------------------------------------------------------------------- flow

interface Resume {
  verifier: string;
  state: string;
  redirectUri: string;
  [k: string]: string;
}

const REFRESH_MARGIN_MS = 60_000;
/**
 * How long a sign-in link stays valid. eve clamps the parked turn to this deadline, so an
 * unanswered link ends the turn ("timed-out") instead of blocking the chat indefinitely.
 */
export const SIGN_IN_WINDOW_MS = 10 * 60_000;

export function createEnergyAuth(deps: { config: EnergyAuthConfig; store: EnergyTokenStore; fetch?: typeof fetch; now?: () => number }) {
  const { config, store } = deps;
  const http = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  let metadata: Promise<{ authorization_endpoint: string; token_endpoint: string }> | null = null;

  const discover = () => {
    metadata ??= http(`${config.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Energy MCP discovery failed (${res.status})`);
        return (await res.json()) as { authorization_endpoint: string; token_endpoint: string };
      })
      .catch((err) => {
        metadata = null;
        throw err;
      });
    return metadata;
  };

  async function tokenRequest(params: Record<string, string>): Promise<{ ok: true; tokens: EnergyTokens } | { ok: false; error: string; status: number }> {
    const { token_endpoint } = await discover();
    const res = await http(token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, ...params }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) return { ok: false, error: body.error ?? "token_request_failed", status: res.status };
    return {
      ok: true,
      tokens: { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, expiresAt: now() + (body.expires_in ?? 300) * 1000 },
    };
  }

  return {
    /** Probed by eve before every Energy tool call. */
    async getToken() {
      const current = await store.load();
      if (!current) throw new ConnectionAuthorizationRequiredError(ENERGY_CONNECTION);
      if (current.expiresAt - now() > REFRESH_MARGIN_MS) return { token: current.accessToken, expiresAt: current.expiresAt };
      if (!current.refreshToken) {
        await store.clear();
        throw new ConnectionAuthorizationRequiredError(ENERGY_CONNECTION);
      }
      const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: current.refreshToken });
      if (!refreshed.ok) {
        // A revoked or expired refresh token means the owner must sign in again; anything else is transient.
        if (refreshed.status === 400 || refreshed.status === 401) {
          await store.clear();
          throw new ConnectionAuthorizationRequiredError(ENERGY_CONNECTION);
        }
        throw new Error(`Energy MCP token refresh failed (${refreshed.status} ${refreshed.error})`);
      }
      // Keycloak rotates refresh tokens; keep the previous one if it did not send a new one.
      const tokens = { ...refreshed.tokens, refreshToken: refreshed.tokens.refreshToken ?? current.refreshToken };
      await store.save(tokens);
      return { token: tokens.accessToken, expiresAt: tokens.expiresAt };
    },

    async startAuthorization({ callbackUrl }: { callbackUrl: string }) {
      const { authorization_endpoint } = await discover();
      const { verifier, challenge } = createPkce();
      const state = randomBytes(16).toString("base64url");
      return {
        challenge: {
          url: buildAuthorizeUrl(authorization_endpoint, config, { callbackUrl, challenge, state }),
          displayName: "Energy MCP",
          expiresAt: new Date(now() + SIGN_IN_WINDOW_MS).toISOString(),
          instructions: "Inicia sesión en Energy MCP y acepta los permisos para que Claudio pueda consultar tus facturas y consumos.",
        },
        resume: { verifier, state, redirectUri: callbackUrl } satisfies Resume,
      };
    },

    async completeAuthorization({ resume, callback }: { resume: Resume | undefined; callback: AuthorizationCallback }) {
      const { params } = callback;
      if (params.error) {
        throw new ConnectionAuthorizationFailedError(ENERGY_CONNECTION, { reason: params.error, retryable: params.error !== "access_denied" });
      }
      if (!resume || !params.code || params.state !== resume.state) {
        throw new ConnectionAuthorizationFailedError(ENERGY_CONNECTION, { reason: "invalid_state" });
      }
      const exchanged = await tokenRequest({
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: resume.redirectUri,
        code_verifier: resume.verifier,
      });
      if (!exchanged.ok) throw new ConnectionAuthorizationFailedError(ENERGY_CONNECTION, { reason: exchanged.error });
      await store.save(exchanged.tokens);
      return { token: exchanged.tokens.accessToken, expiresAt: exchanged.tokens.expiresAt };
    },
  };
}
