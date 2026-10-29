import assert from "node:assert/strict";
import test from "node:test";
import {
  addContract,
  addManualTask,
  addSubtask,
  assignTask,
  completeTaskWithSubtasks,
  confirmTaskVerification,
  getData,
  updateTask,
  updateTaskStatus,
} from "@/lib/store";
import {
  TASK_COMPLETED_LOCKED,
  type TaskDirectoryPerson,
} from "@/lib/task-permissions";
import type { TaskActor } from "@/lib/task-notices";

const people: TaskDirectoryPerson[] = [
  { name: "Priya Manager", department: "Contracts Department", clearance: "manager" },
  { name: "Isha Install", department: "Installation Department", clearance: "manager" },
  { name: "Anil User", department: "Drawings Department", clearance: "user" },
  { name: "New Joiner", department: "Contracts Department", clearance: "user" },
  { name: "Site Lead", department: "Installation Department", clearance: "user" },
];

const outsider: TaskActor = {
  name: "Site Lead",
  clearance: "user",
  department: "Installation Department",
};
const contractsManager: TaskActor = {
  name: "Priya Manager",
  clearance: "manager",
  department: "Contracts Department",
};
const named: TaskActor = {
  name: "Anil User",
  clearance: "user",
  department: "Drawings Department",
};
const master: TaskActor = { name: "Master Admin", clearance: "master", department: null };
const director: TaskActor = { name: "Deepa Director", clearance: "director", department: null };
const installManager: TaskActor = {
  name: "Isha Install",
  clearance: "manager",
  department: "Installation Department",
};

function taskByTitle(title: string) {
  const row = getData().tasks.find((task) => task.title === title && !task.deletedAt);
  assert.ok(row, title);
  return row;
}

