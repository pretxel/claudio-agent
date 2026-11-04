import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TIME_ZONE,
  renderTemporalGuidance,
  renderTurnClock,
  resolveTimeZone,
} from "#lib/temporal-context.ts";

test("turn clock renders the owner's local time and summer offset", () => {
  const clock = renderTurnClock({ now: new Date("2026-09-10T12:34:56.000Z"), timeZone: "Europe/Madrid" });
  assert.match(clock, /^<current_time>\n/);
  assert.match(clock, /utc: 2026-09-10T12:34:56\.000Z/);
  assert.match(clock, /local: 2026-09-10 \(Thursday\) 14:34:56/);
  assert.match(clock, /utc_offset: GMT\+02:00/);
  assert.match(clock, /<\/current_time>$/);
});

test("turn clock handles daylight-saving changes", () => {
  const clock = renderTurnClock({ now: new Date("2026-12-10T12:34:56.000Z"), timeZone: "Europe/Madrid" });
  assert.match(clock, /13:34:56/);
  assert.match(clock, /GMT\+01:00/);
});

test("temporal guidance is stable across time so the prompt cache survives", () => {
  const guidance = renderTemporalGuidance({ timeZone: "Europe/Madrid" });
  assert.equal(renderTemporalGuidance({ timeZone: "Europe/Madrid" }), guidance);
  assert.doesNotMatch(guidance, /\d{2}:\d{2}/);
  assert.match(guidance, /Europe\/Madrid/);
  assert.match(guidance, /most recent `<current_time>` block is the source of truth/);
  assert.match(guidance, /subagents do not see these blocks/);
});

test("invalid or empty time zones fall back to Madrid", () => {
  assert.equal(resolveTimeZone("Mars/Olympus_Mons"), DEFAULT_TIME_ZONE);
  assert.equal(resolveTimeZone("  "), DEFAULT_TIME_ZONE);
});
