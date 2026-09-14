// Google OAuth access tokens for the Gmail and Calendar tools.
// Vercel Connect stores the grant and refreshes short-lived access tokens.

import { connect } from "@vercel/connect/eve";

const CONNECTOR = "google/claudio-google";
export const googleAuth = connect({
  connector: CONNECTOR,
  tokenParams: {
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  },
  // This is a single-owner agent, so every channel uses the same Google grant.
  createSubject: () => ({ type: "user" as const, id: "owner" }),
  instructions: "Autoriza la cuenta de Google del propietario para continuar.",
});

/** GET a Google API endpoint with the owner's credentials. */
export async function googleGet<T>(
  token: string,
  url: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) target.searchParams.set(key, String(value));
  }

  const res = await fetch(target, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`${target.pathname} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** POST JSON to a Google API endpoint with the owner's credentials. */
export async function googlePost<T>(token: string, url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).pathname} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}
