// Builds the RFC 2822 message Gmail expects in `raw` (base64url) for drafts.
// Plain text only, UTF-8 throughout.

export interface DraftEmail {
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  body: string;
  /** Message-ID of the message being answered, for threading. */
  inReplyTo?: string;
  /** References chain of the message being answered (its References + its Message-ID). */
  references?: string;
}

/**
 * Header values come from the model, which may have read hostile email. A CR or
 * LF would let it smuggle extra headers (a hidden Bcc), so they collapse to spaces.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoded-word when the value is not plain ASCII. */
export function encodeHeaderWord(value: string): string {
  const clean = sanitizeHeaderValue(value);
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** "Re: " once, never "Re: Re: ". */
export function replySubject(subject: string): string {
  const clean = sanitizeHeaderValue(subject);
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

export function buildRawEmail(email: DraftEmail): string {
  const addresses = (list: readonly string[]) => list.map(sanitizeHeaderValue).join(", ");
  const headers = [
    `To: ${addresses(email.to)}`,
    ...(email.cc?.length ? [`Cc: ${addresses(email.cc)}`] : []),
    `Subject: ${encodeHeaderWord(email.subject)}`,
    ...(email.inReplyTo ? [`In-Reply-To: ${sanitizeHeaderValue(email.inReplyTo)}`] : []),
    ...(email.references ? [`References: ${sanitizeHeaderValue(email.references)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = Buffer.from(email.body.replace(/\r?\n/g, "\r\n"), "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n");
  const message = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(message, "utf8").toString("base64url");
}
