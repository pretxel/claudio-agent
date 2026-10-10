// Energy MCP: the owner's Spanish electricity invoices, hourly consumption and source documents
// (Endesa today). Remote Streamable HTTP server protected by Keycloak OAuth; see lib/energy-auth.ts.

import { defineInteractiveAuthorization, defineMcpClientConnection } from "eve/connections";
import { createEnergyAuth, defaultEnergyTokenStore, energyAuthConfig } from "#lib/energy-auth.ts";

const config = energyAuthConfig();
const auth = createEnergyAuth({ config, store: defaultEnergyTokenStore() });

export default defineMcpClientConnection({
  url: config.resource,
  description:
    "Electricidad de Edsel (Energy MCP): conexiones con su compañía eléctrica, suministros (CUPS), facturas con importes y conceptos, consumo por horas o días, comparación de periodos, documentos originales y sincronización con el portal. " +
    "Empieza siempre por listConnections: devuelve el connectionId que piden las demás herramientas.",
  // The sign-in challenge carries displayName "Energy MCP" (see startAuthorization).
  auth: defineInteractiveAuthorization({
    getToken: () => auth.getToken(),
    startAuthorization: ({ callbackUrl }) => auth.startAuthorization({ callbackUrl }),
    completeAuthorization: ({ resume, callback }) => auth.completeAuthorization({ resume: resume as never, callback }),
  }),
  // Reading is free; asking the provider for a new download needs the owner's OK.
  approval: ({ toolName }) => (toolName.endsWith("__syncConnection") ? "user-approval" : "not-applicable"),
});
