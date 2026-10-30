"use client";

import Link from "next/link";
import { useViewQuery } from "@/lib/use-view-query";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { HubPage } from "@/components/hub-scroll";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExpensesClient } from "@/app/expenses/expenses-client";
import { SegmentButton } from "@/app/reports/execution/execution-ui";
import { DispatchList } from "./dispatch-list";
import { InstallationsList } from "./installations-list";

type Tab = "dispatch" | "installations" | "expenses";

const TABS: { id: Tab; label: string }[] = [
  { id: "dispatch", label: "Dispatch" },
  { id: "installations", label: "Installations" },
  { id: "expenses", label: "Expenses" },
];

function parseTab(raw: string): Tab {
  return TABS.some((tab) => tab.id === raw) ? (raw as Tab) : "dispatch";
}

export function OperationsClient({
  canAdd,
  canEdit,
  canDelete,
  canViewHistory,
  actorName,
}: {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewHistory: boolean;
  actorName: string;
}) {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { get, commit } = useViewQuery();
  const tab = parseTab(get("tab"));

  function selectTab(next: Tab) {
    commit({
      tab: next === "dispatch" ? null : next,
      q: null,
      deleted: null,
      from: null,
      to: null,
    });
  }

  return (
    <HubPage>
      <header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Operations
        </h1>
        {canEdit && tab === "dispatch" && (
          <Link
            href="/operations/dispatch/new"
            className={cn(
              buttonVariants(),
              "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
            )}
          >
            Add DC
          </Link>
        )}
        {canEdit && tab === "installations" && (
          <Link
            href="/operations/installations/new"
            className={cn(
              buttonVariants(),
              "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
            )}
          >
            Update installations
          </Link>
        )}
        {canAdd && tab === "expenses" && (
          <Link
            href="/expenses/new"
            className={cn(
              buttonVariants(),
              "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
            )}
          >
            Add expense
          </Link>
        )}
      </header>

      <div
        role="tablist"
        aria-label="Operations"
        className="flex shrink-0 flex-wrap gap-1 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-1"
      >
        {TABS.map((item) => (
          <SegmentButton
            key={item.id}
            active={tab === item.id}
            onClick={() => selectTab(item.id)}
            label={item.label}
          />
        ))}
      </div>

      {!ready ? (
        <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
          Loading workspace from server…
        </p>
      ) : (
        <>
          {!canEdit && tab !== "expenses" && (
            <p className="shrink-0 text-sm text-[var(--fh-muted)]">
              View only — this login cannot save.
            </p>
          )}
          {tab === "dispatch" && <DispatchList data={data} />}
          {tab === "installations" && <InstallationsList data={data} />}
          {tab === "expenses" && (
            <ExpensesClient
              embedded
              canAdd={canAdd}
              canEdit={canEdit}
              canDelete={canDelete}
              canViewHistory={canViewHistory}
              actorName={actorName}
            />
          )}
        </>
      )}
    </HubPage>
  );
}
