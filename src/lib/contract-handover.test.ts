import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  acceptedHandoverDate,
  comparisonValue,
  contractDisplayStatus,
  contractIsHandedOver,
  handoverDateForContract,
  handoverDateToSave,
  todayIso,
} from "@/lib/nexus-core";
import { buildRetentionHeldRows } from "@/lib/reports";
import { buildWorkorderRows } from "@/lib/execution-reports";
import {
  addContract,
  addSchedule,
  closureDateNeedsAttention,
  getData,
  markScheduleDone,
  resetWorkspaceClientForTests,
  syncDatedSystemTasks,
  updateContract,
} from "@/lib/store";
import type {
  Contract,
  FlowhubData,
  Invoice,
  Payment,
  ScheduleLine,
} from "@/lib/types";

beforeEach(() => {
  resetWorkspaceClientForTests();
});

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T12:00:00`);
  const b = new Date(`${toIso.slice(0, 10)}T12:00:00`);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function makeContract(projectNo: string, extra?: { retentionPercent?: number; dlpMonths?: number; closureDate?: string }) {
  return addContract({
    projectName: projectNo,
    projectNo,
    orderNos: "T-HO",
    orderDate: "2026-01-01",
    closureDate: extra?.closureDate ?? "2026-12-31",
    orderValue: 10000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: extra?.retentionPercent ?? 5,
    tdsPercent: 0,
    dlpMonths: extra?.dlpMonths ?? 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [],
  }).contract;
}

function scheduleLine(
  contractId: string,
  startDate: string,
  done = false
): ScheduleLine {
  return {
    id: `sch-${contractId}`,
    contractId,
    boqItemId: null,
    kind: "handover",
    quantity: null,
    startDate,
    endDate: startDate,
    committed: true,
    baselineStartDate: startDate,
    baselineEndDate: startDate,
    done,
    doneAt: done ? startDate : null,
    doneBy: done ? "Tester" : null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function contractRow(
  partial: Pick<Contract, "id" | "status" | "handoverDate"> &
    Partial<Contract>
): Contract {
  return {
    projectNo: partial.id,
    projectName: partial.id,
    orderValue: 10000,
    dlpMonths: 12,
    retentionPercent: 5,
    city: "Delhi",
    closureDate: "2026-12-31",
    orderDate: "2026-01-01",
    ...partial,
  } as Contract;
}

function workspace(opts: {
  contracts: Contract[];
  schedules?: ScheduleLine[];
  payments?: Payment[];
  invoices?: Invoice[];
}): FlowhubData {
  return {
    contracts: opts.contracts,
    schedules: opts.schedules ?? [],
    payments: opts.payments ?? [],
    invoices: opts.invoices ?? [],
    tasks: [],
  } as unknown as FlowhubData;
}

test("handover date stays empty when a schedule handover line is present", () => {
  const today = todayIso();
  const scheduleDate = addDays(today, -30);
  const created = makeContract("C-HO-EMPTY");
  const added = addSchedule({
    contractId: created.id,
    kind: "handover",
    startDate: scheduleDate,
    endDate: scheduleDate,
    committed: true,
  });
  assert.equal(added.ok, true);
  const marked = markScheduleDone(added.ok ? added.line.id : "", {
    completedDate: scheduleDate,
  });
  assert.equal(marked.ok, true);

  const saved = getData().contracts.find((c) => c.id === created.id);
  assert.ok(saved);
  assert.equal(saved.handoverDate, null);
  const data = getData();
  assert.equal(handoverDateForContract(data, created.id), null);
  assert.equal(contractIsHandedOver(data, created.id, today), false);
  assert.equal(contractDisplayStatus(data, saved, today), "Active");
  assert.notEqual(saved.status, "completed");
  const line = data.schedules.find(
    (s) => s.contractId === created.id && s.kind === "handover"
  );
  assert.equal(line?.startDate, scheduleDate);
  assert.equal(line?.done, true);
});

test("confirm-save replaces the handover date and an unconfirmed entry does not", () => {
  const today = todayIso();
  const first = addDays(today, -40);
  const next = addDays(today, -10);
  const created = makeContract("C-HO-SAVE");
  addSchedule({
    contractId: created.id,
    kind: "handover",
    startDate: addDays(today, -400),
    endDate: addDays(today, -400),
    committed: true,
  });

  assert.equal(handoverDateToSave(first, false), null);
  assert.equal(acceptedHandoverDate("2026-02-31"), null);
  updateContract(created.id, { handoverDate: handoverDateToSave("nope", true) });
  assert.equal(
    getData().contracts.find((c) => c.id === created.id)?.handoverDate,
    null
  );

  const savedFirst = handoverDateToSave(first, true);
  assert.equal(savedFirst, first);
  updateContract(created.id, { handoverDate: savedFirst });
  assert.equal(
    getData().contracts.find((c) => c.id === created.id)?.handoverDate,
    first
  );

  assert.equal(handoverDateToSave(next, false), null);
  assert.equal(
    getData().contracts.find((c) => c.id === created.id)?.handoverDate,
    first
  );

  const savedNext = handoverDateToSave(next, true);
  assert.equal(savedNext, next);
  updateContract(created.id, { handoverDate: savedNext });
  const data = getData();
  const saved = data.contracts.find((c) => c.id === created.id);
  assert.equal(saved?.handoverDate, next);
  assert.equal(
    data.schedules.find((s) => s.contractId === created.id && s.kind === "handover")
      ?.startDate,
    addDays(today, -400)
  );
});

test("retention, DLP, and Completed follow the contract date, not the schedule line", () => {
  const today = todayIso();
  const contractDate = addDays(today, -100);
  const futureDate = addDays(today, 40);
  const scheduleDate = addDays(today, -500);
  const dlpMonths = 12;
  const dlpEnd = addMonths(contractDate, dlpMonths);
  const scheduleDlpEnd = addMonths(scheduleDate, dlpMonths);

  const handed = contractRow({
    id: "c-handed",
    status: "active",
    handoverDate: contractDate,
    dlpMonths,
    orderValue: 10000,
  });
  const future = contractRow({
    id: "c-future",
    status: "on_hold",
    handoverDate: futureDate,
    dlpMonths,
  });
  const storedDone = contractRow({
    id: "c-stored",
    status: "completed",
    handoverDate: null,
    dlpMonths,
  });
  const schedules = [
    scheduleLine(handed.id, scheduleDate, true),
    scheduleLine(future.id, scheduleDate, true),
    scheduleLine(storedDone.id, scheduleDate, true),
  ];
  const payment = {
    id: "pay-1",
    contractId: handed.id,
    invoiceId: null,
    link: "unlinked",
    date: "2026-05-01",
    netAmount: 100,
    gstAmount: 0,
    retentionAmount: 80,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
    createdAt: "2026-05-01T00:00:00.000Z",
  } as Payment;
  const invoice = {
    id: "ti-1",
    type: "TI",
    contractId: handed.id,
    netAmount: 400,
    date: "2026-05-01",
  } as Invoice;
  const data = workspace({
    contracts: [handed, future, storedDone],
    schedules,
    payments: [payment],
    invoices: [invoice],
  });

  assert.equal(handoverDateForContract(data, handed.id), contractDate);
  assert.equal(contractIsHandedOver(data, handed.id, today), true);
  assert.equal(contractDisplayStatus(data, handed, today), "Completed");
  assert.equal(comparisonValue(data, handed, today), 400);

  assert.equal(contractIsHandedOver(data, future.id, today), false);
  assert.equal(contractDisplayStatus(data, future, today), "On hold");
  assert.equal(contractIsHandedOver(data, storedDone.id, today), false);
  assert.equal(contractDisplayStatus(data, storedDone, today), "Active");

  const retention = buildRetentionHeldRows(data).find(
    (row) => row.contractId === handed.id
  );
  assert.ok(retention);
  assert.equal(retention.handoverDate, contractDate);
  assert.equal(retention.dlpEnd, dlpEnd);
  assert.notEqual(retention.dlpEnd, scheduleDlpEnd);
  assert.equal(retention.status.kind, "due");
  if (retention.status.kind === "due") {
    assert.equal(retention.status.dueDate, dlpEnd);
    assert.equal(
      retention.status.daysUntilDue,
      daysBetween(today, dlpEnd)
    );
  }

  const workorder = buildWorkorderRows(data).find(
    (row) => row.contractId === handed.id
  );
  assert.ok(workorder);
  assert.equal(workorder.handoverDate, contractDate);
  assert.equal(workorder.dlpEndDate, dlpEnd);
  assert.equal(workorder.status, "completed");

  const futureOrder = buildWorkorderRows(data).find(
    (row) => row.contractId === future.id
  );
  assert.equal(futureOrder?.status, "on_hold");
  assert.equal(futureOrder?.handoverDate, futureDate);
  assert.equal(futureOrder?.dlpEndDate, addMonths(futureDate, dlpMonths));

  const storedOrder = buildWorkorderRows(data).find(
    (row) => row.contractId === storedDone.id
  );
  assert.equal(storedOrder?.handoverDate, null);
  assert.equal(storedOrder?.dlpEndDate, null);
  assert.equal(storedOrder?.status, "active");

  assert.equal(
    closureDateNeedsAttention(handed.id, data, today),
    false
  );
  const lateTarget = workspace({
    contracts: [
      contractRow({
        id: "c-target",
        status: "active",
        handoverDate: null,
        closureDate: addDays(today, 30),
      }),
    ],
    schedules: [scheduleLine("c-target", addDays(today, 90), true)],
  });
  assert.equal(
    closureDateNeedsAttention("c-target", lateTarget, today),
    false
  );
});

test("collect-retention uses the contract date and ignores a schedule handover date", () => {
  const today = todayIso();
  const contractDate = addDays(today, 12);
  const scheduleDate = addDays(today, 5);
  const created = makeContract("C-HO-RET", { dlpMonths: 0, retentionPercent: 5 });
  const scheduled = addSchedule({
    contractId: created.id,
    kind: "handover",
    startDate: scheduleDate,
    endDate: scheduleDate,
    committed: true,
  });
  assert.equal(scheduled.ok, true);
  syncDatedSystemTasks();
  assert.equal(
    getData().tasks.some(
      (t) => t.contractId === created.id && t.catalogKey === "collect_retention"
    ),
    false
  );

  const saved = handoverDateToSave(contractDate, true);
  updateContract(created.id, { handoverDate: saved });
  const task = getData().tasks.find(
    (t) => t.contractId === created.id && t.catalogKey === "collect_retention"
  );
  assert.ok(task);
  assert.equal(task.dueDate, contractDate);
  assert.notEqual(task.dueDate, scheduleDate);
  const row = getData().contracts.find((c) => c.id === created.id);
  assert.ok(row);
  assert.equal(contractDisplayStatus(getData(), row, today), "Active");
  assert.equal(row.handoverDate, contractDate);
});
