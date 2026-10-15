export type BillingTerms = Record<string, number>;

export type BoqItem = {
  id: string;
  catalogKey: string;
  name: string;
  unit: string;
  rate: number;
  quantity: number;
};

export type ExpenseEditRecord = {
  id: string;
  at: string;
  by: string;
  /** Short description of the change or deletion */
  summary: string;
};

export type ContractExpense = {
  id: string;
  amount: number;
  date: string;
  personPaid: string;
  reason: string;
  /** Free-text category; hub remembers new values for the dropdown */
  category: string;
  createdAt: string;
  /** Who added the expense (display name) */
  createdBy: string | null;
  editHistory: ExpenseEditRecord[];
  /** Soft-delete — row kept for history */
  deletedAt: string | null;
  deletedBy: string | null;
};

/** Manager+ can edit expense fields. */
export function canEditExpenses(role: string | null | undefined): boolean {
  return role === "manager" || role === "director" || role === "master";
}

/** Manager+ can mark contract retention recovered (same bar as expense edit). */
export function canMarkRetentionRecovered(
  role: string | null | undefined
): boolean {
  return role === "manager" || role === "director" || role === "master";
}

/** Master only: soft-delete expense and view/clear edit history. */
export function canDeleteExpenses(role: string | null | undefined): boolean {
  return role === "master";
}

export function canViewExpenseHistory(role: string | null | undefined): boolean {
  return role === "master";
}

/** Seed categories always offered in the expense dropdown */
export const SEED_EXPENSE_CATEGORIES = [
  "Travel",
  "Courier",
  "Subcontractor",
  "Site consumables",
  "Lodging",
  "Miscellaneous",
] as const;

export type GuaranteeEditRecord = {
  id: string;
  kind: "ABG" | "PBG";
  at: string;
  by: string;
  summary: string;
};

export type BoqAmendmentChangeKind = "added" | "removed" | "qty_changed";

export type BoqAmendmentLineDiff = {
  boqItemId: string;
  name: string;
  unit: string;
  rate: number;
  kind: BoqAmendmentChangeKind;
  /** Null when the line was added by this amendment */
  previousQty: number | null;
  /** Null when the line was removed by this amendment */
  newQty: number | null;
};

/** One confirmed BOQ amendment. Contract BOQ + orderValue reflect the latest. */
export type BoqAmendment = {
  id: string;
  /** 1-based sequence on this contract; drives the default number (A1, A2…) */
  seq: number;
  /** Amendment no. as recorded (defaults to `A{seq}`) */
  number: string;
  /** Amendment date (YYYY-MM-DD) */
  date: string;
  /** Click timestamp (ISO) */
  at: string;
  by: string | null;
  note: string;
  previousOrderValue: number;
  newOrderValue: number;
  previousBoqTotal: number;
  newBoqTotal: number;
  lineDiffs: BoqAmendmentLineDiff[];
  /** Full BOQ after this amendment */
  boqSnapshot: BoqItem[];
};

export function boqTotal(boq: BoqItem[]): number {
  return boq.reduce(
    (s, l) => s + (Number(l.rate) || 0) * (Number(l.quantity) || 0),
    0
  );
}

export function defaultAmendmentNumber(seq: number): string {
  return `A${seq}`;
}

