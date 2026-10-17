import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesAnyRespectingCommitment,
  scheduleMatchesQuery,
} from "@/lib/list-search";

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function line(committed: boolean, start = "2026-12-01") {
  return {
    kind: "supply" as const,
    quantity: 2,
    startDate: start,
    endDate: start,
    committed,
    done: false,
    doneAt: null,
    doneBy: null,
  };
}

const namedCommitted = {
  projectNo: "P-1",
  projectName: "Committed works",
  orderNos: "",
  orderDate: "",
  closureDate: "",
  orderValue: 1,
  city: "Pune",
  state: "",
  country: "",
  contractorAssigned: "",
  handoverDate: null,
  status: "active" as const,
  abgNumber: "",
  pbgNumber: "",
  abgDate: "",
  pbgDate: "",
  abgExpiry: "",
  pbgExpiry: "",
  boq: [
    {
      id: "b1",
      catalogKey: "panel",
      name: "Panel",
      unit: "nos",
      rate: 1,
      quantity: 1,
    },
  ],
};

test("committed search matches committed schedule lines only", () => {
  const committed = line(true);
  const uncommitted = line(false);
  for (const query of ["committed", "Committed", "COMMITTED"]) {
    assert.equal(scheduleMatchesQuery(committed, null, "Panel", query), true);
    assert.equal(
      scheduleMatchesQuery(uncommitted, null, "Panel", query),
      false
    );
    assert.equal(
      scheduleMatchesQuery(uncommitted, namedCommitted, "Panel", query),
      false
    );
  }
});

test("uncommitted search matches uncommitted schedule lines only", () => {
  const committed = line(true);
  const uncommitted = line(false);
  for (const query of ["uncommitted", "Uncommitted"]) {
    assert.equal(
      scheduleMatchesQuery(uncommitted, null, "Panel", query),
      true
    );
    assert.equal(scheduleMatchesQuery(committed, null, "Panel", query), false);
    assert.equal(
      scheduleMatchesQuery(committed, namedCommitted, "Uncommitted depot", query),
      false
    );
  }
});

test("other schedule search words still match, and near does not select lines", () => {
  const soon = line(false, isoOffset(5));
  const late = line(true, isoOffset(-10));
  assert.equal(scheduleMatchesQuery(soon, namedCommitted, "Panel", "pune"), true);
  assert.equal(scheduleMatchesQuery(soon, null, "Panel", "supply"), true);
  assert.equal(scheduleMatchesQuery(late, null, "Panel", "overdue"), true);
  assert.equal(scheduleMatchesQuery(soon, null, "Panel", "overdue"), false);
  assert.equal(scheduleMatchesQuery(soon, null, "Panel", "near"), false);
  assert.equal(scheduleMatchesQuery(late, null, "Panel", "near"), false);
  assert.equal(
    scheduleMatchesQuery(soon, null, "Nearside bracket", "near"),
    true
  );
  assert.equal(
    scheduleMatchesQuery(soon, null, "Panel", "committed, panel"),
    false
  );
  assert.equal(
    scheduleMatchesQuery(line(true), null, "Panel", "committed, panel"),
    true
  );
});

test("operations schedules report search keeps committed and uncommitted apart", () => {
  const uncommittedFields = [
    "P-9",
    "North shed",
    "Pune",
    "Panel",
    "supply",
    "Supply",
    "Uncommitted",
    "pending",
    "Pending",
  ];
  const committedFields = [
    "P-9",
    "Committed works",
    "Pune",
    "Panel",
    "supply",
    "Supply",
    "Committed",
    "pending",
    "Pending",
  ];
  assert.equal(
    matchesAnyRespectingCommitment("committed", false, uncommittedFields),
    false
  );
  assert.equal(
    matchesAnyRespectingCommitment("Committed", true, committedFields),
    true
  );
  assert.equal(
    matchesAnyRespectingCommitment("uncommitted", true, committedFields),
    false
  );
  assert.equal(
    matchesAnyRespectingCommitment("uncommitted", false, uncommittedFields),
    true
  );
  assert.equal(
    matchesAnyRespectingCommitment("committed, pune", false, uncommittedFields),
    false
  );
  assert.equal(
    matchesAnyRespectingCommitment("committed, pune", true, committedFields),
    true
  );
  assert.equal(
    matchesAnyRespectingCommitment("near", false, uncommittedFields),
    false
  );
  assert.equal(matchesAnyRespectingCommitment("", false, uncommittedFields), true);
});
