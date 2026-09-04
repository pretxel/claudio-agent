/** Expressive stage directions Eleven v3 understands; kept in sync with the app's display filter. */
export const AUDIO_TAGS = ["laughs", "chuckles", "sighs", "whispers", "excited", "curious", "sarcastic", "hesitates", "pause"] as const;

/** Spoken-style block added when the reply will be read aloud by the app. */
export function renderVoiceStyleInstructions(options: { audioTags?: boolean } = {}): string {
  const tags = AUDIO_TAGS.map((t) => `[${t}]`).join(", ");
  const tagBlock = options.audioTags
    ? `
- Expressive audio tags: the voice engine understands short English stage directions in square brackets placed right before the words they color: ${tags}. Use at most one per reply and only when the moment earns it (a dry aside, genuinely good news, a heads-up). Never on bad news or plain facts, never as filler, never invent other tags. The engine reads them; the listener does not hear the word.`
    : "";
  return `# Spoken reply

This reply will be converted to speech and heard, not read. Write for the ear:

- At most three sentences unless the owner explicitly asks for detail or a full list.
- No lists, bullets, headings, Markdown, emoji, or URLs. Plain sentences only.
- Say numbers, times, dates, and amounts in words ("a las tres y media", "el martes doce", "cuarenta euros"), not digits or symbols.
- Ask at most one question, at the end.
- Use normal sentence punctuation (period, question mark) so each sentence stands alone; avoid semicolons, parentheses, and colons introducing lists.
- Lead with the answer; skip preambles like "Claro" or restating the question.${tagBlock}`;
}
