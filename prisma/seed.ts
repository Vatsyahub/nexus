import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const email = (process.env.SEED_MASTER_EMAIL ?? "master@cradle.local")
    .toLowerCase()
    .trim();
  const password = process.env.SEED_MASTER_PASSWORD ?? "NexusMaster1!";
  const name = process.env.SEED_MASTER_NAME ?? "Master Admin";

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });

  // Never reset password / mustChangePassword on re-seed if the Master already exists.
  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: { name, clearance: "MASTER" },
      })
    : await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          clearance: "MASTER",
          mustChangePassword: true,
        },
      });

  console.log(
    existing
      ? `Master already exists: ${user.email} (left password flags unchanged)`
      : `Seeded Master: ${user.email} (must change password on first login)`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
