import type { AccessLevel, AccessMap, DoorId } from "@/lib/access";
import type { ClearanceRole } from "@/lib/clearance";
import {
  EMPTY_NEXUS_COSTS,
  type Contract,
  type FlowhubData,
  type ItemCatalogEntry,
  type NexusCosts,
} from "@/lib/types";
import { normalizeNexusCosts } from "@/lib/nexus-core";
import { tasksAfterDepartmentCatalogChange } from "@/lib/departments";
import {
  mergeClearedNotices,
  pruneClearedNotices,
  stampClearedNotices,
  unionNotificationClears,
} from "@/lib/notification-ttl";

/**
 * Company-file slices and the report doors that already show their figures.
 * A blocked slice is omitted on load unless one of those reports is open.
 */
const CONTRACT_REPORTS = [
  "reports_outstanding",
  "reports_sales",
  "reports_accounts",
  "reports_reconciliation",
  "reports_operations",
  "reports_other",
] as const satisfies readonly DoorId[];

const BILLING_REPORTS = [
  "reports_outstanding",
  "reports_sales",
  "reports_reconciliation",
] as const satisfies readonly DoorId[];

const PAYMENT_REPORTS = [
  "reports_outstanding",
  "reports_sales",
  "reports_accounts",
  "reports_reconciliation",
] as const satisfies readonly DoorId[];

const TASK_REPORTS = ["reports_other"] as const satisfies readonly DoorId[];

const SCHEDULE_REPORTS = [
  "reports_operations",
  "reports_accounts",
  "reports_other",
] as const satisfies readonly DoorId[];

const EXPENSE_REPORTS = ["reports_accounts"] as const satisfies readonly DoorId[];

export type WorkspaceSkip =
  | "refuse-empty-overwrite"
  | "refuse-stale-revision";

export type WorkspaceWrite =
  | { action: "save"; data: FlowhubData }
  | {
      action: "skip";
      skipped: WorkspaceSkip;
      currentRevision?: number;
      incomingRevision?: number;
    };

function doorLevel(access: AccessMap, door: DoorId): AccessLevel {
  const value = access?.[door];
  if (value === "block" || value === "view" || value === "edit") return value;
  return "block";
}

function edits(access: AccessMap, door: DoorId): boolean {
  return doorLevel(access, door) === "edit";
}

/** View and edit receive the slice. Block does too when a report of it is open. */
function receives(
  access: AccessMap,
  door: DoorId,
  reports: readonly DoorId[]
): boolean {
  if (doorLevel(access, door) !== "block") return true;
  return reports.some((id) => doorLevel(access, id) !== "block");
}

function isEmptyWorkspace(data: FlowhubData) {
  return (
    data.contracts.length === 0 &&
    data.tasks.length === 0 &&
    data.invoices.length === 0 &&
    data.payments.length === 0 &&
    data.schedules.length === 0 &&
    data.itemCatalog.length === 0
  );
}

/** Contract row with commercial figures removed. Expenses stay attached. */
function contractForExpenses(contract: Contract): Contract {
  return {
    ...contract,
    orderNos: "",
    orderValue: 0,
    billingTerms: {},
    paymentDueDays: 0,
    retentionPercent: 0,
    tdsPercent: 0,
    dlpMonths: 0,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    abgNumber: null,
    abgDate: null,
    abgExpiry: null,
    abgBankName: null,
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    pbgNumber: null,
    pbgDate: null,
    pbgExpiry: null,
    pbgBankName: null,
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    retentionRecoveredAt: null,
    contractorAssigned: "",
    boq: [],
    amendments: [],
    guaranteeEdits: [],
  };
}

/**
 * Load payload for this account. Blocked doors are left out.
 * An open report door still receives the figures that report shows.
 * The schedule change log is not a report figure: it follows the schedules door only.
 */
