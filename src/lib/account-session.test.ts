import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_PAGE,
  PASSWORD_SAVE_MESSAGE,
  SIGNED_OUT_SAVE_MESSAGE,
  blockWorkspaceSave,
  jwtAfterUserLookup,
  loginIdFromToken,
  responseForClosedAccount,
  workspaceSaveExit,
} from "@/lib/account-session";

test("a workspace save is refused when the user row is gone", async () => {
  const calls: string[] = [];
  const block = await responseForClosedAccount(
    null,
    {
      signOut: async () => {
        calls.push("sign-out");
      },
      refreshSession: async () => {
        calls.push("refresh");
      },
    },
    "write"
  );
  assert.equal(block?.status, 401);
  assert.deepEqual(block?.body, { error: "Unauthorized", signedOut: true });
  assert.deepEqual(calls, ["sign-out"]);
  assert.deepEqual(workspaceSaveExit(block?.body ?? null), {
    path: "/login",
    message: SIGNED_OUT_SAVE_MESSAGE,
  });
});

test("a workspace save is refused until a forced password is changed", async () => {
  const calls: string[] = [];
  const block = await responseForClosedAccount(
    { mustChangePassword: true },
    {
      signOut: async () => {
        calls.push("sign-out");
      },
      refreshSession: async () => {
        calls.push("refresh");
      },
    },
    "write"
  );
  assert.equal(block?.status, 403);
  assert.deepEqual(block?.body, {
    ok: false,
    error: PASSWORD_SAVE_MESSAGE,
    redirect: PASSWORD_PAGE,
  });
  assert.deepEqual(calls, ["refresh"]);
  assert.deepEqual(workspaceSaveExit(block?.body ?? null), {
    path: "/settings/password",
    message: PASSWORD_SAVE_MESSAGE,
  });
});

test("a forced password change can still load, and a live login can save", async () => {
  const calls: string[] = [];
  const actions = {
    signOut: async () => {
      calls.push("sign-out");
    },
    refreshSession: async () => {
      calls.push("refresh");
    },
  };
  const loaded = await responseForClosedAccount(
    { mustChangePassword: true },
    actions,
    "read"
  );
  assert.equal(loaded, null);
  const saved = await responseForClosedAccount(
    { mustChangePassword: false },
    actions,
    "write"
  );
  assert.equal(saved, null);
  assert.equal(blockWorkspaceSave({ mustChangePassword: false }), null);
  assert.deepEqual(calls, []);
});

test("a failed cookie clear still refuses the save for a missing user", async () => {
  const block = await responseForClosedAccount(
    null,
    {
      signOut: async () => {
        throw new Error("cookie jar unavailable");
      },
      refreshSession: async () => {
        throw new Error("should not refresh");
      },
    },
    "write"
  );
  assert.equal(block?.status, 401);
  if (!block || !("signedOut" in block.body)) {
    throw new Error("expected sign-out");
  }
  assert.equal(block.body.signedOut, true);
});

test("the JWT callback does not keep a token for a missing user", () => {
  const open = { id: "user-1", name: "Ada", mustChangePassword: false };
  assert.equal(jwtAfterUserLookup(open, { status: "missing" }), null);

  const forced = jwtAfterUserLookup(open, {
    status: "found",
    mustChangePassword: true,
  });
  assert.equal(forced?.mustChangePassword, true);
  assert.equal(forced?.name, "Ada");
  assert.equal(open.mustChangePassword, false);

  const cleared = jwtAfterUserLookup(
    { id: "user-1", mustChangePassword: true },
    { status: "found", mustChangePassword: false }
  );
  assert.equal(cleared?.mustChangePassword, false);

  const duringOutage = jwtAfterUserLookup(open, { status: "error" });
  assert.equal(duringOutage, open);
});

test("the login checked on save is the signed-in account", () => {
  assert.equal(
    loginIdFromToken({ id: "impersonated", realId: "master" }, "impersonated"),
    "master"
  );
  assert.equal(loginIdFromToken({ id: "user-1" }, null), "user-1");
  assert.equal(loginIdFromToken(null, "user-1"), "user-1");
  assert.equal(loginIdFromToken(null, null), "");
});
