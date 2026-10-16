import { mergeClearedNotices } from "@/lib/notification-ttl";
import {
  EMPTY_NEXUS_COSTS,
  type ClearedNotices,
  type Contract,
  type ContractExpense,
  type DeliveryChallan,
  type FlowhubData,
  type HubNotification,
  type InstallationProgress,
  type Invoice,
  type ItemCatalogEntry,
  type NexusContractCost,
  type NexusCostColumn,
  type NexusCosts,
  type Payment,
  type ScheduleChangeLogEntry,
  type ScheduleLine,
  type Task,
} from "@/lib/types";

/** Added or edited rows, and ids removed since the copy this browser loaded. */
export type RecordChange<T> = {
  upsert?: T[];
  delete?: string[];
};

export type StringListChange = {
  add?: string[];
  remove?: string[];
};

export type WorkspaceChanges = {
  contracts?: RecordChange<Contract>;
  /** Expense rows on a contract this browser already had. New contracts carry theirs. */
  contractExpenses?: Record<string, RecordChange<ContractExpense>>;
  tasks?: RecordChange<Task>;
  invoices?: RecordChange<Invoice>;
  payments?: RecordChange<Payment>;
  schedules?: RecordChange<ScheduleLine>;
  scheduleChangeLog?: RecordChange<ScheduleChangeLogEntry>;
  notifications?: RecordChange<HubNotification>;
  itemCatalog?: RecordChange<ItemCatalogEntry>;
  deliveryChallans?: RecordChange<DeliveryChallan>;
  installationProgress?: RecordChange<InstallationProgress>;
  expenseCategories?: StringListChange;
  customDepartments?: StringListChange;
  deletedDepartments?: StringListChange;
  departmentRenames?: { set?: Record<string, string>; unset?: string[] };
  clearedNotices?: ClearedNotices;
  nexusCosts?: {
    columns?: RecordChange<NexusCostColumn>;
    /** Null removes that contract's cost entry. Other contracts stay. */
    contracts?: Record<string, NexusContractCost | null>;
  };
};

/** Changes since the stored revision this browser loaded. Not a full hub. */
export type WorkspaceChangeRequest = {
  baseRevision: number;
  changes: WorkspaceChanges;
};

export function isWorkspaceChangeRequest(
  body: unknown
): body is WorkspaceChangeRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  return (
    typeof record.baseRevision === "number" &&
    Number.isFinite(record.baseRevision) &&
    !!record.changes &&
    typeof record.changes === "object" &&
    !Array.isArray(record.changes)
  );
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      if (src[key] === undefined) continue;
      out[key] = canonical(src[key]);
    }
    return out;
  }
  return value;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function diffRecords<T>(
  base: readonly T[] | undefined,
  next: readonly T[] | undefined,
  idOf: (row: T) => string
): RecordChange<T> | undefined {
  const before = base ?? [];
  const after = next ?? [];
  const baseById = new Map(before.map((row) => [idOf(row), row]));
  const nextIds = new Set(after.map((row) => idOf(row)));
  const upsert = after.filter((row) => {
    const prev = baseById.get(idOf(row));
    return !prev || !same(prev, row);
  });
  const remove = before
    .map((row) => idOf(row))
    .filter((id) => id && !nextIds.has(id));
  if (upsert.length === 0 && remove.length === 0) return undefined;
  const change: RecordChange<T> = {};
  if (upsert.length > 0) change.upsert = upsert;
  if (remove.length > 0) change.delete = remove;
  return change;
}

function applyRecords<T>(
  current: readonly T[] | undefined,
  change: RecordChange<T> | undefined,
  idOf: (row: T) => string
): T[] {
  const rows = [...(current ?? [])];
  if (!change) return rows;
  const remove = new Set(change.delete ?? []);
  const kept = rows.filter((row) => !remove.has(idOf(row)));
  for (const row of change.upsert ?? []) {
    const id = idOf(row);
    const index = kept.findIndex((item) => idOf(item) === id);
    if (index < 0) kept.push(row);
    else kept[index] = row;
  }
  return kept;
}

