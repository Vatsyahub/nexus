"use client";

import {
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useViewQuery } from "@/lib/use-view-query";
import {
  addSubtask,
  afterGadCompleted,
  afterKickoffCompleted,
  assignTask,
  canConfirmTaskVerification,
  clearTaskDeadlineChangeLog,
  completeTaskWithSubtasks,
  completionNeedsVerification,
  confirmTaskVerification,
  deleteSubtask,
  deleteTask,
  flushWorkspace,
  taskIsOpen,
  taskVisibleInLists,
  updateTask,
  updateTaskStatus,
  useFlowhubData,
  type TaskActor,
} from "@/lib/store";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  departmentDisplayName,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import type { ClearanceRole } from "@/lib/clearance";
import { confirmAction } from "@/components/confirm-panel";
import { DeleteIconButton } from "@/components/icon-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { ListSearchBar } from "@/components/list-search";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import {
  matchesToken,
  parseSearchTokens,
  taskMatchesQuery,
} from "@/lib/list-search";
import {
  dateSearchForms,
  formatDisplayDate,
  formatDisplayDateTime,
} from "@/lib/dates";
import type { TaskDeadlineChangeLogEntry } from "@/lib/types";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import {
  canEditTaskSchedule,
  canUpdateTask,
  departmentIsSet,
  namedOnTask,
  peopleNamedInDepartment,
  taskDepartmentControl,
  TASK_READ_ONLY,
  TASK_SAVE_DENIED,
  type TaskDepartmentControl,
} from "@/lib/task-permissions";
import {
  assembleDepartmentView,
  assembleMatchedRows,
  assembleSubtaskView,
  subtasksOnlyLines,
  type TaskListRow,
} from "@/lib/task-list";
import { samePerson } from "@/lib/task-responsible";
import {
  addSubtaskControl,
  closeTaskUpdates,
  initialTaskUpdatesBox,
  openTaskUpdates,
  saveUpdatesControl,
  settleTaskUpdatesSave,
  taskUpdatesSaveCloses,
  updatesBoxShowsAddSubtask,
  type TaskUpdatesBox,
} from "@/lib/task-updates-box";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";

export type AssignablePerson = {
  id: string;
  name: string;
  department: string | null;
  clearance: "USER" | "MANAGER";
};

type ViewFilter =
  | "my"
  | "dept"
  | "all"
  | "unassigned"
  | "overdue"
  | "completed";

function parseTaskView(raw: string): ViewFilter {
  if (raw === "my" || raw === "mine") return "my";
  if (raw === "dept") return "dept";
  if (raw === "overdue") return "overdue";
  if (raw === "completed") return "completed";
  if (raw === "unassigned") return "unassigned";
  return "all";
}

function taskFilterParam(view: ViewFilter): string | null {
  if (view === "all") return null;
  return view;
}

function parseTaskPriority(raw: string): "all" | TaskPriority {
  if (raw === "low" || raw === "normal" || raw === "high" || raw === "urgent") {
    return raw;
  }
  return "all";
}

function todayIso() {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

function peopleForDepartment(
  people: AssignablePerson[],
  department: string
): AssignablePerson[] {
  return peopleNamedInDepartment(
    people,
    department === "none" ? null : department
  );
}

function canNamePeople(
  actor: TaskActor,
  task: Pick<Task, "department" | "assignees">,
  roleCanAssign: boolean
): boolean {
  return canUpdateTask(actor, task) && (roleCanAssign || namedOnTask(actor, task));
}

function chosenDepartment(
  control: TaskDepartmentControl,
  value: string
): string | null {
  if (control.kind === "fixed") return control.department;
  if (control.kind === "clear") {
    return value === "none" ? null : control.department;
  }
  if (value === "none" || !control.options.includes(value)) return null;
  return value;
}

function DepartmentField({
  control,
  value,
  onChange,
  emptyLabel,
}: {
  control: TaskDepartmentControl;
  value: string;
  onChange: (next: string) => void;
  emptyLabel: string;
}) {
  if (control.kind === "fixed") {
    return (
      <p
        data-department-locked="true"
        className="flex h-9 items-center text-sm text-[var(--fh-ink)]"
      >
        {control.department ? departmentDisplayName(control.department) : "—"}
      </p>
    );
  }
  if (control.kind === "clear") {
    return (
      <select
        className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
        value={value === "none" ? "none" : control.department}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={control.department}>
          {departmentDisplayName(control.department)}
        </option>
        <option value="none">No department</option>
      </select>
    );
  }
  return (
    <select
      className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="none">{emptyLabel}</option>
      {control.options.map((d) => (
        <option key={d} value={d}>
          {departmentDisplayName(d)}
        </option>
      ))}
    </select>
  );
}

function isOverdue(t: Task, today: string) {
  return taskIsOpen(t) && !!t.dueDate && t.dueDate < today;
}

function priorityRank(p: TaskPriority) {
  return { urgent: 0, high: 1, normal: 2, low: 3 }[p];
}

function sortTasks(a: Task, b: Task, today: string) {
  const aDone = taskIsOpen(a) ? 0 : 1;
  const bDone = taskIsOpen(b) ? 0 : 1;
  if (aDone !== bDone) return aDone - bDone;
  const aOd = isOverdue(a, today) ? 0 : 1;
  const bOd = isOverdue(b, today) ? 0 : 1;
  if (aOd !== bOd) return aOd - bOd;
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  const aDue = a.dueDate || "9999-99-99";
  const bDue = b.dueDate || "9999-99-99";
  if (aDue !== bDue) return aDue.localeCompare(bDue);
  return b.createdAt.localeCompare(a.createdAt);
}

function formatLastUpdated(t: Task) {
  return formatDisplayDate(t.notesUpdatedAt);
}

function peopleLabel(names: string[]) {
  if (!names.length) return "—";
  return names.join(", ");
}

const WORK_STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "on_hold",
  "completed",
];

function statusChoices(
  selected: TaskStatus,
  includeNotRequired = false
): TaskStatus[] {
  const list: TaskStatus[] = [...WORK_STATUSES];
  if (includeNotRequired) list.push("not_required");
  if (selected === "awaiting_verification") {
    return ["awaiting_verification", ...list];
  }
  return list;
}

function waitingForCopy(task: Task): string {
  if ((task.verificationDepartment || "").trim()) {
    return "Waiting for the manager.";
  }
  return "Waiting for Master to verify.";
}

export default function TasksClient({
  role,
  currentUserName,
  currentUserDepartment,
  currentUserSecondDepartment,
}: {
  role: ClearanceRole;
  currentUserName: string;
  currentUserDepartment: string | null;
  currentUserSecondDepartment: string | null;
}) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[var(--fh-muted)]">Loading tasks…</p>
      }
    >
      <TasksPageInner
        role={role}
        currentUserName={currentUserName}
        currentUserDepartment={currentUserDepartment}
        currentUserSecondDepartment={currentUserSecondDepartment}
      />
    </Suspense>
  );
}

