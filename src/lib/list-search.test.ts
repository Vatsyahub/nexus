import assert from "node:assert/strict";
import test from "node:test";
import {
  contractMatchesQuery,
  invoiceMatchesQuery,
  matchesAnyRespectingCommitment,
  paymentMatchesQuery,
  scheduleMatchesQuery,
  taskMatchesQuery,
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

const drawingContract = {
  projectNo: "C4959",
  projectName: "Zen Kode",
  orderNos: "WO-1",
  orderDate: "2026-01-15",
  closureDate: "",
  orderValue: 2500000,
  city: "Pune",
  state: "Maharashtra",
  country: "India",
  contractorAssigned: "Cradle Civil",
  handoverDate: null,
  status: "active" as const,
  abgNumber: "ABG-4401",
  pbgNumber: "PBG-4401",
  abgDate: "",
  pbgDate: "",
  abgExpiry: "",
  pbgExpiry: "",
  boq: [
    {
      id: "draw",
      catalogKey: "drawings",
      name: "Drawings Preparation",
      unit: "lot",
      rate: 1,
      quantity: 1,
    },
    {
      id: "jib",
      catalogKey: "jib",
      name: "Jib",
      unit: "nos",
      rate: 1,
      quantity: 1,
    },
  ],
};

function taskRow(title: string, extra?: { department?: string; notes?: string }) {
  return {
    title,
    department: extra?.department ?? "Contracts Department",
    assignees: ["Rahul"],
    status: "in_progress" as const,
    dueDate: "2026-11-01",
    notes: extra?.notes ?? "",
    completedAt: null,
    source: "system" as const,
  };
}

test("contracts search still matches a BOQ name and the other contract fields", () => {
  assert.equal(contractMatchesQuery(drawingContract, "Drawing"), true);
  assert.equal(contractMatchesQuery(drawingContract, "ABG-4401"), true);
  assert.equal(contractMatchesQuery(drawingContract, "PBG-4401"), true);
  assert.equal(contractMatchesQuery(drawingContract, "Cradle Civil"), true);
  assert.equal(contractMatchesQuery(drawingContract, "2500000"), true);
  assert.equal(contractMatchesQuery(drawingContract, "Active"), true);
  assert.equal(contractMatchesQuery(drawingContract, "C4959"), true);
  assert.equal(contractMatchesQuery(drawingContract, "Pune"), true);
});

test("task, invoice, payment, and schedule search skip BOQ, guarantees, contractor, value, and contract status", () => {
  const supply = taskRow("Jib Supply");
  const released = taskRow("Payment released");
  const invoice = {
    type: "TI" as const,
    number: "18",
    date: "2026-04-01",
    netAmount: 100,
    gstAmount: 18,
    finalAmount: 118,
    contractId: "c1",
  };
  const payment = {
    date: "2026-04-02",
    netAmount: 100,
    gstAmount: 18,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    link: "TI 18",
  };
  const otherLine = line(false);
  for (const query of [
    "Drawing",
    "ABG-4401",
    "PBG-4401",
    "Cradle Civil",
    "2500000",
    "Active",
  ]) {
    assert.equal(taskMatchesQuery(supply, drawingContract, query), false);
    assert.equal(taskMatchesQuery(released, drawingContract, query), false);
    assert.equal(invoiceMatchesQuery(invoice, drawingContract, query), false);
    assert.equal(
      paymentMatchesQuery(payment, drawingContract, invoice, query),
      false
    );
    assert.equal(
      scheduleMatchesQuery(otherLine, drawingContract, "Jib", query),
      false
    );
  }
  assert.equal(taskMatchesQuery(supply, drawingContract, "C4959"), true);
  assert.equal(taskMatchesQuery(supply, drawingContract, "Zen Kode"), true);
  assert.equal(taskMatchesQuery(supply, drawingContract, "Pune"), true);
  assert.equal(taskMatchesQuery(supply, drawingContract, "Jib Supply"), true);
  assert.equal(invoiceMatchesQuery(invoice, drawingContract, "TI 18"), true);
  assert.equal(invoiceMatchesQuery(invoice, drawingContract, "118"), true);
  assert.equal(
    paymentMatchesQuery(payment, drawingContract, invoice, "TI 18"),
    true
  );
  assert.equal(
    scheduleMatchesQuery(otherLine, drawingContract, "Drawings Preparation", "Drawing"),
    true
  );
});

test("Drawing still finds the tasks that mention it themselves", () => {
  const rows = [
    taskRow("GAD Submission", { department: "Drawing Department" }),
    taskRow("Manufacturing drawing for Jib", {
      department: "Drawing Department",
    }),
    taskRow("Manufacturing drawing for Louvers restraint", {
      department: "Drawing Department",
      notes: "Drawing release for production",
    }),
    taskRow("Finalise Drawings/GAD"),
    taskRow("Kick off meeting pending", {
      notes: "Will be held after Drawings submission.",
    }),
  ];
  for (const row of rows) {
    assert.equal(taskMatchesQuery(row, drawingContract, "Drawing"), true);
  }
});
