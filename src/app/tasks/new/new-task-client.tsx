"use client";

import { useMemo, useState, type FormEvent } from "react";
import { HubReturnLink } from "@/components/hub-return-link";
import { useRouter } from "next/navigation";
import { addManualTask, flushWorkspace, listDepartments, useFlowhubData } from "@/lib/store";
import {
  TASK_PRIORITY_LABELS,
  departmentDisplayName,
  type TaskPriority,
} from "@/lib/types";
import type { ClearanceRole } from "@/lib/clearance";
import { safeTaskListReturn } from "@/lib/task-list";
import {
  canEditTaskSchedule,
  peopleNamedInDepartment,
  taskDepartmentControl,
} from "@/lib/task-permissions";
import { samePerson } from "@/lib/task-responsible";
import { PeoplePicker, type AssignablePerson } from "../tasks-client";
import { ADD_CONTRACT_MATCH_LIMIT } from "@/lib/add-contract-matches";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function canAssignPeople(role: ClearanceRole) {
  return role === "manager" || role === "director" || role === "master";
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

export function NewTaskClient({
  people,
  role,
  defaultContractId,
  canEditTasks,
  returnTo,
}: {
  people: AssignablePerson[];
  role: ClearanceRole;
  defaultContractId: string;
  canEditTasks: boolean;
  returnTo: string;
}) {
  const data = useFlowhubData();
  const router = useRouter();
  const departments = useMemo(() => listDepartments(data), [data]);
  const assignPeople = canAssignPeople(role);
  const maySetPriority = canEditTaskSchedule(
    { name: "", clearance: role, department: null },
    { department: null, assignees: [] }
  );
  const departmentControl = taskDepartmentControl(
    { name: "", clearance: role, department: null },
    { parentId: null, department: null, assignees: [] },
    departments,
    canEditTasks
  );
  const contracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );
  const listHref = returnTo
    ? safeTaskListReturn(returnTo)
    : defaultContractId
      ? `/tasks?contractId=${encodeURIComponent(defaultContractId)}`
      : "/tasks";

  const [title, setTitle] = useState("");
  const [contractId, setContractId] = useState(defaultContractId);
  const [department, setDepartment] = useState("none");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [error, setError] = useState<string | null>(null);

  const selectable = peopleForDepartment(people, department);

  function onDepartmentChange(next: string) {
    setDepartment(next);
    const allowed = peopleForDepartment(people, next);
    setAssignees((prev) =>
      prev.filter((name) =>
        allowed.some((person) => samePerson(person.name, name))
      )
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!contractId) {
      setError("Select a contract.");
      return;
    }
    const finalTitle = title.trim();
    if (!finalTitle) {
      setError("Enter a task name.");
      return;
    }
    const chosen =
      departmentControl.kind === "choose" &&
      department !== "none" &&
      departmentControl.options.includes(department)
        ? department
        : null;
    const named = assignPeople
      ? assignees.filter((name) =>
          selectable.some((person) => samePerson(person.name, name))
        )
      : [];
    addManualTask({
      title: finalTitle,
      contractId,
      department: chosen,
      assignees: named,
      dueDate: dueDate || null,
      priority: maySetPriority ? priority : "normal",
      catalogKey: "custom",
      source: "manual",
    }, { actor: { name: "", clearance: role, department: null } });
    void flushWorkspace();
    router.push(listHref);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Add New Task
        </h1>
        <HubReturnLink
          href={listHref}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to tasks
        </HubReturnLink>
      </div>

      <form
        onSubmit={submit}
        {...entryRootProps}
        className="space-y-4 border border-[var(--fh-line)] bg-white p-5"
      >
        {error && (
          <p className="text-sm text-[var(--destructive)]" role="alert">
            {error}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Task name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <ContractTypeahead
              contracts={contracts}
              value={contractId}
              onChange={setContractId}
              placeholder="Type project number or name…"
              maxMatches={ADD_CONTRACT_MATCH_LIMIT}
            />
          </div>
          <div className="space-y-1">
            <Label>Department</Label>
            {departmentControl.kind === "choose" ? (
              <select
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                value={department}
                onChange={(e) => onDepartmentChange(e.target.value)}
              >
                <option value="none">Select later…</option>
                {departmentControl.options.map((d) => (
                  <option key={d} value={d}>
                    {departmentDisplayName(d)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="flex h-9 items-center text-sm text-[var(--fh-muted)]">
                —
              </p>
            )}
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
            {maySetPriority ? (
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
            ) : (
              <p className="flex h-9 items-center text-sm text-[var(--fh-muted)]">
                {TASK_PRIORITY_LABELS.normal}
              </p>
            )}
          </div>
          {assignPeople && department !== "none" && (
            <div className="space-y-1 sm:col-span-2">
              <Label>People</Label>
              <PeoplePicker
                people={selectable}
                assignees={assignees}
                onChange={setAssignees}
              />
            </div>
          )}
          {!assignPeople && (
            <p className="text-xs text-[var(--fh-muted)] sm:col-span-2">
              You can assign a department. A manager will assign people if needed.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" {...entrySaveProps} className="bg-[var(--fh-steel)]">
            Create task
          </Button>
          <HubReturnLink
            href={listHref}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Cancel
          </HubReturnLink>
        </div>
      </form>
    </div>
  );
}
