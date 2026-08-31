// One-time helper: run a loopback OAuth flow and print a Google refresh token.
//
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-auth.mjs
//
// The OAuth client must be a "Desktop app" (or a Web app with
// http://localhost:8910/callback registered as a redirect URI).

import { createServer } from "node:http";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.");
  process.exit(1);
}

const PORT = 8910;
const redirectUri = `http://localhost:${PORT}/callback`;
const scopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
];

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", scopes.join(" "));
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log("\nOpen this URL and approve access:\n");
console.log(authUrl.toString());
console.log();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("No code in callback.");
    return;
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = await tokenRes.json();
  if (!tokenRes.ok || !data.refresh_token) {
    res.writeHead(500).end("Token exchange failed. See the terminal.");
    console.error(data);
    process.exit(1);
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Done. Copy the refresh token from your terminal, then close this tab.");

  console.log("Add this to .env.local:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}\n`);
  server.close();
  process.exit(0);
});

server.listen(PORT, () => console.log(`Waiting for the callback on ${redirectUri} ...`));
