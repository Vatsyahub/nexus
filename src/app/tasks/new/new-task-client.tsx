"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addManualTask, flushWorkspace, listDepartments, useFlowhubData } from "@/lib/store";
import {
  TASK_CATALOG,
  TASK_PRIORITY_LABELS,
  departmentDisplayName,
  type TaskCatalogKey,
  type TaskPriority,
} from "@/lib/types";
import type { ClearanceRole } from "@/lib/clearance";
import type { AssignablePerson } from "../tasks-client";
import { ContractTypeahead } from "@/components/contract-typeahead";
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
  if (department === "none" || !department) return people;
  return people.filter((p) => p.department === department);
}

export function NewTaskClient({
  people,
  role,
  defaultContractId,
}: {
  people: AssignablePerson[];
  role: ClearanceRole;
  defaultContractId: string;
}) {
  const data = useFlowhubData();
  const router = useRouter();
  const departments = useMemo(() => listDepartments(data), [data]);
  const assignPeople = canAssignPeople(role);
  const contracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );
  const listHref = defaultContractId
    ? `/tasks?contractId=${encodeURIComponent(defaultContractId)}`
    : "/tasks";

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
    addManualTask({
      title: finalTitle,
      contractId,
      department: department === "none" ? null : department,
      assignees: assignPeople ? assignees : [],
      dueDate: dueDate || null,
      priority,
      catalogKey,
      source: catalog?.system ? "system" : "manual",
    });
    void flushWorkspace();
    router.push(listHref);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Add New Task
        </h1>
        <Link
          href={listHref}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to tasks
        </Link>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 border border-[var(--fh-line)] bg-white p-5"
      >
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
          <div className="sm:col-span-2">
            <ContractTypeahead
              contracts={contracts}
              value={contractId}
              onChange={setContractId}
              placeholder="Type contract no. or name…"
            />
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
          {assignPeople && department !== "none" && (
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
          {!assignPeople && (
            <p className="text-xs text-[var(--fh-muted)] sm:col-span-2">
              You can assign a department. A manager will assign people if needed.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="bg-[var(--fh-steel)]">
            Create task
          </Button>
          <Link
            href={listHref}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
