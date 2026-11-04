import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRawEmail, encodeHeaderWord, replySubject, sanitizeHeaderValue } from "#lib/mime.ts";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

function parse(raw: string) {
  const text = decode(raw);
  const [head, body] = text.split("\r\n\r\n");
  return { head: head!, body: Buffer.from(body!.replace(/\r\n/g, ""), "base64").toString("utf8") };
}

test("builds a plain-text UTF-8 message with CRLF headers", () => {
  const { head, body } = parse(
    buildRawEmail({ to: ["ana@example.com", "luis@example.com"], subject: "Hola", body: "Línea uno\nLínea dos" }),
  );
  assert.match(head, /^To: ana@example\.com, luis@example\.com\r\n/);
  assert.match(head, /\r\nSubject: Hola\r\n/);
  assert.match(head, /Content-Type: text\/plain; charset="UTF-8"/);
  assert.doesNotMatch(head, /\r\nCc:/);
  assert.equal(body, "Línea uno\r\nLínea dos");
});

test("non-ASCII subjects use an RFC 2047 encoded word", () => {
  assert.equal(encodeHeaderWord("Reunión mañana"), `=?UTF-8?B?${Buffer.from("Reunión mañana").toString("base64")}?=`);
  assert.equal(encodeHeaderWord("Plain subject"), "Plain subject");
});

test("CR/LF in header values cannot inject extra headers", () => {
  assert.equal(sanitizeHeaderValue("Hola\r\nBcc: evil@example.com"), "Hola Bcc: evil@example.com");
  const { head } = parse(
    buildRawEmail({ to: ["ana@example.com"], subject: "Hola\r\nBcc: evil@example.com", body: "x" }),
  );
  assert.doesNotMatch(head, /^Bcc:/m);
});

test("replies carry threading headers and a single Re:", () => {
  assert.equal(replySubject("Factura octubre"), "Re: Factura octubre");
  assert.equal(replySubject("RE: Factura octubre"), "RE: Factura octubre");
  const { head } = parse(
    buildRawEmail({
      to: ["ana@example.com"],
      cc: ["luis@example.com"],
      subject: "Re: Factura",
      body: "Gracias",
      inReplyTo: "<abc@mail>",
      references: "<root@mail> <abc@mail>",
    }),
  );
  assert.match(head, /\r\nCc: luis@example\.com\r\n/);
  assert.match(head, /\r\nIn-Reply-To: <abc@mail>\r\n/);
  assert.match(head, /\r\nReferences: <root@mail> <abc@mail>\r\n/);
});
