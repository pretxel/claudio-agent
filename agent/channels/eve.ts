import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";
import { apiKeyAuth } from "#lib/api-key-auth.ts";

export default eveChannel({
  auth: [
    // The owner's native clients (iOS app) authenticate with CLIENT_API_KEY.
    apiKeyAuth(),
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // Falls through to a structured 401 when nothing above matched.
    placeholderAuth(),
  ],
});
