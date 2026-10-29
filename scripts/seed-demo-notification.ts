import { randomUUID } from "crypto";
import { currentSeedDepartment } from "../src/lib/departments";
import { prisma } from "../src/lib/prisma";
import { taskNotificationHref } from "../src/lib/notification-href";
import type { FlowhubData, HubNotification, Task } from "../src/lib/types";

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      department: true,
      clearance: true,
    },
  });
  console.log("USERS", JSON.stringify(users, null, 2));

  const row = await prisma.workspaceStore.findUnique({ where: { id: "default" } });
  const data = (row?.data ?? {}) as Partial<FlowhubData>;
  const contracts = data.contracts ?? [];
  const tasks = [...(data.tasks ?? [])];
  const notifications = [...(data.notifications ?? [])];

  console.log("counts", {
    contracts: contracts.length,
    tasks: tasks.length,
    notifications: notifications.length,
  });

  if (!contracts.length) {
    throw new Error("No contracts in workspace — cannot attach task");
  }

  const master = users.find((u) => u.clearance === "MASTER");
  const assigneeName = master?.name?.trim() || "Master Admin";
  const audienceNames = Array.from(
    new Set(
      [assigneeName, "Rahul Vatsyayan", "Master Admin"]
        .map((n) => n.trim())
        .filter(Boolean)
    )
  );

  const now = new Date().toISOString();
  const contractsDepartment = currentSeedDepartment(
    {
      departmentRenames: data.departmentRenames,
      deletedDepartments: data.deletedDepartments,
    },
    "Contracts Department"
  );

  // Prefer an ABG job so the bell opens the contract guarantee entry form.
  const existingAbg = tasks.find(
    (t) => t.catalogKey === "create_abg" && t.contractId && t.status !== "completed"
  );
  let abgTask: Task;
  if (!existingAbg) {
    const contract = contracts[0];
    abgTask = {
      id: randomUUID(),
      title: `Create ABG — ${contract.projectNo}`,
      contractId: contract.id,
      department: master?.department || contractsDepartment,
      assignees: [assigneeName],
      status: "pending",
      dueDate: null,
      parentId: null,
      source: "manual",
      catalogKey: "create_abg",
      notes: "Seeded so notification deep-link opens ABG entry on the contract.",
      notesUpdatedAt: now,
      completedAt: null,
      notRequiredReason: null,
      createdAt: now,
    };
    tasks.push(abgTask);
  } else if (!existingAbg.assignees.includes(assigneeName)) {
    abgTask = {
      ...existingAbg,
      assignees: [...existingAbg.assignees, assigneeName],
    };
    const idx = tasks.findIndex((t) => t.id === abgTask.id);
    if (idx >= 0) tasks[idx] = abgTask;
  } else {
    abgTask = existingAbg;
  }

  const contract = contracts.find((c) => c.id === abgTask.contractId)!;
  const projectBit = `${contract.projectNo} · ${contract.projectName}`;

  const personNotif: HubNotification = {
    id: randomUUID(),
    createdAt: now,
    kind: "task_assigned",
    title: "Task assigned to you",
    body: abgTask.title,
    href: taskNotificationHref(abgTask),
    taskId: abgTask.id,
    contractId: abgTask.contractId,
    audienceUserNames: audienceNames,
    audienceDepartment: null,
    createdBy: "Nexus Agent",
    readByUserIds: [],
    readAtByUserIds: {},
  };

  const deptNotif: HubNotification = {
    id: randomUUID(),
    createdAt: now,
    kind: "task_department",
    title: "New job for Contracts",
    body: abgTask.title,
    href: taskNotificationHref(abgTask),
    taskId: abgTask.id,
    contractId: abgTask.contractId,
    audienceUserNames: [],
    audienceDepartment: contractsDepartment,
    createdBy: "Nexus Agent",
    readByUserIds: [],
    readAtByUserIds: {},
  };

  // Also seed a custom task that opens expanded on Tasks for status/notes entry.
  const customId = randomUUID();
  const customTask: Task = {
    id: customId,
    title: "Demo: enter progress on this job",
    contractId: contract.id,
    department: master?.department || contractsDepartment,
    assignees: [assigneeName],
    status: "in_progress",
    dueDate: null,
    parentId: null,
    source: "manual",
    catalogKey: "custom",
    notes: "Created so a notification opens the Tasks editor for data entry.",
    notesUpdatedAt: now,
    completedAt: null,
    notRequiredReason: null,
    createdAt: now,
  };
  tasks.push(customTask);

  const customNotif: HubNotification = {
    id: randomUUID(),
    createdAt: now,
    kind: "task_assigned",
    title: "Task assigned to you",
    body: customTask.title,
    href: taskNotificationHref(customTask),
    taskId: customId,
    contractId: contract.id,
    audienceUserNames: audienceNames,
    audienceDepartment: null,
    createdBy: "Nexus Agent",
    readByUserIds: [],
    readAtByUserIds: {},
  };

  const next: FlowhubData = {
    contracts,
    tasks,
    itemCatalog: data.itemCatalog ?? [],
    invoices: data.invoices ?? [],
    payments: data.payments ?? [],
    schedules: data.schedules ?? [],
    scheduleChangeLog: data.scheduleChangeLog ?? [],
    taskDeadlineChangeLog: data.taskDeadlineChangeLog ?? [],
    notifications: [...notifications, personNotif, deptNotif, customNotif],
    customDepartments: data.customDepartments ?? [],
    departmentRenames: data.departmentRenames ?? {},
    deletedDepartments: data.deletedDepartments ?? [],
    expenseCategories: data.expenseCategories ?? [],
    deliveryChallans: data.deliveryChallans ?? [],
    installationProgress: data.installationProgress ?? [],
    nexusCosts: data.nexusCosts ?? { contracts: {} },
  };

  await prisma.workspaceStore.upsert({
    where: { id: "default" },
    create: { id: "default", data: next },
    update: { data: next },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        abgTaskId: abgTask.id,
        abgHref: personNotif.href,
        customTaskId: customId,
        customHref: customNotif.href,
        assigneeName,
        audienceNames,
        projectNo: contract.projectNo,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
