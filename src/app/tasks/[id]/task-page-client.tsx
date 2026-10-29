"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HubReturnLink } from "@/components/hub-return-link";
import { buttonVariants } from "@/components/ui/button";
import { listDepartments, useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { safeTaskListReturn } from "@/lib/task-list";
import { useViewQuery } from "@/lib/use-view-query";
import type { ClearanceRole } from "@/lib/clearance";
import { cn } from "@/lib/utils";
import { TaskEditor, type AssignablePerson } from "../tasks-client";

export function TaskPageClient(props: {
  taskId: string;
  people: AssignablePerson[];
  role: ClearanceRole;
  currentUserName: string;
  currentUserDepartment: string | null;
  currentUserSecondDepartment: string | null;
  canDeleteTasks: boolean;
  canEditTasks: boolean;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--fh-muted)]">Loading task…</p>}>
      <TaskPageInner {...props} />
    </Suspense>
  );
}

function TaskPageInner({
  taskId,
  people,
  role,
  currentUserName,
  currentUserDepartment,
  currentUserSecondDepartment,
  canDeleteTasks,
  canEditTasks,
}: {
  taskId: string;
  people: AssignablePerson[];
  role: ClearanceRole;
  currentUserName: string;
  currentUserDepartment: string | null;
  currentUserSecondDepartment: string | null;
  canDeleteTasks: boolean;
  canEditTasks: boolean;
}) {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const router = useRouter();
  const { get } = useViewQuery();
  const backHref = safeTaskListReturn(get("from"));
  const subParam = get("sub");
  const [openSubId, setOpenSubId] = useState<string | null>(subParam || null);

  const task = data.tasks.find((row) => row.id === taskId && !row.deletedAt);
  const departments = useMemo(() => listDepartments(data), [data]);
  const subtasks = useMemo(
    () =>
      data.tasks.filter(
        (row) => row.parentId === taskId && !row.deletedAt
      ),
    [data.tasks, taskId]
  );
  const contract = task?.contractId
    ? data.contracts.find((row) => row.id === task.contractId)
    : null;

  useEffect(() => {
    if (!task?.parentId) return;
    router.replace(
      `/tasks/${task.parentId}?sub=${encodeURIComponent(task.id)}`
    );
  }, [task, router]);

  useEffect(() => {
    if (subParam) setOpenSubId(subParam);
  }, [subParam]);

  if (!ready || task?.parentId) {
    return <p className="text-sm text-[var(--fh-muted)]">Loading task…</p>;
  }
  if (!task) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Task not found.</p>
        <HubReturnLink href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
          Back
        </HubReturnLink>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            Task name
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--fh-steel)]">
            {task.title}
          </h1>
          {contract ? (
            <Link
              href={`/contracts/${contract.id}`}
              className="mt-1 block text-sm text-[var(--fh-steel)] underline-offset-2 hover:underline"
            >
              {contract.projectName}
              <span className="text-[var(--fh-muted)]"> · {contract.projectNo}</span>
            </Link>
          ) : null}
        </div>
        <HubReturnLink
          href={backHref}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back
        </HubReturnLink>
      </div>
      <TaskEditor
        task={task}
        subtasks={subtasks}
        people={people}
        departments={departments}
        canAssignPeople={role === "manager" || role === "director" || role === "master"}
        canDeleteTasks={canDeleteTasks}
        canEditTasks={canEditTasks}
        actor={{
          name: currentUserName,
          clearance: role,
          department: currentUserDepartment,
          secondDepartment: currentUserSecondDepartment,
        }}
        expandedSubId={openSubId}
        setExpandedSubId={setOpenSubId}
        onClose={() => router.push(backHref)}
      />
    </div>
  );
}
