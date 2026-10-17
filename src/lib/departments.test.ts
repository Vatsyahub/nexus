import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultAccess } from "@/lib/access";
import {
  deleteDepartmentRecords,
  listDepartmentNames,
  renameDepartmentRecords,
} from "@/lib/departments";
import {
  addContract,
  addCustomDepartment,
  addManualTask,
  afterGadCompleted,
  afterKickoffCompleted,
  deleteDepartment,
  getData,
  listDepartments,
  renameDepartment,
  updateContract,
} from "@/lib/store";
import {
  canAmendBoq,
  SEED_DEPARTMENTS,
  type FlowhubData,
  type Task,
} from "@/lib/types";
import { mergeWorkspaceSave } from "@/lib/workspace-guard";

function shiftIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function makeContract(tag: string, extra?: { abg?: boolean; pbg?: boolean }) {
  return addContract({
    projectName: tag,
    projectNo: tag,
    orderNos: tag,
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 100000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: extra?.abg ?? false,
    abgPercent: extra?.abg ? 10 : null,
    abgValue: null,
    pbgRequired: extra?.pbg ?? false,
    pbgPercent: extra?.pbg ? 5 : null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [
      {
        id: `boq-${tag}`,
        catalogKey: `item-${tag}`,
        name: tag,
        unit: "Nos",
        rate: 100000,
        quantity: 1,
      },
    ],
  });
}

function blob(partial: Partial<FlowhubData> = {}): FlowhubData {
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
    expenseCategories: [],
    deliveryChallans: [],
    installationProgress: [],
    ...partial,
  };
}