/** BOQ amendments: Master / Director always; managers & users in Contracts. */
export function canAmendBoq(opts: {
  clearance: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  const role = (opts.clearance || "").toLowerCase();
  if (role === "master" || role === "director") return true;
  if (!["manager", "user"].includes(role)) return false;
  const dept = (opts.department || "").trim().toLowerCase();
  return dept.startsWith("contracts");
}

export type Contract = {
  id: string;
  projectName: string;
  projectNo: string;
  orderNos: string;
  orderDate: string;
  /** Formerly order end date — renamed Closure date */
  closureDate: string;
  orderValue: number;
  gstApplicable: boolean;
  city: string;
  state: string;
  country: string;
  billingTerms: BillingTerms;
  paymentDueDays: number;
  /** Retention % of net on each invoice payment (0–10) */
  retentionPercent: number;
  /** TDS % of invoice net — default 2; editable per contract */
  tdsPercent: number;
  /** DLP whole months (6–60); clock starts from actual handover */
  dlpMonths: number;
  abgRequired: boolean;
  /** Percent of order value (net / before GST) */
  abgPercent: number | null;
  /**
   * Saved rupee amount. New contracts start at percent × order value.
   * Later saves keep this figure; it is not rewritten from the percent.
   */
  abgValue: number | null;
  abgNumber: string | null;
  abgDate: string | null;
  abgExpiry: string | null;
  /** Issuing bank name (free text) */
  abgBankName: string | null;
  /** True when the ABG has been retrieved / taken back from the bank */
  abgRetrieved: boolean;
  abgRetrievedDate: string | null;
  pbgRequired: boolean;
  pbgPercent: number | null;
  pbgValue: number | null;
  pbgNumber: string | null;
  pbgDate: string | null;
  pbgExpiry: string | null;
  /** Issuing bank name (free text) */
  pbgBankName: string | null;
  /** True when the PBG has been retrieved / taken back from the bank */
  pbgRetrieved: boolean;
  pbgRetrievedDate: string | null;
  /**
   * YYYY-MM-DD when retention held on this contract was marked recovered
   * as a whole (contract-level flag). Null = not recovered.
   */
  retentionRecoveredAt: string | null;
  /** Soft free-text until filled */
  contractorAssigned: string;
  boq: BoqItem[];
  /** Confirmed BOQ amendments, oldest first */
  amendments: BoqAmendment[];
  expenses: ContractExpense[];
  guaranteeEdits: GuaranteeEditRecord[];
  /**
   * Active, On hold, or Completed.
   * "complete" is the older stored word for Completed.
   * Completed is set by handover, not by hand.
   */
  status: "active" | "on_hold" | "completed" | "complete";
  createdAt: string;
};

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "on_hold"
  | "awaiting_verification"
  | "completed"
  | "not_required";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type TaskCatalogKey =
  | "kickoff"
  | "gad"
  | "create_abg"
  | "create_pbg"
  | "create_schedules"
  | "boq_amendment"
  | "bg_expiry_abg"
  | "bg_expiry_pbg"
  | "collect_retention"
  | "custom";

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  on_hold: "On hold",
  awaiting_verification: "Waiting for manager",
  completed: "Completed",
  not_required: "Not required",
};

/** Standard steps + custom. Some keys are auto-created by hub rules. */
export const TASK_CATALOG: {
  key: TaskCatalogKey;
  title: string;
  system: boolean;
}[] = [
  { key: "kickoff", title: "Kick off meeting pending", system: true },
  { key: "gad", title: "Finalise Drawings/GAD", system: true },
  { key: "create_abg", title: "Create ABG", system: true },
  { key: "create_pbg", title: "Create PBG", system: true },
  { key: "create_schedules", title: "Create schedules", system: true },
  { key: "boq_amendment", title: "Finalise BOQ amendment", system: true },
  { key: "bg_expiry_abg", title: "Chase ABG expiry", system: true },
  { key: "bg_expiry_pbg", title: "Chase PBG expiry", system: true },
  { key: "collect_retention", title: "Collect retention", system: true },
  { key: "custom", title: "Custom task", system: false },
];

/** BG expiry chase task appears this many months before expiry. */
export const BG_EXPIRY_LEAD_MONTHS = 2;
/** Collect retention task appears this many days before DLP end. */
export const RETENTION_LEAD_DAYS = 30;

export const TASK_COMPLETED_VISIBLE_DAYS = 30;

