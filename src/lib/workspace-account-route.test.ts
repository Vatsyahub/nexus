import assert from "node:assert/strict";
import { before, mock, test } from "node:test";

type Row = { id: string; mustChangePassword: boolean } | null;

const state: {
  user: Row;
  upserts: number;
  writes: number;
  signedOut: number;
  refreshed: number;
  token: { id?: string; realId?: string } | null;
  session: { user: { id: string; name: string; clearance: string } } | null;
} = {
  user: { id: "user-1", mustChangePassword: false },
  upserts: 0,
  writes: 0,
  signedOut: 0,
  refreshed: 0,
  token: { id: "user-1", realId: "user-1" },
  session: { user: { id: "user-1", name: "Ada", clearance: "user" } },
};

mock.module("@/auth", {
  namedExports: {
    auth: async () => state.session,
    signOut: async () => {
      state.signedOut += 1;
    },
    unstable_update: async () => {
      state.refreshed += 1;
      return null;
    },
  },
});

mock.module("@/lib/prisma", {
  namedExports: {
    prisma: {
      user: {
        findUnique: async () => state.user,
        findMany: async () => [
          {
            id: "user-1",
            name: "Ada",
            department: "Contracts",
            clearance: "USER",
          },
        ],
      },
      workspaceStore: {
        findUnique: async () => ({
          id: "default",
          data: {
            workspaceRevision: 2,
            expenseCategories: ["Travel"],
            contracts: [],
            tasks: [],
            invoices: [],
            payments: [],
            schedules: [],
          },
        }),
        update: async () => ({}),
        upsert: async () => {
          state.upserts += 1;
          return {};
        },
      },
      $executeRawUnsafe: async () => {
        state.writes += 1;
        return 1;
      },
    },
  },
});

mock.module("next-auth/jwt", {
  namedExports: {
    getToken: async () => state.token,
  },
});

let PUT: (req: Request) => Promise<Response>;
let GET: (req: Request) => Promise<Response>;

before(async () => {
  const route = await import("@/app/api/workspace/route");
  PUT = route.PUT;
  GET = route.GET;
});

function saveRequest() {
  return new Request("http://localhost/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseRevision: 2,
      changes: { expenseCategories: { add: ["Courier"] } },
    }),
  });
}

test("a removed user is signed out and the workspace is not saved", async () => {
  state.user = null;
  state.upserts = 0;
  state.writes = 0;
  state.signedOut = 0;
  state.refreshed = 0;
  const res = await PUT(saveRequest());
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.signedOut, true);
  assert.equal(state.signedOut, 1);
  assert.equal(state.refreshed, 0);
  assert.equal(state.upserts, 0);
  assert.equal(state.writes, 0);
});

test("a forced password change opens the password page and does not save", async () => {
  state.user = { id: "user-1", mustChangePassword: true };
  state.upserts = 0;
  state.writes = 0;
  state.signedOut = 0;
  state.refreshed = 0;
  const res = await PUT(saveRequest());
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.ok, false);
  assert.equal(body.redirect, "/settings/password");
  assert.equal(state.refreshed, 1);
  assert.equal(state.signedOut, 0);
  assert.equal(state.upserts, 0);
  assert.equal(state.writes, 0);
});

test("a live login can still save", async () => {
  state.user = { id: "user-1", mustChangePassword: false };
  state.upserts = 0;
  state.writes = 0;
  state.signedOut = 0;
  state.refreshed = 0;
  const res = await PUT(saveRequest());
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(state.upserts, 0);
  assert.equal(state.writes, 1);
  assert.equal(state.signedOut, 0);
  assert.equal(state.refreshed, 0);
  assert.ok(
    (body.data?.expenseCategories as string[] | undefined)?.includes("Courier")
  );
});

test("loading the workspace signs a removed user out and still loads a forced password change", async () => {
  state.token = { id: "user-1", realId: "user-1" };
  state.session = { user: { id: "user-1", name: "Ada", clearance: "user" } };
  state.user = null;
  state.signedOut = 0;
  const removed = await GET(new Request("http://localhost/api/workspace"));
  const removedBody = await removed.json();
  assert.equal(removed.status, 401);
  assert.equal(removedBody.signedOut, true);
  assert.equal(state.signedOut, 1);

  state.user = { id: "user-1", mustChangePassword: true };
  state.signedOut = 0;
  state.refreshed = 0;
  const forced = await GET(new Request("http://localhost/api/workspace"));
  assert.equal(forced.status, 200);
  assert.equal(state.signedOut, 0);
  assert.equal(state.refreshed, 0);
});

test("an impersonated save checks the signed-in account", async () => {
  state.token = { id: "other", realId: "user-1" };
  state.session = { user: { id: "other", name: "Other", clearance: "user" } };
  state.user = { id: "user-1", mustChangePassword: true };
  state.upserts = 0;
  state.writes = 0;
  state.signedOut = 0;
  const res = await PUT(saveRequest());
  assert.equal(res.status, 403);
  assert.equal(state.upserts, 0);
  assert.equal(state.writes, 0);
  assert.equal(state.signedOut, 0);
});