export function workspaceForAccount(
  data: FlowhubData,
  access: AccessMap
): FlowhubData {
  const contractRecords = receives(access, "contracts", CONTRACT_REPORTS);
  const expenseRecords = receives(access, "expenses", EXPENSE_REPORTS);
  const scheduleRecords = receives(access, "schedules", SCHEDULE_REPORTS);
  const schedulesDoorOpen = doorLevel(access, "schedules") !== "block";

  let contracts: Contract[];
  if (!contractRecords && !expenseRecords) {
    contracts = [];
  } else if (!contractRecords) {
    contracts = data.contracts.map(contractForExpenses);
  } else if (!expenseRecords) {
    contracts = data.contracts.map((contract) => ({
      ...contract,
      expenses: [],
    }));
  } else {
    contracts = data.contracts;
  }

  const nexusCosts: NexusCosts =
    doorLevel(access, "nexus_core") === "block"
      ? EMPTY_NEXUS_COSTS
      : normalizeNexusCosts(data.nexusCosts);

  return {
    ...data,
    contracts,
    invoices: receives(access, "billing", BILLING_REPORTS) ? data.invoices : [],
    payments: receives(access, "payments", PAYMENT_REPORTS) ? data.payments : [],
    tasks: receives(access, "tasks", TASK_REPORTS) ? data.tasks : [],
    schedules: scheduleRecords ? data.schedules : [],
    scheduleChangeLog: schedulesDoorOpen ? data.scheduleChangeLog : [],
    expenseCategories: expenseRecords ? data.expenseCategories : [],
    itemCatalog: contractRecords ? data.itemCatalog : [],
    nexusCosts,
  };
}

function restoreMissing<T extends { id: string }>(
  current: T[],
  incoming: T[],
  keep: (row: T) => boolean
): T[] {
  const seen = new Set(incoming.map((row) => row.id));
  const extra = current.filter((row) => keep(row) && !seen.has(row.id));
  return extra.length === 0 ? incoming : [...incoming, ...extra];
}

function catalogKeys(contracts: Contract[]): Set<string> {
  const used = new Set<string>();
  const add = (name?: string | null, key?: string | null) => {
    const n = (name ?? "").trim().toLowerCase();
    const k = (key ?? "").trim().toLowerCase();
    if (n) used.add(n);
    if (k) used.add(k);
  };
  for (const contract of contracts) {
    for (const line of contract.boq ?? []) add(line.name, line.catalogKey);
    for (const amendment of contract.amendments ?? []) {
      for (const line of amendment.boqSnapshot ?? []) add(line.name, line.catalogKey);
      for (const diff of amendment.lineDiffs ?? []) add(diff.name, null);
    }
  }
  return used;
}

function restoreCatalog(
  current: ItemCatalogEntry[],
  incoming: ItemCatalogEntry[],
  restored: Contract[]
): ItemCatalogEntry[] {
  if (restored.length === 0) return incoming;
  const used = catalogKeys(restored);
  const have = new Set(
    incoming.map((entry) => (entry.key || "").trim().toLowerCase())
  );
  const extra = current.filter((entry) => {
    const key = (entry.key || "").trim().toLowerCase();
    const name = (entry.name || "").trim().toLowerCase();
    const needed = (key && used.has(key)) || (name && used.has(name));
    return needed && !(key && have.has(key));
  });
  return extra.length === 0 ? incoming : [...incoming, ...extra];
}

function restoreContractCosts(
  current: NexusCosts,
  incoming: NexusCosts,
  contractIds: string[]
): NexusCosts {
  if (contractIds.length === 0) return incoming;
  const prev = normalizeNexusCosts(current);
  const next = normalizeNexusCosts(incoming);
  let changed = false;
  const contracts = { ...next.contracts };
  for (const id of contractIds) {
    if (prev.contracts[id] && !contracts[id]) {
      contracts[id] = prev.contracts[id];
      changed = true;
    }
  }
  return changed ? { ...next, contracts } : incoming;
}

/**
 * Task delete is Master only. A non-master save cannot drop a task or
 * set the hidden delete mark, and cannot clear one that is already set.
 */
