import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth, signOut, unstable_update } from "@/auth";
import {
  loginIdFromToken,
  responseForClosedAccount,
} from "@/lib/account-session";
import { prisma } from "@/lib/prisma";
import {
  pruneClearedNotices,
  purgeExpiredNotifications,
  restrictNewClearsToUser,
  stampClearedNotices,
  type NoticeAudienceMember,
} from "@/lib/notification-ttl";
import { purgeExpiredScheduleChangeLog } from "@/lib/schedule-change-log";
import { normalizeTaskDeadlineChangeLog } from "@/lib/task-deadline-log";
import { departmentCatalogFields } from "@/lib/departments";
import { EMPTY_NEXUS_COSTS, type FlowhubData } from "@/lib/types";
import { normalizeNexusCosts } from "@/lib/nexus-core";
import { defaultAccess } from "@/lib/access";
import {
  resolveWorkspaceWrite,
  STALE_WORKSPACE_SAVE_MESSAGE,
  workspaceForAccount,
} from "@/lib/workspace-guard";
import type { TaskEditContext } from "@/lib/task-permissions";
import { isWorkspaceChangeRequest } from "@/lib/workspace-changes";
import type { ClearanceRole } from "@/lib/clearance";
import { writeWorkspaceIfRevision } from "@/lib/workspace-commit";
import { revisionWriteLanded } from "@/lib/workspace-revision";

const STORE_ID = "default";

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

async function readLoginToken(req: Request) {
  const secret = process.env.AUTH_SECRET;
  const secure = await getToken({ req, secret, secureCookie: true });
  if (secure) return secure;
  return getToken({ req, secret, secureCookie: false });
}

/** The signed-in account, read from the user row rather than the cookie flag. */
async function accountForRequest(req: Request) {
  const session = await auth();
  const token = await readLoginToken(req);
  const loginId = loginIdFromToken(token, session?.user?.id);
  if (!loginId) return { loginId: "", row: null, session };
  const row = await prisma.user.findUnique({
    where: { id: loginId },
    select: { id: true, mustChangePassword: true },
  });
  return { loginId, row, session };
}

const accountActions = {
  signOut: async () => {
    await signOut({ redirect: false });
  },
  refreshSession: async () => {
    await unstable_update({});
  },
};

async function audienceMembers(): Promise<NoticeAudienceMember[]> {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, department: true, clearance: true },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    department: u.department,
    clearance: String(u.clearance).toLowerCase(),
  }));
}

function asFlowhubData(
  raw: unknown,
  members?: NoticeAudienceMember[]
): FlowhubData {
  if (!raw || typeof raw !== "object") return empty;
  const parsed = { ...empty, ...(raw as FlowhubData) };
  const clearedNotices = pruneClearedNotices(parsed.clearedNotices);
  return {
    workspaceRevision:
      typeof parsed.workspaceRevision === "number"
        ? parsed.workspaceRevision
        : 0,
    contracts: parsed.contracts ?? [],
    tasks: parsed.tasks ?? [],
    itemCatalog: parsed.itemCatalog ?? [],
    invoices: parsed.invoices ?? [],
    payments: parsed.payments ?? [],
    schedules: parsed.schedules ?? [],
    scheduleChangeLog: purgeExpiredScheduleChangeLog(parsed.scheduleChangeLog),
    taskDeadlineChangeLog: normalizeTaskDeadlineChangeLog(
      parsed.taskDeadlineChangeLog
    ),
    // Unread: 21 days from creation. Read: 24 hours from that read.
    // Department rows stay until every recipient's case is spent.
    notifications: purgeExpiredNotifications(
      stampClearedNotices(parsed.notifications, clearedNotices),
      Date.now(),
      members
    ),
    clearedNotices,
    ...departmentCatalogFields(parsed),
    expenseCategories: parsed.expenseCategories ?? [],
    deliveryChallans: parsed.deliveryChallans ?? [],
    installationProgress: parsed.installationProgress ?? [],
    nexusCosts: normalizeNexusCosts(parsed.nexusCosts),
  };
}

