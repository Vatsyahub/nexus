"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  addManualTask,
  addSubtask,
  afterGadCompleted,
  afterKickoffCompleted,
  assignTask,
  canConfirmTaskVerification,
  completeTaskWithSubtasks,
  completionNeedsVerification,
  confirmTaskVerification,
  flushWorkspace,
  formatAssignees,
  listDepartments,
  taskIsOpen,
  taskVisibleInLists,
  updateTask,
  updateTaskStatus,
  useFlowhubData,
  type TaskActor,
} from "@/lib/store";
import {
  TASK_CATALOG,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  departmentDisplayName,
  type Task,
  type TaskCatalogKey,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import type { ClearanceRole } from "@/lib/clearance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListSearchBar } from "@/components/list-search";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { taskMatchesQuery } from "@/lib/list-search";
import { formatDisplayDate } from "@/lib/dates";
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
  | "all"
  | "unassigned"
  | "open"
  | "overdue"
  | "no_deadline"
  | "completed";

function todayIso() {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

function canAssignPeople(role: ClearanceRole) {
  return role === "manager" || role === "director" || role === "master";
}

function peopleForDepartment(
  people: AssignablePerson[],
  department: string
): AssignablePerson[] {
  if (department === "none" || !department) return people;
  return people.filter((p) => p.department === department);
}

function isUnassigned(t: Task) {
  return !t.department && t.assignees.length === 0;
}

function isAssignedTo(t: Task, userName: string) {
  if (!userName) return false;
  return t.assignees.includes(userName);
}

function isOverdue(t: Task, today: string) {
  return taskIsOpen(t) && !!t.dueDate && t.dueDate < today;
}

function needsDeadline(t: Task) {
  return taskIsOpen(t) && !t.dueDate;
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
  people,
  role,
  currentUserName,
  currentUserDepartment,
}: {
  people: AssignablePerson[];
  role: ClearanceRole;
  currentUserName: string;
  currentUserDepartment: string | null;
}) {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[var(--fh-muted)]">Loading tasks…</p>
      }
    >
      <TasksPageInner
        people={people}
        role={role}
        currentUserName={currentUserName}
        currentUserDepartment={currentUserDepartment}
      />
    </Suspense>
  );
}

