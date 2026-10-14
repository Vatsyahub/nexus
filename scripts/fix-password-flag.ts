import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const result = await prisma.user.updateMany({
    data: { mustChangePassword: false },
  });
  const users = await prisma.user.findMany({
    select: { email: true, mustChangePassword: true, updatedAt: true },
  });
  console.log("updated", result.count, users);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
