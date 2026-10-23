import assert from "node:assert/strict";
import { before, mock, test } from "node:test";
import { defaultAccess, type AccessMap } from "@/lib/access";

type Row = {
  id: string;
  clearance: "USER" | "MANAGER" | "DIRECTOR" | "MASTER";
  access: unknown;
};

const state: {
  session: {
    user: { clearance: string; impersonating?: boolean };
  } | null;
  users: Row[];
  updates: { id: string; access: AccessMap }[];
} = {
  session: { user: { clearance: "master", impersonating: false } },
  users: [],
  updates: [],
};

mock.module("@/auth", {
  namedExports: {
    auth: async () => state.session,
  },
});

const user = {
  findUnique: async ({ where }: { where: { id: string } }) =>
    state.users.find((row) => row.id === where.id) ?? null,
  findMany: async ({ where }: { where?: { clearance?: string } }) =>
    state.users.filter(
      (row) => !where?.clearance || row.clearance === where.clearance
    ),
  update: async ({
    where,
    data,
  }: {
    where: { id: string };
    data: { access: AccessMap };
  }) => {
    const row = state.users.find((item) => item.id === where.id);
    if (!row) throw new Error("missing user");
    row.access = data.access;
    state.updates.push({ id: where.id, access: data.access });
    return row;
  },
};

mock.module("@/lib/prisma", {
  namedExports: {
    prisma: {
      user,
      $queryRawUnsafe: async () => [],
      $transaction: async (
        run: (tx: { user: typeof user; $queryRawUnsafe: () => Promise<unknown> }) => Promise<unknown>
      ) =>
        run({
          user,
          $queryRawUnsafe: async () => [],
        }),
    },
  },
});

let saveUserAccess: (
  userId: string,
  raw: AccessMap
) => Promise<{ ok: true } | { ok: false; error: string }>;

before(async () => {
  ({ saveUserAccess } = await import("@/app/actions/access"));
});

test("saveUserAccess forces User management and Nexus Core closed when the role does not allow them", async () => {
  state.updates = [];
  state.users = [
    { id: "staff", clearance: "USER", access: defaultAccess("user") },
    { id: "lead", clearance: "MANAGER", access: defaultAccess("manager") },
    { id: "director", clearance: "DIRECTOR", access: defaultAccess("director") },
    { id: "only", clearance: "MASTER", access: defaultAccess("master") },
  ];
  const open = defaultAccess("master");

  const staff = await saveUserAccess("staff", open);
  assert.equal(staff.ok, true);
  assert.equal(state.updates.at(-1)?.access.users, "block");
  assert.equal(state.updates.at(-1)?.access.nexus_core, "block");

  const lead = await saveUserAccess("lead", open);
  assert.equal(lead.ok, true);
  assert.equal(state.updates.at(-1)?.access.users, "block");
  assert.equal(state.updates.at(-1)?.access.nexus_core, "block");

  const director = await saveUserAccess("director", {
    ...open,
    nexus_core: "view",
  });
  assert.equal(director.ok, true);
  assert.equal(state.updates.at(-1)?.access.users, "block");
  assert.equal(state.updates.at(-1)?.access.nexus_core, "view");

  const sole = await saveUserAccess("only", { ...open, users: "block" });
  assert.equal(sole.ok, true);
  assert.equal(state.updates.at(-1)?.access.users, "edit");
});

test("saveUserAccess lets one of two Masters leave Edit while the other stays", async () => {
  state.updates = [];
  state.users = [
    { id: "m1", clearance: "MASTER", access: null },
    { id: "m2", clearance: "MASTER", access: defaultAccess("master") },
  ];
  const result = await saveUserAccess("m1", {
    ...defaultAccess("master"),
    users: "view",
  });
  assert.equal(result.ok, true);
  assert.equal(state.updates.length, 1);
  assert.equal((state.users[0]?.access as AccessMap).users, "view");
  assert.equal((state.users[1]?.access as AccessMap).users, "edit");
});

test("saveUserAccess leaves stored access unchanged when it would remove the last Edit", async () => {
  state.updates = [];
  state.users = [
    { id: "m1", clearance: "MASTER", access: defaultAccess("master") },
    { id: "m2", clearance: "MASTER", access: defaultAccess("master") },
  ];

  const first = await saveUserAccess("m1", {
    ...defaultAccess("master"),
    users: "view",
  });
  assert.equal(first.ok, true);
  assert.equal(state.updates.length, 1);
  assert.equal(state.users[0]?.access && (state.users[0].access as AccessMap).users, "view");
  assert.equal((state.users[1]?.access as AccessMap).users, "edit");

  const before = structuredClone(state.users);
  const second = await saveUserAccess("m2", {
    ...defaultAccess("master"),
    users: "block",
    billing: "view",
  });
  assert.equal(second.ok, false);
  if (second.ok) assert.fail("the last Edit must be rejected");
  assert.match(second.error, /User management/);
  assert.match(second.error, /Edit/);
  assert.equal(state.updates.length, 1);
  assert.deepEqual(state.users, before);
});
