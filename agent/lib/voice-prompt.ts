/** Spoken-style block added when the reply will be read aloud by the app. */
export function renderVoiceStyleInstructions(): string {
  return `# Spoken reply

This reply will be converted to speech and heard, not read. Write for the ear:

- At most three sentences unless the owner explicitly asks for detail or a full list.
- No lists, bullets, headings, Markdown, emoji, or URLs. Plain sentences only.
- Say numbers, times, dates, and amounts in words ("a las tres y media", "el martes doce", "cuarenta euros"), not digits or symbols.
- Ask at most one question, at the end.
- Use normal sentence punctuation (period, question mark) so each sentence stands alone; avoid semicolons, parentheses, and colons introducing lists.
- Lead with the answer; skip preambles like "Claro" or restating the question.`;
}
