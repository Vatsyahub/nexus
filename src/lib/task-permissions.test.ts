import assert from "node:assert/strict";
import test from "node:test";
import { defaultAccess } from "@/lib/access";
import {
  applyTaskEditPolicy,
  canUpdateTask,
  coerceTaskAssignees,
  peopleNamedInDepartment,
  resolveTaskAssignees,
  resolveTaskDepartment,
  taskDepartmentControl,
  TASK_DEPARTMENT_CLEAR_DENIED,
  TASK_DEPARTMENT_LOCKED,
  TASK_DEPARTMENT_SET_DENIED,
  TASK_DEPARTMENT_SWITCH_DENIED,
  type TaskDirectoryPerson,
} from "@/lib/task-permissions";
import { completesImmediately } from "@/lib/task-notices";
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
    priority: "normal",
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
    assignees: row.assignees,
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
    assignees: [],
    actor: master,
  });
  const cleared = resolveTaskDepartment({
    parentId: null,
    currentDepartment: "Contracts Department",
    nextDepartment: null,
    assignees: [],
    actor: master,
  });
  const same = resolveTaskDepartment({
    parentId: null,
    currentDepartment: "Contracts Department",
    nextDepartment: "contracts department",
    assignees: [],
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
    priority: "urgent",
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
  assert.equal(saved?.priority, "normal");
  assert.equal(saved?.dueDate, null);
  assert.equal(saved?.status, "pending");
  assert.equal(saved?.overdueNotifiedFor, "2026-10-01");
});

test("master can save notes and still cannot change a saved department", () => {
  const current = task();
  const [saved] = applyTaskEditPolicy(
    [current],
    [task({ notes: "from master", department: "Accounts Department", priority: "high" })],
    { name: "Master", clearance: "master" },
    people
  );
  assert.equal(saved?.notes, "from master");
  assert.equal(saved?.priority, "high");
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
    [task({ assignees: ["Anil User"], notes: "named note", priority: "urgent" })],
    { name: "Anil User", clearance: "user", department: "Drawings Department" },
    people
  );
  assert.equal(byNamed?.notes, "named note");
  assert.equal(byNamed?.priority, "urgent");
});