function TasksPageInner({
  role,
  currentUserName,
  currentUserDepartment,
  currentUserSecondDepartment,
}: {
  role: ClearanceRole;
  currentUserName: string;
  currentUserDepartment: string | null;
  currentUserSecondDepartment: string | null;
}) {
  const data = useFlowhubData();
  const router = useRouter();
  const { get, commit } = useViewQuery();
  const contractId = get("contractId");
  const focusTaskId = get("task") || get("highlight");
  const q = get("q");
  const urlFilter = get("filter");
  const homeFilter =
    urlFilter && parseTaskView(urlFilter) !== "all" ? urlFilter : null;
  const showDept = role === "user" || role === "manager";
  const requestedView = focusTaskId
    ? "all"
    : parseTaskView(get("view") || urlFilter);
  const view: ViewFilter =
    requestedView === "dept" && !showDept ? "all" : requestedView;
  const priorityFilter = focusTaskId ? "all" : parseTaskPriority(get("priority"));
  const showLog = get("log") === "1";
  const subtasksOnly = get("subs") === "1";

  function setQ(value: string) {
    commit({ q: value || null });
  }

  function setView(next: ViewFilter) {
    commit({
      view: taskFilterParam(next),
      filter: null,
      task: null,
      highlight: null,
    });
  }

  function setPriorityFilter(next: "all" | TaskPriority) {
    commit({ priority: next === "all" ? null : next, task: null, highlight: null });
  }

  function setShowLog(next: boolean) {
    commit({ log: next ? "1" : null });
  }

  function setSubtasksOnly(next: boolean) {
    commit({ subs: next ? "1" : null });
  }
  const canViewDeadlineLog = role === "master" || role === "director";
  const isMaster = role === "master";

  const today = todayIso();

  const contractLabel = contractId
    ? data.contracts.find((c) => c.id === contractId)?.projectNo
    : null;

  const contractById = useMemo(() => {
    const map = new Map(data.contracts.map((c) => [c.id, c]));
    return map;
  }, [data.contracts]);

  useEffect(() => {
    if (!focusTaskId) return;
    const target = data.tasks.find((t) => t.id === focusTaskId && !t.deletedAt);
    if (!target) return;
    const parentId = target.parentId || target.id;
    const params = new URLSearchParams();
    if (target.parentId) params.set("sub", target.id);
    router.replace(
      params.size
        ? `/tasks/${parentId}?${params.toString()}`
        : `/tasks/${parentId}`
    );
  }, [focusTaskId, data.tasks, router]);

  const scoped = useMemo(() => {
    const needle = q.trim();
    return data.tasks.filter((t) => {
      if (!taskVisibleInLists(t)) return false;
      if (contractId && t.contractId !== contractId) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter)
        return false;
      if (!needle) return true;
      const c = t.contractId ? contractById.get(t.contractId) ?? null : null;
      if (taskMatchesQuery(t, c, q)) return true;
      if (!t.parentId) {
        return data.tasks.some((s) => {
          if (s.parentId !== t.id || !taskVisibleInLists(s)) return false;
          const sc = s.contractId
            ? contractById.get(s.contractId) ?? null
            : null;
          return taskMatchesQuery(s, sc, q);
        });
      }
      const parent = data.tasks.find((p) => p.id === t.parentId);
      if (!parent) return false;
      const pc = parent.contractId
        ? contractById.get(parent.contractId) ?? null
        : null;
      return taskMatchesQuery(parent, pc, q);
    });
  }, [
    data.tasks,
    contractById,
    q,
    contractId,
    priorityFilter,
  ]);

  const roots = useMemo(
    () => scoped.filter((t) => !t.parentId),
    [scoped]
  );
  const childrenOf = (id: string) => scoped.filter((t) => t.parentId === id);

  const matchesHubRow = useMemo(() => {
    const needle = q.trim();
    return (t: Task) => {
      if (!taskVisibleInLists(t)) return false;
      if (contractId && t.contractId !== contractId) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (!needle) return true;
      const c = t.contractId ? contractById.get(t.contractId) ?? null : null;
      if (taskMatchesQuery(t, c, q)) return true;
      if (!t.parentId) return false;
      const parent = data.tasks.find((p) => p.id === t.parentId);
      if (!parent) return false;
      const pc = parent.contractId
        ? contractById.get(parent.contractId) ?? null
        : null;
      return taskMatchesQuery(parent, pc, q);
    };
  }, [q, contractId, priorityFilter, contractById, data.tasks]);

  const openSubtasksByParent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of data.tasks) {
      if (!task.parentId || !taskIsOpen(task)) continue;
      counts.set(task.parentId, (counts.get(task.parentId) ?? 0) + 1);
    }
    return counts;
  }, [data.tasks]);

  const subtaskViews = useMemo(() => {
    const ids = ["unassigned", "overdue", "completed"] as const;
    const compare = (a: Task, b: Task) => sortTasks(a, b, today);
    const tasks = data.tasks.filter(
      (t) => !t.deletedAt && (!contractId || t.contractId === contractId)
    );
    return Object.fromEntries(
      ids.map((id) => [
        id,
        assembleSubtaskView({
          tasks,
          view: id,
          today,
          matchesRow: matchesHubRow,
          compare,
        }),
      ])
    ) as Record<
      "unassigned" | "overdue" | "completed",
      ReturnType<typeof assembleSubtaskView>
    >;
  }, [data.tasks, today, contractId, matchesHubRow]);

  const deptDepartments = useMemo(() => {
    if (!showDept) return [];
    const names = [currentUserDepartment];
    if (role === "manager") names.push(currentUserSecondDepartment);
    return names.map((name) => (name || "").trim()).filter(Boolean);
  }, [showDept, role, currentUserDepartment, currentUserSecondDepartment]);

  const listTasks = useMemo(
    () =>
      data.tasks.filter(
        (t) => !t.deletedAt && (!contractId || t.contractId === contractId)
      ),
    [data.tasks, contractId]
  );
  const myView = useMemo(
    () =>
      assembleMatchedRows({
        tasks: listTasks,
        matchesTask: (task) =>
          matchesHubRow(task) &&
          namedOnTask({ name: currentUserName }, task),
        compare: (a, b) => sortTasks(a, b, today),
      }),
    [listTasks, matchesHubRow, currentUserName, today]
  );
  const deptView = useMemo(
    () =>
      assembleDepartmentView({
        tasks: listTasks,
        departments: deptDepartments,
        matchesRow: matchesHubRow,
        compare: (a, b) => sortTasks(a, b, today),
      }),
    [listTasks, deptDepartments, matchesHubRow, today]
  );

  const counts = useMemo(() => {
    return {
      my: myView.counted.length,
      dept: deptView.counted.length,
      all: roots.length,
      unassigned: subtaskViews.unassigned.counted.length,
      overdue: subtaskViews.overdue.counted.length,
      completed: subtaskViews.completed.counted.length,
    };
  }, [roots, myView, deptView, subtaskViews]);

  const visibleRoots = useMemo(() => {
    return roots.slice().sort((a, b) => sortTasks(a, b, today));
  }, [roots, today]);

  const listView: ViewFilter =
    view === "unassigned" && counts.unassigned === 0 ? "all" : view;
  const activeSubtaskView =
    listView === "unassigned" ||
    listView === "overdue" ||
    listView === "completed"
      ? listView
      : null;
  const visibleRows: TaskListRow[] =
    listView === "dept"
      ? deptView.rows
      : listView === "my"
        ? myView.rows
        : activeSubtaskView
          ? subtaskViews[activeSubtaskView].rows
          : visibleRoots.map((parent) => ({
              parent,
              subtasks: childrenOf(parent.id),
            }));
  const displayLines = subtasksOnly
    ? subtasksOnlyLines(visibleRows).map((line) => ({
        task: line.task,
        parent: line.parent,
      }))
    : visibleRows.map((row) => ({
        task: row.parent,
        parent: null as Task | null,
      }));

  function listPath() {
    const params = new URLSearchParams();
    if (contractId) params.set("contractId", contractId);
    const viewParam = taskFilterParam(listView);
    if (viewParam) params.set("view", viewParam);
    if (q) params.set("q", q);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (subtasksOnly) params.set("subs", "1");
    const search = params.toString();
    return search ? `/tasks?${search}` : "/tasks";
  }

  function taskPageHref(task: Task, parent: Task | null) {
    const params = new URLSearchParams();
    params.set("from", listPath());
    if (parent) params.set("sub", task.id);
    const id = parent ? parent.id : task.id;
    return `/tasks/${id}?${params.toString()}`;
  }

  const deadlineLog = useMemo(() => {
    const tokens = parseSearchTokens(q);
    return [...(data.taskDeadlineChangeLog ?? [])]
      .filter((entry) => {
        if (!tokens.length) return true;
        const task = data.tasks.find((row) => row.id === entry.taskId);
        const contractIdForEntry = entry.contractId || task?.contractId || null;
        const contract = contractIdForEntry
          ? data.contracts.find((row) => row.id === contractIdForEntry)
          : null;
        return tokens.every((token) =>
          matchesToken(token, [
            entry.by,
            entry.reason,
            entry.taskTitle,
            task?.title,
            contract?.projectNo,
            contract?.projectName,
            contract?.city,
            contract?.state,
            ...dateSearchForms(entry.at),
            ...dateSearchForms(entry.fromDate),
            ...dateSearchForms(entry.toDate),
            formatDisplayDate(entry.fromDate),
            formatDisplayDate(entry.toDate),
            formatDisplayDateTime(entry.at),
          ])
        );
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [data.taskDeadlineChangeLog, data.tasks, data.contracts, q]);

  async function onClearDeadlineLog() {
    if (!isMaster) return;
    const ok = await confirmAction({
      message: "This removes every change-log row and cannot be undone.",
      action: "Clear",
    });
    if (!ok) return;
    clearTaskDeadlineChangeLog();
    await flushWorkspace();
  }

  const views: { id: ViewFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    ...(counts.unassigned > 0
      ? [
          {
            id: "unassigned" as const,
            label: "Unassigned",
            count: counts.unassigned,
          },
        ]
      : []),
    { id: "overdue", label: "Overdue", count: counts.overdue },
    { id: "completed", label: "Done", count: counts.completed },
    { id: "my", label: "My tasks", count: counts.my },
    ...(showDept
      ? [{ id: "dept" as const, label: "Dept tasks", count: counts.dept }]
      : []),
  ];

  return (
    <HubPage>
      <header className="flex shrink-0 flex-col gap-4 border-b border-[var(--fh-line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--fh-steel)]">
            Tasks
          </h1>
          {(contractId || homeFilter) && (
            <p className="mt-2 text-sm text-[var(--fh-steel)]">
              {contractLabel ? `Contract ${contractLabel}` : null}
              {contractLabel && homeFilter ? " · " : null}
              {homeFilter ? `Filter from home: ${homeFilter}` : null}{" "}
              <Link href="/tasks" className="underline">
                Clear
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewDeadlineLog && (
            <Button
              type="button"
              variant={showLog ? "default" : "outline"}
              className={
                showLog
                  ? "bg-[var(--fh-steel)] text-white hover:bg-[#244a5e]"
                  : undefined
              }
              onClick={() => setShowLog(!showLog)}
            >
              Change log
              <span className="ml-1.5 tabular-nums opacity-80">
                {deadlineLog.length}
              </span>
            </Button>
          )}
          <Link
            href={`/tasks/new?${new URLSearchParams({
              ...(contractId ? { contractId } : {}),
              from: listPath(),
            }).toString()}`}
            className={cn(
              buttonVariants(),
              "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
            )}
          >
            Add New Task
          </Link>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ListSearchBar
          value={q}
          onChange={setQ}
          placeholder={
            showLog
              ? "Search task, who, reason, date…"
              : "Search title, contract, person, status, date…"
          }
        />
        {!showLog && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-[var(--fh-muted)]">Priority</Label>
          <select
            className="flex h-9 rounded-lg border border-input bg-white px-2 text-sm"
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(e.target.value as "all" | TaskPriority)
            }
          >
            <option value="all">All</option>
            {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        )}
      </div>

      {canViewDeadlineLog && showLog ? (
        <TaskDeadlineLogPanel
          entries={deadlineLog}
          contracts={data.contracts}
          tasks={data.tasks}
          query={q}
          isMaster={isMaster}
          onClear={() => void onClearDeadlineLog()}
        />
      ) : (
      <>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <nav className="flex flex-wrap gap-1.5" aria-label="Task views">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              listView === v.id
                ? "bg-[var(--fh-steel)] text-white"
                : "bg-white text-[var(--fh-steel)] ring-1 ring-[var(--fh-line)] hover:bg-[var(--fh-bg)]"
            )}
          >
            {v.label}
            <span
              className={cn(
                "ml-1.5 tabular-nums",
                listView === v.id ? "text-white/80" : "text-[var(--fh-muted)]"
              )}
            >
              {v.count}
            </span>
          </button>
        ))}
      </nav>
      <label className="ml-auto flex items-center gap-2 text-sm text-[var(--fh-steel)]">
        <input
          type="checkbox"
          role="switch"
          aria-checked={subtasksOnly}
          checked={subtasksOnly}
          onChange={(e) => setSubtasksOnly(e.target.checked)}
        />
        Subtasks only
      </label>
      </div>

      <HubDataScroll className="space-y-2">
        <div className="sticky top-0 z-10 mb-0 hidden gap-3 border-b border-[var(--fh-line)] bg-[var(--fh-bg)] px-4 pb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--fh-muted)] lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_8rem_7.5rem]">
          <span>Task name</span>
          <span>Contract</span>
          <span>Department</span>
          <span>Deadline</span>
          <span>Status</span>
        </div>

        {displayLines.length === 0 ? (
          <div className="border border-dashed border-[var(--fh-line)] bg-white px-4 py-12 text-center text-sm text-[var(--fh-muted)]">
            {subtasksOnly ? "No subtasks in this view." : "No tasks in this view."}
          </div>
        ) : (
          displayLines.map((line) => {
            const contract = line.task.contractId
              ? contractById.get(line.task.contractId)
              : null;
            const overdue = isOverdue(line.task, today);
            return (
              <Link
                key={`${line.parent?.id ?? "root"}-${line.task.id}`}
                href={taskPageHref(line.task, line.parent)}
                className={cn(
                  "grid gap-2 border bg-white px-4 py-3 text-left hover:bg-[var(--fh-bg)]/60 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_8rem_7.5rem] lg:items-center",
                  overdue
                    ? "border-[var(--destructive)]/35"
                    : "border-[var(--fh-line)]"
                )}
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-medium text-[var(--fh-steel)]">
                      {line.task.title}
                    </span>
                    {!line.parent &&
                    (openSubtasksByParent.get(line.task.id) ?? 0) > 0 ? (
                      <span className="shrink-0 tabular-nums text-xs font-normal text-[var(--fh-muted)]">
                        +{openSubtasksByParent.get(line.task.id)}
                      </span>
                    ) : null}
                    {line.parent ? (
                      <span className="truncate text-xs font-normal text-[var(--fh-muted)]">
                        {line.parent.title}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-[var(--fh-steel)]">
                    {contract?.projectName ?? "—"}
                  </span>
                  {contract ? (
                    <span className="block truncate text-xs text-[var(--fh-muted)]">
                      {contract.projectNo}
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 truncate text-sm text-[var(--fh-steel)]">
                  {line.task.department
                    ? departmentDisplayName(line.task.department)
                    : "—"}
                </span>
                <span
                  className={cn(
                    "tabular-nums text-sm",
                    overdue && "font-medium text-[var(--destructive)]",
                    !line.task.dueDate && "text-[var(--fh-accent)]"
                  )}
                >
                  {line.task.dueDate
                    ? formatDisplayDate(line.task.dueDate)
                    : "No deadline"}
                </span>
                <span>
                  <StatusPill status={line.task.status} />
                </span>
              </Link>
            );
          })
        )}
      </HubDataScroll>

      <ReportExportIcons
        filename="tasks"
        title="Tasks"
        filters={reportFilterSummary({
          tab: views.find((v) => v.id === listView)?.label ?? null,
          contract: contractLabel ?? null,
          search: q,
          extra: [
            [
              "Priority",
              priorityFilter === "all" ? "" : TASK_PRIORITY_LABELS[priorityFilter],
            ],
          ],
        })}
        headers={["Task name", "Parent", "Contract", "Project no.", "Department", "Deadline", "Status"]}
        rows={displayLines.map((line) => {
          const contract = line.task.contractId
            ? contractById.get(line.task.contractId)
            : null;
          const openSubtasks = line.parent
            ? 0
            : (openSubtasksByParent.get(line.task.id) ?? 0);
          return [
            openSubtasks > 0
              ? `${line.task.title} +${openSubtasks}`
              : line.task.title,
            line.parent?.title ?? "",
            contract?.projectName ?? "",
            contract?.projectNo ?? "",
            line.task.department ? departmentDisplayName(line.task.department) : "",
            line.task.dueDate ? formatDisplayDate(line.task.dueDate) : "No deadline",
            TASK_STATUS_LABELS[line.task.status],
          ];
        })}
      />
      </>
      )}
    </HubPage>
  );
}

function TaskDeadlineLogPanel({
  entries,
  contracts,
  tasks,
  query,
  isMaster,
  onClear,
}: {
  entries: TaskDeadlineChangeLogEntry[];
  contracts: { id: string; projectNo: string; projectName: string }[];
  tasks: Task[];
  query: string;
  isMaster: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="text-xs text-[var(--fh-muted)]">
          {entries.length} change{entries.length === 1 ? "" : "s"}
        </p>
        {isMaster ? (
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
      <HubDataScroll className="overflow-x-auto rounded-xl border border-[var(--fh-line)] bg-white">
        <table className="list-sticky-head w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-[var(--fh-muted)]"
                >
                  {query.trim()
                    ? "No changes match your search."
                    : "No deadline changes yet."}
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const task = tasks.find((row) => row.id === entry.taskId);
                const contractId = entry.contractId || task?.contractId || null;
                const contract = contractId
                  ? contracts.find((row) => row.id === contractId)
                  : null;
                return (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 tabular-nums text-xs text-[var(--fh-muted)]">
                      {formatDisplayDateTime(entry.at)}
                    </td>
                    <td className="px-3 py-2">{entry.by}</td>
                    <td className="px-3 py-2">{contract?.projectNo ?? "—"}</td>
                    <td className="px-3 py-2">
                      {task?.title || entry.taskTitle || "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatDisplayDate(entry.fromDate)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatDisplayDate(entry.toDate)}
                    </td>
                    <td className="px-3 py-2">{entry.reason}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </HubDataScroll>
      <ReportExportIcons
        filename="tasks-change-log"
        title="Tasks — Change log"
        filters={reportFilterSummary({ tab: "Change log", search: query })}
        headers={["When", "Who", "Project no.", "Project", "Task", "From", "To", "Reason"]}
        rows={entries.map((entry) => {
          const task = tasks.find((row) => row.id === entry.taskId);
          const contractId = entry.contractId || task?.contractId || null;
          const contract = contractId
            ? contracts.find((row) => row.id === contractId)
            : null;
          return [
            formatDisplayDateTime(entry.at),
            entry.by,
            contract?.projectNo ?? "",
            contract?.projectName ?? "",
            task?.title || entry.taskTitle || "",
            formatDisplayDate(entry.fromDate),
            formatDisplayDate(entry.toDate),
            entry.reason,
          ];
        })}
      />
    </div>
  );
}

function StatusPill({
  status,
  onDark,
}: {
  status: TaskStatus;
  onDark?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        onDark
          ? "bg-white/15 text-white"
          : status === "awaiting_verification"
            ? "bg-[var(--fh-accent)]/30 text-[var(--fh-ink)]"
            : status === "completed"
              ? "bg-[var(--fh-ok)]/15 text-[var(--fh-ok)]"
              : status === "not_required"
              ? "bg-[var(--fh-muted)]/15 text-[var(--fh-muted)]"
              : status === "in_progress"
                ? "bg-[var(--fh-steel)]/10 text-[var(--fh-steel)]"
                : status === "on_hold"
                  ? "bg-[var(--fh-accent)]/20 text-[var(--fh-ink)]"
                  : "bg-[var(--fh-bg)] text-[var(--fh-muted)]"
      )}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

function SummaryField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--fh-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 min-w-0 text-sm text-[var(--fh-ink)]">{children}</dd>
    </div>
  );
}

export function PeoplePicker({
  people,
  assignees,
  onChange,
}: {
  people: { id: string; name: string }[];
  assignees: string[];
  onChange: (assignees: string[]) => void;
}) {
  function toggle(name: string) {
    const has = assignees.some((item) => samePerson(item, name));
    onChange(
      has
        ? assignees.filter((item) => !samePerson(item, name))
        : [...assignees, name]
    );
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)]/40 px-2 py-1">
      {people.length === 0 ? (
        <p className="text-xs text-[var(--fh-muted)]">
          No users/managers in this department.
        </p>
      ) : (
        people.map((person) => {
          const named = assignees.some((item) => samePerson(item, person.name));
          return (
            <label key={person.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={named}
                onChange={() => toggle(person.name)}
              />
              {person.name}
            </label>
          );
        })
      )}
    </div>
  );
}

type SubtaskSaveResult =
  | { ok: true; status: TaskStatus; wrote: true }
  | { ok: false; error: string; wrote: boolean };

type SubtaskEditorHandle = {
  save: () => SubtaskSaveResult;
};

export function TaskEditor({
  task,
  subtasks,
  people,
  departments,
  canAssignPeople,
  canDeleteTasks,
  canEditTasks,
  actor,
  expandedSubId,
  setExpandedSubId,
  onClose,
  startEditing = false,
}: {
  task: Task;
  subtasks: Task[];
  people: AssignablePerson[];
  departments: string[];
  canAssignPeople: boolean;
  canDeleteTasks: boolean;
  canEditTasks: boolean;
  actor: TaskActor;
  expandedSubId: string | null;
  setExpandedSubId: (id: string | null) => void;
  onClose: () => void;
  /** Open the updates box on the first render. The task page leaves this unset. */
  startEditing?: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [department, setDepartment] = useState(task.department ?? "none");
  const [assignees, setAssignees] = useState<string[]>(task.assignees);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [deadlineReason, setDeadlineReason] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(
    task.status === "not_required" ? "completed" : task.status
  );
  useEffect(() => {
    setStatus(task.status === "not_required" ? "completed" : task.status);
  }, [task.status]);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [subTitle, setSubTitle] = useState("");
  const [subDept, setSubDept] = useState("none");
  const [subDue, setSubDue] = useState("");
  const [subAssignees, setSubAssignees] = useState<string[]>([]);
  const [addingSub, setAddingSub] = useState(
    initialTaskUpdatesBox().addingSubtask
  );
  const [editing, setEditing] = useState(
    startEditing || initialTaskUpdatesBox().editing
  );
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closures, setClosures] = useState<
    Record<string, { status: "completed" | "not_required"; reason: string }>
  >({});
  const [prompt, setPrompt] = useState<
    null | "gad_required" | "boq_changed" | "amendment_needed"
  >(null);
  const [boqChanged, setBoqChanged] = useState(false);
  const [followUpMsg, setFollowUpMsg] = useState<string | null>(null);

  const canUpdate = canUpdateTask(actor, task);
  const departmentControl = taskDepartmentControl(
    actor,
    task,
    departments,
    canEditTasks
  );
  const keepingSavedDepartment =
    departmentControl.kind === "fixed" ||
    (departmentControl.kind === "clear" && department !== "none");
  const newSubControl = taskDepartmentControl(
    actor,
    { parentId: task.id, department: null, assignees: [] },
    departments,
    canEditTasks
  );
  const mayEditSchedule = canEditTaskSchedule(actor, task);
  const deadlineLocked = !mayEditSchedule;
  const canName = canNamePeople(actor, task, canAssignPeople);
  const selectable = peopleForDepartment(people, department);
  const openSubs = subtasks.filter(taskIsOpen);
  const showCompletion =
    task.status === "completed" || task.status === "not_required";
  const subtaskSaveRef = useRef<SubtaskEditorHandle>(null);
  const openSubtask = expandedSubId
    ? (subtasks.find((row) => row.id === expandedSubId) ?? null)
    : null;
  const canSaveOpenSub = Boolean(
    openSubtask && canUpdateTask(actor, openSubtask)
  );

  function currentBox(): TaskUpdatesBox {
    return {
      editing,
      addingSubtask: addingSub,
      subtaskEditorId: expandedSubId,
    };
  }

  function applyBox(next: TaskUpdatesBox) {
    setEditing(next.editing);
    setAddingSub(next.addingSubtask);
    setExpandedSubId(next.subtaskEditorId);
    if (!next.addingSubtask) {
      setSubTitle("");
      setSubDue("");
      setSubDept("none");
      setSubAssignees([]);
    }
    if (!next.editing) setClosing(false);
  }

  function resetDraftFromTask() {
    setTitle(task.title);
    setDepartment(task.department ?? "none");
    setAssignees([...task.assignees]);
    setDueDate(task.dueDate ?? "");
    setDeadlineReason("");
    setPriority(task.priority);
    setStatus(task.status === "not_required" ? "completed" : task.status);
    setNotes(task.notes ?? "");
    setClosures({});
  }

  function runAfterCompleted() {
    if (!task.contractId) return;
    if (task.catalogKey === "kickoff") {
      setPrompt("gad_required");
      return;
    }
    if (task.catalogKey === "gad") {
      setPrompt("boq_changed");
    }
  }

  function onDepartmentChange(next: string) {
    setDepartment(next);
    const allowed = peopleForDepartment(people, next);
    setAssignees((prev) =>
      prev.filter((name) =>
        allowed.some((person) => samePerson(person.name, name))
      )
    );
  }

  function onSubDepartmentChange(next: string) {
    setSubDept(next);
    const allowed = peopleForDepartment(people, next);
    setSubAssignees((prev) =>
      prev.filter((name) =>
        allowed.some((person) => samePerson(person.name, name))
      )
    );
  }

  function parentAssignees() {
    const nextDepartment = chosenDepartment(departmentControl, department);
    const pool = peopleForDepartment(people, nextDepartment || "none");
    const nextAssignees =
      !canName || !departmentIsSet(nextDepartment)
        ? task.assignees
        : assignees.filter((name) => {
            const key = name.trim().toLowerCase();
            const inDepartment = pool.some(
              (person) => person.name.trim().toLowerCase() === key
            );
            const alreadyNamed =
              keepingSavedDepartment &&
              task.assignees.some((item) => item.trim().toLowerCase() === key);
            return inDepartment || alreadyNamed;
          });
    return { nextDepartment, nextAssignees };
  }

  async function saveUpdates() {
    const errors: string[] = [];
    let wrote = false;
    let statusResult: { status: TaskStatus; sideEffects: boolean } | null =
      null;
    let subtaskClosed = false;

    if (editing && canUpdate) {
      const { nextDepartment, nextAssignees } = parentAssignees();
      const saved = assignTask(
        task.id,
        {
          department: nextDepartment,
          assignees: nextAssignees,
          dueDate: deadlineLocked ? task.dueDate : dueDate || null,
        },
        { actor, people, deadlineReason }
      );
      if (!saved.ok) {
        errors.push(saved.error);
      } else {
        wrote = true;
        setDeadlineReason("");
      }
      const updated = updateTask(
        task.id,
        {
          title: title.trim() || task.title,
          priority: mayEditSchedule ? priority : task.priority,
        },
        { actor, people }
      );
      if (!updated) errors.push(TASK_SAVE_DENIED);
      else wrote = true;
    }

    if (canSaveOpenSub && subtaskSaveRef.current) {
      const result = subtaskSaveRef.current.save();
      if (result.wrote) wrote = true;
      if (!result.ok) errors.push(result.error);
      else {
        subtaskClosed =
          result.status === "completed" || result.status === "not_required";
      }
    }

    let addedOpen = false;
    if (addingSub && canUpdate && subTitle.trim()) {
      if (!task.contractId) {
        errors.push(TASK_SAVE_DENIED);
      } else {
        const created = addSubtask(
          task.id,
          {
            title: subTitle,
            department: chosenDepartment(newSubControl, subDept),
            assignees: canAssignPeople ? subAssignees : [],
            dueDate: subDue || null,
          },
          { actor }
        );
        if (!created) {
          errors.push(TASK_SAVE_DENIED);
        } else {
          wrote = true;
          addedOpen = taskIsOpen(created);
          setSubTitle("");
          setSubDue("");
          setSubDept("none");
          setSubAssignees([]);
          setAddingSub(false);
        }
      }
    }

    if (editing && canUpdate) {
      const stillOpen = openSubs.some(
        (row) => !(row.id === expandedSubId && subtaskClosed)
      );
      if (status === "completed" && (stillOpen || addedOpen)) {
        setClosing(true);
      } else {
        const result = updateTaskStatus(task.id, status, { notes, actor });
        if (!result) errors.push("Task not found.");
        else {
          wrote = true;
          statusResult = result;
        }
      }
    }

    if (errors.length > 0) {
      const settled = settleTaskUpdatesSave(currentBox(), {
        ok: false,
        error: errors.join(" "),
      });
      setEditing(settled.box.editing);
      setErr(settled.error);
    } else {
      setErr(null);
    }
    if (!wrote) return;
    const persisted = await confirmWorkspaceSave();
    if (!persisted || !statusResult) return;
    setStatus(statusResult.status === "not_required" ? "completed" : statusResult.status);
    if (
      taskUpdatesSaveCloses({
        errors,
        persisted,
        statusSaved: true,
      })
    ) {
      const settled = settleTaskUpdatesSave(currentBox(), { ok: true });
      setErr(settled.error);
      applyBox(settled.box);
    }
    if (statusResult.sideEffects) runAfterCompleted();
  }

  function applyStatusMessage(result: {
    status: TaskStatus;
    sideEffects: boolean;
  }) {
    setStatus(result.status === "not_required" ? "completed" : result.status);
    setErr(null);
    if (result.sideEffects) runAfterCompleted();
  }

  async function confirmVerified() {
    if (openSubs.length > 0) {
      setClosing(true);
      setErr(null);
      return;
    }
    const result = confirmTaskVerification(task.id, actor);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    setErr(null);
    const saved = await confirmWorkspaceSave();
    if (!saved) return;
    setStatus("completed");
    runAfterCompleted();
  }

  async function confirmCompleteParent() {
    const list = openSubs.map((s) => {
      const c = closures[s.id] ?? { status: "completed" as const, reason: "" };
      return {
        id: s.id,
        status: c.status,
        reason: c.reason,
      };
    });
    for (const item of list) {
      if (item.status === "not_required" && !item.reason.trim()) {
        setErr("Reason required for each subtask marked not required.");
        return;
      }
    }
    const result = completeTaskWithSubtasks(task.id, list, { notes, actor });
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    setErr(null);
    const saved = await confirmWorkspaceSave();
    if (!saved) return;
    const settled = settleTaskUpdatesSave(currentBox(), { ok: true });
    setErr(settled.error);
    applyBox(settled.box);
    applyStatusMessage(result);
  }

  async function removeTask() {
    const ok = await confirmAction({
      message: `Delete “${task.title}” and its subtasks? They leave every list.`,
      action: "Delete",
    });
    if (!ok) return;
    if (!deleteTask(task.id)) {
      setErr("Task not found.");
      return;
    }
    setErr(null);
    const saved = await confirmWorkspaceSave();
    if (saved) onClose();
  }

  function removeSubtask(id: string) {
    deleteSubtask(id);
    void flushWorkspace();
  }

  function answerGadRequired(yes: boolean) {
    setPrompt(null);
    if (!task.contractId) return;
    const created = afterKickoffCompleted(task.contractId, yes);
    void flushWorkspace();
    setFollowUpMsg(
      yes
        ? created
          ? "Finalise Drawings/GAD was added to the task list."
          : "GAD task already exists for this contract."
        : "No GAD task created."
    );
  }

  function answerBoqChanged(yes: boolean) {
    setBoqChanged(yes);
    if (!yes) {
      setPrompt(null);
      if (!task.contractId) return;
      const created = afterGadCompleted(task.contractId, {
        boqChanged: false,
        amendmentNeeded: false,
      });
      void flushWorkspace();
      setFollowUpMsg(
        created.length
          ? "Create schedules was added to the task list."
          : "Create schedules already on the list (or already done)."
      );
      return;
    }
    setPrompt("amendment_needed");
  }

  function answerAmendmentNeeded(yes: boolean) {
    setPrompt(null);
    if (!task.contractId) return;
    const created = afterGadCompleted(task.contractId, {
      boqChanged,
      amendmentNeeded: yes,
    });
    void flushWorkspace();
    const parts = created.map((t) => t.title);
    setFollowUpMsg(
      parts.length
        ? `Added: ${parts.join("; ")}.`
        : "Follow-up tasks already on the list."
    );
  }

  function renderSubtasks(showAdd: boolean) {
    return (
      <div className="space-y-2 border-t border-[var(--fh-line)] pt-2">
        <ul className="space-y-1">
          {subtasks.length === 0 ? (
            <li className="text-sm text-[var(--fh-muted)]">No subtasks yet.</li>
          ) : (
            subtasks.map((s) => (
              <li
                key={s.id}
                data-task-access={canUpdateTask(actor, s) ? "edit" : "read"}
                className="border border-[var(--fh-line)] bg-[var(--fh-bg)]/30 px-2 py-1.5 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <p className="min-w-0">
                    <span className="font-medium text-[var(--fh-steel)]">
                      {s.title}
                    </span>
                    <span className="text-xs text-[var(--fh-muted)]">
                      {" · "}
                      {s.department ? departmentDisplayName(s.department) : "—"}
                      {" · "}
                      {s.dueDate ? formatDisplayDate(s.dueDate) : "No deadline"}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <StatusPill status={s.status} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setExpandedSubId(expandedSubId === s.id ? null : s.id)
                      }
                    >
                      {expandedSubId === s.id
                        ? "Close"
                        : canUpdateTask(actor, s)
                          ? "Edit"
                          : "View"}
                    </Button>
                    {canDeleteTasks && (
                      <DeleteIconButton
                        label={`Delete ${s.title}`}
                        onClick={() => removeSubtask(s.id)}
                      />
                    )}
                  </div>
                </div>
                {expandedSubId === s.id && (
                  <div className="mt-2 border-t border-[var(--fh-line)] pt-2">
                    <SubtaskEditor
                      ref={subtaskSaveRef}
                      task={s}
                      people={people}
                      departments={departments}
                      canAssignPeople={canAssignPeople}
                      canEditTasks={canEditTasks}
                      actor={actor}
                      onDone={() => setExpandedSubId(null)}
                    />
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
        {showAdd && updatesBoxShowsAddSubtask(editing) && (
        <div className="space-y-2 border-t border-[var(--fh-line)] pt-2">
          <div role="tablist" aria-label="Add subtask">
            <button
              type="button"
              role="tab"
              data-add-subtask=""
              aria-selected={addingSub}
              aria-expanded={addingSub}
              onClick={() => setAddingSub((open) => !open)}
              className={cn(
                addSubtaskControl.className,
                "transition-colors",
                addingSub
                  ? "bg-[var(--fh-steel)] text-white"
                  : "bg-white text-[var(--fh-steel)] ring-1 ring-[var(--fh-line)] hover:bg-[var(--fh-bg)]"
              )}
            >
              {addSubtaskControl.label}
            </button>
          </div>
          {addingSub && (
          <div role="tabpanel" className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Name</Label>
              <Input
                className="h-9 bg-white"
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                placeholder="Subtask name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <DepartmentField
                control={newSubControl}
                value={subDept}
                onChange={onSubDepartmentChange}
                emptyLabel="Later…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Deadline</Label>
              <Input
                type="date"
                className="h-9 bg-white"
                value={subDue}
                onChange={(e) => setSubDue(e.target.value)}
              />
            </div>
          </div>
          {canAssignPeople && (
            <div className="space-y-1">
              <Label className="text-xs">People</Label>
              {subDept === "none" ? (
                <p className="text-xs text-[var(--fh-muted)]">
                  Select a department to choose people.
                </p>
              ) : (
                <PeoplePicker
                  people={peopleForDepartment(people, subDept)}
                  assignees={subAssignees}
                  onChange={setSubAssignees}
                />
              )}
            </div>
          )}
          </div>
          )}
        </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      data-task-access={canUpdate ? "edit" : "read"}
      onClick={(e) => e.stopPropagation()}
      {...entryRootProps}
    >
      {(err || followUpMsg) && (
        <div className="space-y-1">
          {err && (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              {err}
            </p>
          )}
          {followUpMsg && (
            <p className="rounded-md border border-[var(--fh-ok)]/30 bg-[var(--fh-ok)]/10 px-3 py-2 text-sm text-[var(--fh-ok)]">
              {followUpMsg}
            </p>
          )}
        </div>
      )}

      {prompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md space-y-4 border border-[var(--fh-line)] bg-white p-5 shadow-lg">
            {prompt === "gad_required" && (
              <>
                <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
                  Is GAD required?
                </h3>
                <p className="text-sm text-[var(--fh-muted)]">
                  Kick off is complete. If drawings/GAD are needed for this
                  contract, the hub will add <strong>Finalise Drawings/GAD</strong>{" "}
                  to the task list.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="bg-[var(--fh-steel)]"
                    onClick={() => answerGadRequired(true)}
                  >
                    Yes — create GAD task
                  </Button>
                  <Button variant="outline" onClick={() => answerGadRequired(false)}>
                    No
                  </Button>
                </div>
              </>
            )}
            {prompt === "boq_changed" && (
              <>
                <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
                  Any changes in the BOQ?
                </h3>
                <p className="text-sm text-[var(--fh-muted)]">
                  GAD is finalised. Create schedules will be added either way. If
                  the BOQ changed, we will ask about a formal amendment next.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="bg-[var(--fh-steel)]"
                    onClick={() => answerBoqChanged(true)}
                  >
                    Yes — BOQ changed
                  </Button>
                  <Button variant="outline" onClick={() => answerBoqChanged(false)}>
                    No
                  </Button>
                </div>
              </>
            )}
            {prompt === "amendment_needed" && (
              <>
                <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
                  Is amendment needed?
                </h3>
                <p className="text-sm text-[var(--fh-muted)]">
                  If a formal BOQ amendment is required, the hub will add{" "}
                  <strong>Finalise BOQ amendment</strong> to the task list.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="bg-[var(--fh-steel)]"
                    onClick={() => answerAmendmentNeeded(true)}
                  >
                    Yes — add amendment task
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => answerAmendmentNeeded(false)}
                  >
                    No
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div
        data-task-summary
        className="flex items-start gap-2 border border-[var(--fh-line)] bg-white p-2"
      >
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryField label="Task name" className="col-span-full">
            {task.title}
          </SummaryField>
          <SummaryField label="Department">
            {task.department ? departmentDisplayName(task.department) : "—"}
          </SummaryField>
          <SummaryField label="People">
            {peopleLabel(task.assignees)}
          </SummaryField>
          <SummaryField label="Deadline">
            {task.dueDate ? formatDisplayDate(task.dueDate) : "No deadline"}
          </SummaryField>
          <SummaryField label="Priority">
            {TASK_PRIORITY_LABELS[task.priority]}
          </SummaryField>
          <SummaryField label="Status">
            {TASK_STATUS_LABELS[task.status]}
          </SummaryField>
          <SummaryField label="Updated">
            {formatLastUpdated(task)}
          </SummaryField>
          {showCompletion && (
            <SummaryField label="Completion date">
              {formatDisplayDate(task.completedAt)}
            </SummaryField>
          )}
          <SummaryField label="Latest note" className="col-span-full">
            <div className="max-w-full min-w-0 overflow-x-auto">
              <div className="whitespace-nowrap">
                {(task.notes ?? "").trim() ? task.notes : "—"}
              </div>
            </div>
          </SummaryField>
          <SummaryField label="Subtasks">
            {subtasks.length}
          </SummaryField>
        </dl>
        <div className="flex shrink-0 gap-2">
          {canUpdate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={editing}
              onClick={() => {
                if (!editing) {
                  setEditing(openTaskUpdates(currentBox()).editing);
                  return;
                }
                resetDraftFromTask();
                const settled = closeTaskUpdates(currentBox());
                applyBox(settled);
                setErr(null);
              }}
            >
              {editing ? "Close" : "Add updates"}
            </Button>
          )}
          {canDeleteTasks && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void removeTask()}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {!canUpdate && (
        <div className="space-y-2">
          <p data-task-access="read" className="text-xs text-[var(--fh-muted)]">
            {TASK_READ_ONLY}
          </p>
          {canConfirmTaskVerification(actor, task) && (
            <Button
              size="sm"
              {...entrySaveProps}
              className="bg-[var(--fh-ok)] text-white"
              onClick={confirmVerified}
            >
              Confirm completion
            </Button>
          )}
        </div>
      )}

      {editing && canUpdate && (
      <div
        data-task-updates=""
        className="space-y-3 border border-[var(--fh-line)] bg-white p-2"
      >
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 lg:grid-cols-12">
          <div className="col-span-2 min-w-0 space-y-1 lg:col-span-12">
            <Label className="text-xs">Task name</Label>
            <Input
              className="bg-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-1 lg:col-span-3">
            <Label className="text-xs">Department</Label>
            <DepartmentField
              control={departmentControl}
              value={department}
              onChange={onDepartmentChange}
              emptyLabel="Select…"
            />
          </div>
          <div className="min-w-0 space-y-1 lg:col-span-3">
            <Label className="text-xs">Deadline</Label>
            {deadlineLocked ? (
              <p className="flex h-9 items-center text-sm text-[var(--fh-ink)]">
                {task.dueDate ? formatDisplayDate(task.dueDate) : "No deadline"}
              </p>
            ) : (
              <Input
                type="date"
                className="min-w-0 bg-white"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            )}
          </div>
          <div className="col-span-2 min-w-0 space-y-1 lg:col-span-2">
            <Label className="text-xs">Priority</Label>
            {mayEditSchedule ? (
              <select
                className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            ) : (
              <p className="flex h-9 items-center text-sm text-[var(--fh-ink)]">
                {TASK_PRIORITY_LABELS[task.priority]}
              </p>
            )}
          </div>
          {canName && (
            <div className="col-span-2 min-w-0 space-y-1 lg:col-span-12">
              <Label className="text-xs">People</Label>
              {department === "none" ? (
                <p className="text-xs text-[var(--fh-muted)]">
                  Select a department to choose people.
                </p>
              ) : (
                <PeoplePicker
                  people={selectable}
                  assignees={assignees}
                  onChange={setAssignees}
                />
              )}
            </div>
          )}
        </div>
        {task.dueDate && dueDate && dueDate !== task.dueDate && mayEditSchedule && (
          <div className="space-y-1">
            <Label className="text-xs">Reason for the new deadline</Label>
            <Input
              className="bg-white"
              value={deadlineReason}
              onChange={(e) => setDeadlineReason(e.target.value)}
              placeholder="One line"
            />
          </div>
        )}
        </div>

      <div className="space-y-2 border-t border-[var(--fh-line)] pt-2">
        <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <select
              className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              disabled={!taskIsOpen(task) && task.status !== "on_hold"}
            >
              {statusChoices(status).map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Update note (optional)</Label>
            <Input
              className="bg-white"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 55 of 100 done — possible delay"
            />
          </div>
        </div>
        {task.notes && (
          <div className="max-w-full min-w-0 overflow-x-auto text-xs text-[var(--fh-muted)]">
            <div className="whitespace-nowrap">
              Latest note: {task.notes}
              {task.notesUpdatedAt ? ` · ${formatLastUpdated(task)}` : ""}
            </div>
          </div>
        )}
        {task.status === "awaiting_verification" && (
          <p className="text-sm text-[var(--fh-ink)]">{waitingForCopy(task)}</p>
        )}
        {canConfirmTaskVerification(actor, task) && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              {...entrySaveProps}
              className="bg-[var(--fh-ok)] text-white"
              onClick={confirmVerified}
            >
              Confirm completion
            </Button>
          </div>
        )}

        {closing && (
          <div className="space-y-2 border border-[var(--fh-accent)] bg-[var(--fh-accent)]/10 p-2">
            <p className="text-sm font-medium text-[var(--fh-steel)]">
              Close open subtasks before completing
            </p>
            {completionNeedsVerification(actor.clearance) && (
              <p className="text-xs text-[var(--fh-muted)]">
                {actor.department
                  ? "Marking this completed sends it to your department manager to verify."
                  : "Marking this completed sends it to Master to verify."}
              </p>
            )}
            {openSubs.map((s) => {
              const c = closures[s.id] ?? {
                status: "completed" as const,
                reason: "",
              };
              if (!canUpdateTask(actor, s)) {
                return (
                  <p key={s.id} className="text-sm text-[var(--fh-ink)]">
                    {s.title} follows{" "}
                    {s.department
                      ? departmentDisplayName(s.department)
                      : "its own department"}
                    . Someone who can update that subtask has to close it first.
                  </p>
                );
              }
              return (
                <div
                  key={s.id}
                  className="grid gap-2 border-b border-[var(--fh-line)] pb-2 sm:grid-cols-3"
                >
                  <p className="text-sm sm:col-span-3">{s.title}</p>
                  <select
                    className="flex h-9 rounded-lg border border-input bg-white px-2 text-sm"
                    value={c.status}
                    onChange={(e) =>
                      setClosures((prev) => ({
                        ...prev,
                        [s.id]: {
                          ...c,
                          status: e.target.value as
                            | "completed"
                            | "not_required",
                        },
                      }))
                    }
                  >
                    <option value="completed">Completed</option>
                    <option value="not_required">Not required</option>
                  </select>
                  {c.status === "not_required" && (
                    <Input
                      className="sm:col-span-2"
                      placeholder="Reason (required)"
                      value={c.reason}
                      onChange={(e) =>
                        setClosures((prev) => ({
                          ...prev,
                          [s.id]: { ...c, reason: e.target.value },
                        }))
                      }
                    />
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                {...entrySaveProps}
                className="bg-[var(--fh-ok)] text-white"
                disabled={openSubs.some((s) => !canUpdateTask(actor, s))}
                onClick={confirmCompleteParent}
              >
                Confirm complete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setClosing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
      {renderSubtasks(true)}
      <div className={saveUpdatesControl.rowClassName}>
        <Button
          type="button"
          size="lg"
          {...entrySaveProps}
          data-save-updates=""
          className={cn("bg-[var(--fh-steel)]", saveUpdatesControl.className)}
          onClick={() => void saveUpdates()}
        >
          {saveUpdatesControl.label}
        </Button>
      </div>
      </div>
      )}

      {!canUpdate && (
        <>
          {renderSubtasks(false)}
          {canSaveOpenSub && (
            <div className="border-t border-[var(--fh-line)] pt-2">
              <Button
                type="button"
                size="sm"
                {...entrySaveProps}
                className="bg-[var(--fh-steel)]"
                onClick={() => void saveUpdates()}
              >
                Save updates
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubtaskEditor({
  task,
  people,
  departments,
  canAssignPeople,
  canEditTasks,
  actor,
  onDone,
  ref,
}: {
  task: Task;
  people: AssignablePerson[];
  departments: string[];
  canAssignPeople: boolean;
  canEditTasks: boolean;
  actor: TaskActor;
  onDone: () => void;
  ref?: Ref<SubtaskEditorHandle>;
}) {
  const [department, setDepartment] = useState(task.department ?? "none");
  const [assignees, setAssignees] = useState<string[]>(task.assignees);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [deadlineReason, setDeadlineReason] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [reason, setReason] = useState(task.notRequiredReason ?? "");
  const [err, setErr] = useState<string | null>(null);

  const canUpdate = canUpdateTask(actor, task);
  const departmentControl = taskDepartmentControl(
    actor,
    task,
    departments,
    canEditTasks
  );
  const keepingSavedDepartment =
    departmentControl.kind === "fixed" ||
    (departmentControl.kind === "clear" && department !== "none");
  const mayEditSchedule = canEditTaskSchedule(actor, task);
  const deadlineLocked = !mayEditSchedule;
  const canName = canNamePeople(actor, task, canAssignPeople);
  const selectable = peopleForDepartment(
    people,
    departmentControl.kind === "fixed"
      ? departmentControl.department || "none"
      : department
  );

  useImperativeHandle(ref, () => ({
    save() {
      if (!canUpdate) {
        return { ok: false, error: TASK_SAVE_DENIED, wrote: false };
      }
      if (status === "not_required" && !reason.trim()) {
        return {
          ok: false,
          error: "Reason is required for not required.",
          wrote: false,
        };
      }
      const nextDepartment = chosenDepartment(departmentControl, department);
      const pool = peopleForDepartment(people, nextDepartment || "none");
      const nextAssignees =
        !canName || !departmentIsSet(nextDepartment)
          ? task.assignees
          : assignees.filter((name) => {
              const key = name.trim().toLowerCase();
              const inDepartment = pool.some(
                (person) => person.name.trim().toLowerCase() === key
              );
              const alreadyNamed =
                keepingSavedDepartment &&
                task.assignees.some(
                  (item) => item.trim().toLowerCase() === key
                );
              return inDepartment || alreadyNamed;
            });
      const assigned = assignTask(
        task.id,
        {
          department: nextDepartment,
          assignees: nextAssignees,
          dueDate: deadlineLocked ? task.dueDate : dueDate || null,
        },
        { actor, people, deadlineReason }
      );
      if (!assigned.ok) {
        return { ok: false, error: assigned.error, wrote: false };
      }
      setDeadlineReason("");
      const scheduled = updateTask(
        task.id,
        { priority: mayEditSchedule ? priority : task.priority },
        { actor, people }
      );
      if (!scheduled) {
        return { ok: false, error: TASK_SAVE_DENIED, wrote: true };
      }
      const result = updateTaskStatus(task.id, status, {
        notes,
        notRequiredReason: reason,
        actor,
      });
      if (!result) {
        return { ok: false, error: TASK_SAVE_DENIED, wrote: true };
      }
      setErr(null);
      return { ok: true, status: result.status, wrote: true };
    },
  }));

  if (!canUpdate) {
    return (
      <div className="mt-1 space-y-2" data-task-access="read">
        <p className="text-xs text-[var(--fh-muted)]">{TASK_READ_ONLY}</p>
        {canConfirmTaskVerification(actor, task) && (
          <Button
            size="sm"
            {...entrySaveProps}
            className="bg-[var(--fh-ok)] text-white"
            onClick={async () => {
              const result = confirmTaskVerification(task.id, actor);
              if (!result.ok) {
                setErr(result.error);
                return;
              }
              const saved = await confirmWorkspaceSave();
              if (saved) onDone();
            }}
          >
            Confirm completion
          </Button>
        )}
        {err && <p className="text-xs text-[var(--destructive)]">{err}</p>}
      </div>
    );
  }

  return (
    <div
      className="mt-1 w-full space-y-1.5 border-t border-[var(--fh-line)] pt-1.5"
      data-task-access="edit"
    >
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <DepartmentField
          control={departmentControl}
          value={department}
          onChange={(next) => {
            setDepartment(next);
            setAssignees([]);
          }}
          emptyLabel="Department…"
        />
        {deadlineLocked ? (
          <p className="flex h-9 items-center text-sm text-[var(--fh-ink)]">
            {task.dueDate ? formatDisplayDate(task.dueDate) : "No deadline"}
          </p>
        ) : (
          <Input
            type="date"
            className="h-9 bg-white"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        )}
        {mayEditSchedule ? (
          <select
            className="flex h-9 rounded-lg border border-input bg-white px-2 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        ) : (
          <p className="flex h-9 items-center text-sm text-[var(--fh-ink)]">
            {TASK_PRIORITY_LABELS[task.priority]}
          </p>
        )}
        <select
          className="flex h-9 rounded-lg border border-input bg-white px-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus)}
        >
          {statusChoices(status, true).map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {task.dueDate && dueDate && dueDate !== task.dueDate && mayEditSchedule && (
        <Input
          placeholder="Reason for the new deadline"
          value={deadlineReason}
          onChange={(e) => setDeadlineReason(e.target.value)}
        />
      )}
      {task.status === "awaiting_verification" && (
        <p className="text-xs text-[var(--fh-ink)]">{waitingForCopy(task)}</p>
      )}
      {status === "not_required" && (
        <Input
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {canName && (keepingSavedDepartment || department !== "none") && (
        <PeoplePicker
          people={selectable}
          assignees={assignees}
          onChange={setAssignees}
        />
      )}
      <Input
        placeholder="Update note (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {err && <p className="text-xs text-[var(--destructive)]">{err}</p>}
      {canConfirmTaskVerification(actor, task) && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            {...entrySaveProps}
            className="bg-[var(--fh-ok)] text-white"
            onClick={async () => {
              const result = confirmTaskVerification(task.id, actor);
              if (!result.ok) {
                setErr(result.error);
                return;
              }
              setErr(null);
              const saved = await confirmWorkspaceSave();
              if (saved) onDone();
            }}
          >
            Confirm completion
          </Button>
        </div>
      )}
    </div>
  );
}
