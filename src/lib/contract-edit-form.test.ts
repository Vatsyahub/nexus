import assert from "node:assert/strict";
import test from "node:test";
import {
  draftFromContract,
  keepOpenContractEdit,
  type ContractEditDraft,
  type ContractEditSource,
} from "@/lib/contract-edit-form";

function savedContract(): ContractEditSource {
  return {
    id: "c1",
    projectName: "Alpha",
    projectNo: "P-1",
    orderNos: "WO-1",
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 5000,
    gstApplicable: true,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    paymentDueDays: 30,
    retentionPercent: 5,
    tdsPercent: 2,
    dlpMonths: 12,
    contractorAssigned: "Ada",
  };
}

function editedDraft(): ContractEditDraft {
  return {
    projectName: "Edited name",
    projectNo: "P-EDIT",
    orderNos: "WO-EDIT",
    orderDate: "2026-02-02",
    closureDate: "2027-03-03",
    orderValue: "99999",
    gstPercent: "12",
    city: "Edited city",
    state: "Edited state",
    country: "Edited country",
    paymentDueDays: "45",
    retentionPercent: "7",
    tdsPercent: "3",
    dlpMonths: "18",
    contractorAssigned: "Edited contractor",
  };
}

const draftKeys = Object.keys(editedDraft()) as (keyof ContractEditDraft)[];

test("the edit page fills every box once from the saved contract", () => {
  const saved = savedContract();
  const open = keepOpenContractEdit(null, saved);
  assert.ok(open);
  assert.equal(open.contractId, saved.id);
  assert.deepEqual(open.draft, draftFromContract(saved));
  assert.equal(open.draft.projectNo, "P-1");
  for (const key of draftKeys) {
    assert.notEqual(open.draft[key], editedDraft()[key], key);
  }
});

test("refresh does not reset the project number while the edit form is open", () => {
  const saved = savedContract();
  const opened = keepOpenContractEdit(null, saved);
  assert.ok(opened);
  const typing = { contractId: opened.contractId, draft: editedDraft() };

  // Same id, new object: refreshWorkspace replaces the snapshot even
  // when nobody else saved. The saved project number must not snap back,
  // and neither does any other box.
  const refreshed = structuredClone(saved);
  assert.notEqual(refreshed, saved);
  const kept = keepOpenContractEdit(typing, refreshed);

  assert.equal(kept, typing);
  assert.equal(keepOpenContractEdit(typing, null), typing);
  assert.equal(keepOpenContractEdit(typing, undefined), typing);
  assert.equal(kept?.draft.projectNo, "P-EDIT");
  assert.notEqual(kept?.draft.projectNo, refreshed.projectNo);
  for (const key of draftKeys) {
    assert.equal(kept?.draft[key], typing.draft[key], key);
    assert.notEqual(kept?.draft[key], draftFromContract(refreshed)[key], key);
  }
});

test("a refreshed contract with newer saved values still leaves the open form", () => {
  const saved = savedContract();
  const opened = keepOpenContractEdit(null, saved);
  assert.ok(opened);
  const typing = { contractId: opened.contractId, draft: editedDraft() };
  const refreshed = {
    ...saved,
    projectNo: "P-SERVER",
    projectName: "Server name",
    city: "Mumbai",
    orderValue: 1234,
  };
  const kept = keepOpenContractEdit(typing, refreshed);
  assert.equal(kept, typing);
  assert.equal(kept?.draft.projectNo, "P-EDIT");
  assert.equal(kept?.draft.projectName, "Edited name");
  assert.equal(kept?.draft.city, "Edited city");
  assert.equal(kept?.draft.orderValue, "99999");
});

test("GST opens at 18 when applicable, at 0 when not, and at a saved percent", () => {
  assert.equal(draftFromContract(savedContract()).gstPercent, "18");
  assert.equal(
    draftFromContract({ ...savedContract(), gstApplicable: false }).gstPercent,
    "0"
  );
  assert.equal(
    draftFromContract({
      ...savedContract(),
      gstApplicable: true,
      gstPercent: 5,
    }).gstPercent,
    "5"
  );
});

test("opening a different contract fills the form from that contract", () => {
  const first = keepOpenContractEdit(null, savedContract());
  assert.ok(first);
  const other = { ...savedContract(), id: "c2", projectNo: "P-2" };
  const next = keepOpenContractEdit(first, other);
  assert.notEqual(next, first);
  assert.equal(next?.contractId, "c2");
  assert.equal(next?.draft.projectNo, "P-2");
});
