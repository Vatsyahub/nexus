import assert from "node:assert/strict";
import test from "node:test";
import { defaultAccess } from "@/lib/access";
import {
  applyTaskEditPolicy,
  canUpdateTask,
  coerceTaskAssignees,
  peopleNamedInDepartment,
  namedOnTask,
  resolveTaskAssignees,
  resolveTaskDepartment,
  taskDepartmentControl,
  TASK_DEPARTMENT_LOCKED,
  TASK_DEPARTMENT_SET_DENIED,
  TASK_SUBTASK_DEPARTMENT_CLEAR_DENIED,
  TASK_SUBTASK_DEPARTMENT_DENIED,
  type TaskDirectoryPerson,
} from "@/lib/task-permissions";
import { assembleDepartmentView, assembleMatchedRows } from "@/lib/task-list";
import {
  completesImmediately,
  notificationVisibleTo,
  taskAlertAudience,
  taskDueTodayAudience,
} from "@/lib/task-notices";
import {
  EMPTY_NEXUS_COSTS,
  type FlowhubData,
  type HubNotification,
  type Task,
} from "@/lib/types";
import { mergeWorkspaceSave } from "@/lib/workspace-guard";

const people: TaskDirectoryPerson[] = [
  { name: "Priya Manager", department: "Contracts Department", clearance: "manager" },
  { name: "Asha Accounts", department: "Accounts Department", clearance: "manager" },
  { name: "Isha Install", department: "Installation Department", clearance: "manager" },
  { name: "Anil User", department: "Drawings Department", clearance: "user" },
  { name: "New Joiner", department: "Contracts Department", clearance: "user" },
  { name: "Site Lead", department: "Installation Department", clearance: "user" },
];

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Check site",
    contractId: "c1",
    department: "Contracts Department",
    assignees: [],
    status: "pending",
    dueDate: null,
    parentId: null,
    source: "manual",
    catalogKey: "custom",
    notes: "",
    notesUpdatedAt: null,
    completedAt: null,
    notRequiredReason: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function file(partial: Partial<FlowhubData> = {}): FlowhubData {
  return {
    workspaceRevision: 1,
    contracts: [],
    tasks: [],
    itemCatalog: [],
    invoices: [],
    payments: [],
    schedules: [],
    scheduleChangeLog: [],
    taskDeadlineChangeLog: [],
    notifications: [],
    clearedNotices: {},
    customDepartments: [],
    departmentRenames: {},
    deletedDepartments: [],
    expenseCategories: [],
    deliveryChallans: [],
    installationProgress: [],
    nexusCosts: EMPTY_NEXUS_COSTS,
    ...partial,
  };
}

test("a saved department can be updated only by master, director, its manager, or a named person", () => {
  const row = task({ assignees: ["Anil User"] });
  assert.equal(
    canUpdateTask(
      { name: "Site Lead", clearance: "user", department: "Installation Department" },
      row
    ),
    false
  );
  assert.equal(
    canUpdateTask(
      { name: "New Joiner", clearance: "user", department: "Contracts Department" },
      row
    ),
    false
  );
  assert.equal(
    canUpdateTask(
      { name: "Asha Accounts", clearance: "manager", department: "Accounts Department" },
      row
    ),
    false
  );
  assert.equal(
    canUpdateTask(
      { name: "Priya Manager", clearance: "manager", department: "Contracts Department" },
      row
    ),
    true
  );
  assert.equal(
    canUpdateTask(
      { name: "Anil User", clearance: "user", department: "Drawings Department" },
      row
    ),
    true
  );
  assert.equal(
    canUpdateTask({ name: "Deepa", clearance: "director", department: null }, row),
    true
  );
  assert.equal(
    canUpdateTask({ name: "Master", clearance: "master", department: "Contracts Department" }, row),
    true
  );
});

