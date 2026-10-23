import assert from "node:assert/strict";
import test from "node:test";
import {
  BULK_SKIPPED_DOORS,
  DOORS,
  LAST_USER_EDIT_ERROR,
  applyBulkAccess,
  defaultAccess,
  doorChoiceDisabled,
  presentAccess,
  resolveUserAccessSave,
  type AccessChoiceContext,
  type AccessMap,
  type AccessSaveResult,
} from "@/lib/access";
import type { ClearanceRole } from "@/lib/clearance";

const SKIPPED = ["home", "settings", "users", "nexus_core"] as const;

function choice(partial: Partial<AccessChoiceContext> = {}): AccessChoiceContext {
  return {
    role: "master",
    masterCount: 2,
    storedUsers: "edit",
    otherMastersOnEdit: 1,
    ...partial,
  };
}

function levels(door: "users" | "nexus_core" | "home" | "settings", ctx: AccessChoiceContext) {
  return {
    block: doorChoiceDisabled(door, "block", ctx),
    view: doorChoiceDisabled(door, "view", ctx),
    edit: doorChoiceDisabled(door, "edit", ctx),
  };
}

function save(
  raw: AccessMap,
  target: { id: string; role: ClearanceRole; access?: unknown },
  masters: { id: string; access: unknown }[]
): AccessSaveResult {
  return resolveUserAccessSave(
    raw,
    { access: raw, ...target },
    masters
  );
}

test("bulk skips Home, Settings, User management, and Nexus Core", () => {
  assert.deepEqual([...BULK_SKIPPED_DOORS], [...SKIPPED]);

  const start = defaultAccess("master");
  start.home = "view";
  start.settings = "edit";
  start.users = "block";
  start.nexus_core = "view";
  start.billing = "edit";
  start.contracts = "block";

  for (const level of ["view", "edit", "block"] as const) {
    const next = applyBulkAccess(start, level);
    assert.equal(next.home, "view");
    assert.equal(next.settings, "edit");
    assert.equal(next.users, "block");
    assert.equal(next.nexus_core, "view");
    for (const door of DOORS) {
      if ((SKIPPED as readonly string[]).includes(door.id)) continue;
      assert.equal(next[door.id], level, door.id);
    }
    assert.equal(start.billing, "edit");
  }

  const afterBulk = applyBulkAccess(start, "block");
  const billingEdited: AccessMap = { ...afterBulk, billing: "edit" };
  assert.equal(billingEdited.billing, "edit");
  assert.equal(billingEdited.contracts, "block");
  assert.equal(billingEdited.home, "view");
  assert.equal(billingEdited.settings, "edit");
  assert.equal(billingEdited.users, "block");
  assert.equal(billingEdited.nexus_core, "view");
});

test("a non-master cannot gain User management", () => {
  const masters = [
    { id: "master", access: defaultAccess("master") },
  ];
  for (const role of ["user", "manager", "director"] as const) {
    const raw = defaultAccess("master");
    raw.users = "edit";
    const shown = presentAccess(raw, { role, masterCount: masters.length });
    assert.equal(shown.users, "block");
    assert.deepEqual(levels("users", choice({ role, masterCount: 1, storedUsers: "edit", otherMastersOnEdit: 1 })), {
      block: false,
      view: true,
      edit: true,
    });

    const decision = save(raw, { id: role, role }, masters);
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.map.users, "block");
    assert.equal(decision.map.billing, "edit");
  }
});

test("a non-master non-director cannot gain Nexus Core", () => {
  for (const role of ["user", "manager"] as const) {
    const raw = defaultAccess("master");
    raw.nexus_core = "edit";
    const shown = presentAccess(raw, { role, masterCount: 1 });
    assert.equal(shown.nexus_core, "block");
    assert.deepEqual(
      levels("nexus_core", choice({ role, storedUsers: "block" })),
      { block: false, view: true, edit: true }
    );

    const decision = save(raw, { id: role, role }, []);
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.map.nexus_core, "block");
    assert.equal(decision.map.users, "block");
  }

  for (const role of ["director", "master"] as const) {
    const raw = defaultAccess(role);
    raw.nexus_core = "view";
    assert.deepEqual(
      levels("nexus_core", choice({ role, masterCount: role === "master" ? 1 : 2 })),
      { block: false, view: false, edit: false }
    );
    const decision = save(
      raw,
      { id: role, role, access: defaultAccess(role) },
      role === "master" ? [{ id: "master", access: defaultAccess("master") }] : []
    );
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.map.nexus_core, "view");
  }
});

