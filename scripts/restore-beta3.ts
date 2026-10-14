/**
 * Replace the workspace and user accounts with the Beta 3 snapshot.
 * Run after migrations: npm run db:restore-beta3
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type SnapUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  clearance: "USER" | "MANAGER" | "DIRECTOR" | "MASTER";
  department: string | null;
  mustChangePassword: boolean;
  access: unknown;
};

type Snap = {
  version: string;
  workspace: object;
  users: SnapUser[];
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const snap = JSON.parse(
    readFileSync(new URL("../prisma/snapshots/beta-3.json", import.meta.url), "utf8"),
  ) as Snap;
  if (snap.version !== "beta-3") {
    throw new Error(`Expected a beta-3 snapshot, found ${snap.version}`);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  await prisma.user.deleteMany();
  await prisma.workspaceStore.deleteMany();
  await prisma.workspaceStore.create({
    data: { id: "default", data: snap.workspace },
  });
  for (const user of snap.users) {
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        clearance: user.clearance,
        department: user.department,
        mustChangePassword: user.mustChangePassword,
        access: user.access ?? undefined,
      },
    });
  }

  const data = snap.workspace as { contracts?: unknown[] };
  console.log(
    `Restored Beta 3: ${snap.users.length} users, ${data.contracts?.length ?? 0} contracts`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