export type Task = {
  id: string;
  title: string;
  /** Required for new tasks; legacy rows may still be null until edited. */
  contractId: string | null;
  department: string | null;
  /** Equal owners from the department; empty = department-only / unassigned people. */
  assignees: string[];
  status: TaskStatus;
  dueDate: string | null;
  parentId: string | null;
  source: "system" | "manual";
  catalogKey: TaskCatalogKey | null;
  priority: TaskPriority;
  /** Latest progress note only (not a timeline). */
  notes: string;
  notesUpdatedAt: string | null;
  completedAt: string | null;
  notRequiredReason: string | null;
  /**
   * Due date (YYYY-MM-DD) already covered by the one-time overdue notice.
   * A reload or another overdue day with the same deadline does not send again.
   */
  overdueNotifiedFor?: string | null;
  /** Due date (YYYY-MM-DD) already covered by the one-time due-today notice. */
  dueTodayNotifiedFor?: string | null;
  /**
   * Department on the User account when they asked for verification.
   * Null while waiting means the notice went to Master (no department to tie).
   */
  verificationDepartment?: string | null;
  verificationRequestedBy?: string | null;
  /**
   * Set when Master deletes the task. The row stays so a system task
   * (including a bank-guarantee expiry chase) is not created again.
   * Lists and counts skip it.
   */
  deletedAt?: string | null;
  createdAt: string;
};

export type ItemCatalogEntry = {
  key: string;
  name: string;
  unit: string;
  lastRate: number;
};

export type InvoiceType = "PI" | "TI";

export type InvoiceLine = {
  boqItemId: string;
  itemName: string;
  termKey: string;
  billedQty: number;
  rate: number;
  termPercent: number;
  lineNet: number;
};

export type InvoiceExtraCharge = {
  id: string;
  label: string;
  amount: number;
};

export type Invoice = {
  id: string;
  type: InvoiceType;
  number: string;
  date: string;
  contractId: string;
  lines: InvoiceLine[];
  netAmount: number;
  gstAmount: number;
  /** Post-GST charges (no GST on these) */
  extraCharges: InvoiceExtraCharge[];
  finalAmount: number;
  /** Set when a PI was converted to this TI via one-click / edit */
  convertedFromPiId: string | null;
  createdAt: string;
};

export type PaymentLink = "TI" | "PI" | "unlinked";

export type Payment = {
  id: string;
  contractId: string;
  /** Null when unlinked */
  invoiceId: string | null;
  link: PaymentLink;
  date: string;
  /** Cash received (net + GST typically) */
  netAmount: number;
  gstAmount: number;
  retentionAmount: number;
  tdsAmount: number;
  otherDeductions: number;
  /** Optional note for otherDeductions; missing on old records → empty */
  otherDeductionReason: string;
  createdAt: string;
};

/** Supply / installation are per BOQ item; testing / handover once per contract. */
export type ScheduleKind = "supply" | "installation" | "testing" | "handover";

