// Approval policy for the Linear MCP connection. Reads run freely; anything
// else (create, update, delete, comment, label, share, upload…) pauses for the
// owner. It is an allow-list of read verbs on purpose: a tool Linear adds later
// is gated until someone decides it is safe.

import type { ApprovalStatus } from "eve/tools/approval";

const READ_ONLY = /^(list|get|search|extract)_/;

/** `toolName` is the qualified name eve passes, e.g. `linear__save_issue`. */
export function linearApproval({ toolName }: { toolName: string }): ApprovalStatus {
  const bare = toolName.includes("__") ? toolName.slice(toolName.lastIndexOf("__") + 2) : toolName;
  return READ_ONLY.test(bare) ? "not-applicable" : "user-approval";
}