function TasksPageInner({
  people,
  role,
  currentUserName,
  currentUserDepartment,
}: {
  people: AssignablePerson[];
  role: ClearanceRole;
  currentUserName: string;
  currentUserDepartment: string | null;
}) {
  const data = useFlowhubData();
  const search = useSearchParams();
  const urlFilter = search.get("filter") || "";
  const contractId = search.get("contractId") || "";
  const focusTaskId =
    search.get("task") || search.get("highlight") || "";
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewFilter>(() => {
    if (focusTaskId) return "all";
    if (urlFilter === "my" || urlFilter === "mine") return "my";
    if (urlFilter === "pending") return "open";
    if (urlFilter === "overdue") return "overdue";
    if (urlFilter === "completed") return "completed";
    return "all";
  });
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>(
    "all"
  );
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    focusTaskId || null
  );
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);

  const departments = useMemo(() => listDepartments(data), [data]);
  const today = todayIso();
  const assignPeople = canAssignPeople(role);
  const actor = useMemo<TaskActor>(
    () => ({
      name: currentUserName,
      clearance: role,
      department: currentUserDepartment,
    }),
    [currentUserName, role, currentUserDepartment]
  );

  const contractLabel = contractId
    ? data.contracts.find((c) => c.id === contractId)?.projectNo
    : null;

  const contractById = useMemo(() => {
    const map = new Map(data.contracts.map((c) => [c.id, c]));
    return map;
  }, [data.contracts]);

  // Open the task from a notification deep-link so data can be entered.
  useEffect(() => {
    if (!focusTaskId) return;
    const target = data.tasks.find((t) => t.id === focusTaskId);
    if (!target) return;
    const rootId = target.parentId || target.id;
    setView("all");
    setPriorityFilter("all");
    setExpandedId(rootId);
    if (target.parentId) setExpandedSubId(target.id);
    const t = window.setTimeout(() => {
      document
        .getElementById(`task-row-${rootId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusTaskId, data.tasks]);

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

  const isMyTask = useMemo(() => {
    const name = currentUserName.trim();
    return (t: Task) => {
      if (!name) return false;
      if (isAssignedTo(t, name)) return true;
      // Include parent when a subtask is appointed to this user
      return scoped.some(
        (s) => s.parentId === t.id && isAssignedTo(s, name)
      );
    };
  }, [currentUserName, scoped]);

  const counts = useMemo(() => {
    const open = roots.filter(taskIsOpen);
    return {
      my: roots.filter(isMyTask).length,
      all: roots.length,
      unassigned: open.filter(isUnassigned).length,
      open: open.length,
      overdue: open.filter((t) => isOverdue(t, today)).length,
      no_deadline: open.filter(needsDeadline).length,
      completed: roots.filter(
        (t) => t.status === "completed" || t.status === "not_required"
      ).length,
    };
  }, [roots, today, isMyTask]);

  const visibleRoots = useMemo(() => {
    return roots
      .filter((t) => {
        if (view === "my") return isMyTask(t);
        if (view === "all") return true;
        if (view === "unassigned") return taskIsOpen(t) && isUnassigned(t);
        if (view === "open") return taskIsOpen(t);
        if (view === "overdue") return isOverdue(t, today);
        if (view === "no_deadline") return needsDeadline(t);
        if (view === "completed")
          return t.status === "completed" || t.status === "not_required";
        return true;
      })
      .slice()
      .sort((a, b) => sortTasks(a, b, today));
  }, [roots, view, today, isMyTask]);

  const views: { id: ViewFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "unassigned", label: "Unassigned", count: counts.unassigned },
    { id: "open", label: "Open", count: counts.open },
    { id: "overdue", label: "Overdue", count: counts.overdue },
    { id: "no_deadline", label: "No deadline", count: counts.no_deadline },
    { id: "completed", label: "Done", count: counts.completed },
    { id: "my", label: "My tasks", count: counts.my },
  ];

  return (
    <HubPage>
      <header className="flex shrink-0 flex-col gap-4 border-b border-[var(--fh-line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--fh-steel)]">
            Tasks
          </h1>
          {(contractId || urlFilter) && (
            <p className="mt-2 text-sm text-[var(--fh-steel)]">
              {contractLabel ? `Contract ${contractLabel}` : null}
              {contractLabel && urlFilter ? " · " : null}
              {urlFilter ? `Filter from home: ${urlFilter}` : null}{" "}
              <Link href="/tasks" className="underline">
                Clear
              </Link>
            </p>
          )}
        </div>
        <Button
          type="button"
          className="bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? "Close" : "New task"}
        </Button>
      </header>

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ListSearchBar
          value={q}
          onChange={setQ}
          placeholder="Search title, contract, person, status, date…"
        />
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
      </div>

      <nav className="flex shrink-0 flex-wrap gap-1.5" aria-label="Task views">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              view === v.id
                ? "bg-[var(--fh-steel)] text-white"
                : "bg-white text-[var(--fh-steel)] ring-1 ring-[var(--fh-line)] hover:bg-[var(--fh-bg)]"
            )}
          >
            {v.label}
            <span
              className={cn(
                "ml-1.5 tabular-nums",
                view === v.id ? "text-white/80" : "text-[var(--fh-muted)]"
              )}
            >
              {v.count}
            </span>
          </button>
        ))}
      </nav>

      <HubDataScroll className="space-y-3">
        {showNew && (
          <NewTaskForm
            people={people}
            departments={departments}
            contracts={data.contracts.map((c) => ({
              id: c.id,
              projectNo: c.projectNo,
              label: `${c.projectNo} · ${c.projectName}`,
            }))}
            defaultContractId={contractId || ""}
            canAssignPeople={assignPeople}
            onCreated={(id) => {
              setShowNew(false);
              setView("all");
              setExpandedId(id);
            }}
          />
        )}
        <div className="hidden gap-3 px-4 text-[11px] font-medium uppercase tracking-wide text-[var(--fh-muted)] lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_7rem_minmax(0,1fr)_minmax(0,0.9fr)_5.5rem_4.5rem_5.5rem_6.5rem_2.5rem]">
          <span>Project</span>
          <span>Task</span>
          <span>Deadline</span>
          <span>Department</span>
          <span>Person</span>
          <span>Priority</span>
          <span>Subs</span>
          <span>Updated</span>
          <span>Status</span>
          <span className="sr-only">Expand</span>
        </div>

        {visibleRoots.length === 0 ? (
          <div className="border border-dashed border-[var(--fh-line)] bg-white px-4 py-12 text-center text-sm text-[var(--fh-muted)]">
            No tasks in this view.
          </div>
        ) : (
          visibleRoots.map((t) => {
            const contract = t.contractId
              ? contractById.get(t.contractId)
              : null;
            const kids = childrenOf(t.id);
            const overdue = isOverdue(t, today);
            const expanded = expandedId === t.id;
            return (
              <TaskBlock
                key={t.id}
                task={t}
                contract={
                  contract
                    ? {
                        id: contract.id,
                        projectNo: contract.projectNo,
                        projectName: contract.projectName,
                      }
                    : null
                }
                subtasks={kids}
                overdue={overdue}
                people={people}
                departments={departments}
                canAssignPeople={assignPeople}
                actor={actor}
                expanded={expanded}
                dimmed={expandedId != null && !expanded}
                onToggle={() => {
                  setExpandedSubId(null);
                  setExpandedId((cur) => (cur === t.id ? null : t.id));
                }}
                expandedSubId={expandedSubId}
                setExpandedSubId={setExpandedSubId}
              />
            );
          })
        )}
      </HubDataScroll>

      <ReportExportIcons
        filename="tasks"
        title="Tasks"
        filters={reportFilterSummary({
          tab: views.find((v) => v.id === view)?.label ?? null,
          contract: contractLabel ?? null,
          search: q,
          extra: [
            [
              "Priority",
              priorityFilter === "all" ? "" : TASK_PRIORITY_LABELS[priorityFilter],
            ],
          ],
        })}
        headers={[
          "Project",
          "Project no.",
          "Task",
          "Deadline",
          "Overdue",
          "Department",
          "Person",
          "Priority",
          "Subtasks",
          "Updated",
          "Status",
        ]}
        rows={visibleRoots.map((t) => {
          const contract = t.contractId ? contractById.get(t.contractId) : null;
          const kids = childrenOf(t.id);
          const done = kids.filter((k) => !taskIsOpen(k)).length;
          return [
            contract?.projectName ?? "",
            contract?.projectNo ?? "",
            t.title,
            t.dueDate ? formatDisplayDate(t.dueDate) : "No deadline",
            isOverdue(t, today) ? "Yes" : "",
            t.department ? departmentDisplayName(t.department) : "",
            formatAssignees(t.assignees),
            TASK_PRIORITY_LABELS[t.priority],
            kids.length === 0 ? "" : `${done}/${kids.length}`,
            formatLastUpdated(t),
            TASK_STATUS_LABELS[t.status],
          ];
        })}
      />
    </HubPage>
  );
}

function NewTaskForm({
  people,
  departments,
  contracts,
  defaultContractId,
  canAssignPeople,
  onCreated,
}: {
  people: AssignablePerson[];
  departments: string[];
  contracts: { id: string; projectNo: string; label: string }[];
  defaultContractId: string;
  canAssignPeople: boolean;
  onCreated: (id: string) => void;
}) {
  const [catalogKey, setCatalogKey] = useState<TaskCatalogKey>("custom");
  const [title, setTitle] = useState("");
  const [contractId, setContractId] = useState(defaultContractId);
  const [department, setDepartment] = useState("none");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [error, setError] = useState<string | null>(null);

  const selectable = peopleForDepartment(people, department);
  const catalog = TASK_CATALOG.find((c) => c.key === catalogKey);
  const isCustom = catalogKey === "custom";

  function onDepartmentChange(next: string) {
    setDepartment(next);
    setAssignees((prev) =>
      prev.filter((name) =>
        peopleForDepartment(people, next).some((p) => p.name === name)
      )
    );
  }

  function toggleAssignee(name: string) {
    setAssignees((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!contractId) {
      setError("Select a contract.");
      return;
    }
    const contract = contracts.find((c) => c.id === contractId);
    let finalTitle = title.trim();
    if (!isCustom) {
      if (catalogKey === "create_abg") {
        finalTitle = `Create ABG — ${contract?.projectNo ?? ""}`;
      } else if (catalogKey === "create_pbg") {
        finalTitle = `Create PBG — ${contract?.projectNo ?? ""}`;
      } else {
        finalTitle = catalog?.title ?? finalTitle;
      }
    }
    if (!finalTitle) {
      setError("Enter a task title.");
      return;
    }
    const created = addManualTask({
      title: finalTitle,
      contractId,
      department: department === "none" ? null : department,
      assignees: canAssignPeople ? assignees : [],
      dueDate: dueDate || null,
      priority,
      catalogKey,
      source: catalog?.system ? "system" : "manual",
    });
    void flushWorkspace();
    onCreated(created.id);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 border border-[var(--fh-line)] bg-white p-5"
    >
      <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
        New task
      </h2>
      {error && (
        <p className="text-sm text-[var(--destructive)]" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Type</Label>
          <select
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={catalogKey}
            onChange={(e) => {
              const key = e.target.value as TaskCatalogKey;
              setCatalogKey(key);
              if (key !== "custom") setTitle("");
            }}
          >
            {TASK_CATALOG.filter((c) =>
              ["custom", "kickoff", "gad", "create_abg", "create_pbg"].includes(
                c.key
              )
            ).map((c) => (
              <option key={c.key} value={c.key}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        {isCustom && (
          <div className="space-y-1 sm:col-span-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing"
              required
            />
          </div>
        )}
        <div className="space-y-1 sm:col-span-2">
          <Label>Contract</Label>
          <select
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Department</Label>
          <select
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={department}
            onChange={(e) => onDepartmentChange(e.target.value)}
          >
            <option value="none">Select later…</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {departmentDisplayName(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Deadline</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          <select
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        {canAssignPeople && department !== "none" && (
          <div className="space-y-1 sm:col-span-2">
            <Label>People (optional — equal owners)</Label>
            <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)]/40 p-2">
              {selectable.length === 0 ? (
                <p className="text-xs text-[var(--fh-muted)]">
                  No users/managers in this department.
                </p>
              ) : (
                selectable.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={assignees.includes(p.name)}
                      onChange={() => toggleAssignee(p.name)}
                    />
                    {p.name}
                  </label>
                ))
              )}
            </div>
          </div>
        )}
        {!canAssignPeople && (
          <p className="text-xs text-[var(--fh-muted)] sm:col-span-2">
            You can assign a department. A manager will assign people if needed.
          </p>
        )}
      </div>
      <Button type="submit" className="bg-[var(--fh-steel)]">
        Create task
      </Button>
    </form>
  );
}

function TaskBlock({
  task,
  contract,
  subtasks,
  overdue,
  people,
  departments,
  canAssignPeople,
  actor,
  expanded,
  dimmed,
  onToggle,
  expandedSubId,
  setExpandedSubId,
}: {
  task: Task;
  contract: { id: string; projectNo: string; projectName: string } | null;
  subtasks: Task[];
  overdue: boolean;
  people: AssignablePerson[];
  departments: string[];
  canAssignPeople: boolean;
  actor: TaskActor;
  expanded: boolean;
  dimmed: boolean;
  onToggle: () => void;
  expandedSubId: string | null;
  setExpandedSubId: (id: string | null) => void;
}) {
  const openSubs = subtasks.filter(taskIsOpen).length;
  const doneSubs = subtasks.length - openSubs;

  return (
    <article
      id={`task-row-${task.id}`}
      className={cn(
        "overflow-hidden border bg-white transition-opacity",
        expanded
          ? "border-[var(--fh-steel)] shadow-sm"
          : overdue
            ? "border-[var(--destructive)]/35"
            : "border-[var(--fh-line)]",
        dimmed && "opacity-45"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "grid w-full gap-2 px-4 py-3.5 text-left sm:gap-3",
          "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_7rem_minmax(0,1fr)_minmax(0,0.9fr)_5.5rem_4.5rem_5.5rem_6.5rem_2.5rem]",
          expanded ? "bg-[var(--fh-steel)] text-white" : "hover:bg-[var(--fh-bg)]/60"
        )}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide task" : "Open task"}
      >
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Project
          </p>
          {contract ? (
            <span
              className="block"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Link
                href={`/contracts/${contract.id}`}
                className={cn(
                  "font-medium underline-offset-2 hover:underline",
                  expanded ? "text-white" : "text-[var(--fh-steel)]"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {contract.projectNo}
              </Link>
              <span
                className={cn(
                  "block truncate text-xs",
                  expanded ? "text-white/75" : "text-[var(--fh-muted)]"
                )}
              >
                {contract.projectName}
              </span>
            </span>
          ) : (
            <span className={expanded ? "text-white/70" : "text-[var(--fh-muted)]"}>
              —
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Task
          </p>
          <p className={cn("font-medium", !expanded && "text-[var(--fh-steel)]")}>
            {task.title}
          </p>
          {task.catalogKey && task.catalogKey !== "custom" && (
            <span
              className={cn(
                "mt-1 inline-block text-[10px] uppercase tracking-wide",
                expanded ? "text-white/70" : "text-[var(--fh-muted)]"
              )}
            >
              Catalog
            </span>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Deadline
          </p>
          <p
            className={cn(
              "tabular-nums text-sm",
              !expanded && overdue && "font-medium text-[var(--destructive)]",
              !expanded && !task.dueDate && "text-[var(--fh-accent)]"
            )}
          >
            {task.dueDate
              ? formatDisplayDate(task.dueDate)
              : "No deadline"}
          </p>
          {overdue && (
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-wide",
                expanded ? "text-[var(--fh-accent)]" : "text-[var(--destructive)]"
              )}
            >
              Overdue
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Department
          </p>
          <p
            className={cn(
              "truncate text-sm",
              expanded ? "text-white/85" : "text-[var(--fh-muted)]"
            )}
          >
            {task.department ? departmentDisplayName(task.department) : "—"}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Person
          </p>
          <p className="truncate text-sm">{formatAssignees(task.assignees)}</p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Priority
          </p>
          {task.priority !== "normal" ? (
            <PriorityPill priority={task.priority} onDark={expanded} />
          ) : (
            <span className={cn("text-sm", expanded ? "text-white/75" : "text-[var(--fh-muted)]")}>
              Normal
            </span>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Subtasks
          </p>
          <p className="tabular-nums text-sm">
            {subtasks.length === 0 ? "—" : `${doneSubs}/${subtasks.length}`}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Updated
          </p>
          <p
            className={cn(
              "text-sm",
              expanded ? "text-white/75" : "text-[var(--fh-muted)]"
            )}
          >
            {formatLastUpdated(task)}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide opacity-70 lg:hidden">
            Status
          </p>
          <StatusPill status={task.status} onDark={expanded} />
        </div>

        <div className="flex items-start justify-end pt-0.5">
          {expanded ? (
            <ChevronDown
              className="size-4 shrink-0 text-[var(--fh-accent)]"
              aria-hidden
            />
          ) : (
            <ChevronRight
              className="size-4 shrink-0 text-[var(--fh-steel)]"
              aria-hidden
            />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t-4 border-[var(--fh-accent)] bg-[var(--fh-bg)]/50 px-4 py-5 sm:px-5">
          <TaskEditor
            task={task}
            subtasks={subtasks}
            people={people}
            departments={departments}
            canAssignPeople={canAssignPeople}
            actor={actor}
            expandedSubId={expandedSubId}
            setExpandedSubId={setExpandedSubId}
            onClose={onToggle}
          />
        </div>
      )}
    </article>
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

function PriorityPill({
  priority,
  onDark,
}: {
  priority: TaskPriority;
  onDark?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
        onDark
          ? "bg-white/15 text-white"
          : priority === "urgent"
            ? "bg-[var(--destructive)]/10 text-[var(--destructive)]"
            : priority === "high"
              ? "bg-[var(--fh-accent)]/20 text-[var(--fh-ink)]"
              : "bg-[var(--fh-bg)] text-[var(--fh-muted)]"
      )}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border border-[var(--fh-line)] bg-white p-4">
      <h3 className="border-b border-[var(--fh-line)] pb-2 font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function TaskEditor({
  task,
  subtasks,
  people,
  departments,
  canAssignPeople,
  actor,
  expandedSubId,
  setExpandedSubId,
  onClose,
}: {
  task: Task;
  subtasks: Task[];
  people: AssignablePerson[];
  departments: string[];
  canAssignPeople: boolean;
  actor: TaskActor;
  expandedSubId: string | null;
  setExpandedSubId: (id: string | null) => void;
  onClose: () => void;
}) {
  const [department, setDepartment] = useState(task.department ?? "none");
  const [assignees, setAssignees] = useState<string[]>(task.assignees);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
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
  const [msg, setMsg] = useState<string | null>(null);
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

  const selectable = peopleForDepartment(people, department);
  const openSubs = subtasks.filter(taskIsOpen);

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
    setAssignees((prev) =>
      prev.filter((name) =>
        peopleForDepartment(people, next).some((p) => p.name === name)
      )
    );
  }

  function toggleAssignee(name: string) {
    setAssignees((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function saveAssignment() {
    assignTask(task.id, {
      department: department === "none" ? null : department,
      assignees: canAssignPeople ? assignees : task.assignees,
      dueDate: dueDate || null,
    });
    updateTask(task.id, { priority });
    void flushWorkspace();
    setMsg("Assignment saved.");
    setErr(null);
  }

  function applyStatusMessage(result: {
    status: TaskStatus;
    sideEffects: boolean;
    alreadyWaiting: boolean;
  }) {
    setStatus(result.status === "not_required" ? "completed" : result.status);
    if (result.status === "awaiting_verification") {
      setMsg(
        result.alreadyWaiting
          ? "Already waiting for the manager."
          : "Waiting for the manager."
      );
      setErr(null);
      return;
    }
    setMsg(result.sideEffects ? "Task completed." : "Status updated.");
    setErr(null);
    if (result.sideEffects) runAfterCompleted();
  }

  function saveStatus() {
    if (status === "completed" && openSubs.length > 0) {
      setClosing(true);
      setErr(null);
      return;
    }
    const result = updateTaskStatus(task.id, status, { notes, actor });
    if (!result) {
      setErr("Task not found.");
      return;
    }
    void flushWorkspace();
    applyStatusMessage(result);
  }

  function confirmVerified() {
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
    void flushWorkspace();
    setStatus("completed");
    setMsg("Task completed.");
    setErr(null);
    runAfterCompleted();
  }

  function confirmCompleteParent() {
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
    void flushWorkspace();
    setClosing(false);
    applyStatusMessage(result);
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

  return (
    <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Hide details
        </Button>
      </div>

      {(err || msg || followUpMsg) && (
        <div className="space-y-1">
          {err && (
            <p className="text-sm text-[var(--destructive)]" role="alert">
              {err}
            </p>
          )}
          {msg && <p className="text-sm text-[var(--fh-ok)]">{msg}</p>}
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

      <Section title="1. Assignment">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Department</Label>
            <select
              className="flex h-9 w-full rounded-lg border border-input bg-white px-2 text-sm"
              value={department}
              onChange={(e) => onDepartmentChange(e.target.value)}
            >
              <option value="none">Select…</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {departmentDisplayName(d)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Deadline</Label>
            <Input
              type="date"
              className="bg-white"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Priority</Label>
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
          </div>
          {canAssignPeople && (
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label className="text-xs">People</Label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)]/40 p-2">
                {department === "none" ? (
                  <p className="text-xs text-[var(--fh-muted)]">
                    Select a department to choose people.
                  </p>
                ) : selectable.length === 0 ? (
                  <p className="text-xs text-[var(--fh-muted)]">
                    No users/managers in this department.
                  </p>
                ) : (
                  selectable.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={assignees.includes(p.name)}
                        onChange={() => toggleAssignee(p.name)}
                      />
                      {p.name}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <Button size="sm" className="bg-[var(--fh-steel)]" onClick={saveAssignment}>
          Save assignment
        </Button>
      </Section>

      <Section title="2. Status & update">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
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
          <p className="text-xs text-[var(--fh-muted)]">
            Latest note: {task.notes}
            {task.notesUpdatedAt ? ` · ${formatLastUpdated(task)}` : ""}
          </p>
        )}
        {task.status === "awaiting_verification" && (
          <p className="text-sm text-[var(--fh-ink)]">{waitingForCopy(task)}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={saveStatus}>
            Save status
          </Button>
          {canConfirmTaskVerification(actor, task) && (
            <Button
              size="sm"
              className="bg-[var(--fh-ok)] text-white"
              onClick={confirmVerified}
            >
              Confirm completion
            </Button>
          )}
        </div>

        {closing && (
          <div className="space-y-3 border border-[var(--fh-accent)] bg-[var(--fh-accent)]/10 p-3">
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
                className="bg-[var(--fh-ok)] text-white"
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
      </Section>

      <Section title="3. Subtasks (checklist)">
        <ul className="space-y-2">
          {subtasks.length === 0 ? (
            <li className="text-sm text-[var(--fh-muted)]">No subtasks yet.</li>
          ) : (
            subtasks.map((s) => (
              <li
                key={s.id}
                className="border border-[var(--fh-line)] bg-[var(--fh-bg)]/30 px-3 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="font-medium text-[var(--fh-steel)]">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--fh-muted)]">
                      {[
                        s.department
                          ? departmentDisplayName(s.department)
                          : null,
                        formatAssignees(s.assignees),
                        s.dueDate
                          ? formatDisplayDate(s.dueDate)
                          : "No deadline",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={s.status} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setExpandedSubId(expandedSubId === s.id ? null : s.id)
                      }
                    >
                      {expandedSubId === s.id ? "Hide" : "Update"}
                    </Button>
                  </div>
                </div>
                {expandedSubId === s.id && (
                  <div className="mt-3 border-t border-[var(--fh-line)] pt-3">
                    <SubtaskEditor
                      task={s}
                      people={people}
                      departments={departments}
                      canAssignPeople={canAssignPeople}
                      actor={actor}
                      onDone={() => setExpandedSubId(null)}
                    />
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--fh-line)] pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Add subtask</Label>
            <Input
              className="h-9 w-56 bg-white"
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              placeholder="Checklist item"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Department</Label>
            <select
              className="flex h-9 rounded-lg border border-input bg-white px-2 text-sm"
              value={subDept}
              onChange={(e) => setSubDept(e.target.value)}
            >
              <option value="none">Later…</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {departmentDisplayName(d)}
                </option>
              ))}
            </select>
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!subTitle.trim() || !task.contractId) return;
              addSubtask(task.id, {
                title: subTitle,
                department: subDept === "none" ? null : subDept,
                dueDate: subDue || null,
              });
              void flushWorkspace();
              setSubTitle("");
              setSubDue("");
              setSubDept("none");
            }}
          >
            Add
          </Button>
        </div>
      </Section>
    </div>
  );
}

function SubtaskEditor({
  task,
  people,
  departments,
  canAssignPeople,
  actor,
  onDone,
}: {
  task: Task;
  people: AssignablePerson[];
  departments: string[];
  canAssignPeople: boolean;
  actor: TaskActor;
  onDone: () => void;
}) {
  const [department, setDepartment] = useState(task.department ?? "none");
  const [assignees, setAssignees] = useState<string[]>(task.assignees);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [reason, setReason] = useState(task.notRequiredReason ?? "");
  const [err, setErr] = useState<string | null>(null);

  const selectable = peopleForDepartment(people, department);

  return (
    <div className="mt-2 w-full space-y-2 border-t border-[var(--fh-line)] pt-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          className="flex h-9 rounded-lg border border-input bg-white px-2 text-sm"
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setAssignees([]);
          }}
        >
          <option value="none">Department…</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {departmentDisplayName(d)}
            </option>
          ))}
        </select>
        <Input
          type="date"
          className="h-9 bg-white"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
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
      {canAssignPeople && department !== "none" && (
        <div className="flex flex-wrap gap-2">
          {selectable.map((p) => (
            <label key={p.id} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={assignees.includes(p.name)}
                onChange={() =>
                  setAssignees((prev) =>
                    prev.includes(p.name)
                      ? prev.filter((n) => n !== p.name)
                      : [...prev, p.name]
                  )
                }
              />
              {p.name}
            </label>
          ))}
        </div>
      )}
      <Input
        placeholder="Update note (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {err && <p className="text-xs text-[var(--destructive)]">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-[var(--fh-steel)]"
          onClick={() => {
            if (status === "not_required" && !reason.trim()) {
              setErr("Reason is required for not required.");
              return;
            }
            assignTask(task.id, {
              department: department === "none" ? null : department,
              assignees: canAssignPeople ? assignees : task.assignees,
              dueDate: dueDate || null,
            });
            updateTaskStatus(task.id, status, {
              notes,
              notRequiredReason: reason,
              actor,
            });
            void flushWorkspace();
            onDone();
          }}
        >
          Save subtask
        </Button>
        {canConfirmTaskVerification(actor, task) && (
          <Button
            size="sm"
            className="bg-[var(--fh-ok)] text-white"
            onClick={() => {
              const result = confirmTaskVerification(task.id, actor);
              if (!result.ok) {
                setErr(result.error);
                return;
              }
              void flushWorkspace();
              onDone();
            }}
          >
            Confirm completion
          </Button>
        )}
      </div>
    </div>
  );
}
