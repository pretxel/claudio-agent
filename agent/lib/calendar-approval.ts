// Approval policy for calendar_create_event. An event with attendees sends an
// invitation (title, description, location) to other people's inboxes, so it
// is an outward-facing action: it must not run on the model's word alone —
// email or web content read earlier in the turn could have asked for it.
// A private event on the owner's own calendar stays prompt-free.

import type { ApprovalStatus } from "eve/tools/approval";

export function calendarCreateApproval({ toolInput }: { toolInput?: { attendees?: readonly string[] } }): ApprovalStatus {
  return (toolInput?.attendees?.length ?? 0) > 0 ? "user-approval" : "not-applicable";
}
