import { test } from "node:test";
import assert from "node:assert/strict";
import { renderVoiceStyleInstructions } from "#lib/voice-prompt.ts";

test("spoken-style block covers the rules the app relies on", () => {
  const md = renderVoiceStyleInstructions();
  assert.match(md, /^# Spoken reply/);
  assert.match(md, /three sentences/);
  assert.match(md, /No lists/);
  assert.match(md, /in words/);
  assert.match(md, /one question/);
});
