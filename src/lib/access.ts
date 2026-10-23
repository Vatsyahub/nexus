import type { ClearanceRole } from "@/lib/clearance";

export type AccessLevel = "block" | "view" | "edit";

export type DoorId =
  | "home"
  | "contracts"
  | "billing"
  | "payments"
  | "tasks"
  | "schedules"
  | "expenses"
  | "reports_outstanding"
  | "reports_sales"
  | "reports_accounts"
  | "reports_reconciliation"
  | "reports_operations"
  | "reports_other"
  | "settings"
  | "users"
  | "nexus_core";

export type AccessMap = Record<DoorId, AccessLevel>;

/** View all, Edit all, and Block all never change these pages. */
export const BULK_SKIPPED_DOORS: readonly DoorId[] = [
  "home",
  "settings",
  "users",
  "nexus_core",
];

export const LAST_USER_EDIT_ERROR =
  "At least one Master must keep User management on Edit. View cannot save access, so this change was not saved.";

export const DOORS: {
  id: DoorId;
  label: string;
  group: string;
  /** Home and Settings cannot be blocked. */
  floor?: AccessLevel;
}[] = [
  { id: "home", label: "Home", group: "Hub", floor: "view" },
  { id: "contracts", label: "Contracts", group: "Hub" },
  { id: "billing", label: "Billing", group: "Hub" },
  { id: "payments", label: "Payments", group: "Hub" },
  { id: "tasks", label: "Tasks", group: "Hub" },
  { id: "schedules", label: "Schedules", group: "Hub" },
  { id: "expenses", label: "Expenses", group: "Hub" },
  { id: "settings", label: "Settings", group: "Hub", floor: "view" },
  { id: "users", label: "User management", group: "Hub" },
  { id: "nexus_core", label: "Nexus Core", group: "Hub" },
  {
    id: "reports_outstanding",
    label: "Invoices and Outstandings",
    group: "Reports",
  },
  { id: "reports_sales", label: "Sales", group: "Reports" },
  { id: "reports_accounts", label: "Accounts", group: "Reports" },
  { id: "reports_reconciliation", label: "Reconciliation", group: "Reports" },
  { id: "reports_operations", label: "Operations", group: "Reports" },
  { id: "reports_other", label: "Other reports", group: "Reports" },
];

const REPORT_DOORS: DoorId[] = [
  "reports_outstanding",
  "reports_sales",
  "reports_accounts",
  "reports_reconciliation",
  "reports_operations",
  "reports_other",
];

/**
 * Starting ticks for a new person (no saved access map).
 * Edit on every door, except User management (Master only)
 * and Nexus Core (Director and Master only).
 */
export function defaultAccess(
  role: ClearanceRole,
  _department?: string | null
): AccessMap {
  const map = Object.fromEntries(
    DOORS.map((d) => [d.id, "edit"])
  ) as AccessMap;
  if (role !== "master") map.users = "block";
  if (role !== "master" && role !== "director") map.nexus_core = "block";
  return map;
}

export function coerceAccess(map: AccessMap): AccessMap {
  const next = { ...map };
  for (const door of DOORS) {
    const level = next[door.id];
    if (level !== "block" && level !== "view" && level !== "edit") {
      next[door.id] = "block";
    }
    if (door.floor === "view" && next[door.id] === "block") {
      next[door.id] = "view";
    }
  }
  return next;
}

/** Sets every page except Home, Settings, User management, and Nexus Core. */
export function applyBulkAccess(map: AccessMap, level: AccessLevel): AccessMap {
  const next = { ...map };
  for (const door of DOORS) {
    if (BULK_SKIPPED_DOORS.includes(door.id)) continue;
    next[door.id] = level;
  }
  return next;
}

export function storedUsersLevel(
  access: unknown,
  role: ClearanceRole
): AccessLevel {
  return parseAccess(access, role).map.users;
}

export type StoredAccessUser = { id: string; access: unknown };

export type AccessChoiceContext = {
  role: ClearanceRole;
  masterCount: number;
  /** User management level already stored for this person. */
  storedUsers: AccessLevel;
  /** Other Masters whose stored User management is Edit. */
  otherMastersOnEdit: number;
};

/**
 * Local ticks before Save. Does not write.
 * Non-masters stay on Block for User management.
 * Anyone who is not Master or Director stays on Block for Nexus Core.
 * The only Master stays on Edit for User management.
 */
export function presentAccess(
  map: AccessMap,
  ctx: { role: ClearanceRole; masterCount: number }
): AccessMap {
  const next = coerceAccess(map);
  if (ctx.role !== "master") next.users = "block";
  else if (ctx.masterCount <= 1) next.users = "edit";
  if (ctx.role !== "master" && ctx.role !== "director") next.nexus_core = "block";
  return next;
}