describe("department rename and delete", { concurrency: false }, () => {
  test("canAmendBoq still depends on the department name", () => {
    assert.equal(canAmendBoq({ clearance: "master", department: null }), true);
    assert.equal(
      canAmendBoq({ clearance: "director", department: "Accounts Department" }),
      true
    );
    assert.equal(
      canAmendBoq({
        clearance: "MASTER",
        department: "Installation Department",
      }),
      true
    );
    assert.equal(
      canAmendBoq({ clearance: "manager", department: "Contracts Department" }),
      true
    );
    assert.equal(
      canAmendBoq({ clearance: "user", department: "  Contracts desk" }),
      true
    );
    assert.equal(
      canAmendBoq({ clearance: "manager", department: "Accounts Department" }),
      false
    );
    assert.equal(
      canAmendBoq({ clearance: "user", department: "Commercial Department" }),
      false
    );
    assert.equal(canAmendBoq({ clearance: "manager", department: null }), false);
    assert.equal(
      canAmendBoq({ clearance: "guest", department: "Contracts Department" }),
      false
    );
  });

  test("rename moves users and tasks and rejects a duplicate name", () => {
    const { contract } = makeContract("DEPT-CUSTOM");
    assert.equal(addCustomDepartment("Quality Department"), "Quality Department");
    const task = addManualTask({
      title: "Quality check",
      contractId: contract.id,
      department: "Quality Department",
    });
    const other = addManualTask({
      title: "Accounts check",
      contractId: contract.id,
      department: "Accounts Department",
    });
    const people = [
      { id: "q", department: "Quality Department" as string | null },
      { id: "a", department: "Accounts Department" as string | null },
    ];

    const empty = renameDepartment("Quality Department", "   ");
    assert.equal(empty.ok, false);

    const duplicate = renameDepartmentRecords(
      getData(),
      people,
      "Quality Department",
      "accounts department"
    );
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) {
      assert.equal(duplicate.error, "That department already exists.");
    }
    assert.equal(
      getData().tasks.find((row) => row.id === task.id)?.department,
      "Quality Department"
    );

    const moved = renameDepartmentRecords(
      getData(),
      people,
      "Quality Department",
      "QA Department"
    );
    assert.equal(moved.ok, true);
    if (!moved.ok) return;
    assert.equal(moved.people[0]?.department, "QA Department");
    assert.equal(moved.people[1]?.department, "Accounts Department");
    assert.equal(
      moved.data.tasks.find((row) => row.id === task.id)?.department,
      "QA Department"
    );
    assert.equal(
      moved.data.tasks.find((row) => row.id === other.id)?.department,
      "Accounts Department"
    );
    assert.equal(moved.data.customDepartments.includes("QA Department"), true);
    assert.equal(
      moved.data.customDepartments.includes("Quality Department"),
      false
    );

    const saved = renameDepartment("Quality Department", "QA Department");
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.to, "QA Department");
    assert.equal(
      getData().tasks.find((row) => row.id === task.id)?.department,
      "QA Department"
    );
    assert.equal(listDepartments().includes("Quality Department"), false);
    assert.equal(listDepartments().includes("QA Department"), true);

    const taken = renameDepartment("QA Department", "Accounts Department");
    assert.equal(taken.ok, false);
    assert.equal(
      getData().tasks.find((row) => row.id === task.id)?.department,
      "QA Department"
    );
  });

  test("delete clears users and tasks for a custom department", () => {
    const task = getData().tasks.find((row) => row.title === "Quality check");
    assert.ok(task);
    const people = [
      { id: "q", department: "QA Department" as string | null },
      { id: "a", department: "Accounts Department" as string | null },
    ];
    const cleared = deleteDepartmentRecords(
      getData(),
      people,
      "QA Department"
    );
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(cleared.people[0]?.department, null);
    assert.equal(cleared.people[1]?.department, "Accounts Department");
    assert.equal(
      cleared.data.tasks.find((row) => row.id === task?.id)?.department,
      null
    );
    assert.equal(listDepartmentNames(cleared.data).includes("QA Department"), false);

    const saved = deleteDepartment("QA Department");
    assert.equal(saved.ok, true);
    assert.equal(listDepartments().includes("QA Department"), false);
    assert.equal(
      getData().tasks.find((row) => row.id === task?.id)?.department,
      null
    );
    assert.equal(
      getData().tasks.find((row) => row.title === "Accounts check")?.department,
      "Accounts Department"
    );
  });

  test("a renamed built-in sticks and new system tasks use the new name", () => {
    const { contract } = makeContract("DEPT-SEED");
    const task = addManualTask({
      title: "Contracts filing",
      contractId: contract.id,
      department: "Contracts Department",
    });
    const people = [
      { id: "c", department: "Contracts Department" as string | null },
      { id: "a", department: "Accounts Department" as string | null },
    ];
    try {
      const moved = renameDepartmentRecords(
        getData(),
        people,
        "Contracts Department",
        "Commercial Department"
      );
      assert.equal(moved.ok, true);
      if (!moved.ok) return;
      assert.equal(moved.people[0]?.department, "Commercial Department");
      assert.equal(moved.people[1]?.department, "Accounts Department");
      assert.equal(
        moved.data.tasks.find((row) => row.id === task.id)?.department,
        "Commercial Department"
      );

      const saved = renameDepartment(
        "Contracts Department",
        "Commercial Department"
      );
      assert.equal(saved.ok, true);
      assert.equal(
        getData().tasks.find((row) => row.id === task.id)?.department,
        "Commercial Department"
      );
      const roundTrip = JSON.parse(JSON.stringify(getData())) as FlowhubData;
      assert.equal(
        listDepartments(roundTrip).includes("Contracts Department"),
        false
      );
      assert.equal(
        listDepartments(roundTrip).includes("Commercial Department"),
        true
      );
      assert.equal(
        roundTrip.departmentRenames?.["Contracts Department"],
        "Commercial Department"
      );
      assert.ok(SEED_DEPARTMENTS.includes("Contracts Department"));

      const duplicate = renameDepartment(
        "Accounts Department",
        "commercial department"
      );
      assert.equal(duplicate.ok, false);

      const created = afterGadCompleted(contract.id, {
        boqChanged: true,
        amendmentNeeded: true,
      });
      assert.equal(
        created.find((row) => row.catalogKey === "create_schedules")?.department,
        "Commercial Department"
      );
      assert.equal(
        created.find((row) => row.catalogKey === "boq_amendment")?.department,
        "Commercial Department"
      );

      assert.equal(
        renameDepartment("Drawings Department", "Design Department").ok,
        true
      );
      const gad = afterKickoffCompleted(contract.id, true);
      assert.equal(gad?.department, "Design Department");

      assert.equal(
        renameDepartment("Installation Department", "Site Department").ok,
        true
      );
      const installed = JSON.parse(JSON.stringify(getData())) as FlowhubData;
      assert.equal(
        listDepartments(installed).includes("Installation Department"),
        false
      );
      assert.equal(listDepartments(installed).includes("Site Department"), true);
    } finally {
      const names = listDepartments();
      if (names.includes("Commercial Department")) {
        renameDepartment("Commercial Department", "Contracts Department");
      }
      if (names.includes("Design Department")) {
        renameDepartment("Design Department", "Drawings Department");
      }
      if (names.includes("Site Department")) {
        renameDepartment("Site Department", "Installation Department");
      }
    }
    assert.equal(listDepartments().includes("Contracts Department"), true);
    assert.equal(listDepartments().includes("Drawings Department"), true);
    assert.equal(listDepartments().includes("Installation Department"), true);
  });

  test("a deleted built-in stays gone and new system tasks have no department", () => {
    assert.equal(deleteDepartment("Accounts Department").ok, true);
    const stored = JSON.parse(JSON.stringify(getData())) as FlowhubData;
    assert.equal(listDepartments(stored).includes("Accounts Department"), false);
    assert.ok(stored.deletedDepartments?.includes("Accounts Department"));
    assert.ok(SEED_DEPARTMENTS.includes("Accounts Department"));
    assert.equal(
      getData().tasks.find((row) => row.title === "Accounts check")?.department,
      null
    );

    const { contract } = makeContract("DEPT-CHASE", { abg: true, pbg: true });
    updateContract(contract.id, {
      abgExpiry: shiftIso(30),
      pbgExpiry: shiftIso(30),
    });
    const rows = getData().tasks.filter((row) => row.contractId === contract.id);
    assert.equal(
      rows.find((row) => row.catalogKey === "bg_expiry_abg")?.department,
      null
    );
    assert.equal(
      rows.find((row) => row.catalogKey === "bg_expiry_pbg")?.department,
      null
    );

    assert.equal(deleteDepartment("Drawings Department").ok, true);
    assert.equal(addCustomDepartment("Drawings Department"), "Drawings Department");
    const { contract: later } = makeContract("DEPT-GAD");
    const gad = afterKickoffCompleted(later.id, true);
    assert.equal(gad?.department, null);
    assert.equal(listDepartments().includes("Drawings Department"), true);
    const withoutCustom = {
      ...getData(),
      customDepartments: (getData().customDepartments ?? []).filter(
        (name) => name !== "Drawings Department"
      ),
    };
    assert.equal(
      listDepartments(withoutCustom).includes("Drawings Department"),
      false
    );
  });

  test("saving a department catalog change rewrites tasks still on the old name", () => {
    const task = {
      id: "t-accounts",
      department: "Accounts Department",
      contractId: "c1",
    } as Task;
    const current = blob({ tasks: [task] });
    const incoming = blob({
      tasks: [],
      deletedDepartments: ["Accounts Department"],
    });
    const access = { ...defaultAccess("user"), tasks: "view" as const };
    const saved = mergeWorkspaceSave(current, incoming, access, "user");
    assert.equal(saved.tasks[0]?.department, null);
    assert.ok(saved.deletedDepartments?.includes("Accounts Department"));

    const contractsTask = {
      id: "t-contracts",
      department: "Contracts Department",
    } as Task;
    const renamed = mergeWorkspaceSave(
      blob({ tasks: [contractsTask], customDepartments: ["Quality Department"] }),
      blob({
        tasks: [contractsTask],
        departmentRenames: { "Contracts Department": "Commercial Department" },
        customDepartments: ["QA Department"],
      }),
      defaultAccess("master"),
      "master"
    );
    assert.equal(renamed.tasks[0]?.department, "Commercial Department");
    assert.equal(
      renamed.tasks.find((row) => row.department === "QA Department"),
      undefined
    );
    const quality = {
      id: "t-quality",
      department: "Quality Department",
    } as Task;
    const customRename = mergeWorkspaceSave(
      blob({
        tasks: [quality],
        customDepartments: ["Quality Department"],
      }),
      blob({
        tasks: [quality],
        customDepartments: ["QA Department"],
      }),
      { ...defaultAccess("manager"), tasks: "block" as const },
      "manager"
    );
    assert.equal(customRename.tasks[0]?.department, "QA Department");
  });
});
