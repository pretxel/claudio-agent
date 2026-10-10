// Text for connection sign-in events on channels that have no built-in sign-in UI (Telegram).
// eve parks the turn on `authorization.required`; without this the owner never sees the link.

export interface AuthorizationPromptData {
  readonly name: string;
  readonly description: string;
  readonly authorization?: {
    readonly url?: string;
    readonly userCode?: string;
    readonly instructions?: string;
    readonly displayName?: string;
  };
}

const titleCase = (name: string) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function renderAuthorizationPrompt(data: AuthorizationPromptData): string {
  const auth = data.authorization;
  const service = auth?.displayName ?? titleCase(data.name);
  return [
    `Para seguir necesito que me des acceso a ${service}.`,
    auth?.instructions,
    auth?.url ? `Abre este enlace para iniciar sesión:\n${auth.url}` : undefined,
    auth?.userCode ? `Código: ${auth.userCode}` : undefined,
    "Cuando termines, continúo yo solo con tu petición.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function renderAuthorizationCompleted(data: { name: string; outcome: string; reason?: string }): string | null {
  const service = titleCase(data.name);
  switch (data.outcome) {
    case "authorized":
      return null;
    case "declined":
      return `El acceso a ${service} no se concedió, así que no puedo consultar esos datos.`;
    case "timed-out":
      return `El enlace de acceso a ${service} caducó. Vuelve a pedírmelo y te mando uno nuevo.`;
    default:
      return `No pude completar el acceso a ${service}${data.reason ? ` (${data.reason})` : ""}. Vuelve a intentarlo.`;
  }
}
