import { test } from "node:test";
import assert from "node:assert/strict";
import { agentSessionActorId, linearNotification } from "#lib/linear-owner.ts";

const owner = { userId: "owner-id", username: "pretxel100" };
const other = { id: "other-id", name: "Laura" };

test("agent session actor prefers the prompter, then the creator", () => {
  assert.equal(agentSessionActorId({ agentActivity: { userId: "a" }, agentSession: { creatorId: "c" } }), "a");
  assert.equal(agentSessionActorId({ agentSession: { creatorId: "c" } }), "c");
  assert.equal(agentSessionActorId({ agentSession: { creator: { id: "d" } } }), "d");
  assert.equal(agentSessionActorId({ agentSession: {} }), undefined);
});

test("someone else assigning the owner an issue notifies", () => {
  const text = linearNotification(
    {
      type: "Issue",
      action: "update",
      actor: other,
      url: "https://linear.app/recupera/issue/REC-12",
      data: { identifier: "REC-12", title: "Arreglar login", assigneeId: "owner-id" },
      updatedFrom: { assigneeId: null },
    },
    owner,
  );
  assert.equal(text, "Laura te asignó REC-12: Arreglar login\nhttps://linear.app/recupera/issue/REC-12");
});

test("a new issue created already assigned to the owner notifies", () => {
  const text = linearNotification(
    { type: "Issue", action: "create", actor: other, data: { identifier: "REC-13", title: "Nuevo", assigneeId: "owner-id" } },
    owner,
  );
  assert.equal(text, "Laura te asignó REC-13: Nuevo");
});

test("edits to an issue he already owns, his own assignments, and other assignees stay quiet", () => {
  const base = { type: "Issue", action: "update", actor: other, data: { identifier: "REC-12", title: "x", assigneeId: "owner-id" } };
  assert.equal(linearNotification({ ...base, updatedFrom: { title: "old" } }, owner), null);
  assert.equal(linearNotification({ ...base, updatedFrom: { assigneeId: "owner-id" } }, owner), null);
  assert.equal(linearNotification({ ...base, actor: { id: "owner-id" }, updatedFrom: { assigneeId: null } }, owner), null);
  assert.equal(
    linearNotification({ ...base, data: { ...base.data, assigneeId: "someone" }, updatedFrom: { assigneeId: null } }, owner),
    null,
  );
});

test("a comment mentioning the owner notifies with a snippet", () => {
  const text = linearNotification(
    {
      type: "Comment",
      action: "create",
      actor: other,
      url: "https://linear.app/recupera/issue/REC-12#comment-1",
      data: {
        body: "Hola [@pretxel100](https://linear.app/recupera/profiles/pretxel100), ¿lo revisas hoy?",
        userId: "other-id",
        issue: { identifier: "REC-12", title: "Arreglar login" },
      },
    },
    owner,
  );
  assert.match(text ?? "", /^Laura te mencionó en REC-12:\n/);
  assert.match(text ?? "", /¿lo revisas hoy\?/);
  assert.match(text ?? "", /#comment-1$/);
});

test("comments without a mention, or by the owner, stay quiet", () => {
  const comment = (body: string, actor = other) => ({ type: "Comment", action: "create", actor, data: { body, issue: {} } });
  assert.equal(linearNotification(comment("Listo, desplegado"), owner), null);
  assert.equal(linearNotification(comment("cc @pretxel1000"), owner), null);
  assert.equal(linearNotification(comment("@pretxel100 nota", { id: "owner-id", name: "Edsel" }), owner), null);
  assert.notEqual(linearNotification(comment("@pretxel100 nota"), owner), null);
});

test("unknown or malformed payloads stay quiet", () => {
  assert.equal(linearNotification(null, owner), null);
  assert.equal(linearNotification({ type: "Project", action: "update", data: {} }, owner), null);
  assert.equal(linearNotification({ type: "Issue", action: "remove", data: { assigneeId: "owner-id" } }, owner), null);
});
