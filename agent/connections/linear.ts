// Linear: the owner's issues, projects, cycles, and comments through Linear's
// official remote MCP server. OAuth goes through Vercel Connect, like Google.

import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";
import { linearApproval } from "#lib/linear-approval.ts";

// The Connect client UID registered in the Vercel dashboard.
const CONNECTOR = process.env.LINEAR_CONNECTOR?.trim() || "linear/claudio-agent";

export default defineMcpClientConnection({
  url: "https://mcp.linear.app/mcp",
  description:
    "Linear de Edsel: issues (tickets), proyectos, ciclos, equipos, etiquetas y comentarios. Leer es libre; crear, editar, comentar o borrar pide su aprobación.",
  auth: connect({
    connector: CONNECTOR,
    tokenParams: { scopes: ["read", "write"] },
    // Single-owner agent: Telegram and the iOS app share one Linear grant
    // instead of asking him to sign in once per channel.
    createSubject: () => ({ type: "user" as const, id: "owner" }),
    instructions: "Autoriza tu cuenta de Linear para que Claudio pueda leer y crear tickets.",
  }),
  approval: linearApproval,
});
