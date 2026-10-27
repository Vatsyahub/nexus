"use client";

import { Suspense, useMemo } from "react";
import { useViewQuery } from "@/lib/use-view-query";
import Link from "next/link";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { GST_RATE } from "@/lib/types";
import { contractDisplayStatus, todayIso } from "@/lib/nexus-core";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate } from "@/lib/dates";
import {
  buildReconciliationDetail,
  buildReconciliationSummary,
} from "@/lib/reports";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ListSearchBar } from "@/components/list-search";
import { ContractTypeahead } from "@/components/contract-typeahead";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
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

type Scope = "all" | "one";

const TI_NOTE =
  "Retention expected / TDS expected = contract % × net. Retention / TDS = payment entry sums on that TI. A linked payment stays on its invoice: outstanding starts as the invoice final minus cash (net + GST), deduction, retention held, TDS held, and recovered. Spare on that overpaid invoice then covers short invoices on this contract only, oldest first. Unlinked net, GST, and deduction still fill the next invoice that needs it and do not create Extra. With no payment, outstanding starts as expected cash. A match within half a paisa is zero. Extra is spare left on the overpaid invoice. Recoverable-link cash does not count.";
const PAYMENTS_NOTE =
  "TI-linked and unlinked payments. Unlinked net+GST+deduction still allocate FIFO to the next invoice that needs it. Unlinked ret/TDS count in contract actual held. Proforma-linked and recoverable payments are excluded.";
const TOTALS_NOTE =
  "Paid amount is the accounted total on each tax invoice: net + GST + retention + TDS + deduction + recovered on payments linked to that invoice, plus the same FIFO slice of unlinked net + GST + deduction. Unlinked retention and TDS stay in Actual retention and Actual TDS. Recoverable-link cash is not included. True outstanding sums each invoice after linked spare is applied inside this contract. It stays zero when one invoice's spare equals another's short.";

export default function ReconciliationReportPage() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <ReconciliationReportInner />
    </Suspense>
  );
}

function ReconciliationReportInner() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { get, commit, retreatSamePage } = useViewQuery();
  const scope: Scope = get("scope") === "one" ? "one" : "all";
  const contractId = get("contract");
  const q = get("q");

  function openDetail(id: string) {
    commit({ scope: "one", contract: id }, "push");
  }

  function setScope(next: Scope) {
    if (next === "all") {
      if (!retreatSamePage()) commit({ scope: null, contract: null });
      return;
    }
    commit({ scope: "one" }, scope === "one" ? "replace" : "push");
  }

  function setContractId(id: string) {
    if (!id) {
      commit({ contract: null });
      return;
    }
    if (scope === "one") commit({ scope: "one", contract: id });
    else commit({ scope: "one", contract: id }, "push");
  }

  function setQ(value: string) {
    commit({ q: value || null });
  }

  const contracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );

  const summary = useMemo(
    () =>
      scope === "all"
        ? buildReconciliationSummary(data, { q })
        : [],
    [data, scope, q]
  );

  const detail = useMemo(() => {
    if (scope !== "one" || !contractId) return null;
    return buildReconciliationDetail(contractId, data);
  }, [scope, contractId, data]);

  const portfolioTotals = useMemo(() => {
    return summary.reduce(
      (acc, row) => {
        acc.invoiced += row.invoiced;
        acc.expected += row.expected;
        acc.paid += row.paid;
        acc.retentionActual += row.retentionActual;
        acc.tdsActual += row.tdsActual;
        acc.outstanding += row.outstanding;
        return acc;
      },
      {
        invoiced: 0,
        expected: 0,
        paid: 0,
        retentionActual: 0,
        tdsActual: 0,
        outstanding: 0,
      }
    );
  }, [summary]);

  return (
    <HubPage>
      <ReportsHeader title="Reconciliation" />

      <section className="shrink-0 space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Scope</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value === "one" ? "one" : "all")}
            >
              <option value="all">All contracts (summary)</option>
              <option value="one">One contract (detail)</option>
            </select>
          </div>
          {scope === "one" ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <ContractTypeahead
                contracts={contracts}
                value={contractId}
                onChange={setContractId}
                label="Contract"
                placeholder="Type contract no. or name…"
              />
            </div>
          ) : (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Search</Label>
              <ListSearchBar
                value={q}
                onChange={setQ}
                placeholder="Project no., name, city…"
              />
            </div>
          )}
        </div>
      </section>

      {!ready ? (
        <ReportsLoading />
      ) : data.contracts.length === 0 ? (
        <ReportsEmpty message="No contracts yet. Create a contract before running reconciliation." />
      ) : scope === "one" && !contractId ? (
        <ReportsEmpty message="Search and select a contract to see tax invoices, payments, and true outstanding." />
      ) : scope === "one" && contractId && !detail ? (
        <ReportsEmpty message="That contract could not be found. It may have been deleted — pick another." />
      ) : scope === "one" && detail ? (
        <DetailView detail={detail} />
      ) : summary.length === 0 ? (
        <ReportsEmpty message="No contracts match these filters." />
      ) : (
        <SummaryView
          rows={summary}
          filters={reportFilterSummary({
            tab: "All contracts (summary)",
            search: q,
          })}
          totals={portfolioTotals}
          onSelectContract={openDetail}
        />
      )}
    </HubPage>
  );
}

