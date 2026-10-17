/**
 * Upsert a complete multi-item schedule on C-DEMO-005 for View testing.
 * Interleaved supply dates: RH → LH → RH → LH.
 *
 * Run: npx tsx scripts/seed-complete-schedule.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { FlowhubData, ScheduleLine } from "../src/lib/types";

const CONTRACT_ID = "demo-c-split";
const RH = "demo-boq-sp-1";
const LH = "demo-boq-sp-2";

function isoDaysFromToday(delta: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + delta);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function sch(
  id: string,
  boqItemId: string | null,
  kind: ScheduleLine["kind"],
  quantity: number | null,
  startDelta: number,
  endDelta: number
): ScheduleLine {
  const now = new Date().toISOString();
  const start = isoDaysFromToday(startDelta);
  const end = isoDaysFromToday(endDelta);
  return {
    id,
    contractId: CONTRACT_ID,
    boqItemId,
    kind,
    quantity,
    startDate: start,
    endDate: end,
    committed: true,
    baselineStartDate: start,
    baselineEndDate: end,
    done: false,
    doneAt: null,
    doneBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  const row = await prisma.workspaceStore.findUnique({
    where: { id: "default" },
  });
  const data = (row?.data ?? {}) as FlowhubData;
  const contract = (data.contracts ?? []).find((c) => c.id === CONTRACT_ID);
  if (!contract) {
    throw new Error(
      `Contract ${CONTRACT_ID} not found — run npm run db:seed-demo first.`
    );
  }

  const complete: ScheduleLine[] = [
    sch("demo-sch-sp-rh-s1", RH, "supply", 1, 8, 14),
    sch("demo-sch-sp-lh-s1", LH, "supply", 1, 18, 24),
    sch("demo-sch-sp-rh-s2", RH, "supply", 1, 28, 34),
    sch("demo-sch-sp-lh-s2", LH, "supply", 1, 38, 44),
    sch("demo-sch-sp-rh-i1", RH, "installation", 1, 48, 54),
    sch("demo-sch-sp-lh-i1", LH, "installation", 1, 58, 64),
    sch("demo-sch-sp-rh-i2", RH, "installation", 1, 68, 74),
    sch("demo-sch-sp-lh-i2", LH, "installation", 1, 78, 84),
    sch("demo-sch-sp-testing", null, "testing", null, 95, 95),
    sch("demo-sch-sp-handover", null, "handover", null, 110, 110),
  ];

  const kept = (data.schedules ?? []).filter(
    (s) => s.contractId !== CONTRACT_ID
  );
  const schedules = [...kept, ...complete];
  const prevRev =
    typeof data.workspaceRevision === "number" ? data.workspaceRevision : 0;
  const next: FlowhubData = {
    ...data,
    workspaceRevision: Math.max(prevRev + 1, 5),
    contracts: data.contracts ?? [],
    tasks: data.tasks ?? [],
    itemCatalog: data.itemCatalog ?? [],
    invoices: data.invoices ?? [],
    payments: data.payments ?? [],
    schedules,
    scheduleChangeLog: data.scheduleChangeLog ?? [],
    taskDeadlineChangeLog: data.taskDeadlineChangeLog ?? [],
    notifications: data.notifications ?? [],
    customDepartments: data.customDepartments ?? [],
    expenseCategories: data.expenseCategories ?? [],
    deliveryChallans: data.deliveryChallans ?? [],
    installationProgress: data.installationProgress ?? [],
    nexusCosts: data.nexusCosts ?? { columns: [], contracts: {} },
  };

  await prisma.workspaceStore.upsert({
    where: { id: "default" },
    create: { id: "default", data: next },
    update: { data: next },
  });

  const supplyOrder = complete
    .filter((s) => s.kind === "supply")
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((s) => {
      const item = contract.boq.find((b) => b.id === s.boqItemId);
      return `${s.startDate} · ${item?.name ?? "?"} · qty ${s.quantity}`;
    });

  console.log(
    JSON.stringify(
      {
        ok: true,
        contract: `${contract.projectNo} · ${contract.projectName}`,
        closureDate: contract.closureDate,
        lines: complete.length,
        viewOrderBySupplyDate: supplyOrder,
        testing: complete.find((s) => s.kind === "testing")?.startDate,
        handover: complete.find((s) => s.kind === "handover")?.startDate,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
