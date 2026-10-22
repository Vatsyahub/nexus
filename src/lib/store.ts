"use client";

import { useSyncExternalStore } from "react";
import {
  type BillingTerms,
  type BoqAmendment,
  type BoqAmendmentLineDiff,
  type BoqItem,
  type Contract,
  type ContractExpense,
  type DeliveryChallan,
  type DeliveryChallanLine,
  type ExpenseEditRecord,
  type FlowhubData,
  SEED_EXPENSE_CATEGORIES,
  type GuaranteeEditRecord,
  type HubNotification,
  type InstallationProgress,
  type Invoice,
  type InvoiceExtraCharge,
  type InvoiceLine,
  type ItemCatalogEntry,
  type Payment,
  type ScheduleChangeLogEntry,
  type ScheduleKind,
  type TaskDeadlineChangeLogEntry,
  type ScheduleLine,
  type Task,
  type TaskCatalogKey,
  type TaskStatus,
  GST_RATE,
  DEFAULT_TDS_PERCENT,
  TASK_COMPLETED_VISIBLE_DAYS,
  BG_EXPIRY_LEAD_MONTHS,
  RETENTION_LEAD_DAYS,
  SCHEDULE_KIND_LABELS,
  SCHEDULE_DATE_NA,
  isScheduleDateNa,
  guaranteeAmount,
  guaranteeIdentitySaved,
  departmentDisplayName,
  boqTotal,
  defaultAmendmentNumber,
  EMPTY_NEXUS_COSTS,
  type NexusCosts,
} from "@/lib/types";
import {
  acceptedHandoverDate,
  contractDisplayStatus,
  contractIsHandedOver,
  contractStatusLabel,
  handoverDateForContract,
  normalizeNexusCosts,
  todayIso as nexusTodayIso,
} from "@/lib/nexus-core";
import {
  formatDisplayDate,
  formatScheduleDateRange,
} from "@/lib/dates";
import { formatMoney } from "@/lib/format-money";
import {
  resolveNotificationHref as resolveHrefFromTasks,
  taskNotificationHref,
} from "@/lib/notification-href";
import {
  clearReadNotices,
  notificationVisibleForUser,
  pruneClearedNotices,
  purgeExpiredNotifications,
  stampClearedNotices,
  type NoticeAudienceMember,
} from "@/lib/notification-ttl";
import { purgeExpiredScheduleChangeLog } from "@/lib/schedule-change-log";
import {
  amendmentDeleteError,
  boqBeforeAmendment,
  existingLineRateIssues,
  rateChangeCarries,
  remapDeliveryChallans,
  remapInstallation,
  scheduleStopMessage,
  taxInvoiceQuantityIssues,
  undoRateChangeCarries,
} from "@/lib/amendment-callback";
import {
  currentSeedDepartment,
  deleteDepartmentRecords,
  departmentCatalogFields,
  listDepartmentNames,
  renameDepartmentRecords,
} from "@/lib/departments";
import {
  canConfirmTaskVerification,
  completesImmediately,
  completionNeedsVerification,
  notificationVisibleTo,
  planDueNotices,
  taskAlertAudience,
  taskDueTodayAudience,
  taskVerifyNotice,
  type TaskActor,
} from "@/lib/task-notices";
import {
  canEditTaskSchedule,
  canUpdateTask,
  resolveTaskAssignees,
  resolveTaskDepartment,
  subtaskUpdateDenied,
  TASK_SAVE_DENIED,
  type TaskDirectoryPerson,
} from "@/lib/task-permissions";
import {
  decideTaskDeadline,
  normalizeTaskDeadlineChangeLog,
  TASK_DEADLINE_MOVE_DENIED,
} from "@/lib/task-deadline-log";
import {
  billingTermsTotal,
  billingTermsTotalIs100,
  deleteCustomBillingTerm,
  isBuiltinBillingTerm,
  renameCustomBillingTerm,
} from "@/lib/billing-terms";
import { renameItemRecords } from "@/lib/item-rename";
import { swapContractBoqItem } from "@/lib/boq-item-swap";
import {
  applyWorkspaceChanges,
  diffWorkspace,
  type WorkspaceChangeRequest,
} from "@/lib/workspace-changes";
import { STALE_WORKSPACE_SAVE_MESSAGE } from "@/lib/workspace-guard";
import { LOGIN_PAGE, workspaceSaveExit } from "@/lib/account-session";

export type { TaskActor };
export {
  canConfirmTaskVerification,
  completionNeedsVerification,
  notificationVisibleTo,
};

export { taskNotificationHref } from "@/lib/notification-href";
export {
  NOTIFICATION_TTL_MS,
  notificationIsAlive,
  notificationVisibleForUser,
  purgeExpiredNotifications,
} from "@/lib/notification-ttl";

/** Bump when demo/workspace must not fight stale browser caches. */
const STORAGE_KEY = "nexus-ws-v5";

const empty: FlowhubData = {
  workspaceRevision: 0,
  contracts: [],
  tasks: [],
  itemCatalog: [],
  invoices: [],
  payments: [],
  schedules: [],
  scheduleChangeLog: [],
  taskDeadlineChangeLog: [],
  notifications: [],
  clearedNotices: {},
  customDepartments: [],
  departmentRenames: {},
  deletedDepartments: [],
  expenseCategories: [],
  deliveryChallans: [],
  installationProgress: [],
  nexusCosts: EMPTY_NEXUS_COSTS,
};

function normalizeExpense(
  e: ContractExpense & { category?: string | null }
): ContractExpense {
  return {
    ...e,
    category: (e.category || "").trim() || "Miscellaneous",
    createdBy: e.createdBy ?? null,
    editHistory: e.editHistory ?? [],
    deletedAt: e.deletedAt ?? null,
    deletedBy: e.deletedBy ?? null,
  };
}

const MAX_NOTIFICATIONS = 300;

/**
 * Soft migration: numbers like ABG/HDFC/7791 → bank "HDFC" when bank is empty.
 * Returns null when the pattern does not match (no invented data).
 */
function inferBankFromGuaranteeNumber(
  number: string | null | undefined
): string | null {
  if (!number) return null;
  const m = String(number)
    .trim()
    .match(/^[AP]BG\/([^/]+)\/.+/i);
  const bank = m?.[1]?.trim();
  return bank || null;
}

function normalizeBankName(
  explicit: string | null | undefined,
  guaranteeNumber: string | null | undefined
): string | null {
  const trimmed = (explicit ?? "").trim();
  if (trimmed) return trimmed;
  return inferBankFromGuaranteeNumber(guaranteeNumber);
}

function coerceContractStatus(status: string | undefined): Contract["status"] {
  const label = contractStatusLabel(status ?? "");
  if (label === "Completed") return "completed";
  if (label === "On hold") return "on_hold";
  return "active";
}

const BOQ_EPS = 1e-6;

/** Handed-over contracts are Completed. On hold and Active stay until then. */
function completeHandedOverContracts(data: FlowhubData): FlowhubData {
  const today = nexusTodayIso();
  let changed = false;
  const contracts = data.contracts.map((c) => {
    if (!contractIsHandedOver(data, c.id, today)) return c;
    if (c.status === "completed" || c.status === "complete") return c;
    changed = true;
    return { ...c, status: "completed" as const };
  });
  if (!changed) return data;
  return { ...data, contracts };
}

/**
 * A saved rupee amount stays. Percent × order value is only the starting
 * figure when no amount has been stored yet.
 */
function savedGuaranteeAmount(
  stored: number | null | undefined,
  orderValue: number,
  percent: number | null
): number | null {
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  return guaranteeAmount(orderValue, percent);
}

function normalizeContract(c: Contract & { orderEndDate?: string }): Contract {
  const legacy = c as Contract & {
    orderEndDate?: string;
    abgPercent?: number | null;
    pbgPercent?: number | null;
    abgBankName?: string | null;
    pbgBankName?: string | null;
    retentionRecoveredAt?: string | null;
  };
  const closureDate = c.closureDate || legacy.orderEndDate || "";
  const abgPercent =
    typeof legacy.abgPercent === "number"
      ? legacy.abgPercent
      : c.abgValue != null && c.orderValue > 0
        ? (c.abgValue / c.orderValue) * 100
        : null;
  const pbgPercent =
    typeof legacy.pbgPercent === "number"
      ? legacy.pbgPercent
      : c.pbgValue != null && c.orderValue > 0
        ? (c.pbgValue / c.orderValue) * 100
        : null;
  const abgNumber = c.abgNumber ?? null;
  const pbgNumber = c.pbgNumber ?? null;
  const retentionRecoveredAt =
    typeof legacy.retentionRecoveredAt === "string" &&
    legacy.retentionRecoveredAt.trim()
      ? legacy.retentionRecoveredAt.trim().slice(0, 10)
      : null;
  const normalized: Contract = {
    ...c,
    closureDate,
    retentionPercent:
      typeof c.retentionPercent === "number" ? c.retentionPercent : 0,
    tdsPercent:
      typeof c.tdsPercent === "number" ? c.tdsPercent : DEFAULT_TDS_PERCENT,
    dlpMonths: typeof c.dlpMonths === "number" ? c.dlpMonths : 6,
    abgPercent,
    abgValue: savedGuaranteeAmount(c.abgValue, c.orderValue, abgPercent),
    abgNumber,
    abgDate: c.abgDate ?? null,
    abgExpiry: c.abgExpiry ?? null,
    abgBankName: normalizeBankName(legacy.abgBankName, abgNumber),
    abgRetrieved: Boolean(c.abgRetrieved),
    abgRetrievedDate: c.abgRetrieved ? (c.abgRetrievedDate ?? null) : null,
    pbgPercent,
    pbgValue: savedGuaranteeAmount(c.pbgValue, c.orderValue, pbgPercent),
    pbgNumber,
    pbgDate: c.pbgDate ?? null,
    pbgExpiry: c.pbgExpiry ?? null,
    pbgBankName: normalizeBankName(legacy.pbgBankName, pbgNumber),
    pbgRetrieved: Boolean(c.pbgRetrieved),
    pbgRetrievedDate: c.pbgRetrieved ? (c.pbgRetrievedDate ?? null) : null,
    retentionRecoveredAt,
    contractorAssigned: c.contractorAssigned ?? "",
    handoverDate: acceptedHandoverDate(
      (c as Contract & { handoverDate?: unknown }).handoverDate
    ),
    boq: c.boq ?? [],
    amendments: (Array.isArray(c.amendments) ? c.amendments : []).map(
      normalizeAmendment
    ),
    expenses: (c.expenses ?? []).map(normalizeExpense),
    guaranteeEdits: c.guaranteeEdits ?? [],
    status: coerceContractStatus(c.status),
  };
  return normalized;
}

function normalizeAmendment(a: BoqAmendment, idx: number): BoqAmendment {
  const seq = typeof a.seq === "number" && a.seq > 0 ? a.seq : idx + 1;
  return {
    ...a,
    id: a.id || crypto.randomUUID(),
    seq,
    number: String(a.number ?? "").trim() || defaultAmendmentNumber(seq),
    date: String(a.date ?? a.at ?? "").slice(0, 10),
    at: a.at || a.date || new Date(0).toISOString(),
    by: a.by ?? null,
    note: a.note ?? "",
    previousOrderValue: Number(a.previousOrderValue) || 0,
    newOrderValue: Number(a.newOrderValue) || 0,
    previousBoqTotal: Number(a.previousBoqTotal) || 0,
    newBoqTotal: Number(a.newBoqTotal) || 0,
    lineDiffs: a.lineDiffs ?? [],
    boqSnapshot: a.boqSnapshot ?? [],
  };
}

function normalizeInvoice(i: Invoice): Invoice {
  const extras = i.extraCharges ?? [];
  const extraTotal = extras.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const net = i.netAmount ?? 0;
  const gst = i.gstAmount ?? 0;
  return {
    ...i,
    extraCharges: extras,
    finalAmount: net + gst + extraTotal,
    createdAt: i.createdAt || i.date || new Date(0).toISOString(),
  };
}

function normalizeTask(t: Task & { assignee?: string | null }): Task {
  const legacyAssignee = t.assignee;
  const assignees =
    Array.isArray(t.assignees) && t.assignees.length > 0
      ? t.assignees.filter(Boolean)
      : legacyAssignee
        ? [legacyAssignee]
        : [];
  const status = (t.status ?? "pending") as TaskStatus;
  const closed = status === "completed" || status === "not_required";
  const waiting = status === "awaiting_verification";
  return {
    ...t,
    assignees,
    source: t.source ?? "manual",
    catalogKey: (t.catalogKey as TaskCatalogKey | null) ?? null,
    priority: t.priority ?? "normal",
    notes: t.notes ?? "",
    notesUpdatedAt: t.notesUpdatedAt ?? null,
    completedAt: closed ? (t.completedAt ?? t.createdAt) : null,
    notRequiredReason: t.notRequiredReason ?? null,
    overdueNotifiedFor: t.overdueNotifiedFor
      ? String(t.overdueNotifiedFor).slice(0, 10)
      : null,
    dueTodayNotifiedFor: t.dueTodayNotifiedFor
      ? String(t.dueTodayNotifiedFor).slice(0, 10)
      : null,
    verificationDepartment: waiting ? (t.verificationDepartment ?? null) : null,
    verificationRequestedBy: waiting
      ? (t.verificationRequestedBy ?? null)
      : null,
    deletedAt: t.deletedAt ? String(t.deletedAt) : null,
    status,
  };
}

export function taskIsDeleted(t: Task): boolean {
  return Boolean(t.deletedAt);
}

/** Closed tasks older than retention window are hidden from lists. */
export function taskVisibleInLists(t: Task, now = new Date()): boolean {
  if (taskIsDeleted(t)) return false;
  if (t.status !== "completed" && t.status !== "not_required") return true;
  const at = t.completedAt || t.createdAt;
  const done = new Date(at);
  if (Number.isNaN(done.getTime())) return true;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - TASK_COMPLETED_VISIBLE_DAYS);
  return done >= cutoff;
}

export function taskIsOpen(t: Task) {
  if (taskIsDeleted(t)) return false;
  return t.status !== "completed" && t.status !== "not_required";
}

export function formatAssignees(assignees: string[]): string {
  if (!assignees.length) return "—";
  if (assignees.length === 1) return assignees[0];
  return `${assignees[0]} +${assignees.length - 1}`;
}

function normalizeSchedule(s: ScheduleLine): ScheduleLine {
  const start = s.startDate || s.endDate || "";
  const end = s.endDate || s.startDate || "";
  const done = Boolean(s.done);
  return {
    ...s,
    boqItemId: s.boqItemId ?? null,
    quantity: s.quantity ?? null,
    startDate: start,
    endDate: end,
    committed: Boolean(s.committed),
    baselineStartDate: s.baselineStartDate || start,
    baselineEndDate: s.baselineEndDate || end,
    done,
    doneAt: done ? (s.doneAt ?? s.updatedAt ?? s.createdAt) : null,
    doneBy: done ? (s.doneBy ?? null) : null,
    updatedAt: s.updatedAt || s.createdAt,
  };
}

function normalizeDeliveryChallan(dc: DeliveryChallan): DeliveryChallan {
  const lines = Array.isArray(dc.lines) ? dc.lines : [];
  return {
    id: dc.id || crypto.randomUUID(),
    contractId: String(dc.contractId ?? ""),
    dcNo: String(dc.dcNo ?? "").trim(),
    date: String(dc.date ?? "").slice(0, 10),
    lines: lines
      .map((l) => ({
        boqItemId: String(l?.boqItemId ?? ""),
        qty: Number(l?.qty) || 0,
      }))
      .filter((l) => l.boqItemId && l.qty > 0),
    createdAt: dc.createdAt || dc.date || new Date(0).toISOString(),
    createdBy: dc.createdBy ?? null,
  };
}

function normalizeInstallationProgress(
  p: InstallationProgress
): InstallationProgress {
  const history = (p.history ?? []).map((h) => ({
    ...h,
    id: h.id || `${p.id}-${h.recordedAt || h.at}`,
    at: String(h.at ?? "").slice(0, 10),
    recordedAt: h.recordedAt || h.at,
    totalAfter: Number(h.totalAfter) || 0,
    delta: Number(h.delta) || 0,
    by: h.by ?? null,
  }));
  return {
    ...p,
    installedQty: Math.max(0, Number(p.installedQty) || 0),
    lastUpdatedAt: p.lastUpdatedAt ?? history[history.length - 1]?.at ?? null,
    history,
  };
}

function clearedNoticeState(raw: FlowhubData): Pick<
  FlowhubData,
  "notifications" | "clearedNotices"
> {
  const clearedNotices = pruneClearedNotices(raw.clearedNotices);
  return {
    clearedNotices,
    notifications: purgeExpiredNotifications(
      stampClearedNotices(raw.notifications, clearedNotices)
    ),
  };
}

function normalizeData(raw: FlowhubData): FlowhubData {
  const base: FlowhubData = {
    ...empty,
    ...raw,
    workspaceRevision:
      typeof raw.workspaceRevision === "number" ? raw.workspaceRevision : 0,
    contracts: (raw.contracts ?? []).map(normalizeContract),
    tasks: (raw.tasks ?? []).map(normalizeTask),
    itemCatalog: raw.itemCatalog ?? [],
    invoices: (raw.invoices ?? []).map(normalizeInvoice),
    payments: (raw.payments ?? []).map((p) =>
      normalizePayment(p, raw.invoices ?? [])
    ),
    schedules: (raw.schedules ?? []).map(normalizeSchedule),
    scheduleChangeLog: purgeExpiredScheduleChangeLog(raw.scheduleChangeLog),
    taskDeadlineChangeLog: normalizeTaskDeadlineChangeLog(
      raw.taskDeadlineChangeLog
    ),
    // Unread notices last 21 days. A read notice lasts 24 hours from that read.
    // A cleared notice stays hidden for that person. The row remains while
    // anyone else can still see it.
    ...clearedNoticeState(raw),
    ...departmentCatalogFields(raw),
    expenseCategories: raw.expenseCategories ?? [],
    deliveryChallans: (raw.deliveryChallans ?? []).map(normalizeDeliveryChallan),
    installationProgress: (raw.installationProgress ?? []).map(
      normalizeInstallationProgress
    ),
    nexusCosts: normalizeNexusCosts(raw.nexusCosts),
  };
  return completeHandedOverContracts(base);
}

/** Prefer a live task-based href so older stored links still land on the entry page. */
export function resolveNotificationHref(
  n: HubNotification,
  data?: FlowhubData
): string {
  const d = data ?? read();
  return resolveHrefFromTasks(n, d.tasks);
}

function blankNotification(
  task: Task,
  spec: {
    kind: HubNotification["kind"];
    title: string;
    createdBy?: string | null;
    names: string[];
    department: string | null;
    audienceClearance?: HubNotification["audienceClearance"];
  }
): HubNotification {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: spec.kind,
    title: spec.title,
    /** Task / alert name only — contract shown separately in the bell. */
    body: task.title,
    href: taskNotificationHref(task),
    taskId: task.id,
    contractId: task.contractId,
    audienceUserNames: spec.names,
    audienceDepartment: spec.department,
    audienceClearance: spec.audienceClearance ?? null,
    createdBy: spec.createdBy ?? null,
    readByUserIds: [],
    readAtByUserIds: {},
    clearedByUserIds: [],
  };
}

function buildTaskJobNotification(
  _data: FlowhubData,
  task: Task,
  opts?: { createdBy?: string | null; kind?: HubNotification["kind"] }
): HubNotification | null {
  const audience = taskAlertAudience(task);
  if (!audience) return null;
  const named = audience.names.length > 0;
  return blankNotification(task, {
    kind: named
      ? (opts?.kind ?? "task_assigned")
      : (opts?.kind ?? "task_department"),
    title: named
      ? "Task assigned to you"
      : `New job for ${departmentDisplayName(audience.department)}`,
    createdBy: opts?.createdBy ?? null,
    names: audience.names,
    department: audience.department,
  });
}

function buildDatedNotice(
  task: Task,
  which: "overdue" | "due_today"
): HubNotification | null {
  const audience =
    which === "due_today"
      ? taskDueTodayAudience(task)
      : taskAlertAudience(task);
  if (!audience) return null;
  return blankNotification(task, {
    kind: which === "overdue" ? "task_overdue" : "task_due_today",
    title: which === "overdue" ? "Task overdue" : "Task due today",
    names: audience.names,
    department: audience.department,
  });
}

/** Managers of the user's department, or Master when that department is missing. */
function buildVerifyNotification(
  task: Task,
  actor: TaskActor
): HubNotification {
  return taskVerifyNotice(task, actor);
}

function appendNotifications(
  data: FlowhubData,
  rows: HubNotification[]
): FlowhubData {
  const kept = purgeExpiredNotifications(data.notifications);
  if (!rows.length) {
    if (kept.length === (data.notifications ?? []).length) return data;
    return { ...data, notifications: kept };
  }
  const next = [...kept, ...rows].slice(-MAX_NOTIFICATIONS);
  return { ...data, notifications: next };
}

function notifyForTasks(
  data: FlowhubData,
  tasks: Task[],
  opts?: { createdBy?: string | null; kind?: HubNotification["kind"] }
): FlowhubData {
  const rows = tasks
    .map((t) => buildTaskJobNotification(data, t, opts))
    .filter((n): n is HubNotification => !!n);
  return appendNotifications(data, rows);
}