test("an empty department can still be edited, and an ordinary user cannot set it", () => {
  const row = task({ department: null, assignees: ["Site Lead"] });
  const user = {
    name: "Site Lead",
    clearance: "user",
    department: "Installation Department",
  };
  assert.equal(canUpdateTask(user, row), true);
  const denied = resolveTaskDepartment({
    parentId: null,
    currentDepartment: null,
    nextDepartment: "Installation Department",
    actor: user,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error, TASK_DEPARTMENT_SET_DENIED);
  assert.equal(
    taskDepartmentControl(user, row, ["Installation Department"], true).kind,
    "fixed"
  );
  assert.equal(
    taskDepartmentControl(user, row, ["Installation Department"], false).kind,
    "fixed"
  );
});

test("a saved parent department cannot be changed or cleared, including by master", () => {
  const master = { name: "Master", clearance: "master", department: null };
  const changed = resolveTaskDepartment({
    parentId: null,
    currentDepartment: "Contracts Department",
    nextDepartment: "Accounts Department",
    actor: master,
  });
  const cleared = resolveTaskDepartment({
    parentId: null,
    currentDepartment: "Contracts Department",
    nextDepartment: null,
    actor: master,
  });
  const same = resolveTaskDepartment({
    parentId: null,
    currentDepartment: "Contracts Department",
    nextDepartment: "contracts department",
    actor: master,
  });
  assert.equal(changed.ok, false);
  assert.equal(cleared.ok, false);
  if (!changed.ok) assert.equal(changed.error, TASK_DEPARTMENT_LOCKED);
  assert.deepEqual(same, { ok: true, department: "Contracts Department" });
});

test("a subtask uses its own department", () => {
  const parent = task({ id: "parent", department: "Contracts Department" });
  const sub = task({
    id: "sub",
    parentId: parent.id,
    department: "Installation Department",
    title: "Install frames",
  });
  const contractsManager = {
    name: "Priya Manager",
    clearance: "manager",
    department: "Contracts Department",
  };
  const installManager = {
    name: "Isha Install",
    clearance: "manager",
    department: "Installation Department",
  };
  assert.equal(canUpdateTask(contractsManager, parent), true);
  assert.equal(canUpdateTask(contractsManager, sub), false);
  assert.equal(canUpdateTask(installManager, sub), true);
  assert.equal(canUpdateTask(installManager, parent), false);
});

test("people offered for a task stay inside the selected department", () => {
  assert.deepEqual(
    peopleNamedInDepartment(people, "Contracts Department").map((person) => person.name),
    ["Priya Manager", "New Joiner"]
  );
  assert.deepEqual(peopleNamedInDepartment(people, null), []);
  const foreign = resolveTaskAssignees({
    currentDepartment: "Contracts Department",
    nextDepartment: "Contracts Department",
    currentAssignees: [],
    nextAssignees: ["Site Lead"],
    people,
  });
  assert.equal(foreign.ok, false);
  const allowed = resolveTaskAssignees({
    currentDepartment: "Contracts Department",
    nextDepartment: "Contracts Department",
    currentAssignees: [],
    nextAssignees: ["New Joiner"],
    people,
  });
  assert.deepEqual(allowed, { ok: true, assignees: ["New Joiner"] });
});

test("a user still waits to finish, and manager, director, and master finish immediately", () => {
  assert.equal(completesImmediately("user"), false);
  assert.equal(completesImmediately("manager"), true);
  assert.equal(completesImmediately("director"), true);
  assert.equal(completesImmediately("master"), true);
});

test("someone who cannot update a task cannot store notes, and a saved department stays", () => {
  const current = task({ notes: "keep", assignees: ["New Joiner"] });
  const incoming = task({
    notes: "changed",
    department: "Accounts Department",
    assignees: ["Site Lead"],
    dueDate: "2026-12-01",
    status: "completed",
    overdueNotifiedFor: "2026-10-01",
  });
  const [saved] = applyTaskEditPolicy(
    [current],
    [incoming],
    { name: "Site Lead", clearance: "user", department: "Installation Department" },
    people
  );
  assert.equal(saved?.notes, "keep");
  assert.equal(saved?.department, "Contracts Department");
  assert.deepEqual(saved?.assignees, ["New Joiner"]);
  assert.equal(saved?.dueDate, null);
  assert.equal(saved?.status, "pending");
  assert.equal(saved?.overdueNotifiedFor, "2026-10-01");
});

test("master can save notes and still cannot change a saved department", () => {
  const current = task();
  const [saved] = applyTaskEditPolicy(
    [current],
    [task({ notes: "from master", department: "Accounts Department" })],
    { name: "Master", clearance: "master" },
    people
  );
  assert.equal(saved?.notes, "from master");
  assert.equal(saved?.department, "Contracts Department");
});

test("the department manager and a named person can save, and a foreign name is dropped", () => {
  const current = task({ assignees: ["Anil User"] });
  const [byManager] = applyTaskEditPolicy(
    [current],
    [task({ notes: "manager note", dueDate: "2026-11-02", assignees: ["New Joiner", "Site Lead"] })],
    { name: "Priya Manager", clearance: "manager", department: "Contracts Department" },
    people
  );
  assert.equal(byManager?.notes, "manager note");
  assert.equal(byManager?.dueDate, "2026-11-02");
  assert.deepEqual(byManager?.assignees, ["New Joiner"]);

  const [byNamed] = applyTaskEditPolicy(
    [current],
    [task({ assignees: ["Anil User"], notes: "named note" })],
    { name: "Anil User", clearance: "user", department: "Drawings Department" },
    people
  );
  assert.equal(byNamed?.notes, "named note");
});

test("a parent updater can switch a subtask department without editing its note", () => {
  const parent = task({ id: "parent", notes: "" });
  const sub = task({
    id: "sub",
    parentId: "parent",
    department: "Installation Department",
    title: "Install frames",
    notes: "",
  });
  const saved = applyTaskEditPolicy(
    [parent, sub],
    [
      task({ id: "parent", notes: "parent note" }),
      task({
        id: "sub",
        parentId: "parent",
        department: "Contracts Department",
        title: "Install frames",
        notes: "should not stick",
      }),
    ],
    { name: "Priya Manager", clearance: "manager", department: "Contracts Department" },
    people
  );
  assert.equal(saved.find((row) => row.id === "parent")?.notes, "parent note");
  assert.equal(saved.find((row) => row.id === "sub")?.notes, "");
  assert.equal(
    saved.find((row) => row.id === "sub")?.department,
    "Contracts Department"
  );
});

test("an empty parent department can be set by a manager, director, or master, then stays", () => {
  const open = task({ department: null, assignees: ["Site Lead"] });
  const [blocked] = applyTaskEditPolicy(
    [open],
    [task({ department: "Installation Department", notes: "user note" })],
    { name: "Site Lead", clearance: "user", department: "Installation Department" },
    people
  );
  assert.equal(blocked?.department, null);
  assert.equal(blocked?.notes, "user note");

  const [byDirector] = applyTaskEditPolicy(
    [open],
    [task({ department: "Installation Department" })],
    { name: "Deepa", clearance: "director", department: null },
    people
  );
  assert.equal(byDirector?.department, "Installation Department");
  const [locked] = applyTaskEditPolicy(
    [byDirector!],
    [task({ department: null, notes: "later" })],
    { name: "Master", clearance: "master" },
    people
  );
  assert.equal(locked?.department, "Installation Department");
  assert.equal(locked?.notes, "later");
});

test("a waiting completion can be confirmed by that user’s manager without opening the rest of the task", () => {
  const waiting = task({
    status: "awaiting_verification",
    verificationDepartment: "Drawings Department",
    notes: "keep",
    assignees: ["Anil User"],
  });
  const [saved] = applyTaskEditPolicy(
    [waiting],
    [
      task({
        status: "completed",
        notes: "nope",
        department: "Drawings Department",
        completedAt: "2026-10-02T00:00:00.000Z",
        verificationDepartment: "Drawings Department",
      }),
    ],
    { name: "Drawing Manager", clearance: "manager", department: "Drawings Department" },
    people
  );
  assert.equal(saved?.status, "completed");
  assert.equal(saved?.notes, "keep");
  assert.equal(saved?.department, "Contracts Department");
  assert.equal(saved?.verificationDepartment, null);
});

test("naming someone from another department does not stick on a new task", () => {
  assert.deepEqual(
    coerceTaskAssignees({
      currentDepartment: null,
      nextDepartment: "Contracts Department",
      currentAssignees: [],
      nextAssignees: ["Site Lead", "New Joiner"],
      people,
    }),
    ["New Joiner"]
  );
});

test("workspace save keeps the edit rule and still lets a department rename through", () => {
  const current = file({
    tasks: [task({ notes: "keep" })],
  });
  const blocked = mergeWorkspaceSave(
    current,
    file({
      tasks: [task({ notes: "changed" })],
    }),
    defaultAccess("user"),
    "user",
    {
      actor: {
        name: "Site Lead",
        clearance: "user",
        department: "Installation Department",
      },
      people,
    }
  );
  assert.equal(blocked.tasks[0]?.notes, "keep");

  const renamed = mergeWorkspaceSave(
    file({ tasks: [task()] }),
    file({
      tasks: [task({ department: "Commercial Department", notes: "renamed with the catalog" })],
      departmentRenames: { "Contracts Department": "Commercial Department" },
    }),
    defaultAccess("master"),
    "master",
    {
      actor: { name: "Master", clearance: "master", department: null },
      people,
    }
  );
  assert.equal(renamed.tasks[0]?.department, "Commercial Department");
  assert.equal(renamed.tasks[0]?.notes, "renamed with the catalog");
});

test("parent and subtask department rules survive a crafted workspace save", () => {
  const master = { name: "Master", clearance: "master", department: null };
  const director = { name: "Deepa", clearance: "director", department: null };
  const contractsManager = {
    name: "Priya Manager",
    clearance: "manager",
    department: "Contracts Department",
  };
  const installManager = {
    name: "Isha Install",
    clearance: "manager",
    department: "Installation Department",
  };
  const named = {
    name: "Anil User",
    clearance: "user",
    department: "Drawings Department",
  };
  const outsider = {
    name: "Site Lead",
    clearance: "user",
    department: "Installation Department",
  };
  const departments = [
    "Contracts Department",
    "Drawings Department",
    "Installation Department",
    "Accounts Department",
  ];

  const openParent = task({ id: "parent", department: null, assignees: ["Anil User"] });
  const [byManager] = applyTaskEditPolicy(
    [openParent],
    [task({ id: "parent", department: "Installation Department", assignees: ["Anil User"] })],
    contractsManager,
    people
  );
  assert.equal(byManager?.department, "Installation Department");
  assert.equal(
    taskDepartmentControl(director, openParent, departments, true).kind,
    "choose"
  );
  assert.equal(
    taskDepartmentControl(
      { name: "Viewer", clearance: "manager", department: "Contracts Department" },
      openParent,
      departments,
      false
    ).kind,
    "fixed"
  );

  const parent = task({
    id: "parent",
    department: "Contracts Department",
    assignees: ["New Joiner"],
  });
  const sub = task({
    id: "sub",
    parentId: "parent",
    department: null,
    assignees: ["Anil User"],
    title: "Install frames",
    status: "pending",
  });

  const directorSet = applyTaskEditPolicy(
    [parent, sub],
    [task({ ...sub, department: "Installation Department", notes: "placed" })],
    director,
    people
  );
  assert.equal(directorSet[0]?.department, "Installation Department");
  assert.equal(directorSet[0]?.notes, "placed");

  const namedOnly = applyTaskEditPolicy(
    [parent, sub],
    [task({ ...sub, department: "Drawings Department", notes: "named note" })],
    named,
    people
  );
  assert.equal(namedOnly[0]?.department, null);
  assert.equal(namedOnly[0]?.notes, "named note");

  const [outsiderDenied] = applyTaskEditPolicy(
    [parent, sub],
    [task({ ...sub, department: "Installation Department" })],
    outsider,
    people
  );
  assert.equal(outsiderDenied?.department, null);

  const blockedAdd = applyTaskEditPolicy(
    [parent],
    [
      parent,
      task({
        id: "new-sub",
        parentId: parent.id,
        department: "Accounts Department",
        title: "Nope",
      }),
    ],
    outsider,
    people
  );
  assert.equal(blockedAdd.some((row) => row.id === "new-sub"), false);

  const added = applyTaskEditPolicy(
    [parent],
    [
      parent,
      task({
        id: "new-sub",
        parentId: parent.id,
        department: "Accounts Department",
        assignees: ["Asha Accounts"],
        title: "Books",
        status: "pending",
      }),
    ],
    contractsManager,
    people
  );
  const addedSub = added.find((row) => row.id === "new-sub");
  assert.equal(addedSub?.department, "Accounts Department");
  assert.deepEqual(addedSub?.assignees, ["Asha Accounts"]);

  const drawings = task({
    ...sub,
    department: "Drawings Department",
    assignees: ["Anil User"],
    status: "in_progress",
    notes: "keep",
  });
  const switched = applyTaskEditPolicy(
    [parent, drawings],
    [
      task({
        ...drawings,
        department: "Installation Department",
        assignees: ["Anil User", "Site Lead"],
        notes: "switch",
        status: "awaiting_verification",
      }),
    ],
    contractsManager,
    people
  );
  assert.equal(switched[0]?.department, "Installation Department");
  assert.deepEqual(switched[0]?.assignees, []);
  assert.equal(switched[0]?.notes, "keep");
  assert.equal(switched[0]?.status, "in_progress");

  const byDirector = applyTaskEditPolicy(
    [parent, drawings],
    [
      task({
        ...drawings,
        department: "Installation Department",
        assignees: ["Site Lead"],
        notes: "director note",
        status: "awaiting_verification",
      }),
    ],
    director,
    people
  );
  assert.equal(byDirector[0]?.department, "Installation Department");
  assert.deepEqual(byDirector[0]?.assignees, ["Site Lead"]);
  assert.equal(byDirector[0]?.notes, "director note");
  assert.equal(byDirector[0]?.status, "completed");

  const refused = resolveTaskDepartment({
    parentId: parent.id,
    parent,
    currentDepartment: "Drawings Department",
    nextDepartment: "Installation Department",
    actor: installManager,
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, TASK_SUBTASK_DEPARTMENT_DENIED);
  const allowedSwitch = resolveTaskDepartment({
    parentId: parent.id,
    parent,
    currentDepartment: "Drawings Department",
    nextDepartment: "Accounts Department",
    actor: master,
  });
  assert.deepEqual(allowedSwitch, { ok: true, department: "Accounts Department" });

  const cleared = resolveTaskDepartment({
    parentId: parent.id,
    parent,
    currentDepartment: "Drawings Department",
    nextDepartment: null,
    actor: master,
  });
  assert.equal(cleared.ok, false);
  if (!cleared.ok) assert.equal(cleared.error, TASK_SUBTASK_DEPARTMENT_CLEAR_DENIED);
  const [kept] = applyTaskEditPolicy(
    [parent, drawings],
    [task({ ...drawings, department: null, notes: "still" })],
    master,
    people
  );
  assert.equal(kept?.department, "Drawings Department");
  assert.equal(kept?.notes, "still");

  const installKept = applyTaskEditPolicy(
    [parent, drawings],
    [
      task({
        ...drawings,
        department: "Contracts Department",
        notes: "own note",
        status: "completed",
      }),
    ],
    installManager,
    people
  );
  assert.equal(installKept[0]?.department, "Drawings Department");
  assert.equal(installKept[0]?.notes, "keep");
  assert.equal(installKept[0]?.status, "in_progress");

  const installOwn = task({
    ...sub,
    department: "Installation Department",
    assignees: ["Site Lead"],
    status: "in_progress",
    notes: "",
  });
  const finished = applyTaskEditPolicy(
    [parent, installOwn],
    [task({ ...installOwn, notes: "done", status: "awaiting_verification" })],
    installManager,
    people
  );
  assert.equal(finished[0]?.department, "Installation Department");
  assert.equal(finished[0]?.notes, "done");
  assert.equal(finished[0]?.status, "completed");
  assert.equal(canUpdateTask(installManager, parent), false);
  assert.equal(canUpdateTask(installManager, finished[0]!), true);

  assert.deepEqual(
    taskDepartmentControl(contractsManager, drawings, departments, true, parent),
    { kind: "choose", options: departments, allowEmpty: false }
  );
  assert.deepEqual(
    taskDepartmentControl(installManager, drawings, departments, true, parent),
    { kind: "fixed", department: "Drawings Department" }
  );
  assert.deepEqual(
    taskDepartmentControl(
      director,
      { ...sub, department: null },
      departments,
      true,
      parent
    ),
    { kind: "choose", options: departments, allowEmpty: true }
  );

  const placed = byDirector[0]!;
  const dept = assembleDepartmentView({
    tasks: [parent, placed],
    departments: ["Installation Department"],
    matchesRow: () => true,
    compare: (a, b) => a.title.localeCompare(b.title),
  });
  assert.deepEqual(dept.counted.map((row) => row.id), ["sub"]);
  const oldDept = assembleDepartmentView({
    tasks: [parent, placed],
    departments: ["Drawings Department"],
    matchesRow: () => true,
    compare: (a, b) => a.title.localeCompare(b.title),
  });
  assert.deepEqual(oldDept.counted, []);
  const mine = assembleMatchedRows({
    tasks: [parent, placed],
    matchesTask: (row) => namedOnTask({ name: "Site Lead" }, row),
    compare: (a, b) => a.title.localeCompare(b.title),
  });
  assert.deepEqual(mine.counted.map((row) => row.id), ["sub"]);
  const notMine = assembleMatchedRows({
    tasks: [parent, placed],
    matchesTask: (row) => namedOnTask({ name: "Anil User" }, row),
    compare: (a, b) => a.title.localeCompare(b.title),
  });
  assert.deepEqual(notMine.counted, []);
  assert.deepEqual(taskDueTodayAudience(placed), {
    names: ["Site Lead"],
    department: "Installation Department",
  });
  assert.deepEqual(taskAlertAudience(placed), {
    names: ["Site Lead"],
    department: null,
  });
  assert.deepEqual(taskAlertAudience(parent), {
    names: ["New Joiner"],
    department: null,
  });
  const due = verifyNotice("sub");
  due.kind = "task_due_today";
  due.audienceUserNames = ["Site Lead"];
  due.audienceDepartment = "Installation Department";
  assert.equal(
    notificationVisibleTo(due, {
      name: "Site Lead",
      clearance: "user",
      department: "Installation Department",
    }),
    true
  );
  assert.equal(notificationVisibleTo(due, installManager), true);
  assert.equal(notificationVisibleTo(due, contractsManager), false);
  assert.equal(
    notificationVisibleTo(due, {
      name: "Anil User",
      clearance: "user",
      department: "Drawings Department",
    }),
    false
  );

  const openForAnyone = task({ id: "open", department: null, assignees: [] });
  const anyoneAdded = applyTaskEditPolicy(
    [openForAnyone],
    [
      openForAnyone,
      task({
        id: "open-sub",
        parentId: "open",
        department: "Accounts Department",
        title: "Any",
      }),
    ],
    outsider,
    people
  );
  assert.equal(
    anyoneAdded.find((row) => row.id === "open-sub")?.department,
    "Accounts Department"
  );

  const viewOnly = mergeWorkspaceSave(
    file({ tasks: [openParent] }),
    file({ tasks: [task({ id: "parent", department: "Contracts Department" })] }),
    { ...defaultAccess("manager"), tasks: "view" },
    "manager",
    { actor: contractsManager, people }
  );
  assert.equal(viewOnly.tasks[0]?.department, null);

  const system = task({
    id: "gad",
    source: "system",
    catalogKey: "gad",
    department: "Drawings Department",
    parentId: null,
  });
  const manual = task({
    id: "manual",
    department: "Drawings Department",
    parentId: null,
  });
  const created = applyTaskEditPolicy([], [system, manual], outsider, people);
  assert.equal(created.find((row) => row.id === "gad")?.department, "Drawings Department");
  assert.equal(created.find((row) => row.id === "manual")?.department, null);
});

function verifyNotice(taskId: string): HubNotification {
  return {
    id: `verify-${taskId}`,
    createdAt: "2026-10-02T00:00:00.000Z",
    kind: "task_verify",
    title: "Verify completed task",
    body: "Check site",
    href: "/tasks",
    taskId,
    contractId: "c1",
    audienceUserNames: [],
    audienceDepartment: "Installation Department",
    audienceClearance: null,
    createdBy: "Site Lead",
    readByUserIds: [],
    readAtByUserIds: {},
  };
}

test("a crafted save finishes a subtask, keeps a parent waiting, and locks schedule fields", () => {
  const user = {
    name: "Site Lead",
    clearance: "user",
    department: "Installation Department",
  };
  const named = {
    name: "Anil User",
    clearance: "user",
    department: "Drawings Department",
  };
  const director = { name: "Deepa", clearance: "director", department: null };
  const contractsManager = {
    name: "Priya Manager",
    clearance: "manager",
    department: "Contracts Department",
  };
  const otherManager = {
    name: "Isha Install",
    clearance: "manager",
    department: "Installation Department",
  };
  const access = { ...defaultAccess("user"), tasks: "edit" as const };

  const sub = task({
    id: "sub",
    parentId: "parent",
    department: "Installation Department",
    assignees: ["Site Lead"],
    status: "in_progress",
    dueDate: "2026-11-15",
    notes: "",
  });
  const subSaved = mergeWorkspaceSave(
    file({ tasks: [sub] }),
    file({
      tasks: [
        task({
          ...sub,
          status: "awaiting_verification",
          notes: "done",
          dueDate: "2026-12-01",
        }),
      ],
      notifications: [verifyNotice("sub")],
      taskDeadlineChangeLog: [],
    }),
    access,
    "user",
    { actor: user, people }
  );
  assert.equal(subSaved.tasks[0]?.status, "completed");
  assert.equal(subSaved.tasks[0]?.notes, "done");
  assert.equal(subSaved.notifications.filter((notice) => notice.kind === "task_verify").length, 0);

  const parent = task({
    id: "parent",
    department: "Installation Department",
    assignees: ["Site Lead"],
    status: "in_progress",
    notes: "",
  });
  const parentSaved = mergeWorkspaceSave(
    file({ tasks: [parent] }),
    file({
      tasks: [task({ ...parent, status: "completed", notes: "ready" })],
    }),
    access,
    "user",
    { actor: user, people }
  );
  assert.equal(parentSaved.tasks[0]?.status, "awaiting_verification");
  assert.equal(parentSaved.tasks[0]?.notes, "ready");
  assert.equal(
    parentSaved.notifications.filter((notice) => notice.kind === "task_verify").length,
    1
  );

  const waiting = task({
    ...sub,
    id: "waiting-sub",
    status: "awaiting_verification",
    verificationDepartment: "Installation Department",
    verificationRequestedBy: "Site Lead",
    notes: "keep",
  });
  const stillWaiting = mergeWorkspaceSave(
    file({ tasks: [waiting] }),
    file({ tasks: [task({ ...waiting, notes: "still waiting" })] }),
    access,
    "user",
    { actor: user, people }
  );
  assert.equal(stillWaiting.tasks[0]?.status, "awaiting_verification");
  assert.equal(stillWaiting.tasks[0]?.notes, "still waiting");
  assert.equal(stillWaiting.tasks[0]?.verificationDepartment, "Installation Department");

  const scheduled = task({
    id: "scheduled",
    department: "Contracts Department",
    assignees: ["Anil User"],
    dueDate: "2026-11-15",
    notes: "keep",
  });
  const namedChange = mergeWorkspaceSave(
    file({ tasks: [scheduled] }),
    file({
      tasks: [task({ ...scheduled, dueDate: "2026-12-01", notes: "named" })],
      taskDeadlineChangeLog: [
        {
          id: "named-move",
          at: "2026-10-02T00:00:00.000Z",
          by: "Anil User",
          taskId: "scheduled",
          contractId: "c1",
          taskTitle: "Check site",
          fromDate: "2026-11-15",
          toDate: "2026-12-01",
          reason: "Named move",
        },
      ],
    }),
    access,
    "user",
    { actor: named, people }
  );
  assert.equal(namedChange.tasks[0]?.dueDate, "2026-12-01");
  assert.equal(namedChange.tasks[0]?.notes, "named");

  const managerChange = mergeWorkspaceSave(
    file({ tasks: [namedChange.tasks[0]!] }),
    file({
      tasks: [
        task({
          ...namedChange.tasks[0],
          dueDate: "2026-12-20",
        }),
      ],
      taskDeadlineChangeLog: [
        {
          id: "manager-move",
          at: "2026-10-03T00:00:00.000Z",
          by: "Priya Manager",
          taskId: "scheduled",
          contractId: "c1",
          taskTitle: "Check site",
          fromDate: "2026-12-01",
          toDate: "2026-12-20",
          reason: "Manager move",
        },
      ],
    }),
    { ...defaultAccess("manager"), tasks: "edit" },
    "manager",
    { actor: contractsManager, people }
  );
  assert.equal(managerChange.tasks[0]?.dueDate, "2026-12-20");

  const directorChange = mergeWorkspaceSave(
    file({ tasks: [managerChange.tasks[0]!] }),
    file({
      tasks: [
        task({
          ...managerChange.tasks[0],
          dueDate: "2026-11-01",
          department: "Installation Department",
        }),
      ],
      taskDeadlineChangeLog: [
        {
          id: "director-move",
          at: "2026-10-04T00:00:00.000Z",
          by: "Deepa",
          taskId: "scheduled",
          contractId: "c1",
          taskTitle: "Check site",
          fromDate: "2026-12-20",
          toDate: "2026-11-01",
          reason: "Director move",
        },
      ],
    }),
    { ...defaultAccess("director"), tasks: "edit" },
    "director",
    { actor: director, people }
  );
  assert.equal(directorChange.tasks[0]?.dueDate, "2026-11-01");
  assert.equal(directorChange.tasks[0]?.department, "Contracts Department");

  const blocked = mergeWorkspaceSave(
    file({ tasks: [directorChange.tasks[0]!] }),
    file({
      tasks: [
        task({
          ...directorChange.tasks[0],
          dueDate: null,
          notes: "blocked",
          department: "Accounts Department",
        }),
      ],
    }),
    { ...defaultAccess("manager"), tasks: "edit" },
    "manager",
    { actor: otherManager, people }
  );
  assert.equal(blocked.tasks[0]?.dueDate, "2026-11-01");
  assert.equal(blocked.tasks[0]?.notes, "named");
  assert.equal(blocked.tasks[0]?.department, "Contracts Department");
});

test("a creator keeps the deadline on a new task, and moving it later stays limited", () => {
  const user = {
    name: "New Joiner",
    clearance: "user",
    department: "Contracts Department",
  };
  const contractsManager = {
    name: "Priya Manager",
    clearance: "manager",
    department: "Contracts Department",
  };
  const drawingsManager = {
    name: "Drawing Manager",
    clearance: "manager",
    department: "Drawings Department",
  };
  const director = { name: "Deepa", clearance: "director", department: null };
  const edit = (role: "user" | "manager" | "director") => ({
    ...defaultAccess(role),
    tasks: "edit" as const,
  });

  const byUser = mergeWorkspaceSave(
    file({ tasks: [] }),
    file({
      tasks: [
        task({
          id: "by-user",
          department: "Contracts Department",
          assignees: ["New Joiner"],
          dueDate: "2026-12-01",
          notes: "created",
        }),
      ],
    }),
    edit("user"),
    "user",
    { actor: user, people }
  );
  assert.equal(byUser.tasks.length, 1);
  assert.equal(byUser.tasks[0]?.dueDate, "2026-12-01");
  assert.equal(byUser.tasks[0]?.department, null);
  assert.deepEqual(byUser.tasks[0]?.assignees, []);
  assert.equal(byUser.tasks[0]?.notes, "created");
  assert.equal(byUser.taskDeadlineChangeLog.length, 0);

  const userLater = mergeWorkspaceSave(
    byUser,
    file({
      tasks: [
        task({
          ...byUser.tasks[0],
          dueDate: "2027-01-01",
          notes: "still editing",
        }),
      ],
    }),
    edit("user"),
    "user",
    { actor: user, people }
  );
  assert.equal(userLater.tasks[0]?.dueDate, "2026-12-01");
  assert.equal(userLater.tasks[0]?.notes, "still editing");

  const byManager = mergeWorkspaceSave(
    file({ tasks: [] }),
    file({
      tasks: [
        task({
          id: "by-manager",
          department: "Drawings Department",
          assignees: ["Anil User"],
          dueDate: "2026-11-20",
        }),
      ],
    }),
    edit("manager"),
    "manager",
    { actor: contractsManager, people }
  );
  assert.equal(byManager.tasks[0]?.department, "Drawings Department");
  assert.deepEqual(byManager.tasks[0]?.assignees, ["Anil User"]);
  assert.equal(byManager.tasks[0]?.dueDate, "2026-11-20");

  const managerLater = mergeWorkspaceSave(
    byManager,
    file({
      tasks: [
        task({
          ...byManager.tasks[0],
          dueDate: "2027-02-01",
          notes: "not my department",
        }),
      ],
    }),
    edit("manager"),
    "manager",
    { actor: contractsManager, people }
  );
  assert.equal(managerLater.tasks[0]?.dueDate, "2026-11-20");
  assert.equal(managerLater.tasks[0]?.notes, "");
  assert.equal(managerLater.tasks[0]?.department, "Drawings Department");

  const drawingsLater = mergeWorkspaceSave(
    managerLater,
    file({
      tasks: [
        task({
          ...managerLater.tasks[0],
          dueDate: "2026-12-15",
        }),
      ],
      taskDeadlineChangeLog: [
        {
          id: "drawings-move",
          at: "2026-10-05T00:00:00.000Z",
          by: "Drawing Manager",
          taskId: "by-manager",
          contractId: "c1",
          taskTitle: "Check site",
          fromDate: "2026-11-20",
          toDate: "2026-12-15",
          reason: "Drawings manager",
        },
      ],
    }),
    edit("manager"),
    "manager",
    { actor: drawingsManager, people }
  );
  assert.equal(drawingsLater.tasks[0]?.dueDate, "2026-12-15");

  const subParent = task({
    id: "parent",
    department: "Contracts Department",
    assignees: [],
  });
  const sub = mergeWorkspaceSave(
    file({ tasks: [subParent] }),
    file({
      tasks: [
        subParent,
        task({
          id: "new-sub",
          parentId: "parent",
          department: "Drawings Department",
          assignees: ["Anil User"],
          dueDate: "2026-10-15",
        }),
      ],
    }),
    edit("manager"),
    "manager",
    { actor: contractsManager, people }
  );
  const child = sub.tasks.find((row) => row.id === "new-sub");
  assert.equal(child?.dueDate, "2026-10-15");
  assert.equal(child?.department, "Drawings Department");
  assert.deepEqual(child?.assignees, ["Anil User"]);
  const refusedSub = mergeWorkspaceSave(
    file({ tasks: [subParent] }),
    file({
      tasks: [
        subParent,
        task({
          id: "refused-sub",
          parentId: "parent",
          department: "Drawings Department",
          dueDate: "2026-10-15",
        }),
      ],
    }),
    edit("manager"),
    "manager",
    { actor: drawingsManager, people }
  );
  assert.equal(refusedSub.tasks.some((row) => row.id === "refused-sub"), false);

  const byDirector = mergeWorkspaceSave(
    file({ tasks: [] }),
    file({
      tasks: [
        task({
          id: "by-director",
          department: null,
          dueDate: "2026-09-01",
        }),
      ],
    }),
    edit("director"),
    "director",
    { actor: director, people }
  );
  assert.equal(byDirector.tasks[0]?.dueDate, "2026-09-01");

  const systemSaved = mergeWorkspaceSave(
    file({ tasks: [] }),
    file({
      tasks: [
        task({
          id: "gad-new",
          source: "system",
          catalogKey: "gad",
          department: "Drawings Department",
          dueDate: "2026-08-01",
          parentId: null,
        }),
      ],
    }),
    edit("user"),
    "user",
    { actor: user, people }
  );
  assert.equal(systemSaved.tasks[0]?.dueDate, "2026-08-01");
  assert.equal(systemSaved.tasks[0]?.department, "Drawings Department");

  const kept = task({ id: "kept", dueDate: null, notes: "stay" });
  const viewOnly = mergeWorkspaceSave(
    file({ tasks: [kept] }),
    file({
      tasks: [
        task({ ...kept, dueDate: "2026-12-01", notes: "changed" }),
        task({ id: "view-new", dueDate: "2026-12-01", notes: "created" }),
      ],
    }),
    { ...defaultAccess("user"), tasks: "view" },
    "user",
    { actor: user, people }
  );
  assert.equal(viewOnly.tasks.length, 1);
  assert.equal(viewOnly.tasks[0]?.id, "kept");
  assert.equal(viewOnly.tasks[0]?.dueDate, null);
  assert.equal(viewOnly.tasks[0]?.notes, "stay");
});

test("a save drops a stored priority level, including on a finished task", () => {
  const finished = {
    ...task({
      id: "finished",
      status: "completed",
      completedAt: "2026-10-01T00:00:00.000Z",
      notes: "done",
    }),
    priority: "low",
  };
  const open = { ...task({ id: "open", notes: "keep" }), priority: "urgent" };
  const saved = mergeWorkspaceSave(
    file({ tasks: [finished, open] }),
    file({
      tasks: [
        { ...finished, notes: "done" },
        { ...open, notes: "edited" },
      ],
    }),
    { ...defaultAccess("master"), tasks: "edit" },
    "master",
    { actor: { name: "Master", clearance: "master" }, people }
  );
  assert.equal(saved.tasks.length, 2);
  for (const row of saved.tasks) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, "priority"), false);
  }
  assert.equal(saved.tasks.find((row) => row.id === "finished")?.notes, "done");
  assert.equal(saved.tasks.find((row) => row.id === "open")?.notes, "edited");
});