/** Whether a row button on the Access screen cannot be chosen. */
export function doorChoiceDisabled(
  doorId: DoorId,
  level: AccessLevel,
  ctx: AccessChoiceContext
): boolean {
  const door = DOORS.find((item) => item.id === doorId);
  if (door?.floor === "view" && level === "block") return true;

  if (doorId === "users") {
    if (ctx.role !== "master") return level !== "block";
    const soleMaster = ctx.masterCount <= 1;
    const lastEdit =
      ctx.storedUsers === "edit" && ctx.otherMastersOnEdit === 0;
    if (soleMaster || lastEdit) return level !== "edit";
  }

  if (doorId === "nexus_core") {
    if (ctx.role !== "master" && ctx.role !== "director") {
      return level !== "block";
    }
  }

  return false;
}

export type AccessSaveResult =
  | { ok: true; map: AccessMap }
  | { ok: false; error: string };

/**
 * Access that Save may store.
 * Rejects a write that would leave no Master on Edit for User management.
 * The caller must skip the database write when `ok` is false.
 */
export function resolveUserAccessSave(
  raw: AccessMap,
  target: { id: string; role: ClearanceRole; access: unknown },
  masters: StoredAccessUser[]
): AccessSaveResult {
  const next = coerceAccess(raw);

  if (target.role !== "master" && target.role !== "director") {
    next.nexus_core = "block";
  }
  if (target.role !== "master") {
    next.users = "block";
    return { ok: true, map: next };
  }

  const rows = masters.some((master) => master.id === target.id)
    ? masters
    : [...masters, { id: target.id, access: target.access }];

  if (rows.length <= 1) {
    next.users = "edit";
    return { ok: true, map: next };
  }

  const before = rows.filter(
    (master) => storedUsersLevel(master.access, "master") === "edit"
  ).length;
  const after = rows.filter((master) => {
    const level =
      master.id === target.id
        ? next.users
        : storedUsersLevel(master.access, "master");
    return level === "edit";
  }).length;

  if (before > 0 && after === 0) {
    return { ok: false, error: LAST_USER_EDIT_ERROR };
  }

  return { ok: true, map: next };
}

export function parseAccess(
  raw: unknown,
  role: ClearanceRole,
  department?: string | null
): { map: AccessMap; custom: boolean } {
  const base = defaultAccess(role, department);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { map: base, custom: false };
  }
  const merged = { ...base };
  for (const door of DOORS) {
    const value = (raw as Record<string, unknown>)[door.id];
    if (value === "block" || value === "view" || value === "edit") {
      merged[door.id] = value;
    }
  }
  return { map: coerceAccess(merged), custom: true };
}

export function doorForPath(pathname: string): DoorId | null {
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/contracts")) return "contracts";
  if (pathname.startsWith("/billing")) return "billing";
  if (pathname.startsWith("/payments")) return "payments";
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/schedules")) return "schedules";
  if (pathname.startsWith("/expenses")) return "expenses";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/nexus-core")) return "nexus_core";
  if (pathname.startsWith("/reports/outstanding")) return "reports_outstanding";
  if (pathname.startsWith("/reports/sales")) return "reports_sales";
  if (pathname.startsWith("/reports/accounts")) return "reports_accounts";
  if (pathname.startsWith("/reports/reconciliation"))
    return "reports_reconciliation";
  if (pathname.startsWith("/reports/execution")) return "reports_operations";
  if (pathname.startsWith("/reports/other")) return "reports_other";
  if (pathname === "/reports" || pathname.startsWith("/reports/"))
    return "reports_outstanding";
  return null;
}

export function levelForPath(pathname: string, map: AccessMap): AccessLevel {
  if (pathname.startsWith("/settings/password")) return "edit";
  if (pathname === "/reports") {
    const any = REPORT_DOORS.some((id) => map[id] !== "block");
    return any ? "view" : "block";
  }
  const door = doorForPath(pathname);
  if (!door) return "edit";
  const level = map[door] ?? "block";
  if (door === "home" && level === "block") return "view";
  if (door === "settings" && level === "block") return "view";
  return level;
}

export function reportDoorForHref(href: string): DoorId | null {
  if (href.startsWith("/reports/outstanding")) return "reports_outstanding";
  if (href.startsWith("/reports/sales")) return "reports_sales";
  if (href.startsWith("/reports/accounts")) return "reports_accounts";
  if (href.startsWith("/reports/reconciliation")) return "reports_reconciliation";
  if (href.startsWith("/reports/execution")) return "reports_operations";
  if (href.startsWith("/reports/other")) return "reports_other";
  return null;
}

/** Edit is full use of that page, including the starting ticks. */
export function mayMutate(
  level: AccessLevel,
  _legacyAllowed?: boolean,
  _custom?: boolean
) {
  return level === "edit";
}