test("task and subtask saves follow the department on that row", () => {
  const { contract } = addContract({
    projectName: "Dept lock",
    projectNo: "DEPT-LOCK",
    orderNos: "DEPT-LOCK",
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 1000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [],
  });

  const created = addManualTask({
    title: "Dept lock parent",
    contractId: contract.id,
    department: "Contracts Department",
    assignees: ["Anil User"],
  });
  const sub = addSubtask(created.id, {
    title: "Dept lock install",
    department: "Installation Department",
  });
  assert.ok(sub);
  assert.equal(sub?.department, "Installation Department");

  assert.equal(
    updateTask(created.id, { notes: "outsider" }, { actor: outsider, people }),
    null
  );
  assert.equal(taskByTitle("Dept lock parent").notes, "");
  assert.equal(
    updateTaskStatus(created.id, "in_progress", {
      actor: outsider,
      notes: "still no",
    }),
    null
  );
  assert.equal(taskByTitle("Dept lock parent").notes, "");

  const sameDeptUser: TaskActor = {
    name: "New Joiner",
    clearance: "user",
    department: "Contracts Department",
  };
  assert.equal(
    updateTask(created.id, { notes: "same dept" }, { actor: sameDeptUser, people }),
    null
  );

  const byNamed = updateTask(
    created.id,
    { notes: "named note" },
    { actor: named, people }
  );
  assert.equal(byNamed?.notes, "named note");

  const waiting = updateTaskStatus(created.id, "completed", {
    actor: named,
    notes: "ready",
  });
  assert.equal(waiting?.status, "awaiting_verification");
  assert.equal(taskByTitle("Dept lock parent").status, "awaiting_verification");
  assert.equal(taskByTitle("Dept lock install").status, "in_progress");

  const open = addManualTask({
    title: "Dept lock open",
    contractId: contract.id,
    department: null,
    assignees: ["Anil User"],
  });
  const namedDenied = assignTask(
    open.id,
    { department: "Accounts Department" },
    { actor: named, people }
  );
  assert.equal(namedDenied.ok, false);
  const outsiderDenied = assignTask(
    open.id,
    { department: "Accounts Department", dueDate: "2026-12-01" },
    { actor: outsider, people }
  );
  assert.equal(outsiderDenied.ok, false);
  assert.equal(taskByTitle("Dept lock open").department, null);
  const setOnce = assignTask(
    open.id,
    { department: "Accounts Department", dueDate: "2026-12-01" },
    { actor: director, people }
  );
  assert.equal(setOnce.ok, true);
  assert.equal(taskByTitle("Dept lock open").department, "Accounts Department");
  assert.equal(taskByTitle("Dept lock open").dueDate, "2026-12-01");
  const relock = assignTask(
    open.id,
    { department: "Contracts Department" },
    { actor: master, people }
  );
  assert.equal(relock.ok, false);
  if (!relock.ok) {
    assert.match(relock.error, /cannot be changed/);
  }
  assert.equal(taskByTitle("Dept lock open").department, "Accounts Department");

  assert.equal(
    updateTask(sub.id, { notes: "parent dept" }, { actor: contractsManager, people }),
    null
  );
  const subSaved = updateTask(
    sub.id,
    { notes: "own dept" },
    { actor: installManager, people }
  );
  assert.equal(subSaved?.notes, "own dept");
  assert.equal(subSaved?.department, "Installation Department");
  const switched = assignTask(
    sub.id,
    { department: "Contracts Department", assignees: ["New Joiner"] },
    { actor: master, people }
  );
  assert.equal(switched.ok, true);
  if (switched.ok) {
    assert.equal(switched.task.department, "Contracts Department");
    assert.deepEqual(switched.task.assignees, ["New Joiner"]);
  }
  const cleared = assignTask(
    sub.id,
    { department: null },
    { actor: master, people }
  );
  assert.equal(cleared.ok, false);
  assert.equal(taskByTitle("Dept lock install").department, "Contracts Department");
  const back = assignTask(
    sub.id,
    { department: "Installation Department" },
    { actor: master, people }
  );
  assert.equal(back.ok, true);
  assert.equal(taskByTitle("Dept lock install").department, "Installation Department");
  const installCannotSwitch = assignTask(
    sub.id,
    { department: "Accounts Department" },
    { actor: installManager, people }
  );
  assert.equal(installCannotSwitch.ok, false);
  assert.equal(taskByTitle("Dept lock install").department, "Installation Department");
  const byParentManager = assignTask(
    sub.id,
    {
      department: "Drawings Department",
      assignees: ["Anil User"],
      dueDate: "2026-12-01",
    },
    { actor: contractsManager, people }
  );
  assert.equal(byParentManager.ok, true);
  if (byParentManager.ok) {
    assert.equal(byParentManager.task.department, "Drawings Department");
    assert.deepEqual(byParentManager.task.assignees, []);
    assert.equal(byParentManager.task.dueDate, sub.dueDate);
  }
  const restored = assignTask(
    sub.id,
    { department: "Installation Department", assignees: ["Site Lead"] },
    { actor: director, people }
  );
  assert.equal(restored.ok, true);
  if (restored.ok) {
    assert.equal(restored.task.department, "Installation Department");
    assert.deepEqual(restored.task.assignees, ["Site Lead"]);
  }

  const finished = updateTaskStatus(created.id, "completed", { actor: director });
  assert.equal(finished?.status, "completed");
  assert.equal(taskByTitle("Dept lock install").status, "completed");
  const byManager = assignTask(
    created.id,
    {
      department: "Contracts Department",
      assignees: ["New Joiner"],
      dueDate: "2026-11-15",
    },
    { actor: contractsManager, people }
  );
  assert.equal(byManager.ok, false);
  if (!byManager.ok) assert.equal(byManager.error, TASK_COMPLETED_LOCKED);
  assert.equal(taskByTitle("Dept lock parent").dueDate, null);
  assert.deepEqual(taskByTitle("Dept lock parent").assignees, ["Anil User"]);
  assert.equal(taskByTitle("Dept lock parent").notes, "ready");
  const foreign = assignTask(
    created.id,
    {
      department: "Contracts Department",
      assignees: ["Site Lead"],
    },
    { actor: contractsManager, people }
  );
  assert.equal(foreign.ok, false);
  assert.deepEqual(taskByTitle("Dept lock parent").assignees, ["Anil User"]);

  const masterClearParent = assignTask(
    open.id,
    { department: null },
    { actor: master, people }
  );
  assert.equal(masterClearParent.ok, false);
  assert.equal(taskByTitle("Dept lock open").department, "Accounts Department");

  const parentForClose = addManualTask({
    title: "Dept lock close parent",
    contractId: contract.id,
    department: "Contracts Department",
  });
  const otherSub = addSubtask(parentForClose.id, {
    title: "Dept lock close sub",
    department: "Installation Department",
  });
  assert.ok(otherSub);
  const blockedSkip = completeTaskWithSubtasks(
    parentForClose.id,
    [{ id: otherSub.id, status: "not_required", reason: "out of scope" }],
    { actor: contractsManager }
  );
  assert.equal(blockedSkip.ok, false);
  if (!blockedSkip.ok) {
    assert.match(blockedSkip.error, /own department/);
  }
  assert.equal(taskByTitle("Dept lock close sub").status, "in_progress");

  const closedByParent = completeTaskWithSubtasks(
    parentForClose.id,
    [{ id: otherSub.id, status: "completed" }],
    { actor: contractsManager }
  );
  assert.equal(closedByParent.ok, true);
  if (closedByParent.ok) assert.equal(closedByParent.status, "completed");
  assert.equal(taskByTitle("Dept lock close sub").status, "completed");
  assert.equal(taskByTitle("Dept lock close parent").status, "completed");

  const managerFinish = updateTaskStatus(sub.id, "completed", { actor: installManager });
  assert.equal(managerFinish?.status, "completed");
  const masterFinish = updateTaskStatus(parentForClose.id, "in_progress", {
    actor: master,
    notes: "master note",
  });
  assert.equal(masterFinish, null);
  assert.equal(taskByTitle("Dept lock close parent").status, "completed");
  assert.equal(taskByTitle("Dept lock close parent").notes, "");
});

