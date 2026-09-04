// Static bearer API key for the owner's native clients (the iOS app).
//
// The key lives in CLIENT_API_KEY. A request that carries it authenticates as
// the "owner" principal; anything else falls through to the next auth entry.

import { timingSafeEqual } from "node:crypto";
import { withAuthChallenges, type AuthFn } from "eve/channels/auth";

type SessionAuthContext = NonNullable<Awaited<ReturnType<AuthFn<Request>>>>;

const OWNER_AUTH: SessionAuthContext = {
  authenticator: "api-key",
  principalType: "user",
  principalId: "owner",
  attributes: {},
};

/** How the client will present this turn's reply; drives the spoken-style instruction. */
export const CLIENT_MODES = ["voice", "chat"] as const;
export type ClientMode = (typeof CLIENT_MODES)[number];
export const MODE_HEADER = "x-claudio-mode";

export function clientMode(request: Request): ClientMode | undefined {
  const raw = request.headers.get(MODE_HEADER)?.trim().toLowerCase();
  return (CLIENT_MODES as readonly string[]).includes(raw ?? "") ? (raw as ClientMode) : undefined;
}

function ownerAuth(request: Request): SessionAuthContext {
  const mode = clientMode(request);
  return mode ? { ...OWNER_AUTH, attributes: { mode } } : OWNER_AUTH;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** True when the request carries the configured CLIENT_API_KEY as a bearer token. */
export function isValidApiKey(request: Request): boolean {
  const expected = process.env.CLIENT_API_KEY;
  if (!expected) return false;
  const token = bearerToken(request);
  if (!token) return false;
  return safeEqual(token, expected);
}

/** eve `AuthFn` that accepts the owner's API key. Advertises a Bearer challenge. */
export function apiKeyAuth(): AuthFn<Request> {
  return withAuthChallenges(
    (request) => (isValidApiKey(request) ? ownerAuth(request) : null),
    [{ scheme: "Bearer" }],
  );
}
