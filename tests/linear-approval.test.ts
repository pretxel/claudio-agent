import { test } from "node:test";
import assert from "node:assert/strict";
import { linearApproval } from "#lib/linear-approval.ts";

test("Linear reads run without approval", () => {
  for (const tool of ["list_issues", "get_issue", "list_comments", "search_documentation", "extract_images"]) {
    assert.equal(linearApproval({ toolName: `linear__${tool}` }), "not-applicable", tool);
  }
});

test("Linear writes pause for the owner", () => {
  for (const tool of ["save_issue", "save_comment", "delete_comment", "create_issue_label", "share_issue", "prepare_file_upload"]) {
    assert.equal(linearApproval({ toolName: `linear__${tool}` }), "user-approval", tool);
  }
});

test("an unknown future Linear tool is gated by default", () => {
  assert.equal(linearApproval({ toolName: "linear__archive_everything" }), "user-approval");
});
