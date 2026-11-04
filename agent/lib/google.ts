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
      // Create drafts only. Nothing in the agent sends mail.
      "https://www.googleapis.com/auth/gmail.compose",
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

/** Send a JSON body (or none) to a Google API endpoint with the owner's credentials. */
async function googleRequest<T>(
  token: string,
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).pathname} failed (${res.status}): ${await res.text()}`);
  }
  // DELETE answers 204 with an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** POST JSON to a Google API endpoint with the owner's credentials. */
export function googlePost<T>(token: string, url: string, body: unknown): Promise<T> {
  return googleRequest<T>(token, "POST", url, body);
}

/** PATCH JSON to a Google API endpoint: only the fields present change. */
export function googlePatch<T>(token: string, url: string, body: unknown): Promise<T> {
  return googleRequest<T>(token, "PATCH", url, body);
}

/** DELETE a Google API resource. */
export async function googleDelete(token: string, url: string): Promise<void> {
  await googleRequest<void>(token, "DELETE", url);
}