function diffStrings(
  base: readonly string[] | undefined,
  next: readonly string[] | undefined
): StringListChange | undefined {
  const before = base ?? [];
  const after = next ?? [];
  const add = after.filter((item) => !before.includes(item));
  const remove = before.filter((item) => !after.includes(item));
  if (add.length === 0 && remove.length === 0) return undefined;
  const change: StringListChange = {};
  if (add.length > 0) change.add = add;
  if (remove.length > 0) change.remove = remove;
  return change;
}

function applyStrings(
  current: readonly string[] | undefined,
  change: StringListChange | undefined
): string[] {
  if (!change) return [...(current ?? [])];
  const remove = new Set(change.remove ?? []);
  const rows = (current ?? []).filter((item) => !remove.has(item));
  for (const item of change.add ?? []) {
    if (!rows.includes(item)) rows.push(item);
  }
  return rows;
}

function contractBody(contract: Contract): Omit<Contract, "expenses"> {
  const { expenses, ...body } = contract;
  void expenses;
  return body;
}

function diffContractBodies(
  base: readonly Contract[],
  next: readonly Contract[]
): RecordChange<Contract> | undefined {
  const baseById = new Map(base.map((contract) => [contract.id, contract]));
  const nextIds = new Set(next.map((contract) => contract.id));
  const upsert = next.filter((row) => {
    const prev = baseById.get(row.id);
    if (!prev) return true;
    return !same(contractBody(prev), contractBody(row));
  });
  const remove = base
    .map((contract) => contract.id)
    .filter((id) => !nextIds.has(id));
  if (upsert.length === 0 && remove.length === 0) return undefined;
  const change: RecordChange<Contract> = {};
  if (upsert.length > 0) change.upsert = upsert;
  if (remove.length > 0) change.delete = remove;
  return change;
}