export function notificationsForUser(
  user: {
    id: string;
    name: string | null | undefined;
    department: string | null | undefined;
    clearance?: string | null;
  },
  data?: FlowhubData
): HubNotification[] {
  const d = data ?? read();
  return [...(d.notifications ?? [])]
    .filter(
      (n) =>
        notificationVisibleTo(n, user) &&
        notificationVisibleForUser(n, user.id)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadNotificationCount(
  user: {
    id: string;
    name: string | null | undefined;
    department: string | null | undefined;
    clearance?: string | null;
  },
  data?: FlowhubData
): number {
  return notificationsForUser(user, data).filter(
    (n) => !n.readByUserIds.includes(user.id)
  ).length;
}

export function markNotificationRead(id: string, userId: string) {
  const data = read();
  const now = new Date().toISOString();
  write({
    ...data,
    notifications: purgeExpiredNotifications(data.notifications).map((n) => {
      if (n.id !== id) return n;
      if (n.readByUserIds.includes(userId) && n.readAtByUserIds?.[userId]) {
        return n;
      }
      return {
        ...n,
        readByUserIds: n.readByUserIds.includes(userId)
          ? n.readByUserIds
          : [...n.readByUserIds, userId],
        readAtByUserIds: {
          ...(n.readAtByUserIds ?? {}),
          [userId]: n.readAtByUserIds?.[userId] ?? now,
        },
      };
    }),
  });
}

export function markAllNotificationsRead(userId: string, user: {
  id: string;
  name: string | null | undefined;
  department: string | null | undefined;
  clearance?: string | null;
}) {
  const data = read();
  const now = new Date().toISOString();
  write({
    ...data,
    notifications: purgeExpiredNotifications(data.notifications).map((n) => {
      if (!notificationVisibleTo(n, user)) return n;
      if (n.readByUserIds.includes(userId) && n.readAtByUserIds?.[userId]) {
        return n;
      }
      return {
        ...n,
        readByUserIds: n.readByUserIds.includes(userId)
          ? n.readByUserIds
          : [...n.readByUserIds, userId],
        readAtByUserIds: {
          ...(n.readAtByUserIds ?? {}),
          [userId]: n.readAtByUserIds?.[userId] ?? now,
        },
      };
    }),
  });
}

/** Drop opened or marked-read notices from this person's box only. */
export function clearReadNotifications(user: NoticeAudienceMember) {
  const data = read();
  const rows = data.notifications ?? [];
  const cleared = clearReadNotices(rows, data.clearedNotices, user);
  if (
    cleared.notifications === rows &&
    cleared.clearedNotices === data.clearedNotices
  ) {
    return;
  }
  write({
    ...data,
    notifications: cleared.notifications,
    clearedNotices: cleared.clearedNotices ?? {},
  });
}

/** Drop expired notifications from the live workspace (no archive). */
export function pruneExpiredNotifications(): boolean {
  const data = read();
  const before = (data.notifications ?? []).length;
  const notifications = purgeExpiredNotifications(data.notifications);
  if (notifications.length === before) return false;
  write({ ...data, notifications });
  return true;
}

function appendScheduleLog(
  data: FlowhubData,
  entry: Omit<ScheduleChangeLogEntry, "id" | "at"> & { at?: string }
): FlowhubData {
  const row: ScheduleChangeLogEntry = {
    id: crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
    by: entry.by,
    contractId: entry.contractId,
    scheduleId: entry.scheduleId,
    summary: entry.summary,
  };
  return {
    ...data,
    scheduleChangeLog: [...(data.scheduleChangeLog ?? []), row],
  };
}

function appendTaskDeadlineLog(
  data: FlowhubData,
  entry: Omit<TaskDeadlineChangeLogEntry, "id" | "at"> & { at?: string }
): FlowhubData {
  const row: TaskDeadlineChangeLogEntry = {
    id: crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
    by: (entry.by || "").trim() || "User",
    taskId: entry.taskId,
    contractId: entry.contractId,
    taskTitle: (entry.taskTitle || "").trim(),
    fromDate: entry.fromDate,
    toDate: entry.toDate,
    reason: entry.reason,
  };
  return {
    ...data,
    taskDeadlineChangeLog: [...(data.taskDeadlineChangeLog ?? []), row],
  };
}

function daysBetweenIso(from: string, to: string): number {
  const a = new Date(from + "T12:00:00").getTime();
  const b = new Date(to + "T12:00:00").getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** Sum of supply/install qty already scheduled for a BOQ item (optionally excluding one line). */
export function scheduledQtyForKind(
  contractId: string,
  boqItemId: string,
  kind: "supply" | "installation",
  excludeId?: string | null,
  data?: FlowhubData
): number {
  const d = data ?? read();
  return d.schedules
    .filter(
      (s) =>
        s.contractId === contractId &&
        s.kind === kind &&
        s.boqItemId === boqItemId &&
        s.id !== excludeId
    )
    .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
}

export function scheduledSupplyQty(
  contractId: string,
  boqItemId: string,
  excludeId?: string | null
): number {
  return scheduledQtyForKind(contractId, boqItemId, "supply", excludeId);
}

/**
 * Closure date should show in red on the contracts list when the contract
 * is not completed and either its handover date is after closure, or that
 * date is empty and today is already past closure.
 * A schedule handover line is a target and does not turn this red.
 * Completed contracts always use normal (non-attention) styling.
 */
export function closureDateNeedsAttention(
  contractId: string,
  data?: FlowhubData,
  today?: string
): boolean {
  const d = data ?? read();
  const contract = d.contracts.find((c) => c.id === contractId);
  if (!contract?.closureDate) return false;
  const todayIso = (today ?? nexusTodayIso()).slice(0, 10);
  if (contractDisplayStatus(d, contract, todayIso) === "Completed") return false;
  const handoverDate = handoverDateForContract(d, contractId);
  if (handoverDate && handoverDate > contract.closureDate) return true;
  if (!handoverDate && todayIso > contract.closureDate) return true;
  return false;
}

export function scheduleIsOverdue(s: ScheduleLine, today: string): boolean {
  if (s.done) return false;
  const date = s.endDate || s.startDate;
  if (!date || isScheduleDateNa(date)) return false;
  return date < today;
}

/** A contract schedule exists only when every BOQ item is fully covered + testing + handover. */
export function isContractScheduleComplete(
  contractId: string,
  data?: FlowhubData
): boolean {
  const d = data ?? read();
  const contract = d.contracts.find((c) => c.id === contractId);
  if (!contract || contract.boq.length === 0) return false;
  const hasTesting = d.schedules.some(
    (s) => s.contractId === contractId && s.kind === "testing" && s.startDate
  );
  const hasHandover = d.schedules.some(
    (s) => s.contractId === contractId && s.kind === "handover" && s.startDate
  );
  if (!hasTesting || !hasHandover) return false;
  return contract.boq.every((b) => {
    const supply = scheduledQtyForKind(contractId, b.id, "supply", null, d);
    const install = scheduledQtyForKind(
      contractId,
      b.id,
      "installation",
      null,
      d
    );
    return supply === b.quantity && install === b.quantity;
  });
}

export function contractScheduleCoverage(
  contractId: string,
  data?: FlowhubData
): { itemsTotal: number; itemsComplete: number; hasTesting: boolean; hasHandover: boolean; complete: boolean } {
  const d = data ?? read();
  const contract = d.contracts.find((c) => c.id === contractId);
  const itemsTotal = contract?.boq.length ?? 0;
  let itemsComplete = 0;
  if (contract) {
    for (const b of contract.boq) {
      const supply = scheduledQtyForKind(contractId, b.id, "supply", null, d);
      const install = scheduledQtyForKind(
        contractId,
        b.id,
        "installation",
        null,
        d
      );
      if (supply === b.quantity && install === b.quantity) itemsComplete += 1;
    }
  }
  const hasTesting = d.schedules.some(
    (s) => s.contractId === contractId && s.kind === "testing" && s.startDate
  );
  const hasHandover = d.schedules.some(
    (s) => s.contractId === contractId && s.kind === "handover" && s.startDate
  );
  return {
    itemsTotal,
    itemsComplete,
    hasTesting,
    hasHandover,
    complete: isContractScheduleComplete(contractId, d),
  };
}

function completeCreateSchedulesTasks(
  tasks: Task[],
  contractId: string,
  data: FlowhubData
): Task[] {
  if (!isContractScheduleComplete(contractId, data)) return tasks;
  return tasks.map((t) =>
    t.contractId === contractId &&
    t.catalogKey === "create_schedules" &&
    t.status !== "completed" &&
    t.status !== "not_required"
      ? {
          ...t,
          status: "completed" as const,
          completedAt: t.completedAt || new Date().toISOString(),
        }
      : t
  );
}

export type ScheduleWindowInput = {
  startDate: string;
  endDate: string;
  quantity: number;
  /**
   * True only when this window was changed on this save.
   * Untouched windows keep the stored line (dates, qty, done, id).
   */
  edited?: boolean;
};

export type ScheduleItemInput = {
  boqItemId: string;
  supplies: ScheduleWindowInput[];
  installations: ScheduleWindowInput[];
};

function scheduleWindowBlank(w: ScheduleWindowInput): boolean {
  return (
    !String(w.startDate ?? "").trim() &&
    !String(w.endDate ?? "").trim() &&
    !(Number(w.quantity) > 0)
  );
}

/**
 * Planner NA control on a supply or installation window.
 * Start is NA and end is NA or omitted — the planner sets both together.
 * A real date on the other side is not NA; that still has to be corrected.
 */
function scheduleWindowNa(w: ScheduleWindowInput): boolean {
  const start = String(w.startDate ?? "").trim();
  if (!isScheduleDateNa(start)) return false;
  const end = String(w.endDate ?? "").trim();
  return !end || isScheduleDateNa(end);
}

function lineDatesNa(line: ScheduleLine): boolean {
  return isScheduleDateNa(line.startDate) && isScheduleDateNa(line.endDate);
}

/**
 * The BOQ item is marked NA when every supply window on this save is NA.
 * That item is not part of the schedule: no supply qty and no other lines.
 */
function itemSuppliesMarkedNa(supplies: ScheduleWindowInput[]): boolean {
  const meaningful = supplies.filter(
    (w) => w.edited || !scheduleWindowBlank(w)
  );
  return meaningful.length > 0 && meaningful.every(scheduleWindowNa);
}

/**
 * Keep stored supply/install lines unless this save edited that window.
 * A handover date is often saved from a form that still holds the original
 * plan, and that must not put user-edited dates or qty back.
 */
function mergeScheduleWindows(
  existing: ScheduleLine[],
  windows: ScheduleWindowInput[],
  apply: (w: ScheduleWindowInput, prior?: ScheduleLine) => ScheduleLine
): ScheduleLine[] {
  const meaningful = windows.filter(
    (w) => w.edited || !scheduleWindowBlank(w)
  );
  const anyEdited = meaningful.some((w) => w.edited === true);
  if (!anyEdited && existing.length > 0) {
    if (!meaningful.some((w) => scheduleWindowNa(w))) return existing;
    return existing.filter((line, i) => {
      const w = meaningful[i];
      return !(w && scheduleWindowNa(w) && lineDatesNa(line));
    });
  }
  if (!anyEdited) {
    return meaningful
      .filter((w) => !scheduleWindowBlank(w) && !scheduleWindowNa(w))
      .map((w) => apply(w));
  }
  const result: ScheduleLine[] = [];
  const count = Math.max(existing.length, meaningful.length);
  for (let i = 0; i < count; i++) {
    const prior = existing[i];
    const w = meaningful[i];
    if (!w) {
      if (prior) result.push(prior);
      continue;
    }
    if (scheduleWindowNa(w)) {
      const priorNa = prior ? lineDatesNa(prior) : false;
      if (w.edited || priorNa || !prior) continue;
      result.push(prior);
      continue;
    }
    if (!w.edited && prior) {
      result.push(prior);
      continue;
    }
    if (scheduleWindowBlank(w)) continue;
    result.push(apply(w, prior));
  }
  return result;
}

/**
 * Replace supply/install/testing/handover lines for a contract from the planner matrix.
 * Existing lines the user did not edit in this save keep their dates, quantities,
 * and completion. A deliberate commitment edit still updates every line.
 */
export function saveContractSchedulePlan(
  input: {
    contractId: string;
    committed: boolean;
    /** When false, existing lines keep their own committed flag. */
    committedEdited?: boolean;
    testingDate: string;
    testingEdited?: boolean;
    handoverDate: string;
    handoverEdited?: boolean;
    items: ScheduleItemInput[];
  },
  opts?: { by?: string }
): { ok: true; complete: boolean } | { ok: false; error: string } {
  const data = read();
  const contract = data.contracts.find((c) => c.id === input.contractId);
  if (!contract) return { ok: false, error: "Contract not found." };
  if (!contract.boq.length)
    return { ok: false, error: "Contract has no BOQ items to schedule." };

  const by = opts?.by ?? "User";
  const now = new Date().toISOString();
  const prior = data.schedules.filter((s) => s.contractId === contract.id);
  const committedForNew =
    input.committedEdited === true
      ? input.committed
      : (prior.find((s) => s.committed)?.committed ?? input.committed);

  const normDate = (d: string) =>
    isScheduleDateNa(d) ? SCHEDULE_DATE_NA : d;

  const applyWindow = (
    boqId: string,
    kind: "supply" | "installation",
    w: ScheduleWindowInput,
    existingLine?: ScheduleLine
  ): ScheduleLine => {
    const start = normDate(w.startDate);
    const end = normDate(w.endDate || w.startDate);
    const quantity = Number(w.quantity);
    const committed =
      input.committedEdited === true
        ? input.committed
        : (existingLine?.committed ?? committedForNew);
    if (existingLine) {
      return normalizeSchedule({
        ...existingLine,
        quantity,
        startDate: start,
        endDate: end,
        committed,
        updatedAt: now,
      });
    }
    return normalizeSchedule({
      id: crypto.randomUUID(),
      contractId: contract.id,
      boqItemId: boqId,
      kind,
      quantity,
      startDate: start,
      endDate: end,
      committed,
      baselineStartDate: start,
      baselineEndDate: end,
      done: false,
      doneAt: null,
      doneBy: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  const newLines: ScheduleLine[] = [];

  for (const boq of contract.boq) {
    const item = input.items.find((i) => i.boqItemId === boq.id) ?? {
      boqItemId: boq.id,
      supplies: [],
      installations: [],
    };
    // NA on the item's supply dates omits the item. Supply qty is not
    // required, and any supply or installation line already stored is dropped.
    if (itemSuppliesMarkedNa(item.supplies)) continue;
    const existingSupply = prior.filter(
      (s) => s.kind === "supply" && s.boqItemId === boq.id
    );
    const existingInstall = prior.filter(
      (s) => s.kind === "installation" && s.boqItemId === boq.id
    );
    const supplies = mergeScheduleWindows(existingSupply, item.supplies, (w, line) =>
      applyWindow(boq.id, "supply", w, line)
    );
    const installations = mergeScheduleWindows(
      existingInstall,
      item.installations,
      (w, line) => applyWindow(boq.id, "installation", w, line)
    );

    const checkLines = (
      kind: "supply" | "installation",
      lines: ScheduleLine[]
    ) => {
      let sum = 0;
      for (const line of lines) {
        if (!line.startDate || !line.endDate)
          return `${SCHEDULE_KIND_LABELS[kind]} dates required for ${boq.name} (or set NA).`;
        const startNa = isScheduleDateNa(line.startDate);
        const endNa = isScheduleDateNa(line.endDate);
        if (startNa !== endNa)
          return `${SCHEDULE_KIND_LABELS[kind]} for ${boq.name}: set both dates to NA or both to real dates.`;
        if (!startNa && !endNa && line.endDate < line.startDate)
          return `${SCHEDULE_KIND_LABELS[kind]} end before start for ${boq.name}.`;
        if (!(Number(line.quantity) > 0))
          return `${SCHEDULE_KIND_LABELS[kind]} qty must be > 0 for ${boq.name}.`;
        sum += Number(line.quantity);
      }
      if (sum > boq.quantity)
        return `${SCHEDULE_KIND_LABELS[kind]} qty for ${boq.name} exceeds BOQ (${sum} > ${boq.quantity}).`;
      return null;
    };

    const supplyErr = checkLines("supply", supplies);
    if (supplyErr) return { ok: false, error: supplyErr };
    const installErr = checkLines("installation", installations);
    if (installErr) return { ok: false, error: installErr };

    const hasRealSupply = supplies.some(
      (s) => s.startDate && !isScheduleDateNa(s.startDate)
    );
    const hasInstallWork = installations.length > 0;
    if (hasInstallWork && !hasRealSupply) {
      return {
        ok: false,
        error: `Set a supply date for ${boq.name} before adding installation.`,
      };
    }

    newLines.push(...supplies, ...installations);
  }

  const resolveContractLine = (
    kind: "testing" | "handover",
    date: string,
    edited: boolean | undefined
  ): ScheduleLine | null => {
    const existing = prior.find((s) => s.kind === kind);
    if (existing && edited !== true) return existing;
    if (!date) return null;
    const d = isScheduleDateNa(date) ? SCHEDULE_DATE_NA : date;
    const committed =
      input.committedEdited === true
        ? input.committed
        : (existing?.committed ?? committedForNew);
    if (
      existing &&
      existing.startDate === d &&
      existing.endDate === d &&
      existing.committed === committed
    ) {
      return existing;
    }
    if (existing) {
      return normalizeSchedule({
        ...existing,
        startDate: d,
        endDate: d,
        committed,
        updatedAt: now,
      });
    }
    return normalizeSchedule({
      id: crypto.randomUUID(),
      contractId: contract.id,
      boqItemId: null,
      kind,
      quantity: null,
      startDate: d,
      endDate: d,
      committed,
      baselineStartDate: d,
      baselineEndDate: d,
      done: false,
      doneAt: null,
      doneBy: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  const testingLine = resolveContractLine(
    "testing",
    input.testingDate,
    input.testingEdited
  );
  if (testingLine) newLines.push(testingLine);
  const handoverLine = resolveContractLine(
    "handover",
    input.handoverDate,
    input.handoverEdited
  );
  if (handoverLine) newLines.push(handoverLine);

  // Untouched windows return the stored line, so a commitment-only edit
  // never reaches applyWindow / resolveContractLine. Stamp it here.
  const merged =
    input.committedEdited === true
      ? newLines.map((line) =>
          line.committed === input.committed
            ? line
            : normalizeSchedule({
                ...line,
                committed: input.committed,
                updatedAt: now,
              })
        )
      : newLines;

  const commitmentChanged =
    input.committedEdited === true &&
    merged.some((line) => {
      const previous = prior.find((s) => s.id === line.id);
      return previous != null && previous.committed !== line.committed;
    });
  const commitmentBit = commitmentChanged
    ? input.committed
      ? " · committed"
      : " · uncommitted"
    : "";

  const kept = data.schedules.filter((s) => s.contractId !== contract.id);
  const schedules = [...kept, ...merged];
  const nextDataBase: FlowhubData = { ...data, schedules };
  const complete = isContractScheduleComplete(contract.id, nextDataBase);
  const tasks = completeCreateSchedulesTasks(
    data.tasks,
    contract.id,
    nextDataBase
  );

  const nextData = appendScheduleLog(
    { ...nextDataBase, tasks },
    {
      by,
      contractId: contract.id,
      scheduleId: null,
      summary: complete
        ? `Saved complete schedule (${contract.projectNo}) — all BOQ items + testing + handover${commitmentBit}`
        : `Saved schedule progress (${contract.projectNo}) — ${merged.length} lines${commitmentBit}`,
    }
  );
  write(nextData);
  if (input.handoverDate && !isScheduleDateNa(input.handoverDate)) {
    syncDatedSystemTasks();
  }
  return { ok: true, complete };
}

/** Master-only: delete every schedule line for a contract. */
export function deleteContractSchedule(
  contractId: string,
  opts?: { by?: string }
): { ok: true; cleared: number } | { ok: false; error: string } {
  const data = read();
  if (!data.contracts.some((c) => c.id === contractId))
    return { ok: false, error: "Contract not found." };
  const cleared = data.schedules.filter((s) => s.contractId === contractId)
    .length;
  if (!cleared) return { ok: false, error: "No schedule lines for this contract." };
  const projectNo =
    data.contracts.find((c) => c.id === contractId)?.projectNo ?? contractId;
  // Reopen create_schedules
  const tasks = data.tasks.map((t) =>
    t.contractId === contractId &&
    t.catalogKey === "create_schedules" &&
    (t.status === "completed" || t.status === "not_required")
      ? { ...t, status: "pending" as const, completedAt: null }
      : t
  );
  const nextData = appendScheduleLog(
    {
      ...data,
      schedules: data.schedules.filter((s) => s.contractId !== contractId),
      tasks,
    },
    {
      by: opts?.by ?? "Master",
      contractId,
      scheduleId: null,
      summary: `Deleted full schedule for ${projectNo} (${cleared} lines)`,
    }
  );
  write(nextData);
  return { ok: true, cleared };
}

export function listDepartments(data?: FlowhubData): string[] {
  return listDepartmentNames(data ?? read());
}

export function renameDepartment(
  from: string,
  to: string
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const result = renameDepartmentRecords(read(), [], from, to);
  if (!result.ok) return result;
  if (result.to !== result.from) write(result.data);
  return { ok: true, from: result.from, to: result.to ?? result.from };
}

export function deleteDepartment(
  name: string
): { ok: true; from: string } | { ok: false; error: string } {
  const result = deleteDepartmentRecords(read(), [], name);
  if (!result.ok) return result;
  write(result.data);
  return { ok: true, from: result.from };
}

export function addCustomDepartment(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const data = read();
  const all = listDepartments(data);
  if (all.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
    return trimmed;
  }
  write({
    ...data,
    customDepartments: [...(data.customDepartments ?? []), trimmed],
  });
  return trimmed;
}

function workspaceIsEmpty(data: FlowhubData) {
  return (
    data.contracts.length === 0 &&
    data.tasks.length === 0 &&
    data.invoices.length === 0 &&
    data.payments.length === 0 &&
    data.schedules.length === 0 &&
    data.itemCatalog.length === 0
  );
}

function readLocal(): FlowhubData {
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    return normalizeData({ ...empty, ...JSON.parse(raw) } as FlowhubData);
  } catch {
    return empty;
  }
}

/** Cached client snapshot for useSyncExternalStore — must be referentially stable. */
let clientSnapshot: FlowhubData = empty;
/**
 * The stored hub this tab last loaded or last had confirmed.
 * Saves send the difference from this copy, not the whole snapshot.
 */
let editBase: FlowhubData = empty;
let clientHydrated = false;
let serverHydrated = false;
let hydratePromise: Promise<void> | null = null;
let persistChain: Promise<void> = Promise.resolve();
/** Latest save, including failures. flushWorkspace waits on this one. */
let lastPersist: Promise<void> = persistChain;

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("flowhub-data"));
}

function rememberEditBase(data: FlowhubData) {
  editBase = structuredClone(data);
}

function setSnapshot(data: FlowhubData) {
  clientSnapshot = normalizeData(data);
  clientHydrated = true;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clientSnapshot));
  } catch {
    // A full workspace can exceed the browser quota. Drop the stale cache
    // so the next load uses Postgres instead of an older partial copy.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

function read(): FlowhubData {
  if (!clientHydrated) {
    setSnapshot(readLocal());
    rememberEditBase(clientSnapshot);
  }
  return clientSnapshot;
}

/** PUTs queued in this tab that have not finished. */
let persistOutstanding = 0;
/**
 * Bumps on every local write. A refetch that started earlier must not
 * paint over a save this tab has already applied locally.
 */
let persistEpoch = 0;
/**
 * Writes at or before this epoch were refused because the hub moved on.
 * A later edit in this tab is a new epoch and can save again.
 */
let staleRejectEpoch = -1;

function saveInFlight(): boolean {
  return pendingLocalSave || persistOutstanding > 0;
}

type WorkspacePutResult = {
  ok?: boolean;
  skipped?: string;
  error?: string;
  data?: FlowhubData;
  workspaceRevision?: number;
  signedOut?: boolean;
  redirect?: string;
};

function workspaceSaveRequest(data: FlowhubData): WorkspaceChangeRequest {
  return {
    baseRevision: editBase.workspaceRevision ?? 0,
    changes: diffWorkspace(editBase, data),
  };
}

function saveRejectedMessage(
  body: WorkspacePutResult | null,
  status: number
): string {
  if (body?.skipped === "refuse-stale-revision") {
    return STALE_WORKSPACE_SAVE_MESSAGE;
  }
  if (body?.skipped || body?.ok === false) {
    return "Could not save. This entry was not stored.";
  }
  if (body?.error) return body.error;
  return `Could not save the workspace (${status}).`;
}

/** Replace this tab with the hub that refused the save, so a retry starts there. */
async function adoptRejectedWorkspace(body: WorkspacePutResult | null) {
  let remote: FlowhubData | null = null;
  if (body?.data && typeof body.data === "object") {
    remote = normalizeData(body.data);
  } else {
    try {
      const res = await fetch("/api/workspace", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const ctype = res.headers.get("content-type") ?? "";
      if (!ctype.includes("application/json")) return;
      remote = normalizeData((await res.json()) as FlowhubData);
    } catch {
      return;
    }
  }
  setSnapshot(remote);
  rememberEditBase(clientSnapshot);
  notify();
}

function persistToServer() {
  if (typeof window === "undefined") return;
  // Never push until a real Postgres GET succeeded — local-fallback unlock
  // must not wipe the shared workspace.
  if (!hydrateFromServerOk) return;
  const epoch = persistEpoch;
  // Chrome drops keepalive fetches once the body reaches 64KB. The shared
  // workspace crosses that after a handful of contracts, so those saves
  // never reached Postgres and later contracts vanished on the next load.
  persistOutstanding += 1;
  const job = persistChain.catch(() => undefined).then(async () => {
    try {
      if (epoch <= staleRejectEpoch) {
        throw new Error(STALE_WORKSPACE_SAVE_MESSAGE);
      }
      // Build the request after the previous save has stored its revision.
      // The next save then sends that revision, not the one this tab loaded.
      const request = workspaceSaveRequest(clientSnapshot);
      if (Object.keys(request.changes).length === 0) return;
      const sentSnapshot = clientSnapshot;
      const res = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      let body: WorkspacePutResult | null = null;
      try {
        body = (await res.json()) as WorkspacePutResult;
      } catch {
        body = null;
      }
      if (body?.skipped === "refuse-stale-revision") {
        await adoptRejectedWorkspace(body);
        staleRejectEpoch = Math.max(staleRejectEpoch, persistEpoch);
        throw new Error(STALE_WORKSPACE_SAVE_MESSAGE);
      }
      const exit = workspaceSaveExit(body);
      if (exit) {
        window.location.assign(exit.path);
        throw new Error(exit.message);
      }
      if (!res.ok || body?.ok !== true || body?.skipped) {
        throw new Error(saveRejectedMessage(body, res.status));
      }
      if (body.data && typeof body.data === "object") {
        const merged = normalizeData(body.data);
        if (epoch === persistEpoch) {
          setSnapshot(merged);
          rememberEditBase(clientSnapshot);
          notify();
        } else {
          const extra = diffWorkspace(sentSnapshot, clientSnapshot);
          const rebased = applyWorkspaceChanges(merged, extra);
          rebased.workspaceRevision = Math.max(
            merged.workspaceRevision ?? 0,
            clientSnapshot.workspaceRevision ?? 0
          );
          setSnapshot(rebased);
          rememberEditBase(merged);
          notify();
        }
      } else if (typeof body.workspaceRevision === "number") {
        const confirmed = {
          ...sentSnapshot,
          workspaceRevision: body.workspaceRevision,
        };
        if (epoch === persistEpoch) {
          setSnapshot(confirmed);
          rememberEditBase(clientSnapshot);
          notify();
        } else {
          rememberEditBase(confirmed);
        }
      } else {
        rememberEditBase(sentSnapshot);
      }
    } finally {
      persistOutstanding -= 1;
    }
  });
  lastPersist = job;
  persistChain = job.catch((err) => {
    console.error("Failed to persist workspace", err);
  });
}

/** When the signed-in person only has View on the current door, ignore writes. */
let workspaceWritesLocked = false;

export function setWorkspaceWritesLocked(locked: boolean) {
  workspaceWritesLocked = locked;
}

/**
 * A write arrived before the Postgres GET finished. persistToServer no-ops
 * until that GET succeeds, so the edit lives only in clientSnapshot until
 * hydrate applies it. Do not let the late GET replace it.
 */
let pendingLocalSave = false;

function write(data: FlowhubData): Promise<void> {
  if (workspaceWritesLocked) return persistChain;
  persistEpoch += 1;
  // The on-screen revision moves immediately. The server stores the
  // change list and returns the merged hub, which replaces this copy.
  const next: FlowhubData = {
    ...data,
    workspaceRevision: (data.workspaceRevision ?? 0) + 1,
  };
  setSnapshot(next);
  notify();
  if (!hydrateFromServerOk) pendingLocalSave = true;
  persistToServer();
  return persistChain;
}

/** Wait until every pending save has reached Postgres. */
export function flushWorkspace(): Promise<void> {
  if (pendingLocalSave && !hydrateFromServerOk) {
    return hydrateWorkspace().then(() => {
      if (pendingLocalSave && !hydrateFromServerOk) {
        throw new Error("Could not save the workspace.");
      }
      return lastPersist;
    });
  }
  return lastPersist;
}

export function getData(): FlowhubData {
  return read();
}

/** True only after a successful JSON workspace GET (not local-fallback). */
let hydrateFromServerOk = false;
let hydrateRetryTimer: ReturnType<typeof setTimeout> | null = null;
let hydrateAttempts = 0;
let unauthorizedStreak = 0;
let hydrateRequested = false;
const MAX_UNAUTHORIZED_RETRIES = 3;
const MAX_TRANSIENT_RETRIES = 8;

/** Flip the loading gate and notify — always set ready *before* notify. */
function markReady(fromServer: boolean) {
  serverHydrated = true;
  if (fromServer) hydrateFromServerOk = true;
  notify();
}

/** True after a successful JSON workspace GET (not local-fallback / 401). */
export function isWorkspaceHydratedFromServer(): boolean {
  return hydrateFromServerOk;
}

function scheduleHydrateRetry() {
  if (hydrateRetryTimer || hydrateFromServerOk) return;
  if (hydrateAttempts >= MAX_TRANSIENT_RETRIES) {
    // Unlock UI with local cache; persist stays gated on hydrateFromServerOk.
    if (!serverHydrated) markReady(false);
    return;
  }
  const delay = Math.min(500 * 2 ** hydrateAttempts, 10_000);
  hydrateAttempts += 1;
  hydrateRetryTimer = setTimeout(() => {
    hydrateRetryTimer = null;
    void hydrateWorkspace({ force: true });
  }, delay);
}

if (typeof window !== "undefined") {
  const retryNow = () => {
    if (!hydrateRequested || hydrateFromServerOk) return;
    if (hydrateRetryTimer) {
      clearTimeout(hydrateRetryTimer);
      hydrateRetryTimer = null;
    }
    void hydrateWorkspace({ force: true });
  };
  window.addEventListener("online", retryNow);
  window.addEventListener("focus", retryNow);
}

/**
 * Load shared Postgres workspace (and push any leftover local-only data up once).
 * Pass `{ force: true }` after login so a prior 401/local-fallback can retry.
 */
export function hydrateWorkspace(opts?: { force?: boolean }): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  hydrateRequested = true;
  // Reuse in-flight work before any force reset (React Strict Mode remounts).
  if (hydratePromise) return hydratePromise;
  // The first successful GET stays put. Later loads go through refreshWorkspace
  // so this path does not push local cache or recreate system tasks.
  if (hydrateFromServerOk) return Promise.resolve();
  if (serverHydrated && !opts?.force) return Promise.resolve();
  // Drop the loading-gate flag without notifying yet — success/failure paths
  // call markReady/notify so subscribers never miss the ready transition.
  serverHydrated = false;

  hydratePromise = (async () => {
    // Don't let a late GET overwrite a save still in flight
    await persistChain;
    const local = readLocal();
    try {
      const res = await fetch("/api/workspace", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (res.status === 401) {
        let signedOut = false;
        try {
          const body = (await res.json()) as { signedOut?: boolean };
          signedOut = Boolean(body?.signedOut);
        } catch {
          signedOut = false;
        }
        if (signedOut) {
          markReady(false);
          if (!window.location.pathname.startsWith(LOGIN_PAGE)) {
            window.location.assign(LOGIN_PAGE);
          }
          return;
        }
        // Cookie race or expired JWT while SessionProvider still says authed.
        // Keep an edit made during this GET; local was captured before it.
        if (!pendingLocalSave) {
          setSnapshot(local);
          rememberEditBase(clientSnapshot);
        }
        unauthorizedStreak += 1;
        if (unauthorizedStreak > MAX_UNAUTHORIZED_RETRIES) {
          // Unlock UI; do not persist until a real GET succeeds.
          markReady(false);
          if (!window.location.pathname.startsWith("/login")) {
            const back = window.location.pathname + window.location.search;
            window.location.assign(
              `/login?callbackUrl=${encodeURIComponent(back)}`
            );
          }
          return;
        }
        notify();
        scheduleHydrateRetry();
        return;
      }
      unauthorizedStreak = 0;
      if (!res.ok) throw new Error(`workspace GET ${res.status}`);
      const ctype = res.headers.get("content-type") ?? "";
      if (!ctype.includes("application/json")) {
        throw new Error(`workspace GET non-JSON (${ctype || "unknown"})`);
      }
      const payload = (await res.json()) as FlowhubData;
      const rawLogCount = Array.isArray(payload.scheduleChangeLog)
        ? payload.scheduleChangeLog.length
        : 0;
      const remote = normalizeData(payload);
      let adoptedRemote = false;
      if (pendingLocalSave) {
        // This tab edited before the GET returned. persistToServer refused
        // the write until hydrateFromServerOk, so push that unsaved edit now
        // instead of painting the server copy over it. A failed or empty GET
        // never reaches here, and localStorage alone is not pushed back.
        pendingLocalSave = false;
        markReady(true);
        persistToServer();
      } else {
        // Non-empty or empty, the server blob replaces localStorage.
        setSnapshot(remote);
        rememberEditBase(clientSnapshot);
        markReady(true);
        adoptedRemote = true;
      }
      // Drop day-old notifications from the shared store (no archive).
      const pruned = pruneExpiredNotifications();
      const logPruned =
        adoptedRemote &&
        (clientSnapshot.scheduleChangeLog ?? []).length < rawLogCount;
      // Date-window system tasks (BG expiry, retention) after hydrate
      const synced = syncDatedSystemTasks();
      // One-time overdue / due-today notices, same load as the BG chase.
      const dueNotices = syncTaskDueNotices();
      if (
        pruned ||
        logPruned ||
        synced.created.length > 0 ||
        dueNotices.notified > 0
      ) {
        await flushWorkspace().catch(() => undefined);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Workspace hydrate failed; will retry", msg);
      if (!pendingLocalSave) {
        setSnapshot(local);
        rememberEditBase(clientSnapshot);
      }
      notify();
      scheduleHydrateRetry();
    }
  })().finally(() => {
    hydratePromise = null;
    if (hydrateFromServerOk) hydrateAttempts = 0;
  });

  return hydratePromise;
}

/** How often an open signed-in tab reloads the shared workspace. */
const WORKSPACE_REFRESH_MS = 15_000;
let refreshPromise: Promise<void> | null = null;

/**
 * GET the shared workspace again and replace this tab's snapshot when the
 * stored revision is equal to or newer than the one on screen.
 * Skips while a save from this tab has not been stored yet. Never PUTs.
 */
export function refreshWorkspace(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!hydrateFromServerOk) return Promise.resolve();
  if (saveInFlight()) return Promise.resolve();
  if (refreshPromise) return refreshPromise;

  const epoch = persistEpoch;
  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/workspace", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      // A save started while this GET was in flight. Keep the local snapshot.
      if (saveInFlight() || epoch !== persistEpoch) return;
      if (res.status === 401) {
        try {
          const body = (await res.json()) as { signedOut?: boolean };
          if (
            body?.signedOut &&
            !window.location.pathname.startsWith(LOGIN_PAGE)
          ) {
            window.location.assign(LOGIN_PAGE);
          }
        } catch {
          // Keep the copy on screen when the 401 has no body.
        }
        return;
      }
      if (!res.ok) return;
      const ctype = res.headers.get("content-type") ?? "";
      if (!ctype.includes("application/json")) return;
      const payload = (await res.json()) as FlowhubData;
      if (saveInFlight() || epoch !== persistEpoch) return;
      const remote = normalizeData(payload);
      const remoteRev = remote.workspaceRevision ?? 0;
      const paintedRev = clientSnapshot.workspaceRevision ?? 0;
      if (remoteRev < paintedRev) return;
      setSnapshot(remote);
      rememberEditBase(clientSnapshot);
      notify();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Workspace refresh failed", msg);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * While someone is signed in: refetch when the tab becomes visible, and
 * about every 15 seconds while the tab is open.
 */
export function startWorkspaceRefresh(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void refreshWorkspace();
  };
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(() => {
    void refreshWorkspace();
  }, WORKSPACE_REFRESH_MS);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}

/** Drop client workspace state so tests can hydrate more than once. */
export function resetWorkspaceClientForTests() {
  clientSnapshot = empty;
  editBase = empty;
  clientHydrated = false;
  serverHydrated = false;
  hydratePromise = null;
  persistChain = Promise.resolve();
  lastPersist = persistChain;
  pendingLocalSave = false;
  persistOutstanding = 0;
  persistEpoch = 0;
  staleRejectEpoch = -1;
  workspaceWritesLocked = false;
  hydrateFromServerOk = false;
  if (hydrateRetryTimer) {
    clearTimeout(hydrateRetryTimer);
    hydrateRetryTimer = null;
  }
  hydrateAttempts = 0;
  unauthorizedStreak = 0;
  hydrateRequested = false;
  refreshPromise = null;
}

/**
 * Closing or hiding the document must not write the workspace unless this
 * tab still has a change the server has not stored. Visibility refetch is
 * a GET and does not call this.
 */
export function onWorkspacePageHide() {
  if (!saveInFlight()) return;
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(workspaceSaveRequest(clientSnapshot));
  try {
    // keepalive cannot carry a body of 64KB or more.
    void fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: payload.length < 60 * 1024,
    });
  } catch {
    // ignore — best effort
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    onWorkspacePageHide();
  });
}

export function lineNet(rate: number, qty: number, termPercent: number) {
  return (rate * qty * termPercent) / 100;
}

/** Qty may be negative (credit / reversal lines); zero or non-numeric is not a line. */
export function isValidInvoiceQty(qty: number): boolean {
  return Number.isFinite(qty) && Math.abs(qty) > QTY_EPS;
}

function recalcInvoiceLines(lines: InvoiceLine[]): InvoiceLine[] {
  return lines.map((l) => {
    const billedQty = Number(l.billedQty) || 0;
    const rate = Number(l.rate) || 0;
    const termPercent = Number(l.termPercent) || 0;
    return {
      ...l,
      billedQty,
      rate,
      termPercent,
      lineNet: lineNet(rate, billedQty, termPercent),
    };
  });
}

export function upsertCatalog(
  data: FlowhubData,
  name: string,
  unit: string,
  rate: number
): { data: FlowhubData; catalogKey: string } {
  const key = name.trim().toLowerCase();
  const existing = data.itemCatalog.find((c) => c.key === key);
  let itemCatalog: ItemCatalogEntry[];
  if (existing) {
    itemCatalog = data.itemCatalog.map((c) =>
      c.key === key ? { ...c, unit, lastRate: rate, name: name.trim() } : c
    );
  } else {
    itemCatalog = [
      ...data.itemCatalog,
      { key, name: name.trim(), unit, lastRate: rate },
    ];
  }
  return { data: { ...data, itemCatalog }, catalogKey: key };
}

/** Persist a BOQ item name into the catalog as soon as it is entered. */
export function rememberCatalogItem(name: string, unit: string, rate: number) {
  const data = read();
  const { data: next } = upsertCatalog(data, name, unit, rate);
  write(next);
}

/**
 * Master item-list edit. A new name renames the item. An existing name
 * combines into that item. `unit` is the unit Master saved for it.
 */
export function renameItem(fromName: string, toName: string, unit?: string) {
  if (workspaceWritesLocked) {
    return { ok: false as const, error: "This login cannot save changes." };
  }
  const current = read();
  const result = renameItemRecords(current, fromName, toName, unit);
  if (!result.ok) return result;
  if (result.data !== current) write(result.data);
  return result;
}

function systemTask(
  title: string,
  contractId: string,
  catalogKey: TaskCatalogKey
): Task {
  return {
    id: crypto.randomUUID(),
    title,
    contractId,
    department: null,
    assignees: [],
    status: "pending",
    dueDate: null,
    parentId: null,
    source: "system",
    catalogKey,
    priority: "normal",
    notes: "",
    notesUpdatedAt: null,
    completedAt: null,
    notRequiredReason: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function addContract(
  contract: Omit<
    Contract,
    | "id"
    | "createdAt"
    | "status"
    | "amendments"
    | "expenses"
    | "guaranteeEdits"
    | "abgNumber"
    | "abgDate"
    | "abgExpiry"
    | "abgBankName"
    | "abgRetrieved"
    | "abgRetrievedDate"
    | "pbgNumber"
    | "pbgDate"
    | "pbgExpiry"
    | "pbgBankName"
    | "pbgRetrieved"
    | "pbgRetrievedDate"
    | "retentionRecoveredAt"
    | "handoverDate"
  >
): { contract: Contract; tasks: Task[] } {
  const data = read();
  let next = data;
  const boq = contract.boq.map((line) => {
    const res = upsertCatalog(next, line.name, line.unit, line.rate);
    next = res.data;
    return { ...line, catalogKey: res.catalogKey };
  });

  const abgPercent = contract.abgRequired ? contract.abgPercent : null;
  const pbgPercent = contract.pbgRequired ? contract.pbgPercent : null;

  const full: Contract = normalizeContract({
    ...contract,
    tdsPercent:
      typeof contract.tdsPercent === "number"
        ? contract.tdsPercent
        : DEFAULT_TDS_PERCENT,
    boq,
    abgPercent,
    abgValue: guaranteeAmount(contract.orderValue, abgPercent),
    pbgPercent,
    pbgValue: guaranteeAmount(contract.orderValue, pbgPercent),
    contractorAssigned: contract.contractorAssigned ?? "",
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    abgNumber: null,
    abgDate: null,
    abgExpiry: null,
    abgBankName: null,
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgNumber: null,
    pbgDate: null,
    pbgExpiry: null,
    pbgBankName: null,
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    retentionRecoveredAt: null,
    handoverDate: null,
    id: crypto.randomUUID(),
    status: "active",
    createdAt: new Date().toISOString(),
  });

  const tasks: Task[] = [
    systemTask("Kick off meeting pending", full.id, "kickoff"),
  ];
  if (full.abgRequired) {
    tasks.push(
      systemTask(`Create ABG — ${full.projectNo}`, full.id, "create_abg")
    );
  }
  if (full.pbgRequired) {
    tasks.push(
      systemTask(`Create PBG — ${full.projectNo}`, full.id, "create_pbg")
    );
  }

  write({
    ...next,
    contracts: [...next.contracts, full],
    tasks: [...next.tasks, ...tasks],
  });
  return { contract: full, tasks };
}

export function updateContract(
  id: string,
  patch: Partial<Contract>,
  opts?: { editedBy?: string; trackGuarantee?: "ABG" | "PBG" | "both" }
): Contract | null {
  const data = read();
  const current = data.contracts.find((c) => c.id === id);
  if (!current) return null;

  const nextPatch = { ...patch };
  if ("handoverDate" in nextPatch) {
    const accepted = acceptedHandoverDate(nextPatch.handoverDate);
    if (!accepted) delete nextPatch.handoverDate;
    else nextPatch.handoverDate = accepted;
  }
  if (nextPatch.status !== undefined) {
    const preview: FlowhubData = {
      ...data,
      contracts: data.contracts.map((c) =>
        c.id === id ? { ...c, ...nextPatch, id } : c
      ),
    };
    const handedOver = contractIsHandedOver(preview, id, nexusTodayIso());
    if (handedOver) {
      nextPatch.status = "completed";
    } else if (contractStatusLabel(String(nextPatch.status)) === "Completed") {
      // Completed follows handover. It cannot be set by hand.
      delete nextPatch.status;
    } else if (contractStatusLabel(String(nextPatch.status)) === "On hold") {
      nextPatch.status = "on_hold";
    } else {
      nextPatch.status = "active";
    }
  }
  // Retrieved guarantees are locked, including the rupee amount.
  if (current.abgRetrieved || nextPatch.abgRetrieved) delete nextPatch.abgValue;
  if (current.pbgRetrieved || nextPatch.pbgRetrieved) delete nextPatch.pbgValue;
  // Not-required is only available until number, creation date, and bank are saved.
  if (
    nextPatch.abgRequired === false &&
    current.abgRequired &&
    guaranteeIdentitySaved(
      current.abgNumber,
      current.abgDate,
      current.abgBankName
    )
  ) {
    delete nextPatch.abgRequired;
  }
  if (
    nextPatch.pbgRequired === false &&
    current.pbgRequired &&
    guaranteeIdentitySaved(
      current.pbgNumber,
      current.pbgDate,
      current.pbgBankName
    )
  ) {
    delete nextPatch.pbgRequired;
  }

  let updated = normalizeContract({ ...current, ...nextPatch, id });
  updated = keepEnteredLaterGuaranteeAmount(current, nextPatch, updated);
  const track = opts?.trackGuarantee;
  if (track) {
    const kinds: Array<"ABG" | "PBG"> =
      track === "both" ? ["ABG", "PBG"] : [track];
    const records: GuaranteeEditRecord[] = kinds.map((kind) => ({
      id: crypto.randomUUID(),
      kind,
      at: new Date().toISOString(),
      by: opts?.editedBy ?? "Unknown",
      summary:
        kind === "ABG"
          ? `ABG ${updated.abgNumber ?? "—"} · ${formatDisplayDate(updated.abgDate)} · exp ${formatDisplayDate(updated.abgExpiry)}${
              updated.abgBankName ? ` · ${updated.abgBankName}` : ""
            }${
              updated.abgRetrieved
                ? ` · retrieved ${formatDisplayDate(updated.abgRetrievedDate)}`
                : ""
            }`
          : `PBG ${updated.pbgNumber ?? "—"} · ${formatDisplayDate(updated.pbgDate)} · exp ${formatDisplayDate(updated.pbgExpiry)}${
              updated.pbgBankName ? ` · ${updated.pbgBankName}` : ""
            }${
              updated.pbgRetrieved
                ? ` · retrieved ${formatDisplayDate(updated.pbgRetrievedDate)}`
                : ""
            }`,
    }));
    updated = {
      ...updated,
      guaranteeEdits: [...(updated.guaranteeEdits ?? []), ...records],
    };
  }

  let tasks = data.tasks;

  if (current.abgRequired && !updated.abgRequired) {
    tasks = closeGuaranteeTasks(tasks, id, "ABG");
  }
  if (current.pbgRequired && !updated.pbgRequired) {
    tasks = closeGuaranteeTasks(tasks, id, "PBG");
  }

  if (!current.abgRequired && updated.abgRequired && !updated.abgRetrieved) {
    tasks = openCreateGuaranteeTask(tasks, updated, "ABG");
  }
  if (!current.pbgRequired && updated.pbgRequired && !updated.pbgRetrieved) {
    tasks = openCreateGuaranteeTask(tasks, updated, "PBG");
  }

  if (
    updated.abgRequired &&
    updated.abgNumber &&
    updated.abgDate &&
    updated.abgExpiry
  ) {
    tasks = tasks.map((t) =>
      t.contractId === id &&
      t.source === "system" &&
      t.title.startsWith("Create ABG") &&
      t.status !== "completed"
        ? { ...t, status: "completed" as const }
        : t
    );
  }

  if (
    updated.pbgRequired &&
    updated.pbgNumber &&
    updated.pbgDate &&
    updated.pbgExpiry
  ) {
    tasks = tasks.map((t) =>
      t.contractId === id &&
      t.source === "system" &&
      t.title.startsWith("Create PBG") &&
      t.status !== "completed"
        ? { ...t, status: "completed" as const }
        : t
    );
  }

  // Retrieved BGs no longer need expiry chase — close open chase tasks.
  if (updated.abgRetrieved) {
    tasks = tasks.map((t) =>
      t.contractId === id &&
      t.catalogKey === "bg_expiry_abg" &&
      t.status !== "completed" &&
      t.status !== "not_required"
        ? { ...t, status: "not_required" as const }
        : t
    );
  }
  if (updated.pbgRetrieved) {
    tasks = tasks.map((t) =>
      t.contractId === id &&
      t.catalogKey === "bg_expiry_pbg" &&
      t.status !== "completed" &&
      t.status !== "not_required"
        ? { ...t, status: "not_required" as const }
        : t
    );
  }

  write({
    ...data,
    contracts: data.contracts.map((c) => (c.id === id ? updated : c)),
    tasks,
  });
  syncDatedSystemTasks();
  return updated;
}

export type BillingTermActionResult =
  | { ok: true; toKey?: string }
  | { ok: false; error: string };

/**
 * Rename a custom term on a saved contract and move that termKey on this
 * contract’s invoice lines. Percents, quantities, rates, and amounts stay.
 */
export function renameContractBillingTerm(
  contractId: string,
  fromKey: string,
  rawName: string
): BillingTermActionResult {
  const data = read();
  const current = data.contracts.find((c) => c.id === contractId);
  if (!current) return { ok: false, error: "Contract not found." };
  const renamed = renameCustomBillingTerm(current.billingTerms, fromKey, rawName);
  if (!renamed.ok) return renamed;
  if (renamed.toKey === fromKey) return { ok: true, toKey: fromKey };

  const invoices = invoicesWithRenamedTerms(data.invoices, contractId, [
    [fromKey, renamed.toKey],
  ]);

  write({
    ...data,
    contracts: data.contracts.map((c) =>
      c.id === contractId ? { ...c, billingTerms: renamed.terms } : c
    ),
    invoices,
  });
  return { ok: true, toKey: renamed.toKey };
}

/**
 * Delete a custom term. Refuses when any invoice on this contract uses it.
 * Confirmation is left to the page.
 */
export function deleteContractBillingTerm(
  contractId: string,
  key: string
): BillingTermActionResult {
  const data = read();
  const current = data.contracts.find((c) => c.id === contractId);
  if (!current) return { ok: false, error: "Contract not found." };
  const removed = deleteCustomBillingTerm(current.billingTerms, key);
  if (!removed.ok) return removed;
  const used = data.invoices.some(
    (invoice) =>
      invoice.contractId === contractId &&
      invoice.lines.some((line) => line.termKey === key)
  );
  if (used) {
    return {
      ok: false,
      error: "This term is used on an invoice and cannot be deleted.",
    };
  }
  write({
    ...data,
    contracts: data.contracts.map((c) =>
      c.id === contractId ? { ...c, billingTerms: removed.terms } : c
    ),
  });
  return { ok: true };
}

/**
 * Save percents for the terms already on the contract. Does not rename,
 * delete, or rewrite invoice lines. Total must be within 0.01 of 100.
 */
export function saveContractBillingTerms(
  contractId: string,
  terms: BillingTerms
): BillingTermActionResult {
  const data = read();
  const current = data.contracts.find((c) => c.id === contractId);
  if (!current) return { ok: false, error: "Contract not found." };

  const currentKeys = Object.keys(current.billingTerms).sort();
  const nextKeys = Object.keys(terms).sort();
  if (
    currentKeys.length !== nextKeys.length ||
    currentKeys.some((key, index) => key !== nextKeys[index])
  ) {
    return {
      ok: false,
      error: "Save percents for the current terms. Rename and delete are separate.",
    };
  }

  const next: BillingTerms = {};
  for (const key of currentKeys) {
    const value = Number(terms[key]);
    if (!Number.isFinite(value) || value < 0) {
      return {
        ok: false,
        error: "Each billing term percent must be zero or more.",
      };
    }
    next[key] = value;
  }
  if (!billingTermsTotalIs100(next)) {
    const total = billingTermsTotal(next);
    return {
      ok: false,
      error: `Billing terms must total 100% (currently ${total}%).`,
    };
  }

  write({
    ...data,
    contracts: data.contracts.map((c) =>
      c.id === contractId ? { ...c, billingTerms: next } : c
    ),
  });
  return { ok: true };
}

export function contractInvoiceUsesBillingTerm(
  contractId: string,
  termKey: string
): boolean {
  return read().invoices.some(
    (invoice) =>
      invoice.contractId === contractId &&
      invoice.lines.some((line) => line.termKey === termKey)
  );
}

function billingTermNamesCollide(terms: BillingTerms): boolean {
  const seen = new Set<string>();
  for (const key of Object.keys(terms)) {
    const folded = key.toLowerCase();
    if (seen.has(folded)) return true;
    seen.add(folded);
  }
  return false;
}

function hasOwnTerm(terms: BillingTerms, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(terms, key);
}

/**
 * Move termKey on this contract's invoice lines. Other line fields and
 * invoice amounts stay as stored.
 */
function invoicesWithRenamedTerms(
  invoices: Invoice[],
  contractId: string,
  renames: Array<[string, string]>
): Invoice[] {
  const renameTo = new Map(renames.filter(([fromKey, toKey]) => fromKey !== toKey));
  if (renameTo.size === 0) return invoices;
  return invoices.map((invoice) => {
    if (invoice.contractId !== contractId) return invoice;
    if (!invoice.lines.some((line) => renameTo.has(line.termKey))) return invoice;
    return {
      ...invoice,
      lines: invoice.lines.map((line) => {
        const toKey = renameTo.get(line.termKey);
        return toKey ? { ...line, termKey: toKey } : line;
      }),
    };
  });
}

/**
 * Save one billing-term edit. `origins` maps a draft key that came from a
 * saved term to that saved key. Added terms have no origin. A saved custom
 * term that is neither kept nor renamed is deleted.
 * The write is skipped unless the draft totals 100% and no deleted term is
 * on an invoice. Invoice lines change only termKey, and only for a rename.
 */
export function commitContractBillingTerms(
  contractId: string,
  nextTerms: BillingTerms,
  origins: Record<string, string>
): BillingTermActionResult {
  const data = read();
  const current = data.contracts.find((c) => c.id === contractId);
  if (!current) return { ok: false, error: "Contract not found." };

  if (billingTermNamesCollide(nextTerms)) {
    return { ok: false, error: "A term with that name already exists." };
  }

  const originValues = new Set<string>();
  const renames: Array<[string, string]> = [];
  for (const [draftKey, originalKey] of Object.entries(origins)) {
    if (!hasOwnTerm(nextTerms, draftKey) || !hasOwnTerm(current.billingTerms, originalKey)) {
      return { ok: false, error: "That billing term is not on this contract." };
    }
    if (originValues.has(originalKey)) {
      return { ok: false, error: "A term with that name already exists." };
    }
    originValues.add(originalKey);
    if (
      (isBuiltinBillingTerm(originalKey) || isBuiltinBillingTerm(draftKey)) &&
      draftKey !== originalKey
    ) {
      return { ok: false, error: "Built-in billing terms cannot be renamed." };
    }
    if (draftKey !== originalKey) renames.push([originalKey, draftKey]);
  }

  for (const key of Object.keys(current.billingTerms)) {
    if (!isBuiltinBillingTerm(key)) continue;
    if (!hasOwnTerm(nextTerms, key)) {
      return { ok: false, error: "Built-in billing terms cannot be deleted." };
    }
  }

  for (const key of Object.keys(current.billingTerms)) {
    if (isBuiltinBillingTerm(key)) continue;
    if (originValues.has(key) || hasOwnTerm(nextTerms, key)) continue;
    if (contractInvoiceUsesBillingTerm(contractId, key)) {
      return {
        ok: false,
        error: "This term is used on an invoice and cannot be deleted.",
      };
    }
  }

  const next: BillingTerms = {};
  for (const key of Object.keys(nextTerms)) {
    const value = Number(nextTerms[key]);
    if (!Number.isFinite(value) || value < 0) {
      return {
        ok: false,
        error: "Each billing term percent must be zero or more.",
      };
    }
    next[key] = value;
  }
  if (!billingTermsTotalIs100(next)) {
    const total = billingTermsTotal(next);
    return {
      ok: false,
      error: `Billing terms must total 100% (currently ${total}%).`,
    };
  }

  const invoices = invoicesWithRenamedTerms(data.invoices, contractId, renames);
  write({
    ...data,
    contracts: data.contracts.map((c) =>
      c.id === contractId ? { ...c, billingTerms: next } : c
    ),
    invoices,
  });
  return { ok: true };
}

/**
 * A later save that marks ABG or PBG required keeps a typed rupee amount.
 * It is not replaced by percent × order value. An empty amount still follows
 * the existing rule: percent × order value is only the starting figure when
 * no amount has been stored. Amounts already saved on a required guarantee
 * are left to that same rule.
 */
function keepEnteredLaterGuaranteeAmount(
  current: Contract,
  patch: Partial<Contract>,
  updated: Contract
): Contract {
  let next = updated;
  if (
    !current.abgRequired &&
    patch.abgRequired === true &&
    !current.abgRetrieved &&
    !patch.abgRetrieved &&
    typeof patch.abgValue === "number" &&
    Number.isFinite(patch.abgValue)
  ) {
    next = { ...next, abgValue: patch.abgValue };
  }
  if (
    !current.pbgRequired &&
    patch.pbgRequired === true &&
    !current.pbgRetrieved &&
    !patch.pbgRetrieved &&
    typeof patch.pbgValue === "number" &&
    Number.isFinite(patch.pbgValue)
  ) {
    next = { ...next, pbgValue: patch.pbgValue };
  }
  return next;
}

/**
 * Open a Create ABG / Create PBG task the same way a new contract does,
 * when a guarantee becomes required before number, date, and expiry are saved.
 * A save that already has those three leaves no open Create task.
 */
function openCreateGuaranteeTask(
  tasks: Task[],
  contract: Contract,
  kind: "ABG" | "PBG"
): Task[] {
  const catalogKey = kind === "ABG" ? "create_abg" : "create_pbg";
  const number = kind === "ABG" ? contract.abgNumber : contract.pbgNumber;
  const date = kind === "ABG" ? contract.abgDate : contract.pbgDate;
  const expiry = kind === "ABG" ? contract.abgExpiry : contract.pbgExpiry;
  if (number && date && expiry) return tasks;
  if (hasOpenCatalogTask(tasks, contract.id, catalogKey)) return tasks;
  const title =
    kind === "ABG"
      ? `Create ABG — ${contract.projectNo}`
      : `Create PBG — ${contract.projectNo}`;
  return [...tasks, systemTask(title, contract.id, catalogKey)];
}

/** Mark open Create and expiry-chase tasks not required, including their subtasks. */
function closeGuaranteeTasks(
  tasks: Task[],
  contractId: string,
  kind: "ABG" | "PBG"
): Task[] {
  const createKey = kind === "ABG" ? "create_abg" : "create_pbg";
  const expiryKey = kind === "ABG" ? "bg_expiry_abg" : "bg_expiry_pbg";
  const titlePrefix = kind === "ABG" ? "Create ABG" : "Create PBG";
  const reason = `${kind} marked not required`;
  const parentIds = new Set(
    tasks
      .filter(
        (t) =>
          t.contractId === contractId &&
          !t.parentId &&
          taskIsOpen(t) &&
          (t.catalogKey === createKey ||
            t.catalogKey === expiryKey ||
            (t.source === "system" && t.title.startsWith(titlePrefix)))
      )
      .map((t) => t.id)
  );
  if (parentIds.size === 0) return tasks;
  return tasks.map((t) => {
    const hit =
      parentIds.has(t.id) ||
      (t.parentId != null && parentIds.has(t.parentId) && taskIsOpen(t));
    if (!hit) return t;
    return applyStatusFields(t, "not_required", {
      notRequiredReason: reason,
    });
  });
}

function catalogKeysInUse(contracts: Contract[]): Set<string> {
  const used = new Set<string>();
  const add = (name?: string | null, key?: string | null) => {
    const n = (name ?? "").trim().toLowerCase();
    const k = (key ?? "").trim().toLowerCase();
    if (n) used.add(n);
    if (k) used.add(k);
  };
  for (const c of contracts) {
    for (const line of c.boq ?? []) add(line.name, line.catalogKey);
    for (const amendment of c.amendments ?? []) {
      for (const line of amendment.boqSnapshot ?? []) add(line.name, line.catalogKey);
      for (const diff of amendment.lineDiffs ?? []) add(diff.name, null);
    }
  }
  return used;
}

export function deleteContract(id: string): boolean {
  const data = read();
  if (!data.contracts.some((c) => c.id === id)) return false;
  const contracts = data.contracts.filter((c) => c.id !== id);
  const removedTaskIds = new Set(
    data.tasks.filter((t) => t.contractId === id).map((t) => t.id)
  );
  const usedNames = catalogKeysInUse(contracts);
  const next: FlowhubData = {
    ...data,
    contracts,
    tasks: data.tasks.filter((t) => t.contractId !== id),
    invoices: data.invoices.filter((i) => i.contractId !== id),
    payments: data.payments.filter((p) => p.contractId !== id),
    schedules: data.schedules.filter((s) => s.contractId !== id),
    scheduleChangeLog: (data.scheduleChangeLog ?? []).filter(
      (e) => e.contractId !== id
    ),
    notifications: (data.notifications ?? []).filter(
      (n) =>
        n.contractId !== id && !(n.taskId && removedTaskIds.has(n.taskId))
    ),
    itemCatalog: (data.itemCatalog ?? []).filter((entry) => {
      const key = (entry.key || "").trim().toLowerCase();
      const name = (entry.name || "").trim().toLowerCase();
      return (key && usedNames.has(key)) || (name && usedNames.has(name));
    }),
    deliveryChallans: (data.deliveryChallans ?? []).filter(
      (dc) => dc.contractId !== id
    ),
    installationProgress: (data.installationProgress ?? []).filter(
      (p) => p.contractId !== id
    ),
    nexusCosts: dropContractCosts(data.nexusCosts, id),
  };
  write(next);
  return true;
}

/** Remove every schedule change-log row. Schedule lines are left in place. */
export function clearScheduleChangeLog(): boolean {
  const data = read();
  if ((data.scheduleChangeLog ?? []).length === 0) return false;
  write({ ...data, scheduleChangeLog: [] });
  return true;
}

/** Remove every task-deadline log row. Tasks are left in place. */
export function clearTaskDeadlineChangeLog(): boolean {
  const data = read();
  if ((data.taskDeadlineChangeLog ?? []).length === 0) return false;
  write({ ...data, taskDeadlineChangeLog: [] });
  return true;
}

function dropContractCosts(
  raw: NexusCosts | undefined,
  contractId: string
): NexusCosts {
  const costs = normalizeNexusCosts(raw);
  if (!costs.contracts[contractId]) return costs;
  const contracts = { ...costs.contracts };
  delete contracts[contractId];
  return { ...costs, contracts };
}

export function computeBoqLineDiffs(
  previous: BoqItem[],
  next: BoqItem[]
): BoqAmendmentLineDiff[] {
  const diffs: BoqAmendmentLineDiff[] = [];
  const nextById = new Map(next.map((l) => [l.id, l]));
  const prevIds = new Set(previous.map((l) => l.id));
  for (const p of previous) {
    const n = nextById.get(p.id);
    if (!n) {
      diffs.push({
        boqItemId: p.id,
        name: p.name,
        unit: p.unit,
        rate: p.rate,
        kind: "removed",
        previousQty: p.quantity,
        newQty: null,
      });
    } else if (Math.abs((Number(n.quantity) || 0) - (Number(p.quantity) || 0)) > QTY_EPS) {
      diffs.push({
        boqItemId: p.id,
        name: p.name,
        unit: p.unit,
        rate: p.rate,
        kind: "qty_changed",
        previousQty: p.quantity,
        newQty: Number(n.quantity) || 0,
      });
    }
  }
  for (const n of next) {
    if (prevIds.has(n.id)) continue;
    diffs.push({
      boqItemId: n.id,
      name: n.name,
      unit: n.unit,
      rate: n.rate,
      kind: "added",
      previousQty: null,
      newQty: Number(n.quantity) || 0,
    });
  }
  return diffs;
}

/**
 * Blocking problems with a proposed amended BOQ.
 * A schedule on the contract stops the save. Supplied, installed, and
 * invoiced quantities do not. The rate on an existing line cannot change.
 */
export function boqAmendmentIssues(
  contractId: string,
  proposed: BoqItem[],
  data?: FlowhubData
): string[] {
  const d = data ?? read();
  const contract = d.contracts.find((c) => c.id === contractId);
  if (!contract) return ["Contract not found."];
  const schedule = scheduleStopMessage(contract, d.schedules);
  if (schedule) return [schedule];
  const issues: string[] = [];
  if (proposed.length === 0) issues.push("BOQ needs at least one line.");
  const names = new Set<string>();
  for (const l of proposed) {
    const name = l.name.trim();
    if (!name) {
      issues.push("Every BOQ line needs an item name.");
      continue;
    }
    const key = name.toLowerCase();
    if (names.has(key)) issues.push(`Duplicate BOQ item: ${name}.`);
    names.add(key);
    if (!(Number(l.rate) > 0)) issues.push(`Rate must be > 0 for ${name}.`);
    const qty = Number(l.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      issues.push(`Qty must be > 0 for ${name} (remove the line instead).`);
    }
  }
  issues.push(...existingLineRateIssues(contract.boq, proposed));
  return issues;
}

export function nextAmendmentSeq(contract: Contract): number {
  return (
    (contract.amendments ?? []).reduce((m, a) => Math.max(m, a.seq || 0), 0) + 1
  );
}

export type AmendBoqResult =
  | { ok: true; amendment: BoqAmendment; contract: Contract }
  | { ok: false; error: string };

/**
 * Confirm a BOQ amendment: records it on the contract, replaces the BOQ,
 * sets orderValue to the confirmed figure. A saved ABG or PBG amount
 * stays as saved. Closes any
 * open "Finalise BOQ amendment" task for the contract.
 */
export function amendContractBoq(input: {
  contractId: string;
  boq: BoqItem[];
  newOrderValue: number;
  date: string;
  number?: string;
  note?: string;
  by?: string | null;
}): AmendBoqResult {
  const data = read();
  const current = data.contracts.find((c) => c.id === input.contractId);
  if (!current) return { ok: false, error: "Contract not found." };

  const proposed: BoqItem[] = input.boq.map((l) => ({
    ...l,
    id: l.id || crypto.randomUUID(),
    name: l.name.trim(),
    unit: l.unit.trim() || "Nos",
    rate: Number(l.rate) || 0,
    quantity: Number(l.quantity) || 0,
  }));
  const issues = boqAmendmentIssues(current.id, proposed, data);
  if (issues.length) return { ok: false, error: issues[0] };

  const date = (input.date || "").slice(0, 10);
  if (!date) return { ok: false, error: "Amendment date is required." };
  const newOrderValue = Number(input.newOrderValue);
  if (!Number.isFinite(newOrderValue) || newOrderValue <= 0)
    return { ok: false, error: "Confirmed contract value must be > 0." };

  const lineDiffs = computeBoqLineDiffs(current.boq, proposed);
  const valueChanged = Math.abs(newOrderValue - current.orderValue) > 0.005;
  if (!lineDiffs.length && !valueChanged)
    return { ok: false, error: "No BOQ changes to amend." };

  const seq = nextAmendmentSeq(current);
  const number = (input.number ?? "").trim() || defaultAmendmentNumber(seq);
  if (
    current.amendments.some(
      (a) => a.number.trim().toLowerCase() === number.toLowerCase()
    )
  ) {
    return { ok: false, error: `Amendment no. ${number} already exists.` };
  }

  let next = data;
  const boq = proposed.map((line) => {
    const res = upsertCatalog(next, line.name, line.unit, line.rate);
    next = res.data;
    return { ...line, catalogKey: line.catalogKey || res.catalogKey };
  });
  const carries = rateChangeCarries(current.boq, boq);
  next = {
    ...next,
    deliveryChallans: remapDeliveryChallans(
      next.deliveryChallans,
      current.id,
      carries
    ),
    installationProgress: remapInstallation(
      next.installationProgress,
      current.id,
      carries
    ),
  };

  const amendment: BoqAmendment = {
    id: crypto.randomUUID(),
    seq,
    number,
    date,
    at: new Date().toISOString(),
    by: input.by?.trim() || null,
    note: (input.note ?? "").trim(),
    previousOrderValue: current.orderValue,
    newOrderValue,
    previousBoqTotal: boqTotal(current.boq),
    newBoqTotal: boqTotal(boq),
    lineDiffs,
    boqSnapshot: boq.map((l) => ({ ...l })),
  };

  const updated = normalizeContract({
    ...current,
    boq,
    orderValue: newOrderValue,
    amendments: [...current.amendments, amendment],
  });

  const now = new Date().toISOString();
  const tasks = next.tasks.map((t) =>
    t.contractId === current.id &&
    t.catalogKey === "boq_amendment" &&
    taskIsOpen(t)
      ? {
          ...t,
          status: "completed" as const,
          completedAt: now,
          notes: t.notes || `Amendment ${number} confirmed.`,
          notesUpdatedAt: t.notes ? t.notesUpdatedAt : now,
        }
      : t
  );

  write({
    ...next,
    contracts: next.contracts.map((c) => (c.id === current.id ? updated : c)),
    tasks,
  });
  syncDatedSystemTasks();
  return { ok: true, amendment, contract: updated };
}

export type DeleteAmendmentResult =
  | { ok: true; contract: Contract }
  | { ok: false; error: string };

/**
 * Delete the latest amendment and restore the previous BOQ and order value.
 * Supplied and installed quantities that moved onto a new line move back.
 * Invoices and cash are left as recorded.
 */
export function deleteLatestAmendment(
  contractId: string
): DeleteAmendmentResult {
  const data = read();
  const current = data.contracts.find((c) => c.id === contractId);
  if (!current) return { ok: false, error: "Contract not found." };
  const ordered = [...(current.amendments ?? [])].sort((a, b) => a.seq - b.seq);
  const latest = ordered[ordered.length - 1];
  if (!latest) return { ok: false, error: "No amendment to delete." };
  const error = amendmentDeleteError({
    contract: current,
    invoices: data.invoices,
    deliveryChallans: data.deliveryChallans,
    installationProgress: data.installationProgress,
    schedules: data.schedules,
  });
  if (error) return { ok: false, error };

  const boq = boqBeforeAmendment(current, latest);
  const carries = undoRateChangeCarries(latest.lineDiffs);
  const next = {
    ...data,
    deliveryChallans: remapDeliveryChallans(
      data.deliveryChallans,
      current.id,
      carries
    ),
    installationProgress: remapInstallation(
      data.installationProgress,
      current.id,
      carries
    ),
  };
  const updated = normalizeContract({
    ...current,
    boq,
    orderValue: latest.previousOrderValue,
    amendments: current.amendments.filter((row) => row.id !== latest.id),
  });
  write({
    ...next,
    contracts: next.contracts.map((c) => (c.id === current.id ? updated : c)),
  });
  return { ok: true, contract: updated };
}

export type EditAmendmentInput = {
  contractId: string;
  boq: BoqItem[];
  newOrderValue: number;
  date: string;
  number?: string;
  note?: string;
  by?: string | null;
};

export type EditAmendmentDataResult =
  | { ok: true; data: FlowhubData; amendment: BoqAmendment; contract: Contract }
  | { ok: false; error: string };

/**
 * Replace the latest amendment. Does not append one.
 * The same schedule, billing, supply, and installation stops as delete apply.
 * Supplied and installed quantities move when a removed name is added back.
 */
export function editLatestAmendmentIn(
  data: FlowhubData,
  input: EditAmendmentInput
): EditAmendmentDataResult {
  const current = data.contracts.find((c) => c.id === input.contractId);
  if (!current) return { ok: false, error: "Contract not found." };
  const ordered = [...(current.amendments ?? [])].sort((a, b) => a.seq - b.seq);
  const latest = ordered[ordered.length - 1];
  if (!latest) return { ok: false, error: "No amendment to delete." };
  const blocked = amendmentDeleteError({
    contract: current,
    invoices: data.invoices,
    deliveryChallans: data.deliveryChallans,
    installationProgress: data.installationProgress,
    schedules: data.schedules,
  });
  if (blocked) return { ok: false, error: blocked };

  const baseline = boqBeforeAmendment(current, latest);
  const proposed: BoqItem[] = input.boq.map((l) => ({
    ...l,
    id: l.id || crypto.randomUUID(),
    name: l.name.trim(),
    unit: l.unit.trim() || "Nos",
    rate: Number(l.rate) || 0,
    quantity: Number(l.quantity) || 0,
  }));
  if (proposed.length === 0) return { ok: false, error: "BOQ needs at least one line." };
  const names = new Set<string>();
  for (const line of proposed) {
    const name = line.name.trim();
    if (!name) return { ok: false, error: "Every BOQ line needs an item name." };
    const key = name.toLowerCase();
    if (names.has(key)) return { ok: false, error: `Duplicate BOQ item: ${name}.` };
    names.add(key);
    if (!(Number(line.rate) > 0)) {
      return { ok: false, error: `Rate must be > 0 for ${name}.` };
    }
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return {
        ok: false,
        error: `Qty must be > 0 for ${name} (remove the line instead).`,
      };
    }
  }
  const rateIssue = existingLineRateIssues(baseline, proposed)[0];
  if (rateIssue) return { ok: false, error: rateIssue };

  const date = (input.date || "").slice(0, 10);
  if (!date) return { ok: false, error: "Amendment date is required." };
  const newOrderValue = Number(input.newOrderValue);
  if (!Number.isFinite(newOrderValue) || newOrderValue <= 0) {
    return { ok: false, error: "Confirmed contract value must be > 0." };
  }
  const lineDiffs = computeBoqLineDiffs(baseline, proposed);
  const valueChanged =
    Math.abs(newOrderValue - latest.previousOrderValue) > 0.005;
  if (!lineDiffs.length && !valueChanged) {
    return { ok: false, error: "No BOQ changes to amend." };
  }
  const number = (input.number ?? "").trim() || latest.number;
  if (
    current.amendments.some(
      (row) =>
        row.id !== latest.id &&
        row.number.trim().toLowerCase() === number.toLowerCase()
    )
  ) {
    return { ok: false, error: `Amendment no. ${number} already exists.` };
  }

  let next = data;
  const boq = proposed.map((line) => {
    const res = upsertCatalog(next, line.name, line.unit, line.rate);
    next = res.data;
    return { ...line, catalogKey: line.catalogKey || res.catalogKey };
  });
  const undo = undoRateChangeCarries(latest.lineDiffs);
  const forward = rateChangeCarries(baseline, boq);
  next = {
    ...next,
    deliveryChallans: remapDeliveryChallans(
      remapDeliveryChallans(next.deliveryChallans, current.id, undo),
      current.id,
      forward
    ),
    installationProgress: remapInstallation(
      remapInstallation(next.installationProgress, current.id, undo),
      current.id,
      forward
    ),
  };
  const amendment: BoqAmendment = {
    ...latest,
    number,
    date,
    at: new Date().toISOString(),
    by: input.by?.trim() || null,
    note: (input.note ?? "").trim(),
    previousOrderValue: latest.previousOrderValue,
    newOrderValue,
    previousBoqTotal: boqTotal(baseline),
    newBoqTotal: boqTotal(boq),
    lineDiffs,
    boqSnapshot: boq.map((line) => ({ ...line })),
  };
  const updated = normalizeContract({
    ...current,
    boq,
    orderValue: newOrderValue,
    amendments: current.amendments.map((row) =>
      row.id === latest.id ? amendment : row
    ),
  });
  const saved: FlowhubData = {
    ...next,
    contracts: next.contracts.map((c) => (c.id === current.id ? updated : c)),
  };
  return { ok: true, data: saved, amendment, contract: updated };
}

/** Save over the latest amendment. A blocked edit uses the delete message. */
export function editLatestAmendment(
  input: EditAmendmentInput
): AmendBoqResult {
  const result = editLatestAmendmentIn(read(), input);
  if (!result.ok) return result;
  write(result.data);
  return { ok: true, amendment: result.amendment, contract: result.contract };
}

export type BoqLineUseKind = "invoice" | "schedule" | "delivery challan";

/** Where this BOQ line is already used. Installation alone does not count. */
export function boqLineUseKinds(
  contractId: string,
  boqItemId: string,
  data?: FlowhubData
): BoqLineUseKind[] {
  const d = data ?? read();
  const kinds: BoqLineUseKind[] = [];
  if (
    d.invoices.some(
      (i) =>
        i.contractId === contractId &&
        i.lines.some((l) => l.boqItemId === boqItemId)
    )
  ) {
    kinds.push("invoice");
  }
  if (
    d.schedules.some(
      (s) => s.contractId === contractId && s.boqItemId === boqItemId
    )
  ) {
    kinds.push("schedule");
  }
  if (
    d.deliveryChallans.some(
      (dc) =>
        dc.contractId === contractId &&
        dc.lines.some((l) => l.boqItemId === boqItemId)
    )
  ) {
    kinds.push("delivery challan");
  }
  return kinds;
}

export function boqLineIsUsed(
  contractId: string,
  boqItemId: string,
  data?: FlowhubData
): boolean {
  return boqLineUseKinds(contractId, boqItemId, data).length > 0;
}

function boqUsePhrase(kinds: BoqLineUseKind[]): string {
  const parts = kinds.map((k) =>
    k === "invoice"
      ? "an invoice"
      : k === "schedule"
        ? "a schedule"
        : "a delivery challan"
  );
  if (parts.length <= 1) return parts[0] ?? "a record";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** Short label for the editor, or null when the line is unused. */
export function describeBoqLineUse(
  contractId: string,
  boqItemId: string,
  data?: FlowhubData
): string | null {
  const kinds = boqLineUseKinds(contractId, boqItemId, data);
  if (!kinds.length) return null;
  return boqUsePhrase(kinds);
}

function normalizePlainBoqLine(l: BoqItem): BoqItem {
  const rate = Number(l.rate);
  const quantity = Number(l.quantity);
  return {
    ...l,
    id: l.id || crypto.randomUUID(),
    name: (l.name || "").trim(),
    unit: (l.unit || "").trim() || "Nos",
    rate: Number.isFinite(rate) ? rate : Number.NaN,
    quantity: Number.isFinite(quantity) ? quantity : Number.NaN,
  };
}

function boqLinesDiffer(previous: BoqItem[], next: BoqItem[]): boolean {
  if (previous.length !== next.length) return true;
  for (let i = 0; i < previous.length; i++) {
    const a = previous[i];
    const b = next[i];
    if (!a || !b) return true;
    if (a.id !== b.id) return true;
    if (a.name.trim() !== b.name.trim()) return true;
    if ((a.unit || "").trim() !== (b.unit || "").trim()) return true;
    if (Math.abs((Number(a.rate) || 0) - (Number(b.rate) || 0)) > BOQ_EPS) {
      return true;
    }
    if (
      Math.abs((Number(a.quantity) || 0) - (Number(b.quantity) || 0)) > BOQ_EPS
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Problems with a plain BOQ edit. Used lines (invoice, schedule, or delivery
 * challan) cannot be deleted and keep their name and unit. Quantity and rate
 * may change, including a quantity below what is already billed, scheduled,
 * or delivered.
 */
export function boqPlainEditIssues(
  contractId: string,
  proposed: BoqItem[],
  data?: FlowhubData
): string[] {
  const d = data ?? read();
  const contract = d.contracts.find((c) => c.id === contractId);
  if (!contract) return ["Contract not found."];
  const issues: string[] = [];
  const lines = proposed.map(normalizePlainBoqLine);
  if (lines.length === 0) issues.push("BOQ needs at least one line.");
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const l of lines) {
    if (!l.name) {
      issues.push("Every BOQ line needs an item name.");
      continue;
    }
    const key = l.name.toLowerCase();
    if (names.has(key)) issues.push(`Duplicate BOQ item: ${l.name}.`);
    names.add(key);
    if (ids.has(l.id)) issues.push(`Duplicate BOQ line id for ${l.name}.`);
    ids.add(l.id);
    if (!Number.isFinite(l.rate) || l.rate < 0) {
      issues.push(`Rate cannot be negative for ${l.name}.`);
    }
    if (!Number.isFinite(l.quantity) || l.quantity < 0) {
      issues.push(`Qty cannot be negative for ${l.name}.`);
    }
    const original = contract.boq.find((b) => b.id === l.id);
    if (!original) continue;
    const kinds = boqLineUseKinds(contractId, original.id, d);
    if (!kinds.length) continue;
    const where = boqUsePhrase(kinds);
    if (original.name.trim() !== l.name) {
      issues.push(
        `${original.name} is already on ${where}, so its name stays locked.`
      );
    }
    if ((original.unit || "").trim() !== l.unit) {
      issues.push(
        `${original.name} is already on ${where}, so its unit stays locked.`
      );
    }
  }
  for (const b of contract.boq) {
    if (ids.has(b.id)) continue;
    const kinds = boqLineUseKinds(contractId, b.id, d);
    if (!kinds.length) continue;
    issues.push(
      `${b.name} is already on ${boqUsePhrase(kinds)} and cannot be deleted.`
    );
  }
  return issues;
}

export type EditBoqResult =
  | { ok: true; contract: Contract }
  | { ok: false; error: string };

/**
 * Replace the contract BOQ and set order value to the new BOQ total.
 * Does not record an amendment and does not open or complete a
 * Finalise BOQ amendment task. Saved ABG and PBG amounts stay as they are.
 */
export function editContractBoq(input: {
  contractId: string;
  boq: BoqItem[];
}): EditBoqResult {
  const data = read();
  const current = data.contracts.find((c) => c.id === input.contractId);
  if (!current) return { ok: false, error: "Contract not found." };

  const proposed = input.boq.map(normalizePlainBoqLine);
  const issues = boqPlainEditIssues(current.id, proposed, data);
  if (issues.length) return { ok: false, error: issues[0] };

  const newOrderValue = boqTotal(proposed);
  const linesChanged = boqLinesDiffer(current.boq, proposed);
  const valueChanged = Math.abs(newOrderValue - current.orderValue) > 0.005;
  if (!linesChanged && !valueChanged) {
    return { ok: false, error: "No BOQ changes to save." };
  }

  let next = data;
  const boq = proposed.map((line) => {
    const res = upsertCatalog(next, line.name, line.unit, line.rate);
    next = res.data;
    const original = current.boq.find((b) => b.id === line.id);
    const renamed =
      !original ||
      original.name.trim().toLowerCase() !== line.name.trim().toLowerCase();
    return {
      ...line,
      catalogKey: renamed ? res.catalogKey : line.catalogKey || res.catalogKey,
    };
  });

  const updated = normalizeContract({
    ...current,
    boq,
    orderValue: newOrderValue,
    amendments: current.amendments,
    abgValue: current.abgValue,
    pbgValue: current.pbgValue,
  });

  write({
    ...next,
    contracts: next.contracts.map((c) => (c.id === current.id ? updated : c)),
  });
  return { ok: true, contract: updated };
}

/**
 * Master replaces one BOQ line with an item that already exists.
 * The plain edit stays locked. This does not write the line's rate or
 * unit onto the shared catalog entry.
 */
export function replaceContractBoqItem(input: {
  contractId: string;
  boqItemId: string;
  itemKey: string;
  clearance: string | null | undefined;
}): EditBoqResult {
  if (workspaceWritesLocked) {
    return { ok: false, error: "This login cannot save changes." };
  }
  const current = read();
  const result = swapContractBoqItem(current, input);
  if (!result.ok) return result;
  if (result.data !== current) write(result.data);
  const contract = result.data.contracts.find((row) => row.id === input.contractId);
  if (!contract) return { ok: false, error: "Contract not found." };
  return { ok: true, contract };
}

export function listExpenseCategories(data?: FlowhubData): string[] {
  const d = data ?? read();
  const fromRows = d.contracts.flatMap((c) =>
    (c.expenses ?? []).map((e) => e.category).filter(Boolean)
  );
  const set = new Set<string>([
    ...SEED_EXPENSE_CATEGORIES,
    ...(d.expenseCategories ?? []),
    ...fromRows,
  ]);
  return [...set].sort((a, b) => a.localeCompare(b));
}

function rememberExpenseCategory(
  data: FlowhubData,
  category: string
): FlowhubData {
  const trimmed = category.trim();
  if (!trimmed) return data;
  if (
    SEED_EXPENSE_CATEGORIES.some(
      (c) => c.toLowerCase() === trimmed.toLowerCase()
    )
  ) {
    return data;
  }
  const existing = data.expenseCategories ?? [];
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return data;
  }
  return { ...data, expenseCategories: [...existing, trimmed] };
}

export function addExpense(
  contractId: string,
  expense: {
    amount: number;
    date: string;
    personPaid: string;
    reason: string;
    category: string;
  },
  opts?: { by?: string | null }
): ContractExpense | null {
  const data = read();
  const contract = data.contracts.find((c) => c.id === contractId);
  if (!contract) return null;
  if (!(Number(expense.amount) > 0)) return null;
  if (!expense.date?.trim()) return null;
  const category = expense.category.trim() || "Miscellaneous";
  const full: ContractExpense = {
    id: crypto.randomUUID(),
    amount: Number(expense.amount),
    date: expense.date,
    personPaid: expense.personPaid.trim(),
    reason: expense.reason.trim(),
    category,
    createdAt: new Date().toISOString(),
    createdBy: opts?.by?.trim() || null,
    editHistory: [],
    deletedAt: null,
    deletedBy: null,
  };
  const withCat = rememberExpenseCategory(data, category);
  write({
    ...withCat,
    contracts: withCat.contracts.map((c) =>
      c.id === contractId
        ? { ...c, expenses: [...(c.expenses ?? []), full] }
        : c
    ),
  });
  return full;
}

export function updateExpense(
  contractId: string,
  expenseId: string,
  patch: {
    amount: number;
    date: string;
    personPaid: string;
    reason: string;
    category: string;
  },
  opts?: { by?: string | null }
): { ok: true } | { ok: false; error: string } {
  const data = read();
  const contract = data.contracts.find((c) => c.id === contractId);
  if (!contract) return { ok: false, error: "Contract not found." };
  const current = (contract.expenses ?? []).find((e) => e.id === expenseId);
  if (!current || current.deletedAt)
    return { ok: false, error: "Expense not found." };
  if (!(Number(patch.amount) > 0))
    return { ok: false, error: "Amount must be greater than 0." };
  if (!patch.date?.trim()) return { ok: false, error: "Date is required." };

  const category = patch.category.trim() || "Miscellaneous";
  const next: ContractExpense = {
    ...current,
    amount: Number(patch.amount),
    date: patch.date,
    personPaid: patch.personPaid.trim(),
    reason: patch.reason.trim(),
    category,
  };
  const bits: string[] = [];
  if (current.amount !== next.amount)
    bits.push(`amount ${current.amount} → ${next.amount}`);
  if (current.date !== next.date)
    bits.push(`date ${current.date} → ${next.date}`);
  if (current.personPaid !== next.personPaid)
    bits.push(`person paid updated`);
  if (current.reason !== next.reason) bits.push(`reason updated`);
  if (current.category !== next.category)
    bits.push(`category ${current.category} → ${next.category}`);
  const entry: ExpenseEditRecord = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    by: opts?.by?.trim() || "User",
    summary: bits.length ? bits.join("; ") : "Edited expense",
  };
  next.editHistory = [...(current.editHistory ?? []), entry];

  const withCat = rememberExpenseCategory(data, category);
  write({
    ...withCat,
    contracts: withCat.contracts.map((c) =>
      c.id === contractId
        ? {
            ...c,
            expenses: (c.expenses ?? []).map((e) =>
              e.id === expenseId ? next : e
            ),
          }
        : c
    ),
  });
  return { ok: true };
}

/** Clear edit-history on every expense (Master only in UI). */
export function clearAllExpenseHistory(): {
  ok: true;
  cleared: number;
} | { ok: false; error: string } {
  const data = read();
  let cleared = 0;
  const contracts = data.contracts.map((c) => ({
    ...c,
    expenses: (c.expenses ?? []).map((e) => {
      const n = (e.editHistory ?? []).length;
      if (!n) return e;
      cleared += n;
      return { ...e, editHistory: [] };
    }),
  }));
  if (!cleared) return { ok: false, error: "No history to clear." };
  write({ ...data, contracts });
  return { ok: true, cleared };
}

/** Permanently remove all soft-deleted expenses (Master only in UI). */
export function clearDeletedExpenses(): {
  ok: true;
  removed: number;
} | { ok: false; error: string } {
  const data = read();
  let removed = 0;
  const contracts = data.contracts.map((c) => {
    const before = c.expenses ?? [];
    const expenses = before.filter((e) => {
      if (e.deletedAt) {
        removed += 1;
        return false;
      }
      return true;
    });
    return expenses === before ? c : { ...c, expenses };
  });
  if (!removed) return { ok: false, error: "No deleted expenses to clear." };
  write({ ...data, contracts });
  return { ok: true, removed };
}

/** Soft-delete — row stays for history. Master only (enforced in UI). */
export function deleteExpense(
  contractId: string,
  expenseId: string,
  opts?: { by?: string | null }
): { ok: true } | { ok: false; error: string } {
  const data = read();
  const contract = data.contracts.find((c) => c.id === contractId);
  if (!contract) return { ok: false, error: "Contract not found." };
  const current = (contract.expenses ?? []).find((e) => e.id === expenseId);
  if (!current || current.deletedAt)
    return { ok: false, error: "Expense not found." };
  const at = new Date().toISOString();
  const by = opts?.by?.trim() || "User";
  const entry: ExpenseEditRecord = {
    id: crypto.randomUUID(),
    at,
    by,
    summary: `Deleted expense · ${current.amount} · ${current.category}`,
  };
  write({
    ...data,
    contracts: data.contracts.map((c) =>
      c.id === contractId
        ? {
            ...c,
            expenses: (c.expenses ?? []).map((e) =>
              e.id === expenseId
                ? {
                    ...e,
                    deletedAt: at,
                    deletedBy: by,
                    editHistory: [...(e.editHistory ?? []), entry],
                  }
                : e
            ),
          }
        : c
    ),
  });
  return { ok: true };
}

export function addInvoice(input: {
  type: Invoice["type"];
  number: string;
  date: string;
  contractId: string;
  lines: InvoiceLine[];
  extraCharges?: InvoiceExtraCharge[];
  convertedFromPiId?: string | null;
}): Invoice | null {
  const data = read();
  const contract = data.contracts.find((c) => c.id === input.contractId);
  const lines = recalcInvoiceLines(input.lines);
  if (!contract || lines.length === 0) return null;
  if (lines.some((l) => !isValidInvoiceQty(l.billedQty))) return null;
  if (
    input.type === "TI" &&
    taxInvoiceQuantityIssues({ contract, invoices: data.invoices, lines }).length
  ) {
    return null;
  }

  const netAmount = lines.reduce((s, l) => s + l.lineNet, 0);
  const gstAmount = contract.gstApplicable ? netAmount * GST_RATE : 0;
  const extraCharges = input.extraCharges ?? [];
  const extraTotal = extraCharges.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const full: Invoice = {
    id: crypto.randomUUID(),
    type: input.type,
    number: input.number.trim(),
    date: input.date,
    contractId: input.contractId,
    lines,
    netAmount,
    gstAmount,
    extraCharges,
    finalAmount: netAmount + gstAmount + extraTotal,
    convertedFromPiId: input.convertedFromPiId ?? null,
    createdAt: new Date().toISOString(),
  };

  write({ ...data, invoices: [...data.invoices, full] });
  return full;
}

export function updateInvoice(
  id: string,
  patch: {
    number?: string;
    date?: string;
    lines?: InvoiceLine[];
    extraCharges?: InvoiceExtraCharge[];
  }
): Invoice | null {
  const data = read();
  const current = data.invoices.find((i) => i.id === id);
  if (!current) return null;
  const contract = data.contracts.find((c) => c.id === current.contractId);
  if (!contract) return null;

  const lines = recalcInvoiceLines(patch.lines ?? current.lines);
  if (lines.length === 0) return null;
  if (patch.lines && lines.some((l) => !isValidInvoiceQty(l.billedQty)))
    return null;
  if (
    current.type === "TI" &&
    patch.lines &&
    taxInvoiceQuantityIssues({
      contract,
      invoices: data.invoices,
      lines,
      exceptInvoiceId: current.id,
    }).length
  ) {
    return null;
  }
  const extraCharges = patch.extraCharges ?? current.extraCharges ?? [];
  const netAmount = lines.reduce((s, l) => s + l.lineNet, 0);
  const gstAmount = contract.gstApplicable ? netAmount * GST_RATE : 0;
  const extraTotal = extraCharges.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const updated: Invoice = normalizeInvoice({
    ...current,
    number: patch.number != null ? patch.number.trim() : current.number,
    date: patch.date ?? current.date,
    lines,
    netAmount,
    gstAmount,
    extraCharges,
    finalAmount: netAmount + gstAmount + extraTotal,
  });

  write({
    ...data,
    invoices: data.invoices.map((i) => (i.id === id ? updated : i)),
  });
  return updated;
}

/** PI → TI: optional edited lines/charges; PI is removed after convert. */
export function convertPiToTi(
  piId: string,
  tiNumber: string,
  tiDate: string,
  overrides?: {
    lines?: InvoiceLine[];
    extraCharges?: InvoiceExtraCharge[];
  }
): Invoice | null {
  const data = read();
  const pi = data.invoices.find((i) => i.id === piId && i.type === "PI");
  if (!pi) return null;

  const contract = data.contracts.find((c) => c.id === pi.contractId);
  const lines = recalcInvoiceLines(overrides?.lines ?? pi.lines);
  if (lines.length === 0) return null;
  if (lines.some((l) => !isValidInvoiceQty(l.billedQty))) return null;
  if (
    contract &&
    taxInvoiceQuantityIssues({
      contract,
      invoices: data.invoices,
      lines,
    }).length
  ) {
    return null;
  }
  const extraCharges = overrides?.extraCharges ?? pi.extraCharges ?? [];
  const netAmount = lines.reduce((s, l) => s + l.lineNet, 0);
  const gstAmount = contract?.gstApplicable ? netAmount * GST_RATE : 0;
  const extraTotal = extraCharges.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const ti: Invoice = {
    ...pi,
    id: crypto.randomUUID(),
    type: "TI",
    number: tiNumber.trim(),
    date: tiDate,
    lines,
    netAmount,
    gstAmount,
    extraCharges,
    finalAmount: netAmount + gstAmount + extraTotal,
    convertedFromPiId: pi.id,
    createdAt: new Date().toISOString(),
  };

  write({
    ...data,
    invoices: [...data.invoices.filter((i) => i.id !== piId), ti],
    // PI-linked payments follow the new TI
    payments: data.payments.map((p) =>
      p.invoiceId === piId
        ? { ...p, invoiceId: ti.id, link: "TI" as const, contractId: ti.contractId }
        : p
    ),
  });
  return ti;
}

export function paymentCash(p: Payment) {
  return (Number(p.netAmount) || 0) + (Number(p.gstAmount) || 0);
}

/**
 * Accounted toward an invoice:
 * cash (net + GST) + retention held + TDS held + deduction + recovered.
 * Deduction is `otherDeductions`. Recovered counts only on a tax-invoice
 * payment. Cash received stays net + GST.
 */
export function paymentAccounted(p: Payment) {
  return (
    paymentCash(p) +
    (Number(p.retentionAmount) || 0) +
    (Number(p.tdsAmount) || 0) +
    (Number(p.otherDeductions) || 0) +
    paymentRecovered(p)
  );
}

function isTiLinkedPayment(p: Pick<Payment, "link" | "invoiceId">) {
  return p.link === "TI" || (!p.link && !!p.invoiceId);
}

/** Rupees above zero. Zero, blank, and negative amounts contribute nothing. */
function positiveRupees(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/**
 * Recovered on a tax-invoice payment. Not cash, retention, or TDS.
 * Other links never carry it into outstanding.
 */
export function paymentRecovered(p: Payment): number {
  if (!isTiLinkedPayment(p)) return 0;
  return positiveRupees(p.recovered);
}

/**
 * Cash-like amount: net + GST + deduction + recovered on a tax-invoice payment.
 * Retention and TDS stay out. Unlinked FIFO uses this, and so does outstanding
 * on an invoice with no linked payment. Outstanding on a linked invoice uses
 * paymentAccounted (this, plus the retention and TDS stored on the payment).
 * Displayed Paid amount is that accounted total, not this figure alone.
 */
export function paymentTowardOutstanding(p: Payment) {
  return (
    (Number(p.netAmount) || 0) +
    (Number(p.gstAmount) || 0) +
    (Number(p.otherDeductions) || 0) +
    paymentRecovered(p)
  );
}

function isContractMoneyPayment(p: Payment) {
  // TI-linked + unlinked count toward TI money world; PI-linked stay on PI reports only.
  // Recoverable cash is a contract pool, not TI money and not a contract figure.
  return p.link === "TI" || p.link === "unlinked" || !p.link;
}

const RUPEE_EPS = 0.005;

function paymentOmitsInvoice(link: Payment["link"]) {
  return link === "unlinked" || link === "recoverable";
}

/** Recovered is stored only on a tax-invoice payment. */
function storedRecovered(
  link: Payment["link"],
  recovered: number | undefined
): number {
  if (link !== "TI") return 0;
  return positiveRupees(recovered);
}

/** Sum of cash (net + GST) on this contract's recoverable payments. */
export function contractRecoverablePool(
  payments: readonly Payment[],
  contractId: string
): number {
  let sum = 0;
  for (const p of payments) {
    if (p.contractId !== contractId || p.link !== "recoverable") continue;
    sum += (Number(p.netAmount) || 0) + (Number(p.gstAmount) || 0);
  }
  return sum;
}

/**
 * Sum of `recovered` on this contract's tax-invoice payments.
 * `exceptPaymentId` leaves that payment out so an edit can treat its
 * amount as this entry instead of money already used by someone else.
 */
export function contractRecoveredTotal(
  payments: readonly Payment[],
  contractId: string,
  exceptPaymentId?: string | null
): number {
  let sum = 0;
  for (const p of payments) {
    if (p.contractId !== contractId) continue;
    if (exceptPaymentId && p.id === exceptPaymentId) continue;
    sum += paymentRecovered(p);
  }
  return sum;
}

/**
 * Running line figures. `thisEntry` is included in `recovered`.
 * When a recoverable payment is open, pass its current cash so the pool
 * uses that entry once.
 */
export function recoverableRunningLineFigures(
  payments: readonly Payment[],
  contractId: string,
  opts?: {
    exceptPaymentId?: string | null;
    thisEntry?: number;
    openRecoverableCash?: {
      paymentId?: string | null;
      net: number;
      gst: number;
    } | null;
  }
): { pool: number; recovered: number; left: number } {
  const open = opts?.openRecoverableCash;
  let pool = 0;
  for (const p of payments) {
    if (p.contractId !== contractId || p.link !== "recoverable") continue;
    if (open?.paymentId && p.id === open.paymentId) continue;
    pool += (Number(p.netAmount) || 0) + (Number(p.gstAmount) || 0);
  }
  if (open) {
    pool += (Number(open.net) || 0) + (Number(open.gst) || 0);
  }
  const recovered =
    contractRecoveredTotal(payments, contractId, opts?.exceptPaymentId) +
    positiveRupees(opts?.thisEntry);
  return { pool, recovered, left: pool - recovered };
}

/** True when recovered on these payments is within the recoverable cash pool. */
export function recoverablePoolHolds(
  payments: readonly Payment[],
  contractId: string
): boolean {
  return (
    contractRecoveredTotal(payments, contractId) <=
    contractRecoverablePool(payments, contractId) + RUPEE_EPS
  );
}

/**
 * Payments as they will be saved. Replaces `entry.id` when present so this
 * payment's recovered and cash are counted once.
 */
export function applyPaymentEntry(
  payments: readonly Payment[],
  entry: Omit<Payment, "id" | "createdAt"> & { id?: string }
): Payment[] {
  const id = entry.id ?? `__draft_${payments.length}`;
  const row: Payment = {
    ...entry,
    id,
    createdAt: "",
    invoiceId: paymentOmitsInvoice(entry.link) ? null : entry.invoiceId,
    recovered: storedRecovered(entry.link, entry.recovered),
    otherDeductionReason: (entry.otherDeductionReason ?? "").trim(),
  };
  if (!entry.id) return [...payments, row];
  const exists = payments.some((p) => p.id === entry.id);
  if (!exists) return [...payments, row];
  return payments.map((p) =>
    p.id === entry.id ? { ...p, ...row, createdAt: p.createdAt } : p
  );
}

/**
 * Which side of a save would put recovered cash above the recoverable pool.
 * `previousContractId` is the contract this payment is on now. A move is
 * checked there too, because the pool it leaves can shrink.
 */
export function recoverablePoolViolation(
  payments: readonly Payment[],
  entry: Omit<Payment, "id" | "createdAt"> & { id?: string },
  previousContractId?: string | null
): "entry" | "left" | null {
  const next = applyPaymentEntry(payments, entry);
  if (!recoverablePoolHolds(next, entry.contractId)) return "entry";
  if (
    previousContractId &&
    previousContractId !== entry.contractId &&
    !recoverablePoolHolds(next, previousContractId)
  ) {
    return "left";
  }
  return null;
}

export function addPayment(
  payment: Omit<Payment, "id" | "createdAt">
): Payment | null {
  const data = read();
  if (!data.contracts.some((c) => c.id === payment.contractId)) return null;
  if (payment.link === "TI" || payment.link === "PI") {
    const invoice = data.invoices.find((i) => i.id === payment.invoiceId);
    if (!invoice) return null;
    if (payment.link === "TI" && invoice.type !== "TI") return null;
    if (payment.link === "PI" && invoice.type !== "PI") return null;
  }
  if (recoverablePoolViolation(data.payments, payment)) {
    return null;
  }

  const full: Payment = {
    ...payment,
    invoiceId: paymentOmitsInvoice(payment.link) ? null : payment.invoiceId,
    recovered: storedRecovered(payment.link, payment.recovered),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  write({ ...data, payments: [...data.payments, full] });
  return full;
}

export function updatePayment(
  id: string,
  patch: Omit<Payment, "id" | "createdAt">
): Payment | null {
  const data = read();
  const current = data.payments.find((p) => p.id === id);
  if (!current) return null;
  if (!data.contracts.some((c) => c.id === patch.contractId)) return null;
  if (patch.link === "TI" || patch.link === "PI") {
    const invoice = data.invoices.find((i) => i.id === patch.invoiceId);
    if (!invoice) return null;
    if (patch.link === "TI" && invoice.type !== "TI") return null;
    if (patch.link === "PI" && invoice.type !== "PI") return null;
  }
  if (
    recoverablePoolViolation(
      data.payments,
      { ...patch, id },
      current.contractId
    )
  ) {
    return null;
  }

  const updated: Payment = {
    ...current,
    ...patch,
    invoiceId: paymentOmitsInvoice(patch.link) ? null : patch.invoiceId,
    recovered: storedRecovered(patch.link, patch.recovered),
  };
  write({
    ...data,
    payments: data.payments.map((p) => (p.id === id ? updated : p)),
  });
  return updated;
}

/** Remove one invoice. Payments that pointed at it stay and become unlinked. */
export function deleteInvoice(id: string): boolean {
  const data = read();
  if (!data.invoices.some((i) => i.id === id)) return false;
  write({
    ...data,
    invoices: data.invoices.filter((i) => i.id !== id),
    payments: data.payments.map((p) =>
      p.invoiceId === id
        ? { ...p, invoiceId: null, link: "unlinked" as const, recovered: 0 }
        : p
    ),
  });
  return true;
}

export function deletePayment(id: string): boolean {
  const data = read();
  const current = data.payments.find((p) => p.id === id);
  if (!current) return false;
  const remaining = data.payments.filter((p) => p.id !== id);
  if (!recoverablePoolHolds(remaining, current.contractId)) return false;
  write({
    ...data,
    payments: remaining,
  });
  return true;
}

export function invoiceExtraTotal(invoice: Invoice) {
  return (invoice.extraCharges ?? []).reduce(
    (s, e) => s + (Number(e.amount) || 0),
    0
  );
}

/**
 * Expected (theoretical) retention hold: ret% × TI net.
 * Extra charges are not reduced. Used for expected payment / “expected held”.
 * Actual held comes from payment entry sums — see invoiceActualRetentionHold.
 */
export function invoiceRetentionHold(invoice: Invoice, data?: FlowhubData) {
  const d = data ?? read();
  const contract = d.contracts.find((c) => c.id === invoice.contractId);
  return ((contract?.retentionPercent ?? 0) * invoice.netAmount) / 100;
}

/**
 * Expected (theoretical) TDS hold: tds% × TI net.
 * Extra charges are not reduced. Used for expected payment / “expected held”.
 * Actual held comes from payment entry sums — see invoiceActualTdsHold.
 */
export function invoiceTdsHold(invoice: Invoice, data?: FlowhubData) {
  const d = data ?? read();
  const contract = d.contracts.find((c) => c.id === invoice.contractId);
  return (
    ((contract?.tdsPercent ?? DEFAULT_TDS_PERCENT) * invoice.netAmount) / 100
  );
}

/**
 * Expected cash from client (expected world only):
 * TI total (net + GST + others) − (ret%×net) − (tds%×net).
 * Billing “expected payment” uses this; do not mix with actual payment holds.
 */
export function invoiceExpectedCash(invoice: Invoice, data?: FlowhubData) {
  const d = data ?? read();
  return (
    invoice.finalAmount -
    invoiceRetentionHold(invoice, d) -
    invoiceTdsHold(invoice, d)
  );
}

/**
 * Actual retention held on a TI = sum of retentionAmount on payments linked to that TI.
 * No payments → 0. Unlinked payments are not attributed here — use contractActualRetentionHold.
 */
export function invoiceActualRetentionHold(
  invoice: Invoice,
  data?: FlowhubData
) {
  if (invoice.type !== "TI") return 0;
  const d = data ?? read();
  return d.payments
    .filter((p) => p.invoiceId === invoice.id && isTiLinkedPayment(p))
    .reduce((s, p) => s + (Number(p.retentionAmount) || 0), 0);
}

/**
 * Actual TDS held on a TI = sum of tdsAmount on payments linked to that TI.
 * No payments → 0. Unlinked live at contract level — see contractActualTdsHold.
 */
export function invoiceActualTdsHold(invoice: Invoice, data?: FlowhubData) {
  if (invoice.type !== "TI") return 0;
  const d = data ?? read();
  return d.payments
    .filter((p) => p.invoiceId === invoice.id && isTiLinkedPayment(p))
    .reduce((s, p) => s + (Number(p.tdsAmount) || 0), 0);
}

/**
 * Contract-level actual retention held: sum ret on TI-linked + unlinked payments.
 * Unlinked ret/TDS are included here in full (not FIFO-split across TIs).
 */
export function contractActualRetentionHold(
  contractId: string,
  data?: FlowhubData
) {
  const d = data ?? read();
  return d.payments
    .filter((p) => p.contractId === contractId && isContractMoneyPayment(p))
    .reduce((s, p) => s + (Number(p.retentionAmount) || 0), 0);
}

/**
 * Contract-level actual TDS held: sum TDS on TI-linked + unlinked payments.
 */
export function contractActualTdsHold(contractId: string, data?: FlowhubData) {
  const d = data ?? read();
  return d.payments
    .filter((p) => p.contractId === contractId && isContractMoneyPayment(p))
    .reduce((s, p) => s + (Number(p.tdsAmount) || 0), 0);
}

/** Excess actual over expected held (no cap). */
export function holdExcess(actual: number, expected: number) {
  return Math.max(0, actual - expected);
}

export function invoiceDueDate(invoice: Invoice, data?: FlowhubData) {
  const d = data ?? read();
  const contract = d.contracts.find((c) => c.id === invoice.contractId);
  const raw = String(invoice.date ?? "").trim();
  // Anchor at noon to avoid UTC timezone day-shifts; fall back to today if invalid
  // so one bad TI cannot crash Invoices and Outstandings.
  const base = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  const start = Number.isNaN(base.getTime())
    ? new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00`)
    : base;
  start.setDate(start.getDate() + (contract?.paymentDueDays ?? 0));
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizePayment(
  p: Payment & { invoiceId?: string | null },
  invoices: Invoice[]
): Payment {
  const invoiceId = p.invoiceId ?? null;
  const invoice = invoiceId ? invoices.find((i) => i.id === invoiceId) : null;
  let link = p.link;
  if (!link) {
    if (!invoiceId) link = "unlinked";
    else if (invoice?.type === "PI") link = "PI";
    else link = "TI";
  }
  return {
    ...p,
    contractId: p.contractId || invoice?.contractId || "",
    invoiceId,
    link,
    otherDeductionReason: (p.otherDeductionReason ?? "").trim(),
    recovered: storedRecovered(link, p.recovered),
  };
}

/**
 * FIFO-allocate unlinked payments’ toward-outstanding amounts (net+GST+other)
 * across a contract’s TIs. Recoverable-link cash is not in this pool.
 * Unlinked ret/TDS are NOT allocated here — they roll
 * into contract-level actual held only.
 */
function unlinkedTowardOutstandingAllocations(
  data: FlowhubData
): Map<string, number> {
  const allocated = new Map<string, number>();
  const byContract = new Map<string, Payment[]>();
  for (const p of data.payments) {
    if (p.link !== "unlinked") continue;
    const list = byContract.get(p.contractId) ?? [];
    list.push(p);
    byContract.set(p.contractId, list);
  }

  for (const [contractId, pays] of byContract) {
    let pool = pays
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
      )
      .reduce((s, p) => s + paymentTowardOutstanding(p), 0);

    const tis = data.invoices
      .filter((i) => i.type === "TI" && i.contractId === contractId)
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
      );

    for (const ti of tis) {
      const linked = tiLinkedPayments(ti.id, data);
      // A linked payment is settled against the invoice total, using the
      // retention and TDS actually stored on those payments. With no linked
      // payment, unlinked cash still fills expected cash only.
      const need =
        linked.length > 0
          ? Math.max(
              0,
              ti.finalAmount -
                linked.reduce((s, p) => s + paymentAccounted(p), 0)
            )
          : Math.max(0, invoiceExpectedCash(ti, data));
      const take = Math.min(pool, need);
      if (take > 0) {
        allocated.set(ti.id, take);
        pool -= take;
      }
    }
  }
  return allocated;
}

/**
 * Paid toward outstanding on a TI: Σ(net + GST + other + recovered) on linked
 * payments plus FIFO-allocated unlinked (net+GST+other). Does not include
 * ret/TDS. Recoverable-link cash is not included.
 */
export function paymentReceivedTotal(invoiceId: string, data?: FlowhubData) {
  const d = data ?? read();
  const invoice = d.invoices.find((i) => i.id === invoiceId);
  const linked = d.payments
    .filter((p) => {
      if (p.invoiceId !== invoiceId) return false;
      if (!invoice || invoice.type !== "TI") return true;
      return isTiLinkedPayment(p);
    })
    .reduce((s, p) => s + paymentTowardOutstanding(p), 0);
  const unlinked =
    invoice?.type === "TI"
      ? (unlinkedTowardOutstandingAllocations(d).get(invoiceId) ?? 0)
      : 0;
  return linked + unlinked;
}

/**
 * Paid amount shown for one tax invoice.
 * Once a payment is linked, this is the accounted total invoiceOutstanding
 * already subtracts: Σ paymentAccounted (net + GST + retention + TDS +
 * deduction + recovered) plus the same FIFO slice of unlinked net + GST +
 * deduction. Unlinked retention and TDS are not in that slice. With no
 * linked payment this is that FIFO slice only, or 0 when nothing is
 * unlinked. Recoverable-link cash stays out. Does not change outstanding,
 * expected cash, or paymentTowardOutstanding.
 */
export function invoicePaidAmount(invoice: Invoice, data?: FlowhubData) {
  const d = data ?? read();
  return (
    paymentReceivedTotal(invoice.id, d) +
    invoiceActualRetentionHold(invoice, d) +
    invoiceActualTdsHold(invoice, d)
  );
}

function tiLinkedPayments(invoiceId: string, data: FlowhubData): Payment[] {
  return data.payments.filter(
    (p) => p.invoiceId === invoiceId && isTiLinkedPayment(p)
  );
}

/**
 * Outstanding on a tax invoice.
 * No linked payment: expected cash minus FIFO unlinked net+GST+deduction
 * (final − theoretical retention − theoretical TDS − that cash). An unpaid
 * invoice stays on expected cash, not the full invoice total.
 * Once a payment is linked: invoice final minus accounted
 * (cash net+GST + deduction + retention held + TDS held + recovered),
 * plus any FIFO unlinked cash still needed to reach the final.
 * Within half a paisa of the final, outstanding is 0. Above the final,
 * the negative amount is Extra for that excess only. A higher contract TDS
 * percent than the TDS entered on the payment does not create Extra.
 */
export function invoiceOutstanding(invoice: Invoice, data?: FlowhubData) {
  if (invoice.type !== "TI") return 0;
  const d = data ?? read();
  const linked = tiLinkedPayments(invoice.id, d);
  if (linked.length === 0) {
    return invoiceExpectedCash(invoice, d) - paymentReceivedTotal(invoice.id, d);
  }
  const unlinked = unlinkedTowardOutstandingAllocations(d).get(invoice.id) ?? 0;
  const accounted =
    linked.reduce((s, p) => s + paymentAccounted(p), 0) + unlinked;
  const balance = invoice.finalAmount - accounted;
  if (Math.abs(balance) <= RUPEE_EPS) return 0;
  return balance;
}

/**
 * Hub paid-vs-due cutoff. A positive outstanding strictly under this many
 * rupees counts as paid. Rs 100 and above stays due. Stored outstanding
 * math is unchanged — reconciliation still uses the exact rupee balance.
 */
export const OUTSTANDING_PAID_BELOW_RUPEES = 100;

/**
 * True when the hub should keep this balance as due, overdue, or partially paid.
 * Zero, overpayment, and a positive balance strictly under Rs 100 are not still due.
 */
export function outstandingIsStillDue(outstanding: number): boolean {
  return outstanding >= OUTSTANDING_PAID_BELOW_RUPEES;
}

/**
 * Balance text for a tax invoice. Overpayment stays Extra. Rs 100 and above
 * stays Due. Rs 1 and Rs 99.99 are Paid. Does not rewrite the stored balance.
 */
export function invoiceBalanceLabel(amount: number): string {
  if (amount < -RUPEE_EPS) return `Extra ${formatMoney(-amount)}`;
  if (outstandingIsStillDue(amount)) return `Due ${formatMoney(amount)}`;
  return "Paid";
}

export function invoiceIsPaid(invoice: Invoice, data?: FlowhubData) {
  return !outstandingIsStillDue(invoiceOutstanding(invoice, data));
}

export function assignTask(
  id: string,
  assignment: {
    department: string | null;
    assignees?: string[];
    dueDate?: string | null;
  },
  opts?: {
    by?: string | null;
    actor?: TaskActor;
    people?: TaskDirectoryPerson[];
    deadlineReason?: string | null;
  }
): { ok: true; task: Task } | { ok: false; error: string } {
  const data = read();
  const current = data.tasks.find((t) => t.id === id);
  if (!current) return { ok: false, error: "Task not found." };
  if (!opts?.actor || !canUpdateTask(opts.actor, current)) {
    return { ok: false, error: TASK_SAVE_DENIED };
  }
  const requestedDepartment = (assignment.department || "").trim() || null;
  const decision = resolveTaskDepartment({
    parentId: current.parentId,
    currentDepartment: current.department,
    nextDepartment: requestedDepartment,
    assignees: current.assignees,
    actor: opts.actor,
  });
  if (!decision.ok) return decision;
  const department = decision.department;
  const names = resolveTaskAssignees({
    currentDepartment: current.department,
    nextDepartment: department,
    currentAssignees: current.assignees,
    nextAssignees: assignment.assignees ?? current.assignees,
    people: opts.people ?? [],
  });
  if (!names.ok) return names;
  const deadline = decideTaskDeadline({
    currentDue: current.dueDate,
    nextDue:
      assignment.dueDate !== undefined ? assignment.dueDate : current.dueDate,
    reason: opts.deadlineReason,
    actor: opts.actor,
    task: current,
  });
  if (!deadline.ok && deadline.error !== TASK_DEADLINE_MOVE_DENIED) return deadline;
  const dueDate = deadline.ok ? deadline.dueDate : current.dueDate;
  const nextTask: Task = {
    ...current,
    department,
    assignees: names.assignees,
    dueDate,
    status:
      current.status === "pending" &&
      (department || names.assignees.length > 0)
        ? "in_progress"
        : current.status,
  };
  const audienceChanged =
    nextTask.department !== current.department ||
    JSON.stringify([...(nextTask.assignees ?? [])].sort()) !==
      JSON.stringify([...(current.assignees ?? [])].sort());
  let nextData: FlowhubData = {
    ...data,
    tasks: data.tasks.map((t) => (t.id === id ? nextTask : t)),
  };
  if (
    audienceChanged &&
    (nextTask.department || (nextTask.assignees?.length ?? 0) > 0)
  ) {
    nextData = notifyForTasks(nextData, [nextTask], {
      createdBy: opts?.by ?? null,
      kind: "task_assigned",
    });
  }
  if (deadline.ok && deadline.log) {
    nextData = appendTaskDeadlineLog(nextData, {
      by: (opts.actor?.name || "").trim() || opts.by || "User",
      taskId: current.id,
      contractId: current.contractId,
      taskTitle: current.title,
      fromDate: deadline.log.fromDate,
      toDate: deadline.log.toDate,
      reason: deadline.log.reason,
    });
  }
  write(nextData);
  return { ok: true, task: nextTask };
}

function applyStatusFields(
  t: Task,
  status: TaskStatus,
  extra?: { notes?: string; notRequiredReason?: string | null }
): Task {
  const now = new Date().toISOString();
  const closed = status === "completed" || status === "not_required";
  const waiting = status === "awaiting_verification";
  const notes =
    extra?.notes !== undefined ? extra.notes.trim() : t.notes;
  const notesChanged =
    extra?.notes !== undefined && extra.notes.trim() !== (t.notes || "");
  return {
    ...t,
    status,
    notes,
    notesUpdatedAt: notesChanged ? now : t.notesUpdatedAt,
    completedAt: closed ? t.completedAt || now : null,
    notRequiredReason:
      status === "not_required"
        ? (extra?.notRequiredReason ?? t.notRequiredReason)?.trim() || null
        : null,
    verificationDepartment: waiting ? (t.verificationDepartment ?? null) : null,
    verificationRequestedBy: waiting ? (t.verificationRequestedBy ?? null) : null,
  };
}

export type TaskStatusApplyResult = {
  status: TaskStatus;
  /** True when kickoff / GAD follow-up questions should run. */
  sideEffects: boolean;
  /** True when this completion was already waiting, so no new verify notice. */
  alreadyWaiting: boolean;
};

function holdForVerification(
  t: Task,
  actor: TaskActor,
  extra?: { notes?: string }
): Task {
  const now = new Date().toISOString();
  const notes = extra?.notes !== undefined ? extra.notes.trim() : t.notes;
  const notesChanged =
    extra?.notes !== undefined && notes !== (t.notes || "");
  const already = t.status === "awaiting_verification";
  const dept = (actor.department || "").trim() || null;
  return {
    ...t,
    status: "awaiting_verification",
    notes,
    notesUpdatedAt: notesChanged ? now : t.notesUpdatedAt,
    completedAt: null,
    notRequiredReason: null,
    verificationDepartment: already ? (t.verificationDepartment ?? null) : dept,
    verificationRequestedBy: already
      ? (t.verificationRequestedBy ?? null)
      : (actor.name || "").trim() || null,
  };
}

function taskHasParent(task: { parentId?: string | null }): boolean {
  return (task.parentId || "").trim().length > 0;
}

/**
 * A subtask marked completed finishes now, including for a normal user.
 * It does not wait and it does not raise a verify notice.
 * A parent still waits when a user marks it completed.
 * Manager, Director, and Master finish a parent now with no verify notice.
 */
function applyCompletion(
  data: FlowhubData,
  task: Task,
  actor: TaskActor | undefined,
  extra?: { notes?: string; notRequiredReason?: string | null }
): {
  data: FlowhubData;
  task: Task;
  sideEffects: boolean;
  alreadyWaiting: boolean;
} {
  if (taskHasParent(task) || completesImmediately(actor?.clearance)) {
    const next = applyStatusFields(task, "completed", extra);
    return {
      data: {
        ...data,
        tasks: data.tasks.map((t) => (t.id === task.id ? next : t)),
      },
      task: next,
      sideEffects: task.status !== "completed",
      alreadyWaiting: false,
    };
  }
  if (task.status === "completed" || task.status === "not_required") {
    return { data, task, sideEffects: false, alreadyWaiting: false };
  }
  const already = task.status === "awaiting_verification";
  const next = holdForVerification(task, actor ?? {}, extra);
  let nextData: FlowhubData = {
    ...data,
    tasks: data.tasks.map((t) => (t.id === task.id ? next : t)),
  };
  if (!already) {
    nextData = appendNotifications(nextData, [
      buildVerifyNotification(next, {
        name: actor?.name,
        department: next.verificationDepartment,
      }),
    ]);
  }
  return {
    data: nextData,
    task: next,
    sideEffects: false,
    alreadyWaiting: already,
  };
}

export function updateTaskStatus(
  id: string,
  status: TaskStatus,
  opts?: {
    notes?: string;
    notRequiredReason?: string | null;
    actor?: TaskActor;
  }
): TaskStatusApplyResult | null {
  const data = read();
  const current = data.tasks.find((t) => t.id === id);
  if (!current) return null;
  if (!opts?.actor || !canUpdateTask(opts.actor, current)) return null;

  if (status === "completed" || status === "awaiting_verification") {
    if (
      status === "awaiting_verification" &&
      current.status === "awaiting_verification"
    ) {
      const next = holdForVerification(current, opts?.actor ?? {}, opts);
      write({
        ...data,
        tasks: data.tasks.map((t) => (t.id === id ? next : t)),
      });
      return {
        status: "awaiting_verification",
        sideEffects: false,
        alreadyWaiting: true,
      };
    }
    const applied = applyCompletion(data, current, opts?.actor, opts);
    write(applied.data);
    return {
      status: applied.task.status,
      sideEffects: applied.sideEffects,
      alreadyWaiting: applied.alreadyWaiting,
    };
  }

  const next = applyStatusFields(current, status, opts);
  write({
    ...data,
    tasks: data.tasks.map((t) => (t.id === id ? next : t)),
  });
  return { status, sideEffects: false, alreadyWaiting: false };
}

export function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      | "title"
      | "department"
      | "assignees"
      | "status"
      | "dueDate"
      | "priority"
      | "notes"
      | "notRequiredReason"
    >
  >,
  opts?: {
    actor?: TaskActor;
    people?: TaskDirectoryPerson[];
    deadlineReason?: string | null;
  }
) {
  const data = read();
  const current = data.tasks.find((t) => t.id === id);
  if (!current) return null;
  if (!opts?.actor || !canUpdateTask(opts.actor, current)) return null;
  let department = current.department;
  if (patch.department !== undefined) {
    const decision = resolveTaskDepartment({
      parentId: current.parentId,
      currentDepartment: current.department,
      nextDepartment: patch.department,
      assignees: current.assignees,
      actor: opts.actor,
    });
    if (!decision.ok) return null;
    department = decision.department;
  }
  let assignees = patch.assignees;
  if (patch.assignees !== undefined) {
    const names = resolveTaskAssignees({
      currentDepartment: current.department,
      nextDepartment: department,
      currentAssignees: current.assignees,
      nextAssignees: patch.assignees,
      people: opts.people ?? [],
    });
    if (!names.ok) return null;
    assignees = names.assignees;
  }
  const deadline = decideTaskDeadline({
    currentDue: current.dueDate,
    nextDue: patch.dueDate === undefined ? current.dueDate : patch.dueDate,
    reason: opts.deadlineReason,
    actor: opts.actor,
    task: current,
  });
  if (!deadline.ok && deadline.error !== TASK_DEADLINE_MOVE_DENIED) return null;
  const dueDate = deadline.ok ? deadline.dueDate : current.dueDate;
  const priority =
    patch.priority !== undefined &&
    patch.priority !== current.priority &&
    !canEditTaskSchedule(opts.actor, current)
      ? current.priority
      : (patch.priority ?? current.priority);
  const now = new Date().toISOString();
  let next: Task = {
    ...current,
    ...patch,
    department,
    assignees: assignees ?? current.assignees,
    dueDate,
    priority,
  };
  if (patch.notes !== undefined && patch.notes !== current.notes) {
    next = {
      ...next,
      notes: patch.notes.trim(),
      notesUpdatedAt: now,
    };
  }
  let verify = false;
  if (patch.status === "completed" || patch.status === "awaiting_verification") {
    const base: Task = {
      ...next,
      status: current.status,
      completedAt: current.completedAt,
      notRequiredReason: current.notRequiredReason,
      verificationDepartment: current.verificationDepartment,
      verificationRequestedBy: current.verificationRequestedBy,
    };
    if (
      patch.status === "awaiting_verification" &&
      current.status === "awaiting_verification"
    ) {
      next = holdForVerification(base, opts.actor ?? {}, { notes: patch.notes });
    } else if (taskHasParent(current) || completesImmediately(opts.actor?.clearance)) {
      next = applyStatusFields(base, "completed", {
        notes: patch.notes,
        notRequiredReason: patch.notRequiredReason,
      });
    } else if (current.status === "completed" || current.status === "not_required") {
      next = base;
    } else {
      const already = current.status === "awaiting_verification";
      next = holdForVerification(base, opts.actor ?? {}, { notes: patch.notes });
      verify = !already;
    }
  } else if (patch.status !== undefined && patch.status !== current.status) {
    next = applyStatusFields(next, patch.status, {
      notes: patch.notes,
      notRequiredReason: patch.notRequiredReason,
    });
  }
  const audienceChanged =
    next.department !== current.department ||
    JSON.stringify([...(next.assignees ?? [])].sort()) !==
      JSON.stringify([...(current.assignees ?? [])].sort());
  let nextData: FlowhubData = {
    ...data,
    tasks: data.tasks.map((t) => (t.id === id ? next : t)),
  };
  if (
    audienceChanged &&
    (next.department || (next.assignees?.length ?? 0) > 0)
  ) {
    nextData = notifyForTasks(nextData, [next], { kind: "task_assigned" });
  }
  if (verify) {
    nextData = appendNotifications(nextData, [
      buildVerifyNotification(next, {
        name: opts.actor?.name,
        department: next.verificationDepartment,
      }),
    ]);
  }
  if (deadline.ok && deadline.log) {
    nextData = appendTaskDeadlineLog(nextData, {
      by: (opts.actor?.name || "").trim() || "User",
      taskId: current.id,
      contractId: current.contractId,
      taskTitle: current.title,
      fromDate: deadline.log.fromDate,
      toDate: deadline.log.toDate,
      reason: deadline.log.reason,
    });
  }
  write(nextData);
  return next;
}

export function addManualTask(input: {
  title: string;
  contractId: string;
  department?: string | null;
  assignees?: string[];
  dueDate?: string | null;
  priority?: Task["priority"];
  notes?: string;
  parentId?: string | null;
  catalogKey?: TaskCatalogKey | null;
  source?: "system" | "manual";
},
opts?: { actor?: TaskActor }
): Task {
  const data = read();
  const assignees = input.assignees?.filter(Boolean) ?? [];
  let department = input.department ?? null;
  if (opts?.actor) {
    const decision = resolveTaskDepartment({
      parentId: input.parentId,
      currentDepartment: null,
      nextDepartment: department,
      assignees: [],
      actor: opts.actor,
    });
    department = decision.ok ? decision.department : null;
  }
  const maySetSchedule =
    !opts?.actor ||
    canEditTaskSchedule(opts.actor, { department: null, assignees: [] });
  const full: Task = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    contractId: input.contractId,
    department,
    assignees,
    status:
      input.department || assignees.length > 0 ? "in_progress" : "pending",
    dueDate: maySetSchedule ? input.dueDate || null : null,
    parentId: input.parentId ?? null,
    source: input.source ?? "manual",
    catalogKey: input.catalogKey ?? "custom",
    priority: maySetSchedule ? (input.priority ?? "normal") : "normal",
    notes: input.notes?.trim() ?? "",
    notesUpdatedAt: input.notes?.trim() ? new Date().toISOString() : null,
    completedAt: null,
    notRequiredReason: null,
    createdAt: new Date().toISOString(),
  };
  let nextData: FlowhubData = { ...data, tasks: [...data.tasks, full] };
  nextData = notifyForTasks(nextData, [full], { kind: "task_created" });
  write(nextData);
  return full;
}

export function addSubtask(
  parentId: string,
  input: {
    title: string;
    department?: string | null;
    assignees?: string[];
    dueDate?: string | null;
  },
  opts?: { actor?: TaskActor }
): Task | null {
  const data = read();
  const parent = data.tasks.find((t) => t.id === parentId);
  if (!parent?.contractId) return null;
  if (opts?.actor && !canUpdateTask(opts.actor, parent)) return null;
  return addManualTask(
    {
      title: input.title,
      contractId: parent.contractId,
      department: input.department ?? null,
      assignees: input.assignees,
      dueDate: input.dueDate,
      parentId,
      priority: parent.priority,
      catalogKey: "custom",
    },
    opts?.actor ? { actor: opts.actor } : undefined
  );
}

/** Close open subtasks, then complete the parent or park it for verification. */
export function completeTaskWithSubtasks(
  parentId: string,
  subtaskClosures: {
    id: string;
    status: "completed" | "not_required";
    reason?: string;
  }[],
  opts?: { notes?: string; actor?: TaskActor }
):
  | {
      ok: true;
      status: TaskStatus;
      sideEffects: boolean;
      alreadyWaiting: boolean;
    }
  | { ok: false; error: string } {
  const data = read();
  const parent = data.tasks.find((t) => t.id === parentId);
  if (!parent) return { ok: false, error: "Task not found." };
  if (!opts?.actor || !canUpdateTask(opts.actor, parent)) {
    return { ok: false, error: TASK_SAVE_DENIED };
  }
  const openSubs = data.tasks.filter(
    (t) => t.parentId === parentId && taskIsOpen(t)
  );
  for (const sub of openSubs) {
    if (!canUpdateTask(opts.actor, sub)) {
      return { ok: false, error: subtaskUpdateDenied(sub.title) };
    }
  }
  for (const sub of openSubs) {
    const closure = subtaskClosures.find((c) => c.id === sub.id);
    if (!closure) {
      return {
        ok: false,
        error: `Close subtask “${sub.title}” (complete or not required).`,
      };
    }
    if (closure.status === "not_required" && !closure.reason?.trim()) {
      return {
        ok: false,
        error: `Reason required to mark “${sub.title}” not required.`,
      };
    }
  }
  let nextData = data;
  for (const sub of openSubs) {
    const closure = subtaskClosures.find((c) => c.id === sub.id);
    if (!closure) continue;
    const current = nextData.tasks.find((t) => t.id === sub.id);
    if (!current) continue;
    if (closure.status === "not_required") {
      const updated = applyStatusFields(current, "not_required", {
        notRequiredReason: closure.reason ?? null,
      });
      nextData = {
        ...nextData,
        tasks: nextData.tasks.map((t) => (t.id === current.id ? updated : t)),
      };
      continue;
    }
    const applied = applyCompletion(nextData, current, opts?.actor);
    nextData = applied.data;
  }
  const parentNow = nextData.tasks.find((t) => t.id === parentId);
  if (!parentNow) return { ok: false, error: "Task not found." };
  const parentApplied = applyCompletion(nextData, parentNow, opts?.actor, {
    notes: opts?.notes,
  });
  write(parentApplied.data);
  return {
    ok: true,
    status: parentApplied.task.status,
    sideEffects: parentApplied.sideEffects,
    alreadyWaiting: parentApplied.alreadyWaiting,
  };
}

/** Department manager, or Master, accepts a task that is waiting for verification. */
export function confirmTaskVerification(
  id: string,
  actor: TaskActor
): { ok: true } | { ok: false; error: string } {
  const data = read();
  const current = data.tasks.find((t) => t.id === id);
  if (!current) return { ok: false, error: "Task not found." };
  if (current.status !== "awaiting_verification") {
    return { ok: false, error: "This task is not waiting for verification." };
  }
  if (!canConfirmTaskVerification(actor, current)) {
    return {
      ok: false,
      error: "Only that department’s manager, or Master, can confirm this.",
    };
  }
  const openSubs = data.tasks.filter(
    (t) => t.parentId === id && taskIsOpen(t)
  );
  if (openSubs.length) {
    return { ok: false, error: "Close open subtasks before confirming." };
  }
  const next = applyStatusFields(current, "completed");
  write({
    ...data,
    tasks: data.tasks.map((t) => (t.id === id ? next : t)),
  });
  return { ok: true };
}

/** Hide a task and its subtasks. The rows stay so sync does not recreate them. */
export function deleteTask(id: string): boolean {
  const data = read();
  const current = data.tasks.find((t) => t.id === id);
  if (!current || current.parentId || taskIsDeleted(current)) return false;
  const at = new Date().toISOString();
  write({
    ...data,
    tasks: data.tasks.map((t) =>
      t.id === id || t.parentId === id
        ? { ...t, deletedAt: t.deletedAt || at }
        : t
    ),
  });
  return true;
}

/** Hide one subtask. No other task is changed. */
export function deleteSubtask(id: string): boolean {
  const data = read();
  const current = data.tasks.find((t) => t.id === id);
  if (!current?.parentId || taskIsDeleted(current)) return false;
  const at = new Date().toISOString();
  write({
    ...data,
    tasks: data.tasks.map((t) =>
      t.id === id ? { ...t, deletedAt: at } : t
    ),
  });
  return true;
}

function todayIsoLocal() {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

function addMonthsToIso(iso: string, months: number) {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isIsoDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return !Number.isNaN(new Date(iso + "T12:00:00").getTime());
}

function addDaysToIso(iso: string, days: number) {
  if (!iso || isScheduleDateNa(iso) || !isIsoDate(iso)) return iso;
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function monthsBeforeIso(iso: string, months: number) {
  return addMonthsToIso(iso, -months);
}

function daysBeforeIso(iso: string, days: number) {
  return addDaysToIso(iso, -days);
}

function hasOpenCatalogTask(
  tasks: Task[],
  contractId: string,
  catalogKey: TaskCatalogKey
) {
  return tasks.some(
    (t) =>
      t.contractId === contractId &&
      t.catalogKey === catalogKey &&
      !t.parentId &&
      taskIsOpen(t)
  );
}

/** A deleted system task is kept so sync does not create that step again. */
function hasDeletedCatalogTask(
  tasks: Task[],
  contractId: string,
  catalogKey: TaskCatalogKey
) {
  return tasks.some(
    (t) =>
      t.contractId === contractId &&
      t.catalogKey === catalogKey &&
      !t.parentId &&
      taskIsDeleted(t)
  );
}

function makeSystemTask(input: {
  title: string;
  contractId: string;
  catalogKey: TaskCatalogKey;
  dueDate?: string | null;
  department?: string | null;
  priority?: Task["priority"];
}): Task {
  return {
    id: crypto.randomUUID(),
    title: input.title,
    contractId: input.contractId,
    department: input.department ?? null,
    assignees: [],
    status: "pending",
    dueDate: input.dueDate ?? null,
    parentId: null,
    source: "system",
    catalogKey: input.catalogKey,
    priority: input.priority ?? "normal",
    notes: "",
    notesUpdatedAt: null,
    completedAt: null,
    notRequiredReason: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/** After Kick off is completed — create GAD only if user said it is required. */
export function afterKickoffCompleted(
  contractId: string,
  gadRequired: boolean
): Task | null {
  if (!gadRequired) return null;
  const data = read();
  const contract = data.contracts.find((c) => c.id === contractId);
  if (!contract) return null;
  if (hasOpenCatalogTask(data.tasks, contractId, "gad")) return null;
  // Also skip if a completed GAD already exists for this contract
  const already = data.tasks.some(
    (t) =>
      t.contractId === contractId &&
      t.catalogKey === "gad" &&
      !t.parentId
  );
  if (already) return null;
  const task = makeSystemTask({
    title: "Finalise Drawings/GAD",
    contractId,
    catalogKey: "gad",
    department: currentSeedDepartment(data, "Drawings Department"),
    priority: "high",
  });
  let nextData: FlowhubData = { ...data, tasks: [...data.tasks, task] };
  nextData = notifyForTasks(nextData, [task], { kind: "task_department" });
  write(nextData);
  return task;
}

/**
 * After Finalise GAD is completed:
 * always create Create schedules; optionally Finalise BOQ amendment.
 */
export function afterGadCompleted(
  contractId: string,
  opts: { boqChanged: boolean; amendmentNeeded: boolean }
): Task[] {
  const data = read();
  const contract = data.contracts.find((c) => c.id === contractId);
  if (!contract) return [];
  const created: Task[] = [];
  let tasks = data.tasks;

  if (!hasOpenCatalogTask(tasks, contractId, "create_schedules")) {
    const exists = tasks.some(
      (t) =>
        t.contractId === contractId &&
        t.catalogKey === "create_schedules" &&
        !t.parentId
    );
    if (!exists) {
      const schedulesTask = makeSystemTask({
        title: `Create schedules — ${contract.projectNo}`,
        contractId,
        catalogKey: "create_schedules",
        department: currentSeedDepartment(data, "Contracts Department"),
        priority: "high",
      });
      tasks = [...tasks, schedulesTask];
      created.push(schedulesTask);
    }
  }

  if (opts.boqChanged && opts.amendmentNeeded) {
    if (
      !hasDeletedCatalogTask(tasks, contractId, "boq_amendment") &&
      !hasOpenCatalogTask(tasks, contractId, "boq_amendment")
    ) {
      const exists = tasks.some(
        (t) =>
          t.contractId === contractId &&
          t.catalogKey === "boq_amendment" &&
          !t.parentId &&
          taskIsOpen(t)
      );
      if (!exists) {
        const amd = makeSystemTask({
          title: `Finalise BOQ amendment — ${contract.projectNo}`,
          contractId,
          catalogKey: "boq_amendment",
          department: currentSeedDepartment(data, "Contracts Department"),
          priority: "high",
        });
        tasks = [...tasks, amd];
        created.push(amd);
      }
    }
  }

  if (created.length) {
    let nextData: FlowhubData = { ...data, tasks };
    nextData = notifyForTasks(nextData, created, { kind: "task_department" });
    write(nextData);
  }
  return created;
}

/**
 * Create BG-expiry and Collect-retention tasks when their date windows open.
 * Safe to call on hydrate / after BG or schedule edits.
 */
export function syncDatedSystemTasks(): { created: Task[] } {
  const data = read();
  const today = todayIsoLocal();
  let tasks = data.tasks;
  const created: Task[] = [];

  for (const c of data.contracts) {
    if (contractDisplayStatus(data, c, today) === "Completed") continue;

    if (c.abgRequired && c.abgExpiry && !c.abgRetrieved) {
      const windowStart = monthsBeforeIso(c.abgExpiry, BG_EXPIRY_LEAD_MONTHS);
      if (today >= windowStart && today <= c.abgExpiry) {
        const open = hasOpenCatalogTask(tasks, c.id, "bg_expiry_abg");
        const sameDue = tasks.some(
          (t) =>
            t.contractId === c.id &&
            t.catalogKey === "bg_expiry_abg" &&
            t.dueDate === c.abgExpiry &&
            !t.parentId
        );
        if (
          !open &&
          !sameDue &&
          !hasDeletedCatalogTask(tasks, c.id, "bg_expiry_abg")
        ) {
          const t = makeSystemTask({
            title: `Chase ABG expiry — ${c.projectNo}`,
            contractId: c.id,
            catalogKey: "bg_expiry_abg",
            dueDate: c.abgExpiry,
            department: currentSeedDepartment(data, "Accounts Department"),
            priority: "urgent",
          });
          tasks = [...tasks, t];
          created.push(t);
        }
      }
    }

    if (c.pbgRequired && c.pbgExpiry && !c.pbgRetrieved) {
      const windowStart = monthsBeforeIso(c.pbgExpiry, BG_EXPIRY_LEAD_MONTHS);
      if (today >= windowStart && today <= c.pbgExpiry) {
        const open = hasOpenCatalogTask(tasks, c.id, "bg_expiry_pbg");
        const sameDue = tasks.some(
          (t) =>
            t.contractId === c.id &&
            t.catalogKey === "bg_expiry_pbg" &&
            t.dueDate === c.pbgExpiry &&
            !t.parentId
        );
        if (
          !open &&
          !sameDue &&
          !hasDeletedCatalogTask(tasks, c.id, "bg_expiry_pbg")
        ) {
          const t = makeSystemTask({
            title: `Chase PBG expiry — ${c.projectNo}`,
            contractId: c.id,
            catalogKey: "bg_expiry_pbg",
            dueDate: c.pbgExpiry,
            department: currentSeedDepartment(data, "Accounts Department"),
            priority: "urgent",
          });
          tasks = [...tasks, t];
          created.push(t);
        }
      }
    }

    if ((c.retentionPercent ?? 0) > 0) {
      const handover = handoverDateForContract(data, c.id);
      if (handover) {
        const dlpEnd = addMonthsToIso(handover, c.dlpMonths || 0);
        const windowStart = daysBeforeIso(dlpEnd, RETENTION_LEAD_DAYS);
        if (today >= windowStart && today <= dlpEnd) {
          const open = hasOpenCatalogTask(tasks, c.id, "collect_retention");
          const sameDue = tasks.some(
            (t) =>
              t.contractId === c.id &&
              t.catalogKey === "collect_retention" &&
              t.dueDate === dlpEnd &&
              !t.parentId
          );
          if (
            !open &&
            !sameDue &&
            !hasDeletedCatalogTask(tasks, c.id, "collect_retention")
          ) {
            const t = makeSystemTask({
              title: `Collect retention — ${c.projectNo}`,
              contractId: c.id,
              catalogKey: "collect_retention",
              dueDate: dlpEnd,
              department: currentSeedDepartment(data, "Accounts Department"),
              priority: "high",
            });
            tasks = [...tasks, t];
            created.push(t);
          }
        }
      }
    }
  }

  if (created.length) {
    let nextData: FlowhubData = { ...data, tasks };
    nextData = notifyForTasks(nextData, created, { kind: "task_department" });
    write(nextData);
  }
  return { created };
}

/**
 * One overdue notice and one due-today notice per task.
 * Runs when the workspace loads, beside the bank-guarantee chase.
 */
export function syncTaskDueNotices(): { notified: number } {
  const data = read();
  const planned = planDueNotices(data.tasks, todayIsoLocal());
  if (!planned.hits.length) return { notified: 0 };
  const byId = new Map(planned.tasks.map((t) => [t.id, t]));
  const rows: HubNotification[] = [];
  for (const hit of planned.hits) {
    const task = byId.get(hit.taskId);
    if (!task) continue;
    const row = buildDatedNotice(task, hit.which);
    if (row) rows.push(row);
  }
  write(appendNotifications({ ...data, tasks: planned.tasks }, rows));
  return { notified: rows.length };
}

export type ScheduleWriteResult =
  | { ok: true; line: ScheduleLine; cascade?: CascadeProposal[] }
  | { ok: false; error: string };

export type CascadeProposal = {
  scheduleId: string;
  label: string;
  startDate: string;
  endDate: string;
  fromStartDate: string;
  fromEndDate: string;
};

export function addSchedule(
  input: {
    contractId: string;
    kind: ScheduleKind;
    boqItemId?: string | null;
    quantity?: number | null;
    startDate: string;
    endDate: string;
    committed: boolean;
  },
  opts?: { by?: string }
): ScheduleWriteResult {
  const data = read();
  const contract = data.contracts.find((c) => c.id === input.contractId);
  if (!contract) return { ok: false, error: "Contract not found." };
  if (!input.startDate || !input.endDate)
    return { ok: false, error: "Dates are required." };
  if (input.endDate < input.startDate)
    return { ok: false, error: "End date cannot be before start date." };

  const by = opts?.by ?? "User";
  const itemKinds = input.kind === "supply" || input.kind === "installation";
  if (itemKinds) {
    if (!input.boqItemId)
      return { ok: false, error: "BOQ item is required." };
    const boq = contract.boq.find((b) => b.id === input.boqItemId);
    if (!boq) return { ok: false, error: "BOQ item not found." };
    if (!(Number(input.quantity) > 0))
      return { ok: false, error: "Quantity must be greater than 0." };
    if (input.kind === "supply") {
      const already = scheduledSupplyQty(
        input.contractId,
        input.boqItemId,
        null
      );
      if (already + Number(input.quantity) > boq.quantity) {
        return {
          ok: false,
          error: `Supply qty would exceed BOQ (${already} scheduled + ${input.quantity} > ${boq.quantity}).`,
        };
      }
    }
    if (input.kind === "installation") {
      const hasSupply = data.schedules.some(
        (s) =>
          s.contractId === input.contractId &&
          s.kind === "supply" &&
          s.boqItemId === input.boqItemId &&
          s.startDate &&
          !isScheduleDateNa(s.startDate)
      );
      if (!hasSupply) {
        return {
          ok: false,
          error: `Set a supply date for ${boq.name} before adding installation.`,
        };
      }
    }
  } else {
    const existing = data.schedules.find(
      (s) => s.contractId === input.contractId && s.kind === input.kind
    );
    if (existing) {
      return updateSchedule(
        existing.id,
        {
          startDate: input.startDate,
          endDate: input.endDate,
          committed: input.committed,
        },
        { by, skipCascadePrompt: true }
      );
    }
  }

  const now = new Date().toISOString();
  const full: ScheduleLine = normalizeSchedule({
    id: crypto.randomUUID(),
    contractId: input.contractId,
    boqItemId: itemKinds ? input.boqItemId! : null,
    kind: input.kind,
    quantity: itemKinds ? Number(input.quantity) : null,
    startDate: input.startDate,
    endDate: input.endDate,
    committed: input.committed,
    baselineStartDate: input.startDate,
    baselineEndDate: input.endDate,
    done: false,
    doneAt: null,
    doneBy: null,
    createdAt: now,
    updatedAt: now,
  });

  const schedules = [...data.schedules, full];
  const provisional: FlowhubData = { ...data, schedules };
  const nextData = appendScheduleLog(
    {
      ...provisional,
      tasks: completeCreateSchedulesTasks(
        data.tasks,
        full.contractId,
        provisional
      ),
    },
    {
      by,
      contractId: full.contractId,
      scheduleId: full.id,
      summary: `Created ${SCHEDULE_KIND_LABELS[full.kind]} ${formatScheduleDateRange(full.startDate, full.endDate)}${full.quantity != null ? ` · qty ${full.quantity}` : ""}`,
    }
  );
  write(nextData);
  if (full.kind === "handover") syncDatedSystemTasks();
  return { ok: true, line: full };
}

export function updateSchedule(
  id: string,
  patch: Partial<
    Pick<
      ScheduleLine,
      | "boqItemId"
      | "quantity"
      | "startDate"
      | "endDate"
      | "committed"
      | "kind"
    >
  >,
  opts?: { by?: string; skipCascadePrompt?: boolean }
): ScheduleWriteResult {
  const data = read();
  const current = data.schedules.find((s) => s.id === id);
  if (!current) return { ok: false, error: "Schedule line not found." };
  const contract = data.contracts.find((c) => c.id === current.contractId);
  if (!contract) return { ok: false, error: "Contract not found." };

  const by = opts?.by ?? "User";
  const next = normalizeSchedule({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  // The planner leaves an NA supply or installation out of the schedule.
  // Start set to NA removes this line. Quantity is not required.
  if (
    (next.kind === "supply" || next.kind === "installation") &&
    isScheduleDateNa(next.startDate)
  ) {
    const label = SCHEDULE_KIND_LABELS[next.kind];
    const nextData = appendScheduleLog(
      {
        ...data,
        schedules: data.schedules.filter((s) => s.id !== id),
      },
      {
        by,
        contractId: current.contractId,
        scheduleId: current.id,
        summary: `Deleted ${label} ${formatScheduleDateRange(current.startDate, current.endDate)}`,
      }
    );
    write(nextData);
    return { ok: true, line: current };
  }
  if (next.endDate < next.startDate)
    return { ok: false, error: "End date cannot be before start date." };

  const unchanged =
    next.kind === current.kind &&
    next.boqItemId === current.boqItemId &&
    next.quantity === current.quantity &&
    next.startDate === current.startDate &&
    next.endDate === current.endDate &&
    next.committed === current.committed;
  if (unchanged) return { ok: true, line: current };

  const datesChanged =
    next.startDate !== current.startDate || next.endDate !== current.endDate;

  if (next.kind === "supply" && next.boqItemId) {
    const boq = contract.boq.find((b) => b.id === next.boqItemId);
    if (!boq) return { ok: false, error: "BOQ item not found." };
    const already = scheduledSupplyQty(
      next.contractId,
      next.boqItemId,
      next.id
    );
    if (already + (Number(next.quantity) || 0) > boq.quantity) {
      return {
        ok: false,
        error: `Supply qty would exceed BOQ (${already} other + ${next.quantity} > ${boq.quantity}).`,
      };
    }
  }

  if (next.kind === "installation" && next.boqItemId) {
    const boq = contract.boq.find((b) => b.id === next.boqItemId);
    const hasSupply = data.schedules.some(
      (s) =>
        s.id !== id &&
        s.contractId === next.contractId &&
        s.kind === "supply" &&
        s.boqItemId === next.boqItemId &&
        s.startDate &&
        !isScheduleDateNa(s.startDate)
    );
    if (!hasSupply) {
      return {
        ok: false,
        error: `Set a supply date for ${boq?.name ?? "this item"} before adding installation.`,
      };
    }
  }

  const endSlip = daysBetweenIso(current.endDate, next.endDate);
  const cascade =
    !opts?.skipCascadePrompt && endSlip > 0
      ? proposeCascadeAfterSlip(data, current, endSlip)
      : [];

  if (cascade.length > 0) {
    // Save the edited line first; UI confirms cascade separately.
    const nextData = appendScheduleLog(
      {
        ...data,
        schedules: data.schedules.map((s) => (s.id === id ? next : s)),
      },
      {
        by,
        contractId: next.contractId,
        scheduleId: next.id,
        summary: `Updated ${SCHEDULE_KIND_LABELS[next.kind]} dates ${formatScheduleDateRange(current.startDate, current.endDate)} to ${formatScheduleDateRange(next.startDate, next.endDate)} (cascade pending)`,
      }
    );
    write(nextData);
    if (next.kind === "handover") syncDatedSystemTasks();
    return { ok: true, line: next, cascade };
  }

  const label = SCHEDULE_KIND_LABELS[next.kind];
  const committedBit =
    next.committed !== current.committed
      ? next.committed
        ? " · committed"
        : " · uncommitted"
      : "";
  const summary = datesChanged
    ? `Updated ${label} ${formatScheduleDateRange(next.startDate, next.endDate)}${
        next.quantity !== current.quantity
          ? ` · qty ${current.quantity} → ${next.quantity}`
          : ""
      }${committedBit}`
    : next.quantity !== current.quantity
      ? `Updated ${label} qty ${current.quantity} → ${next.quantity}${committedBit}`
      : `Updated ${label}${committedBit}`;

  const nextData = appendScheduleLog(
    {
      ...data,
      schedules: data.schedules.map((s) => (s.id === id ? next : s)),
    },
    {
      by,
      contractId: next.contractId,
      scheduleId: next.id,
      summary,
    }
  );
  write(nextData);
  if (next.kind === "handover") syncDatedSystemTasks();
  return { ok: true, line: next };
}

function proposeCascadeAfterSlip(
  data: FlowhubData,
  source: ScheduleLine,
  slipDays: number
): CascadeProposal[] {
  if (slipDays <= 0) return [];
  const contract = data.contracts.find((c) => c.id === source.contractId);
  if (!contract) return [];
  const proposals: CascadeProposal[] = [];
  const push = (s: ScheduleLine, label: string) => {
    if (s.done || s.id === source.id) return;
    if (proposals.some((p) => p.scheduleId === s.id)) return;
    // NA testing and handover stay NA. Adding days to NA writes NaN-NaN-NaN.
    if (isScheduleDateNa(s.startDate) || isScheduleDateNa(s.endDate)) return;
    const startDate = addDaysToIso(s.startDate, slipDays);
    const endDate = addDaysToIso(s.endDate, slipDays);
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) return;
    proposals.push({
      scheduleId: s.id,
      label,
      fromStartDate: s.startDate,
      fromEndDate: s.endDate,
      startDate,
      endDate,
    });
  };

  const sameContract = data.schedules.filter(
    (s) => s.contractId === source.contractId && !s.done
  );

  if (source.kind === "supply" && source.boqItemId) {
    for (const s of sameContract) {
      if (s.kind === "installation" && s.boqItemId === source.boqItemId) {
        push(s, `Install · same item`);
      }
    }
  }

  if (source.kind === "installation" && source.boqItemId) {
    const order = contract.boq.map((b) => b.id);
    const idx = order.indexOf(source.boqItemId);
    if (idx >= 0) {
      const laterIds = new Set(order.slice(idx + 1));
      for (const s of sameContract) {
        if (
          (s.kind === "supply" || s.kind === "installation") &&
          s.boqItemId &&
          laterIds.has(s.boqItemId)
        ) {
          push(
            s,
            `${SCHEDULE_KIND_LABELS[s.kind]} · later BOQ item`
          );
        }
      }
    }
    // Last install end drives testing / handover
    const installEnds = sameContract
      .filter((s) => s.kind === "installation")
      .map((s) => (s.id === source.id ? addDaysToIso(source.endDate, slipDays) : s.endDate));
    const maxInstall = installEnds.sort().at(-1);
    if (maxInstall) {
      for (const s of sameContract) {
        if (s.kind === "testing" || s.kind === "handover") {
          push(s, SCHEDULE_KIND_LABELS[s.kind]);
        }
      }
    }
  }

  if (source.kind === "testing") {
    for (const s of sameContract) {
      if (s.kind === "handover") push(s, "Handover");
    }
  }

  return proposals;
}

export function applyCascadeProposals(
  proposals: CascadeProposal[],
  opts?: { by?: string; contractId?: string | null }
): { ok: true } | { ok: false; error: string } {
  if (!proposals.length) return { ok: true };
  const data = read();
  const by = opts?.by ?? "User";
  const map = new Map(proposals.map((p) => [p.scheduleId, p]));
  const applied: CascadeProposal[] = [];
  const schedules = data.schedules.map((s) => {
    const p = map.get(s.id);
    if (!p) return s;
    if (isScheduleDateNa(s.startDate) || isScheduleDateNa(s.endDate)) return s;
    if (!isIsoDate(p.startDate) || !isIsoDate(p.endDate)) return s;
    applied.push(p);
    return normalizeSchedule({
      ...s,
      startDate: p.startDate,
      endDate: p.endDate,
      updatedAt: new Date().toISOString(),
    });
  });
  if (!applied.length) return { ok: true };
  const summary = `Cascade confirmed (+dates): ${applied
    .map(
      (p) =>
        `${p.label} ${formatScheduleDateRange(p.fromStartDate, p.fromEndDate)} to ${formatScheduleDateRange(p.startDate, p.endDate)}`
    )
    .join("; ")}`;
  const nextData = appendScheduleLog(
    { ...data, schedules },
    {
      by,
      contractId: opts?.contractId ?? schedules.find((s) => map.has(s.id))?.contractId ?? null,
      scheduleId: null,
      summary,
    }
  );
  write(nextData);
  syncDatedSystemTasks();
  return { ok: true };
}

export function markScheduleDone(
  id: string,
  opts?: { by?: string; done?: boolean; completedDate?: string | null }
): ScheduleWriteResult {
  const data = read();
  const current = data.schedules.find((s) => s.id === id);
  if (!current) return { ok: false, error: "Schedule line not found." };
  const by = opts?.by ?? "User";
  const done = opts?.done !== false;
  const now = new Date().toISOString();
  if (done) {
    const completed = (opts?.completedDate || "").trim();
    if (!completed || isScheduleDateNa(completed)) {
      return {
        ok: false,
        error: "Enter the completion date when marking done.",
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(completed)) {
      return { ok: false, error: "Completion date must be YYYY-MM-DD." };
    }
  }
  const next = normalizeSchedule({
    ...current,
    done,
    doneAt: done ? (opts?.completedDate || "").trim() : null,
    doneBy: done ? by : null,
    updatedAt: now,
  });
  const nextData = appendScheduleLog(
    {
      ...data,
      schedules: data.schedules.map((s) => (s.id === id ? next : s)),
    },
    {
      by,
      contractId: next.contractId,
      scheduleId: next.id,
      summary: done
        ? `Marked ${SCHEDULE_KIND_LABELS[next.kind]} done on ${formatDisplayDate(next.doneAt)}`
        : `Cleared done on ${SCHEDULE_KIND_LABELS[next.kind]}`,
    }
  );
  write(nextData);
  return { ok: true, line: next };
}

export function deleteSchedule(
  id: string,
  opts?: { by?: string }
): boolean {
  const data = read();
  const current = data.schedules.find((s) => s.id === id);
  if (!current) return false;
  const nextData = appendScheduleLog(
    {
      ...data,
      schedules: data.schedules.filter((s) => s.id !== id),
    },
    {
      by: opts?.by ?? "User",
      contractId: current.contractId,
      scheduleId: current.id,
      summary: `Deleted ${SCHEDULE_KIND_LABELS[current.kind]} ${formatScheduleDateRange(current.startDate, current.endDate)}`,
    }
  );
  write(nextData);
  return true;
}

/**
 * Master-only restart of the Schedules slice: clears lines + change log.
 * Contracts/tasks/BOQ stay. Create-schedules tasks are reopened when absent open.
 */
export function resetSchedulesSlice(opts?: { by?: string }): {
  cleared: number;
} {
  const data = read();
  const cleared = data.schedules.length;
  const by = opts?.by ?? "Master";
  // Reopen create_schedules if contract has no schedules after reset
  const tasks = data.tasks.map((t) =>
    t.catalogKey === "create_schedules" &&
    (t.status === "completed" || t.status === "not_required")
      ? {
          ...t,
          status: "pending" as const,
          completedAt: null,
        }
      : t
  );
  const nextData = appendScheduleLog(
    {
      ...data,
      schedules: [],
      scheduleChangeLog: [],
      tasks,
    },
    {
      by,
      contractId: null,
      scheduleId: null,
      summary: `Reset schedules slice (${cleared} lines cleared). Restart anytime via Master → Reset schedules slice.`,
    }
  );
  // Keep only the reset breadcrumb in the new log
  write({
    ...nextData,
    scheduleChangeLog: nextData.scheduleChangeLog.slice(-1),
  });
  return { cleared };
}

/** Σ DC line qty for one contract BOQ item. */
export function suppliedQty(
  contractId: string,
  boqItemId: string,
  data?: FlowhubData
): number {
  const d = data ?? read();
  let total = 0;
  for (const dc of d.deliveryChallans) {
    if (dc.contractId !== contractId) continue;
    for (const l of dc.lines) {
      if (l.boqItemId === boqItemId) total += Number(l.qty) || 0;
    }
  }
  return total;
}

export function installationProgressFor(
  contractId: string,
  boqItemId: string,
  data?: FlowhubData
): InstallationProgress | null {
  const d = data ?? read();
  return (
    d.installationProgress.find(
      (p) => p.contractId === contractId && p.boqItemId === boqItemId
    ) ?? null
  );
}

export function installedQty(
  contractId: string,
  boqItemId: string,
  data?: FlowhubData
): number {
  return installationProgressFor(contractId, boqItemId, data)?.installedQty ?? 0;
}

/** BOQ − supplied (never negative). */
export function leftToSupplyQty(
  contractId: string,
  boqItemId: string,
  data?: FlowhubData
): number {
  const d = data ?? read();
  const item = d.contracts
    .find((c) => c.id === contractId)
    ?.boq.find((b) => b.id === boqItemId);
  const boq = Number(item?.quantity) || 0;
  return Math.max(0, boq - suppliedQty(contractId, boqItemId, d));
}

/** Supplied − installed (cannot install what was not supplied). */
export function leftToInstallQty(
  contractId: string,
  boqItemId: string,
  data?: FlowhubData
): number {
  const d = data ?? read();
  return Math.max(
    0,
    suppliedQty(contractId, boqItemId, d) - installedQty(contractId, boqItemId, d)
  );
}

const QTY_EPS = 1e-9;

export type ExecutionWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function addDeliveryChallan(
  input: {
    contractId: string;
    dcNo: string;
    date: string;
    lines: DeliveryChallanLine[];
  },
  opts?: { by?: string | null }
): ExecutionWriteResult<DeliveryChallan> {
  const data = read();
  const contract = data.contracts.find((c) => c.id === input.contractId);
  if (!contract) return { ok: false, error: "Select a contract." };
  const dcNo = input.dcNo.trim();
  if (!dcNo) return { ok: false, error: "DC no. is required." };
  const date = input.date.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, error: "DC date is required." };
  const dup = data.deliveryChallans.some(
    (dc) =>
      dc.contractId === contract.id &&
      dc.dcNo.toLowerCase() === dcNo.toLowerCase()
  );
  if (dup)
    return {
      ok: false,
      error: `DC ${dcNo} already exists on ${contract.projectNo}.`,
    };

  const merged = new Map<string, number>();
  for (const l of input.lines) {
    const qty = Number(l.qty);
    if (!l.boqItemId || !Number.isFinite(qty) || qty <= 0) continue;
    merged.set(l.boqItemId, (merged.get(l.boqItemId) ?? 0) + qty);
  }
  if (merged.size === 0)
    return { ok: false, error: "Enter a qty greater than 0 for at least one item." };

  for (const [boqItemId, qty] of merged) {
    const item = contract.boq.find((b) => b.id === boqItemId);
    if (!item) return { ok: false, error: "Unknown BOQ item on this contract." };
    const left = leftToSupplyQty(contract.id, boqItemId, data);
    if (qty > left + QTY_EPS) {
      return {
        ok: false,
        error: `${item.name}: ${qty} exceeds qty left to supply (${left}).`,
      };
    }
  }

  const dc: DeliveryChallan = normalizeDeliveryChallan({
    id: crypto.randomUUID(),
    contractId: contract.id,
    dcNo,
    date,
    lines: [...merged].map(([boqItemId, qty]) => ({ boqItemId, qty })),
    createdAt: new Date().toISOString(),
    createdBy: opts?.by?.trim() || null,
  });
  write({ ...data, deliveryChallans: [...data.deliveryChallans, dc] });
  return { ok: true, value: dc };
}

/** Blocked when removal would leave installed qty above supplied. */
export function deleteDeliveryChallan(id: string): ExecutionWriteResult<null> {
  const data = read();
  const dc = data.deliveryChallans.find((d) => d.id === id);
  if (!dc) return { ok: false, error: "DC not found." };
  const next: FlowhubData = {
    ...data,
    deliveryChallans: data.deliveryChallans.filter((d) => d.id !== id),
  };
  for (const l of dc.lines) {
    const supplied = suppliedQty(dc.contractId, l.boqItemId, next);
    const installed = installedQty(dc.contractId, l.boqItemId, next);
    if (installed > supplied + QTY_EPS) {
      const item = data.contracts
        .find((c) => c.id === dc.contractId)
        ?.boq.find((b) => b.id === l.boqItemId);
      return {
        ok: false,
        error: `Cannot delete DC ${dc.dcNo}: ${item?.name ?? "item"} would have installed (${installed}) above supplied (${supplied}).`,
      };
    }
  }
  write(next);
  return { ok: true, value: null };
}

/** Set a new cumulative installed total; history keeps the delta. */
export function recordInstallationTotal(
  input: {
    contractId: string;
    boqItemId: string;
    newTotal: number;
    date: string;
  },
  opts?: { by?: string | null }
): ExecutionWriteResult<InstallationProgress> {
  const data = read();
  const contract = data.contracts.find((c) => c.id === input.contractId);
  if (!contract) return { ok: false, error: "Select a contract." };
  const item = contract.boq.find((b) => b.id === input.boqItemId);
  if (!item) return { ok: false, error: "Unknown BOQ item on this contract." };
  const total = Number(input.newTotal);
  if (!Number.isFinite(total) || total < 0)
    return { ok: false, error: "Enter a cumulative installed qty of 0 or more." };
  const date = input.date.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, error: "Update date is required." };
  const supplied = suppliedQty(contract.id, item.id, data);
  if (total > supplied + QTY_EPS) {
    return {
      ok: false,
      error: `${item.name}: installed total ${total} exceeds supplied ${supplied}.`,
    };
  }
  const existing = installationProgressFor(contract.id, item.id, data);
  const before = existing?.installedQty ?? 0;
  const delta = total - before;
  if (Math.abs(delta) < QTY_EPS)
    return { ok: false, error: `${item.name}: total is already ${before}.` };

  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    at: date,
    recordedAt: now,
    totalAfter: total,
    delta,
    by: opts?.by?.trim() || null,
  };
  const updated: InstallationProgress = normalizeInstallationProgress({
    id: existing?.id ?? crypto.randomUUID(),
    contractId: contract.id,
    boqItemId: item.id,
    installedQty: total,
    lastUpdatedAt: date,
    history: [...(existing?.history ?? []), entry],
  });
  write({
    ...data,
    installationProgress: existing
      ? data.installationProgress.map((p) =>
          p.id === existing.id ? updated : p
        )
      : [...data.installationProgress, updated],
  });
  return { ok: true, value: updated };
}

export function setNexusSpend(
  contractId: string,
  field: "spent" | "yetToSpend",
  amount: number | null
) {
  const data = read();
  if (!data.contracts.some((c) => c.id === contractId)) return;
  const costs = normalizeNexusCosts(data.nexusCosts);
  const prev = costs.contracts[contractId] ?? { spent: null, yetToSpend: null };
  const value = amount != null && Number.isFinite(amount) ? amount : null;
  const nextEntry = { ...prev, [field]: value };
  const contracts = { ...costs.contracts };
  if (nextEntry.spent == null && nextEntry.yetToSpend == null) {
    delete contracts[contractId];
  } else {
    contracts[contractId] = nextEntry;
  }
  write({
    ...data,
    nexusCosts: { contracts },
  });
}

/** Sort key for “next items” — earliest relevant date on the line. */
export function scheduleSortDate(s: ScheduleLine): string {
  const d = s.startDate || s.endDate;
  if (!d || isScheduleDateNa(d)) return "9999-99-99";
  return d;
}

function subscribeWorkspace(onStoreChange: () => void) {
  const handler = () => onStoreChange();
  window.addEventListener("flowhub-data", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("flowhub-data", handler);
    window.removeEventListener("storage", handler);
  };
}

/** True after Postgres workspace has been loaded (or hydrate gave up to local). */
export function useWorkspaceReady(): boolean {
  return useSyncExternalStore(
    subscribeWorkspace,
    () => serverHydrated,
    () => false
  );
}

export function useFlowhubData(): FlowhubData {
  return useSyncExternalStore(
    subscribeWorkspace,
    () => {
      if (!clientHydrated) {
        clientSnapshot = readLocal();
        clientHydrated = true;
        rememberEditBase(clientSnapshot);
      }
      return clientSnapshot;
    },
    () => empty
  );
}
