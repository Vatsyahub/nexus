"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  applyCascadeProposals,
  clearScheduleChangeLog,
  flushWorkspace,
  scheduleIsOverdue,
  scheduleSortDate,
  useFlowhubData,
  type CascadeProposal,
} from "@/lib/store";
import {
  SCHEDULE_KIND_LABELS,
  SCHEDULE_NEAR_DAYS,
  isScheduleDateNa,
  type ScheduleLine,
} from "@/lib/types";
import { confirmAction } from "@/components/confirm-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ListSearchBar } from "@/components/list-search";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { ScheduleContractView } from "@/app/schedules/schedule-contract-view";
import { buttonVariants } from "@/components/ui/button";
import {
  matchesToken,
  parseSearchTokens,
  scheduleMatchesQuery,
} from "@/lib/list-search";
import {
  dateSearchForms,
  formatDisplayDate,
  formatDisplayDateTime,
  formatScheduleDateRange,
} from "@/lib/dates";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { contractStatusLabel } from "@/lib/nexus-core";
import { cn } from "@/lib/utils";

type Tab = "all" | "near" | "overdue" | "view" | "changelog";

function todayIso() {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isNear(date: string, today: string) {
  if (!date || isScheduleDateNa(date) || date < today) return false;
  return date <= addDaysIso(today, SCHEDULE_NEAR_DAYS);
}

function scheduleIsNear(
  s: { done: boolean; startDate: string; endDate: string },
  today: string
): boolean {
  if (s.done) return false;
  return isNear(s.startDate, today) || isNear(s.endDate, today);
}

function scheduleStatusLabel(s: ScheduleLine, today: string) {
  if (s.done) return s.doneAt ? `Done · ${formatDisplayDate(s.doneAt)}` : "Done";
  if (scheduleIsOverdue(s, today)) return "Overdue";
  if (isScheduleDateNa(s.startDate)) return "NA";
  if (scheduleIsNear(s, today)) return "Near";
  return "Planned";
}

export default function SchedulesClient({
  canEdit,
  isMaster,
  actorName,
}: {
  canEdit: boolean;
  isMaster: boolean;
  actorName: string;
}) {
  const data = useFlowhubData();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [committedFilter, setCommittedFilter] = useState<
    "all" | "committed" | "uncommitted"
  >("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [cascade, setCascade] = useState<CascadeProposal[] | null>(null);
  const [cascadeContractId, setCascadeContractId] = useState<string | null>(
    null
  );
  const [viewContractId, setViewContractId] = useState("");

  const today = todayIso();

  const viewContracts = useMemo(() => {
    return [...data.contracts]
      .filter((c) => data.schedules.some((s) => s.contractId === c.id))
      .sort((a, b) => a.projectNo.localeCompare(b.projectNo));
  }, [data.contracts, data.schedules]);

  const listed = useMemo(() => {
    return data.schedules
      .filter((s) => {
        const c = data.contracts.find((x) => x.id === s.contractId);
        const item = s.boqItemId
          ? c?.boq.find((b) => b.id === s.boqItemId)
          : null;
        if (!scheduleMatchesQuery(s, c, item?.name, q)) return false;
        if (committedFilter === "committed" && !s.committed) return false;
        if (committedFilter === "uncommitted" && s.committed) return false;
        if (fromDate || toDate) {
          if (isScheduleDateNa(s.startDate) || !s.startDate) return false;
          if (fromDate && s.startDate < fromDate) return false;
          if (toDate && s.startDate > toDate) return false;
        }
        if (tab === "near") return scheduleIsNear(s, today);
        if (tab === "overdue") return scheduleIsOverdue(s, today);
        return true;
      })
      .slice()
      .sort((a, b) => {
        const da = scheduleSortDate(a);
        const db = scheduleSortDate(b);
        return da.localeCompare(db) || a.createdAt.localeCompare(b.createdAt);
      });
  }, [
    data.schedules,
    data.contracts,
    q,
    committedFilter,
    fromDate,
    toDate,
    tab,
    today,
  ]);

  const nearCount = useMemo(
    () => data.schedules.filter((s) => scheduleIsNear(s, today)).length,
    [data.schedules, today]
  );

  const overdueCount = useMemo(
    () => data.schedules.filter((s) => scheduleIsOverdue(s, today)).length,
    [data.schedules, today]
  );

  const changelog = useMemo(() => {
    const tokens = parseSearchTokens(q);
    return [...(data.scheduleChangeLog ?? [])]
      .filter((e) => {
        if (!tokens.length) return true;
        const c = e.contractId
          ? data.contracts.find((x) => x.id === e.contractId)
          : null;
        return tokens.every((token) => {
          const t = token.toLowerCase();
          if (c && matchesToken(t, [
            c.projectNo,
            c.projectName,
            c.city,
            c.state,
            c.orderNos,
            contractStatusLabel(c.status),
          ])) {
            return true;
          }
          return matchesToken(t, [
            e.by,
            e.summary,
            ...dateSearchForms(e.at),
            formatDisplayDateTime(e.at),
          ]);
        });
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [data.scheduleChangeLog, data.contracts, q]);

  async function onClearChangeLog() {
    if (!isMaster) return;
    const ok = await confirmAction({
      message:
        "This removes every change-log row and cannot be undone.",
      action: "Clear",
    });
    if (!ok) return;
    clearScheduleChangeLog();
    await flushWorkspace();
  }

  async function confirmCascade() {
    if (!cascade?.length) return;
    const result = applyCascadeProposals(cascade, {
      by: actorName,
      contractId: cascadeContractId,
    });
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    await flushWorkspace();
    setCascade(null);
    setCascadeContractId(null);
    setMsg("Cascade confirmed.");
  }

  const tabs: {
    id: Exclude<Tab, "changelog">;
    label: string;
    count?: number;
  }[] = [
    { id: "all", label: "All", count: data.schedules.length },
    { id: "near", label: "Near", count: nearCount },
    { id: "overdue", label: "Overdue", count: overdueCount },
    { id: "view", label: "View" },
  ];

  return (
    <HubPage>
      <header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Schedules
          </h1>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link
                href="/schedules/new"
                className={cn(
                  buttonVariants({
                    className:
                      "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]",
                  })
                )}
              >
                Add schedule
              </Link>
            )}
            <Button
              type="button"
              variant={tab === "changelog" ? "default" : "outline"}
              className={
                tab === "changelog"
                  ? "bg-[var(--fh-steel)] text-white hover:bg-[#244a5e]"
                  : undefined
              }
              onClick={() =>
                setTab((t) => (t === "changelog" ? "all" : "changelog"))
              }
            >
              Change log
              <span className="ml-1.5 tabular-nums opacity-80">
                {changelog.length}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {tab !== "changelog" && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Schedule views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === t.id
                  ? "bg-[var(--fh-steel)] text-white"
                  : "bg-white text-[var(--fh-steel)] ring-1 ring-[var(--fh-line)] hover:bg-[var(--fh-bg)]"
              )}
            >
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    "ml-1.5 tabular-nums",
                    tab === t.id ? "text-white/80" : "text-[var(--fh-muted)]"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      )}

      {tab !== "view" && (
        <ListSearchBar
          value={q}
          onChange={setQ}
          placeholder={
            tab === "changelog"
              ? "Search contract, who, change, date…"
              : "Search project, city, item, type, date…"
          }
        />
      )}

      {msg && (
        <p className="rounded-md border border-[var(--fh-line)] bg-white px-3 py-2 text-sm">
          {msg}
        </p>
      )}

      {!canEdit && tab !== "view" && (
        <p className="text-sm text-[var(--fh-muted)]">
          View only — this login cannot change schedules.
        </p>
      )}

      {tab === "view" && (
        <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="max-w-xl shrink-0 space-y-2 rounded-xl border border-[var(--fh-line)] bg-white p-4">
            <p className="text-sm text-[var(--fh-muted)]">
              Select a contract to see its full schedule — item, supply dates,
              and installation dates.
            </p>
            <ContractTypeahead
              contracts={viewContracts}
              value={viewContractId}
              onChange={setViewContractId}
              placeholder="Type contract no. or name…"
              emptyMessage="No matching contracts with a schedule."
            />
            {viewContracts.length === 0 && (
              <p className="text-xs text-[var(--fh-muted)]">
                No schedules yet. Use Add schedule first.
              </p>
            )}
          </div>
          {viewContractId ? (
            <HubDataScroll>
              <ScheduleContractView
                contractId={viewContractId}
                canEdit={canEdit}
                embedded
              />
            </HubDataScroll>
          ) : null}
        </section>
      )}

      {tab !== "changelog" && tab !== "view" && (
        <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--fh-muted)]">Commitment</span>
              <select
                value={committedFilter}
                onChange={(e) =>
                  setCommittedFilter(e.target.value as typeof committedFilter)
                }
                className="rounded-md border border-[var(--fh-line)] bg-white px-3 py-2 text-[var(--fh-ink)]"
              >
                <option value="all">All</option>
                <option value="committed">Committed</option>
                <option value="uncommitted">Uncommitted</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--fh-muted)]">From date</span>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--fh-muted)]">To date</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-white"
              />
            </label>
          </div>
          <p className="text-xs text-[var(--fh-muted)]">
            {listed.length} line{listed.length === 1 ? "" : "s"}
          </p>
        </section>
      )}

      {tab === "changelog" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <p className="text-xs text-[var(--fh-muted)]">
              {changelog.length} change{changelog.length === 1 ? "" : "s"}
            </p>
            {isMaster ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onClearChangeLog()}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <HubDataScroll className="overflow-x-auto rounded-xl border border-[var(--fh-line)] bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Who</th>
                  <th className="px-3 py-2 font-medium">Contract</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {changelog.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-[var(--fh-muted)]"
                    >
                      {q.trim()
                        ? "No changes match your search."
                        : "No schedule changes yet."}
                    </td>
                  </tr>
                ) : (
                  changelog.map((e) => {
                    const c = e.contractId
                      ? data.contracts.find((x) => x.id === e.contractId)
                      : null;
                    return (
                      <tr key={e.id}>
                        <td className="px-3 py-2 tabular-nums text-xs text-[var(--fh-muted)]">
                          {formatDisplayDateTime(e.at)}
                        </td>
                        <td className="px-3 py-2">{e.by}</td>
                        <td className="px-3 py-2">{c?.projectNo ?? "—"}</td>
                        <td className="px-3 py-2">{e.summary}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </HubDataScroll>
          <ReportExportIcons
            filename="schedules-change-log"
            title="Schedules — Change log"
            filters={reportFilterSummary({ tab: "Change log", search: q })}
            headers={["When", "Who", "Project no.", "Project", "Change"]}
            rows={changelog.map((e) => {
              const c = e.contractId
                ? data.contracts.find((x) => x.id === e.contractId)
                : null;
              return [
                formatDisplayDateTime(e.at),
                e.by,
                c?.projectNo ?? "",
                c?.projectName ?? "",
                e.summary,
              ];
            })}
          />
        </div>
      ) : tab === "view" ? null : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <HubDataScroll className="overflow-x-auto rounded-xl border border-[var(--fh-line)] bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 font-medium">City</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Commitment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {listed.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-[var(--fh-muted)]"
                    >
                      {tab === "overdue"
                        ? "No overdue schedule lines."
                        : tab === "near"
                          ? "No near schedule lines."
                          : "No schedule lines yet. Use Add schedule."}
                    </td>
                  </tr>
                ) : (
                  listed.map((s) => {
                    const c = data.contracts.find((x) => x.id === s.contractId);
                    const item = s.boqItemId
                      ? c?.boq.find((b) => b.id === s.boqItemId)
                      : null;
                    const dateLabel = formatScheduleDateRange(
                      s.startDate,
                      s.endDate
                    );
                    const near = scheduleIsNear(s, today);
                    const overdue = scheduleIsOverdue(s, today);
                    const na = isScheduleDateNa(s.startDate);
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          "cursor-pointer",
                          overdue
                            ? "bg-red-100/90 hover:bg-red-100"
                            : near
                              ? "bg-[var(--fh-accent)]/15 hover:bg-[var(--fh-accent)]/25"
                              : "hover:bg-[var(--fh-bg)]/80"
                        )}
                        onClick={() => router.push(`/schedules/${s.id}`)}
                      >
                        <td className="px-3 py-2">
                          {c ? (
                            <Link
                              href={`/schedules/plan/${c.id}?mode=view`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-[var(--fh-steel)] hover:underline"
                            >
                              {c.projectName}
                              <span className="mt-0.5 block text-xs tabular-nums text-[var(--fh-muted)]">
                                {c.projectNo}
                              </span>
                            </Link>
                          ) : (
                            <span className="font-medium text-[var(--fh-steel)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--fh-muted)]">
                          {c?.city || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {SCHEDULE_KIND_LABELS[s.kind]}
                        </td>
                        <td className="px-3 py-2">
                          {item ? item.name : SCHEDULE_KIND_LABELS[s.kind]}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.quantity != null
                            ? `${s.quantity}${item ? ` ${item.unit}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {dateLabel}
                          {near && (
                            <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[var(--fh-steel)]">
                              Within {SCHEDULE_NEAR_DAYS} days
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {s.done ? (
                            <Badge className="bg-[var(--fh-ok)]/15 text-[var(--fh-ok)]">
                              Done
                              {s.doneAt
                                ? ` · ${formatDisplayDate(s.doneAt)}`
                                : ""}
                            </Badge>
                          ) : overdue ? (
                            <Badge variant="destructive">Overdue</Badge>
                          ) : na ? (
                            <Badge variant="secondary">NA</Badge>
                          ) : near ? (
                            <Badge className="bg-[var(--fh-accent)]/25 text-[var(--fh-ink)]">
                              Near
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Planned</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--fh-muted)]">
                          {s.committed ? "Committed" : "Uncommitted"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </HubDataScroll>
          <ReportExportIcons
            filename="schedules"
            title="Schedules"
            filters={reportFilterSummary({
              tab: tabs.find((t) => t.id === tab)?.label ?? null,
              search: q,
              dateFrom: fromDate,
              dateTo: toDate,
              dateLabel: "Start date",
              extra: [
                [
                  "Commitment",
                  committedFilter === "all"
                    ? ""
                    : committedFilter === "committed"
                      ? "Committed"
                      : "Uncommitted",
                ],
              ],
            })}
            headers={[
              "Project",
              "Project no.",
              "City",
              "Type",
              "Item",
              "Qty",
              "Unit",
              "Date",
              "Status",
              "Commitment",
            ]}
            rows={listed.map((s) => {
              const c = data.contracts.find((x) => x.id === s.contractId);
              const item = s.boqItemId
                ? c?.boq.find((b) => b.id === s.boqItemId)
                : null;
              return [
                c?.projectName ?? "",
                c?.projectNo ?? "",
                c?.city ?? "",
                SCHEDULE_KIND_LABELS[s.kind],
                item ? item.name : SCHEDULE_KIND_LABELS[s.kind],
                s.quantity ?? null,
                item?.unit ?? "",
                formatScheduleDateRange(s.startDate, s.endDate),
                scheduleStatusLabel(s, today),
                s.committed ? "Committed" : "Uncommitted",
              ];
            })}
          />
        </div>
      )}

      {cascade && cascade.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--fh-line)] bg-white p-5 shadow-lg"
          >
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
              Confirm cascaded dates
            </h2>
            <ul className="mt-4 space-y-3">
              {cascade.map((p, i) => (
                <li
                  key={p.scheduleId}
                  className="rounded-lg border border-[var(--fh-line)] p-3 text-sm"
                >
                  <p className="font-medium text-[var(--fh-steel)]">{p.label}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Start</Label>
                      <Input
                        type="date"
                        value={
                          isScheduleDateNa(p.startDate) ? "" : p.startDate
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setCascade((prev) =>
                            prev
                              ? prev.map((row, j) =>
                                  j === i ? { ...row, startDate: v } : row
                                )
                              : prev
                          );
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End</Label>
                      <Input
                        type="date"
                        value={isScheduleDateNa(p.endDate) ? "" : p.endDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCascade((prev) =>
                            prev
                              ? prev.map((row, j) =>
                                  j === i ? { ...row, endDate: v } : row
                                )
                              : prev
                          );
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                className="bg-[var(--fh-steel)]"
                onClick={() => void confirmCascade()}
              >
                Confirm cascade
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCascade(null);
                  setCascadeContractId(null);
                }}
              >
                Skip cascade
              </Button>
            </div>
          </div>
        </div>
      )}
    </HubPage>
  );
}