function verifyNotices(taskId: string) {
  return getData().notifications.filter(
    (notice) => notice.kind === "task_verify" && notice.taskId === taskId
  );
}

test("a user completes a subtask immediately and a parent still waits", () => {
  const { contract } = addContract({
    projectName: "Complete now",
    projectNo: "COMPLETE-NOW",
    orderNos: "COMPLETE-NOW",
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 1000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [],
  });
  const user: TaskActor = {
    name: "Site Lead",
    clearance: "user",
    department: "Installation Department",
  };
  const parent = addManualTask({
    title: "Complete now parent",
    contractId: contract.id,
    department: "Contracts Department",
    assignees: ["Site Lead"],
  });
  const sub = addSubtask(parent.id, {
    title: "Complete now sub",
    department: "Installation Department",
    assignees: ["Site Lead"],
  });
  assert.ok(sub);

  const finishedSub = updateTaskStatus(sub.id, "completed", { actor: user });
  assert.equal(finishedSub?.status, "completed");
  assert.equal(taskByTitle("Complete now sub").status, "completed");
  assert.equal(verifyNotices(sub.id).length, 0);

  const waitingParent = updateTaskStatus(parent.id, "completed", {
    actor: user,
    notes: "parent ready",
  });
  assert.equal(waitingParent?.status, "awaiting_verification");
  assert.equal(taskByTitle("Complete now parent").status, "awaiting_verification");
  assert.equal(verifyNotices(parent.id).length, 1);

  const withSubs = addManualTask({
    title: "Complete now with subs",
    contractId: contract.id,
    department: "Installation Department",
    assignees: ["Site Lead"],
  });
  const openSub = addSubtask(withSubs.id, {
    title: "Complete now child",
    department: "Installation Department",
    assignees: ["Site Lead"],
  });
  assert.ok(openSub);
  const closed = completeTaskWithSubtasks(
    withSubs.id,
    [{ id: openSub.id, status: "completed" }],
    { actor: user, notes: "closing" }
  );
  assert.equal(closed.ok, true);
  if (closed.ok) assert.equal(closed.status, "awaiting_verification");
  assert.equal(taskByTitle("Complete now child").status, "completed");
  assert.equal(taskByTitle("Complete now with subs").status, "awaiting_verification");
  assert.equal(verifyNotices(openSub.id).length, 0);
  assert.equal(verifyNotices(withSubs.id).length, 1);

  const waitingSub = addSubtask(withSubs.id, {
    title: "Complete now waiting",
    department: "Installation Department",
    assignees: ["Site Lead"],
  });
  assert.ok(waitingSub);
  const stored = getData().tasks.find((task) => task.id === waitingSub.id);
  assert.ok(stored);
  stored.status = "awaiting_verification";
  stored.verificationDepartment = "Installation Department";
  stored.verificationRequestedBy = "Site Lead";
  stored.completedAt = null;
  const noted = updateTask(
    waitingSub.id,
    { notes: "still waiting" },
    { actor: user, people }
  );
  assert.equal(noted?.notes, "still waiting");
  assert.equal(noted?.status, "awaiting_verification");
  const confirmed = confirmTaskVerification(waitingSub.id, installManager);
  assert.equal(confirmed.ok, true);
  assert.equal(taskByTitle("Complete now waiting").status, "completed");
});