function diffContractExpenses(
  base: readonly Contract[],
  next: readonly Contract[]
): Record<string, RecordChange<ContractExpense>> | undefined {
  const baseById = new Map(base.map((contract) => [contract.id, contract]));
  const out: Record<string, RecordChange<ContractExpense>> = {};
  for (const row of next) {
    if (!baseById.has(row.id)) continue;
    const change = diffRecords(
      baseById.get(row.id)?.expenses ?? [],
      row.expenses ?? [],
      (expense) => expense.id
    );
    if (change) out[row.id] = change;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function applyContractChanges(
  current: readonly Contract[],
  changes: WorkspaceChanges
): Contract[] {
  const remove = new Set(changes.contracts?.delete ?? []);
  const rows = current.filter((contract) => !remove.has(contract.id));
  for (const row of changes.contracts?.upsert ?? []) {
    const index = rows.findIndex((contract) => contract.id === row.id);
    if (index < 0) {
      rows.push(row);
      continue;
    }
    rows[index] = { ...row, expenses: rows[index]?.expenses ?? [] };
  }
  const expenseChanges = changes.contractExpenses ?? {};
  return rows.map((contract) => {
    const expenseChange = expenseChanges[contract.id];
    if (!expenseChange) return contract;
    return {
      ...contract,
      expenses: applyRecords(
        contract.expenses ?? [],
        expenseChange,
        (expense) => expense.id
      ),
    };
  });
}

function diffRenames(
  base: Record<string, string> | undefined,
  next: Record<string, string> | undefined
): WorkspaceChanges["departmentRenames"] | undefined {
  const before = base ?? {};
  const after = next ?? {};
  const set: Record<string, string> = {};
  const unset: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (after[key] === before[key]) continue;
    if (!after[key]) unset.push(key);
    else set[key] = after[key];
  }
  if (Object.keys(set).length === 0 && unset.length === 0) return undefined;
  const change: NonNullable<WorkspaceChanges["departmentRenames"]> = {};
  if (Object.keys(set).length > 0) change.set = set;
  if (unset.length > 0) change.unset = unset;
  return change;
}

function diffNexus(
  base: NexusCosts | undefined,
  next: NexusCosts | undefined
): WorkspaceChanges["nexusCosts"] | undefined {
  const before = base ?? EMPTY_NEXUS_COSTS;
  const after = next ?? EMPTY_NEXUS_COSTS;
  const columns = diffRecords(before.columns, after.columns, (column) => column.id);
  const contracts: Record<string, NexusContractCost | null> = {};
  const ids = new Set([
    ...Object.keys(before.contracts ?? {}),
    ...Object.keys(after.contracts ?? {}),
  ]);
  for (const id of ids) {
    const prev = before.contracts?.[id] ?? null;
    const updated = after.contracts?.[id] ?? null;
    if (same(prev, updated)) continue;
    contracts[id] = updated;
  }
  if (!columns && Object.keys(contracts).length === 0) return undefined;
  const change: NonNullable<WorkspaceChanges["nexusCosts"]> = {};
  if (columns) change.columns = columns;
  if (Object.keys(contracts).length > 0) change.contracts = contracts;
  return change;
}

function applyNexus(
  current: NexusCosts | undefined,
  change: NonNullable<WorkspaceChanges["nexusCosts"]>
): NexusCosts {
  const base = current ?? EMPTY_NEXUS_COSTS;
  const columns = change.columns
    ? applyRecords(base.columns, change.columns, (column) => column.id)
    : [...(base.columns ?? [])];
  const contracts = { ...(base.contracts ?? {}) };
  for (const [id, value] of Object.entries(change.contracts ?? {})) {
    if (value == null) delete contracts[id];
    else contracts[id] = value;
  }
  return { columns, contracts };
}

/** Records this browser added, edited, or removed since `base`. */
export function diffWorkspace(
  base: FlowhubData,
  next: FlowhubData
): WorkspaceChanges {
  const changes: WorkspaceChanges = {};
  const contracts = diffContractBodies(base.contracts ?? [], next.contracts ?? []);
  if (contracts) changes.contracts = contracts;
  const contractExpenses = diffContractExpenses(
    base.contracts ?? [],
    next.contracts ?? []
  );
  if (contractExpenses) changes.contractExpenses = contractExpenses;

  const tasks = diffRecords(base.tasks, next.tasks, (row) => row.id);
  if (tasks) changes.tasks = tasks;
  const invoices = diffRecords(base.invoices, next.invoices, (row) => row.id);
  if (invoices) changes.invoices = invoices;
  const payments = diffRecords(base.payments, next.payments, (row) => row.id);
  if (payments) changes.payments = payments;
  const schedules = diffRecords(base.schedules, next.schedules, (row) => row.id);
  if (schedules) changes.schedules = schedules;
  const scheduleChangeLog = diffRecords(
    base.scheduleChangeLog,
    next.scheduleChangeLog,
    (row) => row.id
  );
  if (scheduleChangeLog) changes.scheduleChangeLog = scheduleChangeLog;
  const notifications = diffRecords(
    base.notifications,
    next.notifications,
    (row) => row.id
  );
  if (notifications) changes.notifications = notifications;
  const itemCatalog = diffRecords(
    base.itemCatalog,
    next.itemCatalog,
    (row) => row.key
  );
  if (itemCatalog) changes.itemCatalog = itemCatalog;
  const deliveryChallans = diffRecords(
    base.deliveryChallans,
    next.deliveryChallans,
    (row) => row.id
  );
  if (deliveryChallans) changes.deliveryChallans = deliveryChallans;
  const installationProgress = diffRecords(
    base.installationProgress,
    next.installationProgress,
    (row) => row.id
  );
  if (installationProgress) changes.installationProgress = installationProgress;

  const expenseCategories = diffStrings(
    base.expenseCategories,
    next.expenseCategories
  );
  if (expenseCategories) changes.expenseCategories = expenseCategories;
  const customDepartments = diffStrings(
    base.customDepartments,
    next.customDepartments
  );
  if (customDepartments) changes.customDepartments = customDepartments;
  const deletedDepartments = diffStrings(
    base.deletedDepartments,
    next.deletedDepartments
  );
  if (deletedDepartments) changes.deletedDepartments = deletedDepartments;
  const departmentRenames = diffRenames(
    base.departmentRenames,
    next.departmentRenames
  );
  if (departmentRenames) changes.departmentRenames = departmentRenames;
  if (!same(base.clearedNotices ?? {}, next.clearedNotices ?? {})) {
    changes.clearedNotices = next.clearedNotices ?? {};
  }
  const nexusCosts = diffNexus(base.nexusCosts, next.nexusCosts);
  if (nexusCosts) changes.nexusCosts = nexusCosts;
  return changes;
}

/**
 * Lay this browser's changes onto the hub that is stored now.
 * Rows it did not touch stay as stored. A row it edited replaces that row.
 */
export function applyWorkspaceChanges(
  current: FlowhubData,
  changes: WorkspaceChanges
): FlowhubData {
  const next: FlowhubData = { ...current };
  if (changes.contracts || changes.contractExpenses) {
    next.contracts = applyContractChanges(current.contracts ?? [], changes);
  }
  if (changes.tasks) {
    next.tasks = applyRecords(current.tasks, changes.tasks, (row) => row.id);
  }
  if (changes.invoices) {
    next.invoices = applyRecords(
      current.invoices,
      changes.invoices,
      (row) => row.id
    );
  }
  if (changes.payments) {
    next.payments = applyRecords(
      current.payments,
      changes.payments,
      (row) => row.id
    );
  }
  if (changes.schedules) {
    next.schedules = applyRecords(
      current.schedules,
      changes.schedules,
      (row) => row.id
    );
  }
  if (changes.scheduleChangeLog) {
    next.scheduleChangeLog = applyRecords(
      current.scheduleChangeLog,
      changes.scheduleChangeLog,
      (row) => row.id
    );
  }
  if (changes.notifications) {
    next.notifications = applyRecords(
      current.notifications,
      changes.notifications,
      (row) => row.id
    );
  }
  if (changes.itemCatalog) {
    next.itemCatalog = applyRecords(
      current.itemCatalog,
      changes.itemCatalog,
      (row) => row.key
    );
  }
  if (changes.deliveryChallans) {
    next.deliveryChallans = applyRecords(
      current.deliveryChallans,
      changes.deliveryChallans,
      (row) => row.id
    );
  }
  if (changes.installationProgress) {
    next.installationProgress = applyRecords(
      current.installationProgress,
      changes.installationProgress,
      (row) => row.id
    );
  }
  if (changes.expenseCategories) {
    next.expenseCategories = applyStrings(
      current.expenseCategories,
      changes.expenseCategories
    );
  }
  if (changes.customDepartments) {
    next.customDepartments = applyStrings(
      current.customDepartments,
      changes.customDepartments
    );
  }
  if (changes.deletedDepartments) {
    next.deletedDepartments = applyStrings(
      current.deletedDepartments,
      changes.deletedDepartments
    );
  }
  if (changes.departmentRenames) {
    const renames = { ...(current.departmentRenames ?? {}) };
    for (const key of changes.departmentRenames.unset ?? []) delete renames[key];
    Object.assign(renames, changes.departmentRenames.set ?? {});
    next.departmentRenames = renames;
  }
  if (changes.clearedNotices) {
    next.clearedNotices = mergeClearedNotices(
      current.clearedNotices,
      changes.clearedNotices
    );
  }
  if (changes.nexusCosts) {
    next.nexusCosts = applyNexus(current.nexusCosts, changes.nexusCosts);
  }
  return next;
}
