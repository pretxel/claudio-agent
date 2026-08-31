// Google OAuth access-token minting for the Gmail and Calendar tools.
//
// Uses a long-lived refresh token for a single account (the agent's owner).
// Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

let cached: { token: string; expiresAt: number } | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. See README "Google access".`);
  return value;
}

export async function googleAccessToken(): Promise<string> {
  // Refresh a minute early so a call never starts with an expiring token.
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      refresh_token: required("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.token;
}

/** GET a Google API endpoint with the owner's credentials. */
export async function googleGet<T>(
  url: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) target.searchParams.set(key, String(value));
  }

  const res = await fetch(target, {
    headers: { authorization: `Bearer ${await googleAccessToken()}` },
  });
  if (!res.ok) {
    throw new Error(`${target.pathname} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** POST JSON to a Google API endpoint with the owner's credentials. */
export async function googlePost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${await googleAccessToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).pathname} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}
