import type { SessionContext } from "eve/context";

/** Memory tools work only for an authenticated caller; the scope itself is fixed to the owner. */
export function requireCaller(ctx: SessionContext): string {
  const caller = ctx.session.auth.current;
  if (!caller) throw new Error("Memory requires an authenticated caller.");
  return `${caller.authenticator}:${caller.principalId}`;
}