test("the sole Master stays on Edit for User management", () => {
  const raw = defaultAccess("master");
  raw.users = "block";
  raw.billing = "view";
  const shown = presentAccess(raw, { role: "master", masterCount: 1 });
  assert.equal(shown.users, "edit");
  assert.deepEqual(
    levels("users", choice({ masterCount: 1, storedUsers: "block", otherMastersOnEdit: 0 })),
    { block: true, view: true, edit: false }
  );

  const decision = save(
    raw,
    { id: "only", role: "master", access: { ...raw, users: "view" } },
    [{ id: "only", access: { ...raw, users: "view" } }]
  );
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.map.users, "edit");
  assert.equal(decision.map.billing, "view");
});

test("with two Masters, one can leave Edit while the other stays", () => {
  const staying = { id: "stay", access: null as unknown };
  const leavingRaw = defaultAccess("master");
  leavingRaw.users = "view";
  leavingRaw.contracts = "block";

  assert.deepEqual(
    levels(
      "users",
      choice({ masterCount: 2, storedUsers: "edit", otherMastersOnEdit: 1 })
    ),
    { block: false, view: false, edit: false }
  );

  const decision = save(
    leavingRaw,
    { id: "leave", role: "master", access: defaultAccess("master") },
    [staying, { id: "leave", access: defaultAccess("master") }]
  );
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.map.users, "view");
  assert.equal(decision.map.contracts, "block");
  assert.equal(staying.access, null);

  const explicit = save(
    { ...defaultAccess("master"), users: "block" },
    { id: "leave", role: "master" },
    [
      { id: "stay", access: { ...defaultAccess("master"), billing: "view" } },
      { id: "leave", access: defaultAccess("master") },
    ]
  );
  assert.equal(explicit.ok, true);
  if (!explicit.ok) return;
  assert.equal(explicit.map.users, "block");
});

test("the last Edit cannot be removed", () => {
  const firstRaw = { ...defaultAccess("master"), users: "view" as const };
  const first = save(firstRaw, { id: "m1", role: "master" }, [
    { id: "m1", access: defaultAccess("master") },
    { id: "m2", access: defaultAccess("master") },
  ]);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const stored = {
    m1: first.map,
    m2: defaultAccess("master"),
  };
  const second = save(
    { ...defaultAccess("master"), users: "block" },
    { id: "m2", role: "master", access: stored.m2 },
    [
      { id: "m1", access: stored.m1 },
      { id: "m2", access: stored.m2 },
    ]
  );
  assert.equal(second.ok, false);
  if (second.ok) assert.fail("stored access must stay unchanged");
  assert.equal(second.error, LAST_USER_EDIT_ERROR);
  assert.equal(stored.m2.users, "edit");
  assert.equal(stored.m1.users, "view");

  const direct = save(
    { ...defaultAccess("master"), users: "view", billing: "block" },
    { id: "m2", role: "master" },
    [
      { id: "m1", access: { ...defaultAccess("master"), users: "view" } },
      { id: "m2", access: defaultAccess("master") },
    ]
  );
  assert.equal(direct.ok, false);
  if (direct.ok) assert.fail("a rejected save has no map to write");

  const stillEditing = save(
    { ...defaultAccess("master"), billing: "view" },
    { id: "m2", role: "master" },
    [
      { id: "m1", access: { ...defaultAccess("master"), users: "view" } },
      { id: "m2", access: defaultAccess("master") },
    ]
  );
  assert.equal(stillEditing.ok, true);
  if (!stillEditing.ok) return;
  assert.equal(stillEditing.map.users, "edit");
  assert.equal(stillEditing.map.billing, "view");

  const locked = choice({
    masterCount: 2,
    storedUsers: "edit",
    otherMastersOnEdit: 0,
  });
  assert.deepEqual(levels("users", locked), {
    block: true,
    view: true,
    edit: false,
  });
});

test("Home and Settings cannot be set to Block", () => {
  const ctx = choice({ role: "user", storedUsers: "block" });
  for (const door of ["home", "settings"] as const) {
    assert.equal(doorChoiceDisabled(door, "block", ctx), true);
    assert.equal(doorChoiceDisabled(door, "view", ctx), false);
    assert.equal(doorChoiceDisabled(door, "edit", ctx), false);
  }

  const raw = defaultAccess("master");
  raw.home = "block";
  raw.settings = "block";
  const blocked = save(raw, { id: "only", role: "master" }, [
    { id: "only", access: defaultAccess("master") },
  ]);
  assert.equal(blocked.ok, true);
  if (!blocked.ok) return;
  assert.equal(blocked.map.home, "view");
  assert.equal(blocked.map.settings, "view");

  const edited = save(
    { ...defaultAccess("master"), home: "edit", settings: "edit" },
    { id: "only", role: "master" },
    [{ id: "only", access: defaultAccess("master") }]
  );
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.map.home, "edit");
  assert.equal(edited.map.settings, "edit");
});
