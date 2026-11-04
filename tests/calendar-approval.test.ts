import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarCreateApproval } from "#lib/calendar-approval.ts";

test("an event with attendees pauses for the owner's approval", () => {
  assert.equal(calendarCreateApproval({ toolInput: { attendees: ["someone@example.com"] } }), "user-approval");
});

test("a private event without attendees runs without a prompt", () => {
  assert.equal(calendarCreateApproval({ toolInput: { attendees: [] } }), "not-applicable");
  assert.equal(calendarCreateApproval({ toolInput: {} }), "not-applicable");
});

test("a missing input does not require approval", () => {
  assert.equal(calendarCreateApproval({}), "not-applicable");
});
