import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";
import { apiKeyAuth } from "#lib/api-key-auth.ts";

export default eveChannel({
  auth: [
    // The owner's native clients (iOS app) authenticate with CLIENT_API_KEY.
    apiKeyAuth(),
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // No placeholder: routeAuth fails closed with a 401 + `WWW-Authenticate: Bearer` challenge.
  ],
});