export type ScheduleLine = {
  id: string;
  contractId: string;
  /** Required for supply / installation; null for testing / handover */
  boqItemId: string | null;
  kind: ScheduleKind;
  /** Qty for supply / installation (may split across lines); null for testing / handover */
  quantity: number | null;
  startDate: string;
  endDate: string;
  committed: boolean;
  baselineStartDate: string;
  baselineEndDate: string;
  /** True when planned work was actually finished */
  done: boolean;
  /** Completion date (YYYY-MM-DD) when marked done — not the click timestamp */
  doneAt: string | null;
  doneBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleChangeLogEntry = {
  id: string;
  at: string;
  by: string;
  contractId: string | null;
  scheduleId: string | null;
  summary: string;
};

export type DeliveryChallanLine = {
  boqItemId: string;
  qty: number;
};

/** One delivery challan (dispatch) against one contract; many BOQ items. */
export type DeliveryChallan = {
  id: string;
  contractId: string;
  dcNo: string;
  /** DC date (YYYY-MM-DD) */
  date: string;
  lines: DeliveryChallanLine[];
  createdAt: string;
  createdBy: string | null;
};

export type InstallationHistoryEntry = {
  id: string;
  /** Update date (YYYY-MM-DD) chosen by the user */
  at: string;
  /** Click timestamp (ISO) */
  recordedAt: string;
  totalAfter: number;
  delta: number;
  by: string | null;
};

/** Cumulative installed qty for one BOQ item on one contract. */
export type InstallationProgress = {
  id: string;
  contractId: string;
  boqItemId: string;
  installedQty: number;
  /** YYYY-MM-DD of the latest update */
  lastUpdatedAt: string | null;
  history: InstallationHistoryEntry[];
};

/** Edit dispatch / installation: Master always; else manager/user/director in Contracts or Installation. */
export function canEditExecution(opts: {
  clearance: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  const role = (opts.clearance || "").toLowerCase();
  if (role === "master") return true;
  if (!["manager", "user", "director"].includes(role)) return false;
  const dept = (opts.department || "").trim().toLowerCase();
  return dept.startsWith("contracts") || dept.startsWith("installation");
}

export type HubNotificationKind =
  | "task_assigned"
  | "task_department"
  | "task_created"
  | "task_overdue"
  | "task_due_today"
  | "task_verify";

/**
 * After a user marks a notification read, it stays visible for this many hours,
 * then is removed for them (and eventually hard-deleted). Unread stay until read.
 */
export const NOTIFICATION_TTL_HOURS = 24;

/** Unread notices are removed this many days after they were created. */
export const NOTIFICATION_UNREAD_TTL_DAYS = 21;

/**
 * In-app notification. Audience is named people, or — when nobody is named —
 * managers of a department. Due-today rows include both. Master-only rows
 * set audienceClearance to "master".
 * Each client filters for the signed-in user.
 * An unread notice lasts NOTIFICATION_UNREAD_TTL_DAYS from createdAt.
 * Once a person has read it, that person's copy lasts NOTIFICATION_TTL_HOURS
 * from their read time. The row is hard-deleted when no recipient should
 * still see it. Nothing is archived.
 */
export type HubNotification = {
  id: string;
  createdAt: string;
  kind: HubNotificationKind;
  title: string;
  body: string;
  href: string;
  taskId: string | null;
  contractId: string | null;
  /** Matched to session user name (case-insensitive). */
  audienceUserNames: string[];
  /**
   * Managers whose department matches. Used alone when nobody is named.
   * Due-today rows set this together with audienceUserNames so assignees
   * and department managers share one notice. Users in the department do
   * not see department rows unless they are also named.
   */
  audienceDepartment: string | null;
  /**
   * "master" when a completion cannot be tied to a department.
   * Only Master clearance sees those rows. Absent on older notices.
   */
  audienceClearance?: "master" | null;
  /** Display name of who triggered the event (optional). */
  createdBy: string | null;
  /** User ids who marked this read. */
  readByUserIds: string[];
  /** ISO timestamps of when each user marked this read (drives the 24h post-read TTL). */
  readAtByUserIds: Record<string, string>;
};

export type FlowhubData = {
  /**
   * Monotonic revision from seeds / repairs. Stale browser tabs with a lower
   * revision cannot overwrite newer Postgres data on PUT.
   */
  workspaceRevision?: number;
  contracts: Contract[];
  tasks: Task[];
  itemCatalog: ItemCatalogEntry[];
  invoices: Invoice[];
  payments: Payment[];
  schedules: ScheduleLine[];
  /** Separate from the schedules list — Change log tab */
  scheduleChangeLog: ScheduleChangeLogEntry[];
  /** In-app notifications for task / job assignment */
  notifications: HubNotification[];
  /** Custom departments Master adds (seed list always available too) */
  customDepartments: string[];
  /** Extra expense categories users typed (seed list always available too) */
  expenseCategories: string[];
  /** Dispatch — delivery challans (many per contract over time) */
  deliveryChallans: DeliveryChallan[];
  /** Installation — cumulative installed qty per contract + BOQ item */
  installationProgress: InstallationProgress[];
  /**
   * Nexus Core cost centre. Column headers are defined once for every
   * contract. Absent on workspaces saved before Nexus Core.
   */
  nexusCosts?: NexusCosts;
};

/** One rate-per-unit column, reused on every contract's BOQ. */
export type NexusCostColumn = {
  id: string;
  header: string;
};

/** Costs the Director typed for one contract. */
export type NexusContractCost = {
  /** Used only when no BOQ rate on this contract is filled. */
  directCost: number | null;
  /** boqItemId → columnId → rate per unit. */
  lineRates: Record<string, Record<string, number>>;
};

export type NexusCosts = {
  columns: NexusCostColumn[];
  contracts: Record<string, NexusContractCost>;
};

export const EMPTY_NEXUS_COSTS: NexusCosts = {
  columns: [],
  contracts: {},
};

/** Slice marker: ask to “restart schedules” or use Master Reset schedules slice. */
export const SCHEDULES_SLICE_ID = "schedules-v1-2026-10-12";

/** Sentinel date value — not required / not applicable */
export const SCHEDULE_DATE_NA = "NA";

export function isScheduleDateNa(value: string | null | undefined): boolean {
  return (value || "").trim().toUpperCase() === SCHEDULE_DATE_NA;
}

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  supply: "Supply",
  installation: "Installation",
  testing: "Testing",
  handover: "Handover",
};

/** Near-date highlight starts this many days before a schedule date */
export const SCHEDULE_NEAR_DAYS = 30;

export const SEED_DEPARTMENTS = [
  "Contracts Department",
  "Accounts Department",
  "Drawings Department",
  "Installation Department",
] as const;

/** UI label: first word only (e.g. "Contracts Department" → "Contracts"). */
export function departmentDisplayName(dept: string | null | undefined): string {
  if (!dept) return "";
  const first = dept.trim().split(/\s+/)[0];
  return first || dept;
}

/** @deprecated use SEED_DEPARTMENTS + customDepartments */
export const DEPARTMENTS = [
  ...SEED_DEPARTMENTS,
  "Directors",
] as const;

export const DEFAULT_BILLING_TERM_KEYS = [
  "advance",
  "gad",
  "supply",
  "installation",
  "testing",
  "handover",
] as const;

export const TERM_LABELS: Record<string, string> = {
  advance: "Advance",
  gad: "GAD",
  supply: "Supply",
  installation: "Installation",
  testing: "Testing",
  handover: "Handover",
};

/**
 * Stable order for billing terms: Advance → GAD → Supply → Installation →
 * Testing → Handover, then any custom terms alphabetically.
 * When `onlyPositive` is true, skips terms at 0% (invoice term dropdowns).
 */
export function orderedBillingTermKeys(
  terms: BillingTerms,
  opts?: { onlyPositive?: boolean }
): string[] {
  const onlyPositive = opts?.onlyPositive ?? false;
  const keys = Object.keys(terms);
  const include = (k: string) =>
    keys.includes(k) && (!onlyPositive || (Number(terms[k]) || 0) > 0);
  const defaults = DEFAULT_BILLING_TERM_KEYS.filter(include);
  const custom = keys
    .filter(
      (k) =>
        !(DEFAULT_BILLING_TERM_KEYS as readonly string[]).includes(k) &&
        include(k)
    )
    .sort((a, b) => a.localeCompare(b));
  return [...defaults, ...custom];
}

export const COMPANY_NAME = "Cradle Runways (I) Pvt. Ltd.";
export const HUB_NAME = "Nexus";
export const HUB_TAGLINE = "Where every contract breathes.";
export const GST_RATE = 0.18;
export const DEFAULT_TDS_PERCENT = 2;

export function guaranteeAmount(
  orderValue: number,
  percent: number | null | undefined
): number | null {
  if (percent == null || Number.isNaN(percent)) return null;
  return (orderValue * percent) / 100;
}

/**
 * True once the guarantee number, creation date, and bank are all saved.
 * Until then a required guarantee can still be marked not required.
 */
export function guaranteeIdentitySaved(
  number: string | null | undefined,
  date: string | null | undefined,
  bank: string | null | undefined
): boolean {
  return Boolean(number?.trim() && date?.trim() && bank?.trim());
}
