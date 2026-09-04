import { test } from "node:test";
import assert from "node:assert/strict";
import { AUDIO_TAGS, renderVoiceStyleInstructions } from "#lib/voice-prompt.ts";

test("spoken-style block covers the rules the app relies on", () => {
  const md = renderVoiceStyleInstructions();
  assert.match(md, /^# Spoken reply/);
  assert.match(md, /three sentences/);
  assert.match(md, /No lists/);
  assert.match(md, /in words/);
  assert.match(md, /one question/);
  assert.doesNotMatch(md, /audio tags/i);
});

test("audio tags are listed only when enabled", () => {
  const md = renderVoiceStyleInstructions({ audioTags: true });
  assert.match(md, /audio tags/i);
  for (const t of AUDIO_TAGS) assert.match(md, new RegExp(`\\[${t}\\]`));
  assert.match(md, /at most one per reply/);
});