function keepTasksUnlessMaster(
  current: FlowhubData["tasks"],
  incoming: FlowhubData["tasks"]
): FlowhubData["tasks"] {
  const incomingById = new Map(incoming.map((task) => [task.id, task]));
  const kept = current.map((prev) => {
    const next = incomingById.get(prev.id);
    if (!next) return prev;
    return { ...next, deletedAt: prev.deletedAt ?? null };
  });
  const known = new Set(current.map((task) => task.id));
  const added = incoming
    .filter((task) => !known.has(task.id))
    .map((task) => ({ ...task, deletedAt: null }));
  return [...kept, ...added];
}

/**
 * Per-door save. The page address is not an input.
 * A door that is not edit keeps the stored slice.
 * Contract delete, tax-invoice delete, task delete, and clearing the whole
 * change log stay Master-only even when that door is edit.
 */
export function mergeWorkspaceSave(
  current: FlowhubData,
  incoming: FlowhubData,
  access: AccessMap,
  clearance: ClearanceRole
): FlowhubData {
  const master = clearance === "master";
  const contractsEdit = edits(access, "contracts");
  const expensesEdit = edits(access, "expenses");

  let contracts: Contract[];
  if (!contractsEdit && !expensesEdit) {
    contracts = current.contracts;
  } else if (!contractsEdit && expensesEdit) {
    const incomingById = new Map(incoming.contracts.map((c) => [c.id, c]));
    contracts = current.contracts.map((contract) => {
      const next = incomingById.get(contract.id);
      if (!next) return contract;
      return { ...contract, expenses: next.expenses ?? [] };
    });
  } else if (contractsEdit && !expensesEdit) {
    const storedExpenses = new Map(
      current.contracts.map((c) => [c.id, c.expenses ?? []])
    );
    contracts = incoming.contracts.map((contract) => ({
      ...contract,
      expenses: storedExpenses.get(contract.id) ?? [],
    }));
  } else {
    contracts = incoming.contracts;
  }

  let invoices = edits(access, "billing") ? incoming.invoices : current.invoices;
  let payments = edits(access, "payments") ? incoming.payments : current.payments;
  let tasks = edits(access, "tasks") ? incoming.tasks : current.tasks;
  if (edits(access, "tasks") && !master) {
    tasks = keepTasksUnlessMaster(current.tasks, tasks);
  }
  let schedules = edits(access, "schedules")
    ? incoming.schedules
    : current.schedules;
  let scheduleChangeLog = edits(access, "schedules")
    ? incoming.scheduleChangeLog
    : current.scheduleChangeLog;
  let nexusCosts = edits(access, "nexus_core")
    ? normalizeNexusCosts(incoming.nexusCosts)
    : normalizeNexusCosts(current.nexusCosts);
  let itemCatalog = contractsEdit ? incoming.itemCatalog : current.itemCatalog;
  let deliveryChallans = incoming.deliveryChallans;
  let installationProgress = incoming.installationProgress;
  let notifications = incoming.notifications;

  if (contractsEdit && !master) {
    const incomingIds = new Set(contracts.map((c) => c.id));
    const restored = current.contracts.filter((c) => !incomingIds.has(c.id));
    if (restored.length > 0) {
      const restoredIds = new Set(restored.map((c) => c.id));
      contracts = [...contracts, ...restored];
      const onContract = (row: { contractId: string | null }) =>
        !!row.contractId && restoredIds.has(row.contractId);
      invoices = restoreMissing(current.invoices, invoices, onContract);
      payments = restoreMissing(current.payments, payments, onContract);
      const restoredTaskIds = new Set(
        current.tasks
          .filter((task) => task.contractId && restoredIds.has(task.contractId))
          .map((task) => task.id)
      );
      tasks = restoreMissing(
        current.tasks,
        tasks,
        (task) => !!task.contractId && restoredIds.has(task.contractId)
      );
      schedules = restoreMissing(current.schedules, schedules, onContract);
      scheduleChangeLog = restoreMissing(
        current.scheduleChangeLog,
        scheduleChangeLog,
        (entry) => !!entry.contractId && restoredIds.has(entry.contractId)
      );
      deliveryChallans = restoreMissing(
        current.deliveryChallans,
        deliveryChallans,
        onContract
      );
      installationProgress = restoreMissing(
        current.installationProgress,
        installationProgress,
        onContract
      );
      notifications = restoreMissing(
        current.notifications,
        notifications,
        (notice) =>
          (!!notice.contractId && restoredIds.has(notice.contractId)) ||
          (!!notice.taskId && restoredTaskIds.has(notice.taskId))
      );
      itemCatalog = restoreCatalog(current.itemCatalog, itemCatalog, restored);
      nexusCosts = restoreContractCosts(
        current.nexusCosts ?? EMPTY_NEXUS_COSTS,
        nexusCosts,
        [...restoredIds]
      );
    }
  }

  if (edits(access, "billing") && !master) {
    const incomingIds = new Set(invoices.map((invoice) => invoice.id));
    const restored = current.invoices.filter(
      (invoice) => invoice.type === "TI" && !incomingIds.has(invoice.id)
    );
    if (restored.length > 0) {
      const restoredIds = new Set(restored.map((invoice) => invoice.id));
      invoices = [...invoices, ...restored];
      const previous = new Map(current.payments.map((payment) => [payment.id, payment]));
      payments = payments.map((payment) => {
        const stored = previous.get(payment.id);
        if (!stored?.invoiceId || !restoredIds.has(stored.invoiceId)) {
          return payment;
        }
        if (payment.invoiceId === stored.invoiceId && payment.link === stored.link) {
          return payment;
        }
        return { ...payment, invoiceId: stored.invoiceId, link: stored.link };
      });
    }
  }

  if (
    edits(access, "schedules") &&
    !master &&
    current.scheduleChangeLog.length > 0 &&
    scheduleChangeLog.length === 0
  ) {
    scheduleChangeLog = current.scheduleChangeLog;
  }

  tasks = tasksAfterDepartmentCatalogChange(current, incoming, tasks);

  const clearedNotices = pruneClearedNotices(
    mergeClearedNotices(current.clearedNotices, incoming.clearedNotices)
  );
  notifications = stampClearedNotices(
    unionNotificationClears(current.notifications, notifications),
    clearedNotices
  );

  return {
    ...incoming,
    workspaceRevision: incoming.workspaceRevision,
    contracts,
    invoices,
    payments,
    tasks,
    schedules,
    scheduleChangeLog,
    expenseCategories: expensesEdit
      ? incoming.expenseCategories
      : current.expenseCategories,
    itemCatalog,
    deliveryChallans,
    installationProgress,
    notifications,
    clearedNotices,
    nexusCosts,
  };
}

/**
 * An equal or older revision is refused, and so is an empty overwrite that
 * is not newer than the hub it would replace. The page address is ignored;
 * each slice follows the account's door.
 */
export function resolveWorkspaceWrite(
  current: FlowhubData,
  incoming: FlowhubData,
  access: AccessMap,
  clearance: ClearanceRole
): WorkspaceWrite {
  const incomingRev = incoming.workspaceRevision ?? 0;
  const currentRev = current.workspaceRevision ?? 0;
  if (incomingRev <= currentRev) {
    return {
      action: "skip",
      skipped: "refuse-stale-revision",
      currentRevision: currentRev,
      incomingRevision: incomingRev,
    };
  }

  const data = mergeWorkspaceSave(current, incoming, access, clearance);
  // Equal revisions never reach this. A newer empty save is an intentional
  // clear and is stored. This still refuses an empty body if a future change
  // lets an equal revision through.
  if (
    isEmptyWorkspace(data) &&
    !isEmptyWorkspace(current) &&
    incomingRev <= currentRev
  ) {
    return { action: "skip", skipped: "refuse-empty-overwrite" };
  }

  return { action: "save", data };
}
