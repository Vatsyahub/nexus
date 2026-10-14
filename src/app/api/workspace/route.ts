import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  purgeExpiredNotifications,
  type NoticeAudienceMember,
} from "@/lib/notification-ttl";
import { purgeExpiredScheduleChangeLog } from "@/lib/schedule-change-log";
import { EMPTY_NEXUS_COSTS, type FlowhubData } from "@/lib/types";
import { normalizeNexusCosts } from "@/lib/nexus-core";
import { defaultAccess } from "@/lib/access";
import {
  resolveWorkspaceWrite,
  workspaceForAccount,
} from "@/lib/workspace-guard";
import type { ClearanceRole } from "@/lib/clearance";

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
  notifications: [],
  customDepartments: [],
  expenseCategories: [],
  deliveryChallans: [],
  installationProgress: [],
  nexusCosts: EMPTY_NEXUS_COSTS,
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
    // Unread: 21 days from creation. Read: 24 hours from that read.
    // Department rows stay until every recipient's case is spent.
    notifications: purgeExpiredNotifications(
      parsed.notifications,
      Date.now(),
      members
    ),
    customDepartments: parsed.customDepartments ?? [],
    expenseCategories: parsed.expenseCategories ?? [],
    deliveryChallans: parsed.deliveryChallans ?? [],
    installationProgress: parsed.installationProgress ?? [],
    nexusCosts: normalizeNexusCosts(parsed.nexusCosts),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await prisma.workspaceStore.findUnique({
    where: { id: STORE_ID },
  });

  const members = await audienceMembers();
  const stored = (row?.data ?? null) as FlowhubData | null;
  const data = asFlowhubData(stored ?? empty, members);
  const rawNotificationCount = Array.isArray(stored?.notifications)
    ? stored.notifications.length
    : 0;
  const rawLogCount = Array.isArray(stored?.scheduleChangeLog)
    ? stored.scheduleChangeLog.length
    : 0;
  // Persist purge so spent notifications and 14-day change-log rows leave the DB.
  if (
    row &&
    (data.notifications.length < rawNotificationCount ||
      data.scheduleChangeLog.length < rawLogCount)
  ) {
    await prisma.workspaceStore.update({
      where: { id: STORE_ID },
      data: { data },
    });
  }

  const access = session.user.access ?? defaultAccess(session.user.clearance);
  return NextResponse.json(workspaceForAccount(data, access));
}

export async function PUT(req: Request) {
  const session = await auth();
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
  const incoming = asFlowhubData(body, members);

  // The page address is ignored. Each slice follows this account's door.
  // Stale revisions and empty overwrites are still refused.
  const existing = await prisma.workspaceStore.findUnique({
    where: { id: STORE_ID },
  });
  const current = asFlowhubData(existing?.data ?? empty, members);
  const decision = resolveWorkspaceWrite(
    current,
    incoming,
    access,
    clearance
  );
  if (decision.action === "skip") {
    if (decision.skipped === "refuse-stale-revision") {
      return NextResponse.json({
        ok: true,
        skipped: decision.skipped,
        currentRevision: decision.currentRevision,
        incomingRevision: decision.incomingRevision,
      });
    }
    return NextResponse.json({
      ok: true,
      skipped: decision.skipped,
    });
  }

  await prisma.workspaceStore.upsert({
    where: { id: STORE_ID },
    create: { id: STORE_ID, data: decision.data },
    update: { data: decision.data },
  });

  return NextResponse.json({ ok: true });
}
