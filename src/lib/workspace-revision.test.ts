import assert from "node:assert/strict";
import test from "node:test";
import {
  revisionWriteLanded,
  WORKSPACE_REVISION_PREDICATE,
  workspaceInsertIfEmptySql,
  workspaceUpdateSql,
} from "@/lib/workspace-revision";

test("a workspace write is conditional on the revision the save started from", () => {
  const update = workspaceUpdateSql();
  assert.match(update, /UPDATE "WorkspaceStore"/);
  assert.match(update, /WHERE/);
  assert.match(update, new RegExp(WORKSPACE_REVISION_PREDICATE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(update, /workspaceRevision/);
  assert.equal(update.includes("workspaceRevision") && update.includes("$3"), true);
  const insert = workspaceInsertIfEmptySql();
  assert.match(insert, /INSERT INTO "WorkspaceStore"/);
  assert.match(insert, /NOT EXISTS/);
  assert.match(insert, /\$3 = 0/);
  assert.equal(revisionWriteLanded(0), false);
  assert.equal(revisionWriteLanded(1), true);
});
