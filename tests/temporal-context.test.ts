import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TIME_ZONE,
  renderTemporalContext,
  resolveTimeZone,
} from "#lib/temporal-context.ts";

test("temporal context renders the owner's local time and summer offset", () => {
  const prompt = renderTemporalContext({
    now: new Date("2026-09-10T12:34:56.000Z"),
    timeZone: "Europe/Madrid",
  });

  assert.match(prompt, /2026-09-10 \(Thursday\)/);
  assert.match(prompt, /14:34:56/);
  assert.match(prompt, /GMT\+02:00/);
  assert.match(prompt, /relative dates and times/);
  assert.match(prompt, /Before calling Calendar tools/);
  assert.match(prompt, /subagents do not inherit this block/);
});

test("temporal context handles daylight-saving changes", () => {
  const prompt = renderTemporalContext({
    now: new Date("2026-12-10T12:34:56.000Z"),
    timeZone: "Europe/Madrid",
  });

  assert.match(prompt, /13:34:56/);
  assert.match(prompt, /GMT\+01:00/);
});

test("invalid or empty time zones fall back to Madrid", () => {
  assert.equal(resolveTimeZone("Mars/Olympus_Mons"), DEFAULT_TIME_ZONE);
  assert.equal(resolveTimeZone("  "), DEFAULT_TIME_ZONE);
});
