import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAuthorizationCompleted, renderAuthorizationPrompt } from "#lib/authorization-prompt.ts";

test("sign-in prompt names the service, explains why and includes the link", () => {
  const text = renderAuthorizationPrompt({
    name: "energy",
    description: "",
    authorization: { url: "https://id.example.com/auth?a=1&code_challenge=x_y", displayName: "Energy MCP", instructions: "Inicia sesión y acepta los permisos." },
  });
  assert.match(text, /Energy MCP/);
  assert.match(text, /Inicia sesión y acepta los permisos\./);
  assert.ok(text.includes("https://id.example.com/auth?a=1&code_challenge=x_y"));
});

test("falls back to the connection name and shows a device code when there is one", () => {
  const text = renderAuthorizationPrompt({ name: "energy", description: "", authorization: { url: "https://x.example/device", userCode: "ABCD-1234" } });
  assert.match(text, /Energy/);
  assert.match(text, /ABCD-1234/);
});

test("completion message is silent on success and explains other outcomes", () => {
  assert.equal(renderAuthorizationCompleted({ name: "energy", outcome: "authorized" }), null);
  assert.match(renderAuthorizationCompleted({ name: "energy", outcome: "declined" })!, /no se concedió/i);
  assert.match(renderAuthorizationCompleted({ name: "energy", outcome: "timed-out" })!, /caducó/i);
});
