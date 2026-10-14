import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  purgeExpiredNotifications,
  type NoticeAudienceMember,
} from "@/lib/notification-ttl";
import { EMPTY_NEXUS_COSTS, type FlowhubData } from "@/lib/types";
import { normalizeNexusCosts } from "@/lib/nexus-core";
import { defaultAccess, levelForPath, type AccessMap } from "@/lib/access";

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
    scheduleChangeLog: parsed.scheduleChangeLog ?? [],
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

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await prisma.workspaceStore.findUnique({
    where: { id: STORE_ID },
  });

  const members = await audienceMembers();
  const data = asFlowhubData(row?.data ?? empty, members);
  const rawCount = Array.isArray((row?.data as FlowhubData | null)?.notifications)
    ? ((row?.data as FlowhubData).notifications?.length ?? 0)
    : 0;
  // Persist purge so day-old notifications leave the DB (no records kept).
  if (row && data.notifications.length < rawCount) {
    await prisma.workspaceStore.update({
      where: { id: STORE_ID },
      data: { data },
    });
  }

  return NextResponse.json(data);
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
  const referer = req.headers.get("referer");
  let path = "/";
  if (referer) {
    try {
      path = new URL(referer).pathname;
    } catch {
      path = "/";
    }
  }
  const level = levelForPath(path, access as AccessMap);
  const quietPath = path === "/" || path.startsWith("/settings");
  if (!quietPath && level !== "edit") {
    return NextResponse.json(
      { error: "This login can view this page, not change it." },
      { status: 403 }
    );
  }

  const members = await audienceMembers();
  const data = asFlowhubData(body, members);

  // Stale tabs often hydrate empty then flush — do not wipe a populated hub.
  // A real delete of the last contract bumps workspaceRevision so that clear
  // is newer than the data it replaces and is allowed through.
  const existing = await prisma.workspaceStore.findUnique({
    where: { id: STORE_ID },
  });
  const current = asFlowhubData(existing?.data ?? empty, members);
  const incomingRev = data.workspaceRevision ?? 0;
  const currentRev = current.workspaceRevision ?? 0;
  if (
    isEmptyWorkspace(data) &&
    !isEmptyWorkspace(current) &&
    incomingRev <= currentRev
  ) {
    return NextResponse.json({
      ok: true,
      skipped: "refuse-empty-overwrite",
    });
  }
  // Seeds bump workspaceRevision — refuse older browser caches overwriting them.
  if (incomingRev < currentRev) {
    return NextResponse.json({
      ok: true,
      skipped: "refuse-stale-revision",
      currentRevision: currentRev,
      incomingRevision: incomingRev,
    });
  }

  await prisma.workspaceStore.upsert({
    where: { id: STORE_ID },
    create: { id: STORE_ID, data },
    update: { data },
  });

  return NextResponse.json({ ok: true });
}
