import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const row = await prisma.workspaceStore.findUnique({ where: { id: "default" } });
  const d = (row?.data ?? {}) as {
    contracts?: unknown[];
    tasks?: unknown[];
    invoices?: unknown[];
    payments?: unknown[];
    schedules?: unknown[];
    itemCatalog?: unknown[];
  };
  console.log(
    JSON.stringify(
      {
        contracts: d.contracts?.length ?? 0,
        tasks: d.tasks?.length ?? 0,
        invoices: d.invoices?.length ?? 0,
        payments: d.payments?.length ?? 0,
        schedules: d.schedules?.length ?? 0,
        catalog: d.itemCatalog?.length ?? 0,
        updatedAt: row?.updatedAt ?? null,
        users: await prisma.user.count(),
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
