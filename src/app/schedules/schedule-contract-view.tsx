"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useFlowhubData } from "@/lib/store";
import {
  SCHEDULE_KIND_LABELS,
  isScheduleDateNa,
  type ScheduleLine,
} from "@/lib/types";
import { formatDisplayDate } from "@/lib/dates";
import { buttonVariants } from "@/components/ui/button";
import { EditIconLink } from "@/components/icon-actions";
import {
  ReportExportIcons,
  reportFilterSummary,
  type ReportExportSection,
} from "@/components/report-export-icons";
import { cn } from "@/lib/utils";

function dateLabel(value: string | null | undefined): string {
  if (value == null || !String(value).trim()) return "—";
  if (isScheduleDateNa(value)) return "NA";
  return formatDisplayDate(value);
}

function hasDate(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

/** Sort key: real dates ascending, NA / empty last. */
function supplySortKey(startDate: string): string {
  if (!hasDate(startDate)) return "9999-99-99";
  if (isScheduleDateNa(startDate)) return "9999-99-98";
  return startDate.slice(0, 10);
}

function sortWindows(lines: ScheduleLine[]): ScheduleLine[] {
  return [...lines].sort((a, b) => {
    const ka = supplySortKey(a.startDate);
    const kb = supplySortKey(b.startDate);
    return ka.localeCompare(kb) || a.id.localeCompare(b.id);
  });
}

type ViewRow = {
  key: string;
  itemName: string;
  unit: string;
  boqQty: number;
  supply: ScheduleLine;
  installation: ScheduleLine | null;
};

export function ScheduleContractView({
  contractId,
  canEdit,
  embedded = false,
}: {
  contractId: string;
  canEdit: boolean;
  /** When true, hide page chrome (used inside Schedules → View tab). */
  embedded?: boolean;
}) {
  const data = useFlowhubData();
  const contract = data.contracts.find((c) => c.id === contractId) ?? null;

  const lines = useMemo(
    () => data.schedules.filter((s) => s.contractId === contractId),
    [data.schedules, contractId]
  );

  const rows = useMemo((): ViewRow[] => {
    if (!contract) return [];
    const out: ViewRow[] = [];
    for (const b of contract.boq) {
      const supplies = sortWindows(
        lines.filter(
          (s) =>
            s.kind === "supply" &&
            s.boqItemId === b.id &&
            hasDate(s.startDate)
        )
      );
      const installations = sortWindows(
        lines.filter(
          (s) =>
            s.kind === "installation" &&
            s.boqItemId === b.id &&
            hasDate(s.startDate)
        )
      );
      supplies.forEach((supply, idx) => {
        out.push({
          key: supply.id,
          itemName: b.name,
          unit: b.unit,
          boqQty: b.quantity,
          supply,
          installation: installations[idx] ?? null,
        });
      });
    }
    return out.sort((a, b) => {
      const ka = supplySortKey(a.supply.startDate);
      const kb = supplySortKey(b.supply.startDate);
      return (
        ka.localeCompare(kb) ||
        a.itemName.localeCompare(b.itemName) ||
        a.supply.id.localeCompare(b.supply.id)
      );
    });
  }, [contract, lines]);

  const testing = lines.find((s) => s.kind === "testing") ?? null;
  const handover = lines.find((s) => s.kind === "handover") ?? null;

  if (!contract) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Contract not found.</p>
        {!embedded && (
          <Link
            href="/schedules"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to schedules
          </Link>
        )}
      </div>
    );
  }

  const exportSections: ReportExportSection[] = [
    {
      heading: "Schedule lines",
      headers: [
        "Project no.",
        "Project",
        "City",
        "Item",
        "BOQ qty",
        "Unit",
        "Supply qty",
        "Supply start date",
        "Supply end date",
        "Installation qty",
        "Installation start date",
        "Installation end date",
      ],
      rows: rows.map((row) => {
        const install = row.installation;
        return [
          contract.projectNo,
          contract.projectName,
          contract.city || "",
          row.itemName,
          row.boqQty,
          row.unit,
          row.supply.quantity != null ? row.supply.quantity : "—",
          dateLabel(row.supply.startDate),
          dateLabel(row.supply.endDate || row.supply.startDate),
          install?.quantity != null ? install.quantity : "—",
          install ? dateLabel(install.startDate) : "—",
          install
            ? dateLabel(install.endDate || install.startDate)
            : "—",
        ];
      }),
      emptyMessage: "No dated supply lines for this contract yet.",
    },
  ];
  if (rows.length > 0) {
    exportSections.push({
      heading: "Testing and handover",
      headers: ["Project no.", "Project", "City", "Milestone", "Date"],
      rows: [
        [
          contract.projectNo,
          contract.projectName,
          contract.city || "",
          SCHEDULE_KIND_LABELS.testing,
          testing ? dateLabel(testing.startDate) : "—",
        ],
        [
          contract.projectNo,
          contract.projectName,
          contract.city || "",
          SCHEDULE_KIND_LABELS.handover,
          handover ? dateLabel(handover.startDate) : "—",
        ],
      ],
    });
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/schedules"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Back to schedules
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <ReportExportIcons
              className="mt-0"
              filename={`schedule-export-${contract.projectNo}`}
              title={`Schedule export — ${contract.projectNo}`}
              filters={reportFilterSummary({
                contract: `${contract.projectNo} · ${contract.projectName}`,
                extra: [["City", contract.city]],
              })}
              sections={exportSections}
            />
            {canEdit && (
              <EditIconLink
                href={`/schedules/plan/${contract.id}?mode=edit`}
                label="Edit schedule"
              />
            )}
          </div>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            Schedule view
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--fh-steel)] sm:text-3xl">
            {contract.projectNo}
          </h2>
          <p className="mt-1 text-sm text-[var(--fh-muted)]">
            {contract.projectName}
            {contract.city ? ` · ${contract.city}` : ""}
          </p>
        </div>
        {embedded && canEdit && (
          <EditIconLink
            href={`/schedules/plan/${contract.id}?mode=edit`}
            label="Edit schedule"
          />
        )}
      </header>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
          No dated supply lines for this contract yet.
        </p>
      ) : (
        <>
          <section className="overflow-x-auto rounded-xl border border-[var(--fh-line)] bg-white">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Supply qty</th>
                  <th className="px-3 py-2 font-medium">Supply start date</th>
                  <th className="px-3 py-2 font-medium">Supply end date</th>
                  <th className="px-3 py-2 font-medium">Installation qty</th>
                  <th className="px-3 py-2 font-medium">
                    Installation start date
                  </th>
                  <th className="px-3 py-2 font-medium">
                    Installation end date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {rows.map((row) => {
                  const install = row.installation;
                  return (
                    <tr
                      key={row.key}
                      className="align-top hover:bg-[var(--fh-bg)]/50"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-[var(--fh-steel)]">
                          {row.itemName}
                        </p>
                        <p className="text-xs text-[var(--fh-muted)]">
                          BOQ qty {row.boqQty} {row.unit}
                        </p>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 tabular-nums",
                          row.supply.done && "text-[var(--fh-ok)]"
                        )}
                      >
                        {row.supply.quantity != null ? (
                          <>
                            {row.supply.quantity}
                            {row.unit ? (
                              <span className="ml-1 text-xs text-[var(--fh-muted)]">
                                {row.unit}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 tabular-nums",
                          row.supply.done && "text-[var(--fh-ok)]"
                        )}
                      >
                        {dateLabel(row.supply.startDate)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 tabular-nums",
                          row.supply.done && "text-[var(--fh-ok)]"
                        )}
                      >
                        {dateLabel(row.supply.endDate || row.supply.startDate)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 tabular-nums",
                          install?.done && "text-[var(--fh-ok)]"
                        )}
                      >
                        {install?.quantity != null ? (
                          <>
                            {install.quantity}
                            {row.unit ? (
                              <span className="ml-1 text-xs text-[var(--fh-muted)]">
                                {row.unit}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[var(--fh-muted)]">—</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 tabular-nums",
                          install?.done && "text-[var(--fh-ok)]"
                        )}
                      >
                        {install ? (
                          dateLabel(install.startDate)
                        ) : (
                          <span className="text-[var(--fh-muted)]">—</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 tabular-nums",
                          install?.done && "text-[var(--fh-ok)]"
                        )}
                      >
                        {install ? (
                          dateLabel(install.endDate || install.startDate)
                        ) : (
                          <span className="text-[var(--fh-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                {SCHEDULE_KIND_LABELS.testing}
              </p>
              <p className="mt-1 text-sm tabular-nums font-medium text-[var(--fh-steel)]">
                {testing ? dateLabel(testing.startDate) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                {SCHEDULE_KIND_LABELS.handover}
              </p>
              <p className="mt-1 text-sm tabular-nums font-medium text-[var(--fh-steel)]">
                {handover ? dateLabel(handover.startDate) : "—"}
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
