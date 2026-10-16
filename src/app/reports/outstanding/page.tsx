"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  outstandingIsStillDue,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate, isDateInInclusiveRange } from "@/lib/dates";
import {
  buildInvoiceOutstandingRows,
  buildOpenPiRows,
  sumOpenOutstanding,
  type InvoiceOutstandingStatus,
} from "@/lib/reports";
import { matchesAny } from "@/lib/list-search";
import { ListSearchWithDateRange } from "@/components/list-date-range";
import { ProjectIdentity } from "@/components/project-identity";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";
import {
  ReportsEmpty,
  ReportsHeader,
  ReportsLoading,
  ReportsTableScroll,
  reportPanelClass,
  reportMoney,
  reportTd,
  reportTh,
} from "../reports-shell";

type Tab = "all" | "outstandings" | "proformas";

function parseTab(raw: string | null): Tab {
  if (raw === "outstandings" || raw === "proformas") return raw;
  return "all";
}

export default function InvoicesAndOutstandingsPage() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <InvoicesAndOutstandingsInner />
    </Suspense>
  );
}

function InvoicesAndOutstandingsInner() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const dueWithin = searchParams.get("dueWithin") === "7" ? 7 : 0;

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    params.delete("dueWithin");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const allInvoiceRows = useMemo(
    () => buildInvoiceOutstandingRows(data),
    [data]
  );

  const allProformaRows = useMemo(() => buildOpenPiRows(data), [data]);

  const dueWindow = useMemo(() => {
    if (dueWithin !== 7) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    const iso = (d: Date) => {
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${m}-${day}`;
    };
    return { from: iso(today), to: iso(end) };
  }, [dueWithin]);

  const invoiceRows = useMemo(() => {
    const base =
      tab === "outstandings" || dueWithin === 7
        ? allInvoiceRows.filter((r) => outstandingIsStillDue(r.outstanding))
        : allInvoiceRows;
    const needle = q.trim();
    return base.filter((r) => {
      if (
        dueWindow &&
        (r.dueDate < dueWindow.from || r.dueDate > dueWindow.to)
      ) {
        return false;
      }
      if (!isDateInInclusiveRange(r.date, dateFrom, dateTo)) return false;
      if (!needle) return true;
      return matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.city,
        r.number,
        `TI ${r.number}`,
        r.status,
        r.finalAmount,
        r.expected,
        r.paid,
        r.outstanding,
        r.daysUntilDue,
        formatDisplayDate(r.date),
        formatDisplayDate(r.dueDate),
      ]);
    });
  }, [allInvoiceRows, tab, q, dateFrom, dateTo, dueWithin, dueWindow]);

  const proformaRows = useMemo(() => {
    const needle = q.trim();
    return allProformaRows.filter((r) => {
      if (!isDateInInclusiveRange(r.date, dateFrom, dateTo)) return false;
      if (!needle) return true;
      return matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.city,
        r.number,
        `PI ${r.number}`,
        r.finalAmount,
        r.daysOpen,
        formatDisplayDate(r.date),
      ]);
    });
  }, [allProformaRows, q, dateFrom, dateTo]);

  const outstandingTotal = useMemo(
    () => sumOpenOutstanding(invoiceRows),
    [invoiceRows]
  );

  const showProformas = tab === "proformas";

  return (
    <HubPage>
      <ReportsHeader title="Invoices and Outstandings" />

      {!ready ? (
        <ReportsLoading />
      ) : data.contracts.length === 0 ? (
        <ReportsEmpty message="No contracts yet." />
      ) : !showProformas && allInvoiceRows.length === 0 ? (
        <ReportsEmpty message="No tax invoices yet." />
      ) : (
        <section className={reportPanelClass}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div
              role="tablist"
              aria-label="Invoice list"
              className="flex flex-wrap gap-1 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-1"
            >
              <TabButton
                active={tab === "all"}
                onClick={() => selectTab("all")}
                label="All"
              />
              <TabButton
                active={tab === "outstandings"}
                onClick={() => selectTab("outstandings")}
                label="Outstandings"
              />
              <TabButton
                active={tab === "proformas"}
                onClick={() => selectTab("proformas")}
                label="Proformas"
              />
            </div>
            {!showProformas ? (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                  Total of outstandings
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--fh-steel)]">
                  {formatMoney(outstandingTotal)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-[var(--fh-muted)]">
                {proformaRows.length} open proforma
                {proformaRows.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
          {dueWithin === 7 && !showProformas ? (
            <p className="mt-3 text-sm text-[var(--fh-muted)]">
              Due within 7 days (overdue invoices excluded).
            </p>
          ) : null}

          <ListSearchWithDateRange
            value={q}
            onChange={setQ}
            placeholder={
              showProformas
                ? "Search project, city, PI no..."
                : "Search project, city, TI no., status..."
            }
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />

          {showProformas ? (
            allProformaRows.length === 0 ? (
              <p className="mt-4 px-1 py-6 text-center text-sm text-[var(--fh-muted)]">
                No open proformas.
              </p>
            ) : (
              <ProformasTable
                rows={proformaRows}
                filters={reportFilterSummary({
                  tab: "Proformas",
                  search: q,
                  dateFrom,
                  dateTo,
                  dateLabel: "PI date",
                })}
              />
            )
          ) : (
            <InvoicesTable
              rows={invoiceRows}
              title={
                dueWithin === 7
                  ? "Outstandings — due in 7 days"
                  : tab === "outstandings"
                    ? "Outstandings"
                    : "All tax invoices"
              }
              filters={reportFilterSummary({
                tab: tab === "outstandings" ? "Outstandings" : "All",
                search: q,
                dateFrom,
                dateTo,
                dateLabel: "Invoice date",
                extra: dueWithin === 7 ? [["Due", "within 7 days"]] : undefined,
              })}
            />
          )}
        </section>
      )}
    </HubPage>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-white font-medium text-[var(--fh-steel)] ring-1 ring-[var(--fh-line)]"
          : "text-[var(--fh-muted)] hover:text-[var(--fh-steel)]"
      )}
    >
      {label}
    </button>
  );
}

function InvoicesTable({
  rows,
  title,
  filters,
}: {
  rows: ReturnType<typeof buildInvoiceOutstandingRows>;
  title: string;
  filters: string;
}) {
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[11%]" />
            <col className="w-[5%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>City</th>
              <th className={reportTh}>TI no.</th>
              <th className={reportTh}>TI date</th>
              <th className={cn(reportTh, "text-right")}>TI amount</th>
              <th className={cn(reportTh, "text-right")}>Expected</th>
              <th className={cn(reportTh, "text-right")}>Paid</th>
              <th className={cn(reportTh, "text-right")}>Outstanding</th>
              <th className={reportTh}>Due date</th>
              <th className={cn(reportTh, "text-right")}>Due days</th>
              <th className={reportTh}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  No matching invoices.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.invoiceId}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={`/contracts/${r.contractId}`}
                    />
                  </td>
                  <td className={cn(reportTd, "break-words")}>{r.city}</td>
                  <td className={cn(reportTd, "break-all")}>
                    <Link
                      href={`/billing/${r.invoiceId}`}
                      className="font-medium text-[var(--fh-steel)] hover:underline"
                    >
                      {r.number}
                    </Link>
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.date)}
                  </td>
                  <td className={reportMoney}>{formatMoney(r.finalAmount)}</td>
                  <td className={reportMoney}>{formatMoney(r.expected)}</td>
                  <td className={reportMoney}>
                    {formatMoney(r.paid > 0.005 ? r.paid : 0)}
                  </td>
                  <td className={cn(reportMoney, "font-medium")}>
                    {formatMoney(r.outstanding)}
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.dueDate)}
                  </td>
                  <td className={cn(reportMoney)}>
                    {r.status === "paid" ? "" : r.daysUntilDue}
                  </td>
                  <td className={reportTd}>
                    <StatusLabel status={r.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename={`invoices-${title}`}
        title={`Invoices and Outstandings — ${title}`}
        filters={filters}
        headers={[
          "Project",
          "Project no.",
          "City",
          "TI no.",
          "TI date",
          "TI amount",
          "Expected",
          "Paid",
          "Outstanding",
          "Due date",
          "Due days",
          "Status",
        ]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          r.city,
          r.number,
          formatDisplayDate(r.date),
          r.finalAmount,
          r.expected,
          r.paid > 0.005 ? r.paid : 0,
          r.outstanding,
          formatDisplayDate(r.dueDate),
          r.status === "paid" ? "" : r.daysUntilDue,
          capitalize(r.status),
        ])}
      />
    </>
  );
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function ProformasTable({
  rows,
  filters,
}: {
  rows: ReturnType<typeof buildOpenPiRows>;
  filters: string;
}) {
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[28%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>City</th>
              <th className={reportTh}>PI number</th>
              <th className={reportTh}>Date</th>
              <th className={cn(reportTh, "text-right")}>Final amount</th>
              <th className={cn(reportTh, "text-right")}>Days open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  No open proformas match this search.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.invoiceId}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={row.projectNo}
                      projectName={row.projectName}
                      href={`/contracts/${row.contractId}`}
                    />
                  </td>
                  <td className={cn(reportTd, "break-words")}>{row.city}</td>
                  <td className={cn(reportTd, "break-all")}>
                    <Link
                      href={`/billing/${row.invoiceId}`}
                      className="font-medium text-[var(--fh-steel)] hover:underline"
                    >
                      {row.number}
                    </Link>
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(row.date)}
                  </td>
                  <td className={reportMoney}>
                    {formatMoney(row.finalAmount)}
                  </td>
                  <td className={cn(reportMoney, "font-medium")}>{row.daysOpen}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="open-proformas"
        title="Invoices and Outstandings — Open proformas"
        filters={filters}
        headers={[
          "Project",
          "Project no.",
          "City",
          "PI number",
          "Date",
          "Final amount",
          "Days open",
        ]}
        rows={rows.map((row) => [
          row.projectName,
          row.projectNo,
          row.city,
          row.number,
          formatDisplayDate(row.date),
          row.finalAmount,
          row.daysOpen,
        ])}
      />
    </>
  );
}

function StatusLabel({ status }: { status: InvoiceOutstandingStatus }) {
  const tone =
    status === "paid"
      ? "bg-emerald-50 text-emerald-800"
      : status === "overdue"
        ? "bg-red-50 text-red-800"
        : status === "partially paid"
          ? "bg-amber-50 text-amber-900"
          : "bg-sky-50 text-sky-900";
  return (
    <span
      className={cn(
        "inline-block max-w-full break-words rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize leading-tight sm:text-xs",
        tone
      )}
    >
      {status}
    </span>
  );
}