export async function GET(req: Request) {
  const account = await accountForRequest(req);
  if (!account.loginId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const closed = await responseForClosedAccount(
    account.row
      ? { mustChangePassword: account.row.mustChangePassword }
      : null,
    accountActions,
    "read"
  );
  if (closed) {
    return NextResponse.json(closed.body, { status: closed.status });
  }
  const session = account.session;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await prisma.workspaceStore.findUnique({
    where: { id: STORE_ID },
  });

  const members = await audienceMembers();
  const stored = (row?.data ?? null) as FlowhubData | null;
  let data = asFlowhubData(stored ?? empty, members);
  const rawNotificationCount = Array.isArray(stored?.notifications)
    ? stored.notifications.length
    : 0;
  const rawLogCount = Array.isArray(stored?.scheduleChangeLog)
    ? stored.scheduleChangeLog.length
    : 0;
  // Persist purge so spent notifications and 14-day change-log rows leave the DB.
  // Only when the hub is still the revision this read just saw.
  if (
    row &&
    (data.notifications.length < rawNotificationCount ||
      data.scheduleChangeLog.length < rawLogCount)
  ) {
    const readRevision = data.workspaceRevision ?? 0;
    const wrote = await writeWorkspaceIfRevision(data, readRevision);
    if (!revisionWriteLanded(wrote)) {
      const again = await prisma.workspaceStore.findUnique({
        where: { id: STORE_ID },
      });
      const fresh = (again?.data ?? null) as FlowhubData | null;
      data = asFlowhubData(fresh ?? empty, members);
    }
  }

  const access = session.user.access ?? defaultAccess(session.user.clearance);
  return NextResponse.json(
    workspaceForAccount(data, access, session.user.clearance)
  );
}

export async function PUT(req: Request) {
  const account = await accountForRequest(req);
  if (!account.loginId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const closed = await responseForClosedAccount(
    account.row
      ? { mustChangePassword: account.row.mustChangePassword }
      : null,
    accountActions,
    "write"
  );
  if (closed) {
    return NextResponse.json(closed.body, { status: closed.status });
  }
  const session = account.session;
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const access =
    session.user.access ?? defaultAccess(session.user.clearance);
  const clearance = (session.user.clearance ?? "user") as ClearanceRole;

  const members = await audienceMembers();
  const actorMember = members.find((member) => member.id === session.user.id);
  const taskEdit: TaskEditContext = {
    actor: {
      name: actorMember?.name ?? session.user.name,
      clearance,
      department: actorMember?.department ?? null,
    },
    people: members,
  };

  // The page address is ignored. Each slice follows this account's door.
  // Changes are applied onto the hub stored now. A full snapshot is not stored.
  const existing = await prisma.workspaceStore.findUnique({
    where: { id: STORE_ID },
  });
  const current = asFlowhubData(existing?.data ?? empty, members);
  const decision = resolveWorkspaceWrite(
    current,
    isWorkspaceChangeRequest(body) ? body : asFlowhubData(body, members),
    access,
    clearance,
    taskEdit
  );
  if (decision.action === "skip") {
    const stale = decision.skipped === "refuse-stale-revision";
    return NextResponse.json(
      {
        ok: false,
        skipped: decision.skipped,
        error: stale
          ? STALE_WORKSPACE_SAVE_MESSAGE
          : "Could not save. This entry was not stored.",
        currentRevision: decision.currentRevision,
        incomingRevision: decision.incomingRevision,
        ...(stale
          ? { data: workspaceForAccount(current, access, clearance) }
          : {}),
      },
      { status: 409 }
    );
  }

  const userId = session.user.id;
  const kept = userId
    ? restrictNewClearsToUser(
        current.notifications,
        decision.data.notifications,
        current.clearedNotices,
        decision.data.clearedNotices,
        userId
      )
    : null;
  const saved = kept
    ? {
        ...decision.data,
        notifications: kept.notifications,
        clearedNotices: kept.clearedNotices,
      }
    : decision.data;

  const startedFrom = current.workspaceRevision ?? 0;
  const wrote = await writeWorkspaceIfRevision(saved, startedFrom);
  if (!revisionWriteLanded(wrote)) {
    const again = await prisma.workspaceStore.findUnique({
      where: { id: STORE_ID },
    });
    const fresh = asFlowhubData(
      ((again?.data ?? null) as FlowhubData | null) ?? empty,
      members
    );
    return NextResponse.json(
      {
        ok: false,
        skipped: "refuse-stale-revision",
        error: STALE_WORKSPACE_SAVE_MESSAGE,
        currentRevision: fresh.workspaceRevision ?? 0,
        incomingRevision: startedFrom,
        data: workspaceForAccount(fresh, access, clearance),
      },
      { status: 409 }
    );
  }

  const visible = workspaceForAccount(saved, access, clearance);
  return NextResponse.json({
    ok: true,
    data: visible,
    workspaceRevision: visible.workspaceRevision ?? 0,
  });
}
