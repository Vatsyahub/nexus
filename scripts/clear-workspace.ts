/**
 * Wipe the shared workspace blob to empty (users untouched).
 * Run: npx tsx scripts/clear-workspace.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const empty = {
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
  customDepartments: [],
  expenseCategories: [],
  deliveryChallans: [],
  installationProgress: [],
  nexusCosts: { contracts: {} },
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  await prisma.workspaceStore.upsert({
    where: { id: "default" },
    create: { id: "default", data: empty },
    update: { data: empty },
  });
  const row = await prisma.workspaceStore.findUnique({ where: { id: "default" } });
  const d = (row?.data ?? empty) as typeof empty;
  console.log("Workspace cleared:", {
    contracts: d.contracts?.length ?? 0,
    tasks: d.tasks?.length ?? 0,
    invoices: d.invoices?.length ?? 0,
    payments: d.payments?.length ?? 0,
    schedules: d.schedules?.length ?? 0,
    catalog: d.itemCatalog?.length ?? 0,
  });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