function DetailView({
  detail,
}: {
  detail: NonNullable<ReturnType<typeof buildReconciliationDetail>>;
}) {
  const data = useFlowhubData();
  const { contract, client, tis, payments, totals } = detail;
  const statusLabel = contractDisplayStatus(data, contract, todayIso());
  const orderWithGst = contract.gstApplicable
    ? contract.orderValue * (1 + GST_RATE)
    : contract.orderValue;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <HubDataScroll className="space-y-4">
      <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--fh-steel)]">
              {contract.projectName}
            </h2>
            <p className="mt-1 text-sm text-[var(--fh-muted)]">
              {contract.projectNo}
            </p>
          </div>
          <Badge>{statusLabel}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Meta label="Client" value={client} />
          <Meta label="City" value={contract.city} />
          <Meta label="Order value" value={formatMoney(contract.orderValue)} />
          <Meta
            label="GST"
            value={
              contract.gstApplicable
                ? `18% · w/ GST ${formatMoney(orderWithGst)}`
                : "Not applicable"
            }
          />
          <Meta
            label="Retention %"
            value={`${contract.retentionPercent}% of net`}
          />
          <Meta label="Status" value={statusLabel} />
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          Tax invoices
        </h3>
        <ReportsTableScroll className="mt-3">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[6.5%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[7%]" />
              <col className="w-[6.5%]" />
              <col className="w-[6.5%]" />
              <col className="w-[7%]" />
              <col className="w-[6.5%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[5.5%]" />
              <col className="w-[6.5%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
              <tr>
                <th className={reportTh}>TI no.</th>
                <th className={reportTh}>TI date</th>
                <th className={cn(reportTh, "text-right")}>Net</th>
                <th className={cn(reportTh, "text-right")}>GST</th>
                <th className={cn(reportTh, "text-right")}>Extras</th>
                <th className={cn(reportTh, "text-right")}>Final TI</th>
                <th className={cn(reportTh, "text-right")}>Ret. exp.</th>
                <th className={cn(reportTh, "text-right")}>TDS exp.</th>
                <th className={cn(reportTh, "text-right")}>Exp. pay</th>
                <th className={cn(reportTh, "text-right")}>Net paid</th>
                <th className={cn(reportTh, "text-right")}>GST paid</th>
                <th className={cn(reportTh, "text-right")}>Retention</th>
                <th className={cn(reportTh, "text-right")}>TDS</th>
                <th className={cn(reportTh, "text-right")}>Other</th>
                <th className={cn(reportTh, "text-right")}>Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--fh-line)]">
              {tis.length === 0 ? (
                <tr>
                  <td
                    colSpan={15}
                    className="px-3 py-6 text-center text-[var(--fh-muted)]"
                  >
                    No tax invoices on this contract yet.
                  </td>
                </tr>
              ) : (
                tis.map((ti) => (
                  <tr key={ti.invoiceId}>
                    <td className={cn(reportTd, "break-all")}>
                      <Link
                        href={`/billing/${ti.invoiceId}`}
                        className="font-medium text-[var(--fh-steel)] hover:underline"
                      >
                        {ti.number}
                      </Link>
                    </td>
                    <td className={cn(reportTd, "tabular-nums")}>
                      {formatDisplayDate(ti.date)}
                    </td>
                    <td className={reportMoney}>{formatMoney(ti.net)}</td>
                    <td className={reportMoney}>{formatMoney(ti.gst)}</td>
                    <td className={reportMoney}>{formatMoney(ti.extras)}</td>
                    <td className={reportMoney}>
                      {formatMoney(ti.finalAmount)}
                    </td>
                    <td className={reportMoney}>
                      {formatMoney(ti.retentionExpected)}
                    </td>
                    <td className={reportMoney}>
                      {formatMoney(ti.tdsExpected)}
                    </td>
                    <td className={reportMoney}>{formatMoney(ti.expected)}</td>
                    <td className={reportMoney}>{formatMoney(ti.netPaid)}</td>
                    <td className={reportMoney}>{formatMoney(ti.gstPaid)}</td>
                    <td className={reportMoney}>
                      {formatMoney(ti.retentionActual)}
                    </td>
                    <td className={reportMoney}>{formatMoney(ti.tdsActual)}</td>
                    <td className={reportMoney}>{formatMoney(ti.otherPaid)}</td>
                    <td className={cn(reportMoney, "font-medium")}>
                      {formatMoney(ti.outstanding)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ReportsTableScroll>
      </section>

      <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          Payments
        </h3>
        <ReportsTableScroll className="mt-3">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
              <tr>
                <th className={reportTh}>Against TI</th>
                <th className={reportTh}>Date</th>
                <th className={cn(reportTh, "text-right")}>Net</th>
                <th className={cn(reportTh, "text-right")}>GST</th>
                <th className={cn(reportTh, "text-right")}>Retention</th>
                <th className={cn(reportTh, "text-right")}>TDS</th>
                <th className={cn(reportTh, "text-right")}>Other</th>
                <th className={cn(reportTh, "text-right")}>Paid total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--fh-line)]">
              {payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-[var(--fh-muted)]"
                  >
                    No TI or unlinked payments on this contract yet.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.paymentId}>
                    <td className={cn(reportTd, "break-words")}>
                      <Link
                        href={`/payments/${p.paymentId}`}
                        className="font-medium text-[var(--fh-steel)] hover:underline"
                      >
                        {p.againstLabel}
                      </Link>
                    </td>
                    <td className={cn(reportTd, "tabular-nums")}>
                      {formatDisplayDate(p.date)}
                    </td>
                    <td className={reportMoney}>{formatMoney(p.net)}</td>
                    <td className={reportMoney}>{formatMoney(p.gst)}</td>
                    <td className={reportMoney}>{formatMoney(p.retention)}</td>
                    <td className={reportMoney}>{formatMoney(p.tds)}</td>
                    <td className={reportMoney}>{formatMoney(p.other)}</td>
                    <td className={cn(reportMoney, "font-medium")}>
                      {formatMoney(p.paidTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ReportsTableScroll>
      </section>

      <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          Totals
        </h3>
        <dl className="mt-4 space-y-2 text-sm">
          <TotalRow label="Sum TI final amounts" value={totals.invoiced} />
          <TotalRow label="Expected payments" value={totals.expected} />
          <TotalRow label="Paid amount" value={totals.paid} />
          <TotalRow label="Actual retention" value={totals.retentionActual} />
          <TotalRow label="Actual TDS" value={totals.tdsActual} />
          <TotalRow
            label="True outstanding"
            value={totals.outstanding}
            emphasize
          />
        </dl>
      </section>

      </HubDataScroll>
      <ReportExportIcons
        className="mt-0"
        filename={`reconciliation-${contract.projectNo}`}
        title={`Reconciliation Report — ${contract.projectNo}`}
        filters={reportFilterSummary({
          tab: "One contract (detail)",
          contract: `${contract.projectNo} · ${contract.projectName}`,
        })}
        sections={[
          {
            heading: "Contract",
            headers: [
              "Project no.",
              "Project name",
              "Client",
              "City",
              "Order value",
              "GST",
              "Retention %",
              "Status",
            ],
            rows: [
              [
                contract.projectNo,
                contract.projectName,
                client,
                contract.city,
                contract.orderValue,
                contract.gstApplicable
                  ? `18% · w/ GST ${formatMoney(orderWithGst)}`
                  : "Not applicable",
                `${contract.retentionPercent}% of net`,
                statusLabel,
              ],
            ],
          },
          {
            heading: "Summary totals",
            note: TOTALS_NOTE,
            headers: [
              "Sum TI final amounts",
              "Expected payments",
              "Paid amount",
              "Actual retention",
              "Actual TDS",
              "True outstanding",
            ],
            rows: [
              [
                totals.invoiced,
                totals.expected,
                totals.paid,
                totals.retentionActual,
                totals.tdsActual,
                totals.outstanding,
              ],
            ],
          },
          {
            heading: `Tax invoices (${tis.length})`,
            note: TI_NOTE,
            emptyMessage: "No tax invoices on this contract yet.",
            headers: [
              "TI no.",
              "TI date",
              "Net",
              "GST",
              "Extras",
              "Final TI",
              "Ret. exp.",
              "TDS exp.",
              "Exp. pay",
              "Net paid",
              "GST paid",
              "Retention",
              "TDS",
              "Other",
              "Outstanding",
            ],
            rows: tis.map((ti) => [
              ti.number,
              formatDisplayDate(ti.date),
              ti.net,
              ti.gst,
              ti.extras,
              ti.finalAmount,
              ti.retentionExpected,
              ti.tdsExpected,
              ti.expected,
              ti.netPaid,
              ti.gstPaid,
              ti.retentionActual,
              ti.tdsActual,
              ti.otherPaid,
              ti.outstanding,
            ]),
          },
          {
            heading: `Payments (${payments.length})`,
            note: PAYMENTS_NOTE,
            emptyMessage: "No TI or unlinked payments on this contract yet.",
            headers: [
              "Against TI",
              "Date",
              "Net",
              "GST",
              "Retention",
              "TDS",
              "Other",
              "Paid total",
            ],
            rows: payments.map((p) => [
              p.againstLabel,
              formatDisplayDate(p.date),
              p.net,
              p.gst,
              p.retention,
              p.tds,
              p.other,
              p.paidTotal,
            ]),
          },
        ]}
      />
    </div>
  );
}

function SummaryView({
  rows,
  filters,
  totals,
  onSelectContract,
}: {
  rows: ReturnType<typeof buildReconciliationSummary>;
  filters: string;
  totals: {
    invoiced: number;
    expected: number;
    paid: number;
    retentionActual: number;
    tdsActual: number;
    outstanding: number;
  };
  onSelectContract: (contractId: string) => void;
}) {
  return (
    <section className={reportPanelClass}>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          All contracts
        </h2>
        <p className="text-xs text-[var(--fh-muted)]">
          {rows.length} contract{rows.length === 1 ? "" : "s"}
        </p>
      </div>
      <ReportsTableScroll className="mt-3">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>City</th>
              <th className={cn(reportTh, "text-right")}>Invoiced (TI)</th>
              <th className={cn(reportTh, "text-right")}>Expected</th>
              <th className={cn(reportTh, "text-right")}>Paid</th>
              <th className={cn(reportTh, "text-right")}>Retention</th>
              <th className={cn(reportTh, "text-right")}>TDS</th>
              <th className={cn(reportTh, "text-right")}>True outst.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.map((row) => (
              <tr key={row.contractId}>
                <td className={reportTd}>
                  <div className="min-w-0 break-words">
                    <button
                      type="button"
                      className="break-words text-left font-medium text-[var(--fh-steel)] hover:underline"
                      onClick={() => onSelectContract(row.contractId)}
                    >
                      {row.projectName}
                    </button>
                    <p className="break-all text-xs text-[var(--fh-muted)]">
                      {row.projectNo}
                    </p>
                  </div>
                </td>
                <td className={cn(reportTd, "break-words")}>{row.city}</td>
                <td className={reportMoney}>{formatMoney(row.invoiced)}</td>
                <td className={reportMoney}>{formatMoney(row.expected)}</td>
                <td className={reportMoney}>{formatMoney(row.paid)}</td>
                <td className={reportMoney}>
                  {formatMoney(row.retentionActual)}
                </td>
                <td className={reportMoney}>{formatMoney(row.tdsActual)}</td>
                <td className={cn(reportMoney, "font-medium")}>
                  {formatMoney(row.outstanding)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-[var(--fh-line)] bg-[var(--fh-bg)] text-sm font-medium">
            <tr>
              <td className={reportTd} colSpan={2}>
                Portfolio totals
              </td>
              <td className={reportMoney}>{formatMoney(totals.invoiced)}</td>
              <td className={reportMoney}>{formatMoney(totals.expected)}</td>
              <td className={reportMoney}>{formatMoney(totals.paid)}</td>
              <td className={reportMoney}>
                {formatMoney(totals.retentionActual)}
              </td>
              <td className={reportMoney}>{formatMoney(totals.tdsActual)}</td>
              <td className={reportMoney}>
                {formatMoney(totals.outstanding)}
              </td>
            </tr>
          </tfoot>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="reconciliation-summary"
        title="Reconciliation Report — All contracts"
        filters={filters}
        headers={[
          "Project",
          "City",
          "Invoiced (TI)",
          "Expected",
          "Paid",
          "Retention",
          "TDS",
          "True outstanding",
        ]}
        rows={[
          ...rows.map((row) => [
            `${row.projectName}\n${row.projectNo}`,
            row.city,
            row.invoiced,
            row.expected,
            row.paid,
            row.retentionActual,
            row.tdsActual,
            row.outstanding,
          ]),
          [
            "Portfolio totals",
            "",
            totals.invoiced,
            totals.expected,
            totals.paid,
            totals.retentionActual,
            totals.tdsActual,
            totals.outstanding,
          ],
        ]}
      />
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function TotalRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div
      className={
        emphasize
          ? "flex justify-between border-t border-[var(--fh-line)] pt-3 text-base font-semibold text-[var(--fh-steel)]"
          : "flex justify-between"
      }
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatMoney(value)}</dd>
    </div>
  );
}