test("a subtask edit follows the subtask department when both rows are saved together", () => {
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
    "Installation Department"
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
      tasks: [task({ notes: "changed", priority: "urgent" })],
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
  assert.equal(blocked.tasks[0]?.priority, "normal");

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
    "Installation Department",
    "Accounts Department",
  ];

  const parent = task({ id: "parent", department: null, assignees: ["Anil User"] });
  const [byManager] = applyTaskEditPolicy(
    [parent],
    [task({ id: "parent", department: "Installation Department", assignees: ["Anil User"] })],
    contractsManager,
    people
  );
  assert.equal(byManager?.department, "Installation Department");
  assert.equal(
    taskDepartmentControl(director, parent, departments, true).kind,
    "choose"
  );
  assert.equal(
    taskDepartmentControl(
      { name: "Viewer", clearance: "manager", department: "Contracts Department" },
      parent,
      departments,
      false
    ).kind,
    "fixed"
  );

  const sub = task({
    id: "sub",
    parentId: "parent",
    department: null,
    assignees: ["Anil User"],
    title: "Install frames",
  });
  const [directorDenied] = applyTaskEditPolicy(
    [sub],
    [task({ ...sub, department: "Installation Department", notes: "no" })],
    director,
    people
  );
  assert.equal(directorDenied?.department, null);
  assert.equal(directorDenied?.notes, "no");

  const [outsiderDenied] = applyTaskEditPolicy(
    [sub],
    [task({ ...sub, department: "Installation Department" })],
    outsider,
    people
  );
  assert.equal(outsiderDenied?.department, null);

  const [parentNameDenied] = applyTaskEditPolicy(
    [sub],
    [task({ ...sub, department: "Contracts Department" })],
    { name: "New Joiner", clearance: "user", department: "Contracts Department" },
    people
  );
  assert.equal(parentNameDenied?.department, null);

  const [namedSet] = applyTaskEditPolicy(
    [sub],
    [task({ ...sub, department: "Drawings Department" })],
    named,
    people
  );
  assert.equal(namedSet?.department, "Drawings Department");
  assert.deepEqual(namedSet?.assignees, ["Anil User"]);

  const [switched] = applyTaskEditPolicy(
    [namedSet!],
    [task({ ...sub, department: "Installation Department", notes: "switch" })],
    master,
    people
  );
  assert.equal(switched?.department, "Drawings Department");
  assert.equal(switched?.notes, "switch");
  const refused = resolveTaskDepartment({
    parentId: "parent",
    currentDepartment: "Drawings Department",
    nextDepartment: "Installation Department",
    assignees: ["Anil User"],
    actor: master,
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, TASK_DEPARTMENT_SWITCH_DENIED);

  const [removed] = applyTaskEditPolicy(
    [namedSet!],
    [task({ ...sub, department: null })],
    named,
    people
  );
  assert.equal(removed?.department, null);
  const allowedClear = resolveTaskDepartment({
    parentId: "parent",
    currentDepartment: "Drawings Department",
    nextDepartment: null,
    assignees: ["Anil User"],
    actor: named,
  });
  assert.deepEqual(allowedClear, { ok: true, department: null });

  const [setAgain] = applyTaskEditPolicy(
    [removed!],
    [task({ ...sub, department: "Installation Department" })],
    installManager,
    people
  );
  assert.equal(setAgain?.department, "Installation Department");
  const [managerElsewhere] = applyTaskEditPolicy(
    [removed!],
    [task({ ...sub, department: "Contracts Department" })],
    installManager,
    people
  );
  assert.equal(managerElsewhere?.department, null);

  const directorNamed = task({
    ...sub,
    id: "sub-director",
    assignees: ["Deepa"],
    department: "Installation Department",
  });
  const [directorClear] = applyTaskEditPolicy(
    [directorNamed],
    [task({ ...directorNamed, department: null })],
    director,
    people
  );
  assert.equal(directorClear?.department, null);
  const strangerClear = resolveTaskDepartment({
    parentId: "parent",
    currentDepartment: "Installation Department",
    nextDepartment: null,
    assignees: ["Anil User"],
    actor: outsider,
  });
  assert.equal(strangerClear.ok, false);
  if (!strangerClear.ok) assert.equal(strangerClear.error, TASK_DEPARTMENT_CLEAR_DENIED);

  const viewOnly = mergeWorkspaceSave(
    file({ tasks: [parent] }),
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
    priority: "normal",
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
          priority: "urgent",
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
  assert.equal(subSaved.tasks[0]?.priority, "urgent");
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
    priority: "normal",
    notes: "keep",
  });
  const namedChange = mergeWorkspaceSave(
    file({ tasks: [scheduled] }),
    file({
      tasks: [task({ ...scheduled, dueDate: "2026-12-01", priority: "high", notes: "named" })],
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
  assert.equal(namedChange.tasks[0]?.priority, "high");
  assert.equal(namedChange.tasks[0]?.notes, "named");

  const managerChange = mergeWorkspaceSave(
    file({ tasks: [namedChange.tasks[0]!] }),
    file({
      tasks: [
        task({
          ...namedChange.tasks[0],
          dueDate: "2026-12-20",
          priority: "urgent",
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
  assert.equal(managerChange.tasks[0]?.priority, "urgent");

  const directorChange = mergeWorkspaceSave(
    file({ tasks: [managerChange.tasks[0]!] }),
    file({
      tasks: [
        task({
          ...managerChange.tasks[0],
          dueDate: "2026-11-01",
          priority: "low",
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
  assert.equal(directorChange.tasks[0]?.priority, "low");
  assert.equal(directorChange.tasks[0]?.department, "Contracts Department");

  const blocked = mergeWorkspaceSave(
    file({ tasks: [directorChange.tasks[0]!] }),
    file({
      tasks: [
        task({
          ...directorChange.tasks[0],
          dueDate: null,
          priority: "urgent",
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
  assert.equal(blocked.tasks[0]?.priority, "low");
  assert.equal(blocked.tasks[0]?.notes, "named");
  assert.equal(blocked.tasks[0]?.department, "Contracts Department");
});
