import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("no db");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  const email = "demo.user@cradle.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: "Demo User",
        clearance: "USER",
        passwordHash: await bcrypt.hash("TempPass12!", 12),
        mustChangePassword: true,
      },
    });
    console.log("created demo user");
  } else {
    console.log("demo user exists");
  }
  console.log(
    await prisma.user.findMany({
      select: { email: true, clearance: true, mustChangePassword: true },
      orderBy: { email: "asc" },
    })
  );
  await prisma.$disconnect();
}
main();
