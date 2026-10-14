"use client";

import { useMemo, useState } from "react";
import type { FlowhubData } from "@/lib/types";
import {
  flushWorkspace,
  installationProgressFor,
  recordInstallationTotal,
  suppliedQty,
} from "@/lib/store";
import { formatDisplayDate } from "@/lib/dates";
import { formatQty } from "@/lib/execution-reports";
import { ContractTypeahead } from "@/components/contract-typeahead";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ReportsEmpty,
  ReportsTableScroll,
  reportTd,
  reportTh,
} from "../reports-shell";
import { FormMessage, qtyCell, todayIsoLocal } from "./execution-ui";

type Msg = { kind: "ok" | "error"; text: string } | null;

export function InstallationsTab({
  data,
  canEdit,
  actorName,
  contractId,
  onContractChange,
}: {
  data: FlowhubData;
  canEdit: boolean;
  actorName: string;
  contractId: string;
  onContractChange: (id: string) => void;
}) {
  const contract = data.contracts.find((c) => c.id === contractId) ?? null;
  const [msg, setMsg] = useState<Msg>(null);
  const [date, setDate] = useState(todayIsoLocal);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const items = useMemo(() => {
    if (!contract) return [];
    return contract.boq.map((b) => {
      const progress = installationProgressFor(contract.id, b.id, data);
      return {
        item: b,
        supplied: suppliedQty(contract.id, b.id, data),
        installed: progress?.installedQty ?? 0,
        lastUpdatedAt: progress?.lastUpdatedAt ?? null,
      };
    });
  }, [contract, data]);

  const history = useMemo(() => {
    if (!contract) return [];
    const names = new Map(contract.boq.map((b) => [b.id, b.name]));
    return data.installationProgress
      .filter((p) => p.contractId === contract.id)
      .flatMap((p) =>
        p.history.map((h) => ({
          ...h,
          itemName: names.get(p.boqItemId) ?? "—",
        }))
      )
      .sort(
        (a, b) =>
          b.at.localeCompare(a.at) || b.recordedAt.localeCompare(a.recordedAt)
      );
  }, [contract, data.installationProgress]);

  async function save(boqItemId: string) {
    if (!contract) return;
    const raw = (drafts[boqItemId] ?? "").trim();
    if (raw === "") {
      setMsg({ kind: "error", text: "Enter the new cumulative installed total." });
      return;
    }
    setSavingId(boqItemId);
    const res = recordInstallationTotal(
      { contractId: contract.id, boqItemId, newTotal: Number(raw), date },
      { by: actorName }
    );
    if (!res.ok) {
      setSavingId(null);
      setMsg({ kind: "error", text: res.error });
      return;
    }
    await flushWorkspace();
    setSavingId(null);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[boqItemId];
      return next;
    });
    const last = res.value.history[res.value.history.length - 1];
    const name = contract.boq.find((b) => b.id === boqItemId)?.name ?? "Item";
    setMsg({
      kind: "ok",
      text: `${name}: installed ${formatQty(res.value.installedQty)} (${last.delta > 0 ? "+" : ""}${formatQty(last.delta)}) as of ${formatDisplayDate(last.at)}.`,
    });
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[16rem] max-w-xl flex-1">
          <ContractTypeahead
            contracts={data.contracts}
            value={contractId}
            onChange={(id) => {
              setMsg(null);
              setDrafts({});
              onContractChange(id);
            }}
          />
        </div>
        {canEdit && contract && (
          <div className="space-y-1">
            <Label htmlFor="install-date">Update date</Label>
            <Input
              id="install-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[10.5rem] bg-white"
            />
          </div>
        )}
      </div>

      <FormMessage msg={msg} />

      {!contract ? (
        <ReportsEmpty message="Select a contract to see and update installation progress." />
      ) : contract.boq.length === 0 ? (
        <ReportsEmpty message="This contract has no BOQ items." />
      ) : (
        <>
          {canEdit && (
            <p className="text-xs text-[var(--fh-muted)]">
              Enter the new cumulative installed total (not the increment). It
              cannot exceed supplied qty.
            </p>
          )}
          <ReportsTableScroll>
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className={canEdit ? "w-[26%]" : "w-[40%]"} />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[12%]" />
                <col className={canEdit ? "w-[13%]" : "w-[26%]"} />
                {canEdit && <col className="w-[15%]" />}
                {canEdit && <col className="w-[12%]" />}
              </colgroup>
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className={reportTh}>Item</th>
                  <th className={cn(reportTh, "text-right")}>BOQ qty</th>
                  <th className={cn(reportTh, "text-right")}>Supplied</th>
                  <th className={cn(reportTh, "text-right")}>Installed</th>
                  <th className={reportTh}>Last update</th>
                  {canEdit && (
                    <th className={cn(reportTh, "text-right")}>New total</th>
                  )}
                  {canEdit && (
                    <th className={reportTh}>
                      <span className="sr-only">Save</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {items.map(({ item, supplied, installed, lastUpdatedAt }) => {
                  const draft = drafts[item.id] ?? "";
                  const over = draft !== "" && Number(draft) > supplied + 1e-9;
                  return (
                    <tr key={item.id}>
                      <td className={reportTd}>
                        <span className="break-words">{item.name}</span>
                        {item.unit ? (
                          <span className="block text-xs text-[var(--fh-muted)]">
                            {item.unit}
                          </span>
                        ) : null}
                      </td>
                      <td className={qtyCell}>{formatQty(item.quantity)}</td>
                      <td className={qtyCell}>{formatQty(supplied)}</td>
                      <td className={cn(qtyCell, "font-medium")}>
                        {formatQty(installed)}
                      </td>
                      <td className={cn(reportTd, "tabular-nums")}>
                        {formatDisplayDate(lastUpdatedAt)}
                      </td>
                      {canEdit && (
                        <td className="px-1 py-1.5 sm:px-1.5">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={supplied}
                            step="any"
                            value={draft}
                            disabled={supplied <= 0}
                            placeholder={
                              supplied <= 0 ? "Not supplied" : formatQty(installed)
                            }
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void save(item.id);
                              }
                            }}
                            aria-label={`New installed total for ${item.name}`}
                            aria-invalid={over || undefined}
                            className={cn(
                              "h-8 bg-white text-right tabular-nums",
                              over && "border-[var(--destructive)]"
                            )}
                          />
                          {over && (
                            <span className="mt-0.5 block text-right text-[10px] text-[var(--destructive)]">
                              Max {formatQty(supplied)}
                            </span>
                          )}
                        </td>
                      )}
                      {canEdit && (
                        <td className="px-1 py-1.5 sm:px-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              supplied <= 0 ||
                              draft === "" ||
                              over ||
                              savingId === item.id
                            }
                            onClick={() => void save(item.id)}
                            className="w-full"
                          >
                            {savingId === item.id ? "…" : "Update"}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ReportsTableScroll>
          <ReportExportIcons
            filename={`installations-${contract.projectNo}`}
            title="Operations — Installations"
            filters={reportFilterSummary({
              tab: "Installations",
              contract: `${contract.projectNo} · ${contract.projectName}`,
            })}
            headers={["Item", "Unit", "BOQ qty", "Supplied", "Installed", "Last update"]}
            rows={items.map(({ item, supplied, installed, lastUpdatedAt }) => [
              item.name,
              item.unit,
              item.quantity,
              supplied,
              installed,
              formatDisplayDate(lastUpdatedAt),
            ])}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <h3 className="shrink-0 font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
              Installation history
            </h3>
            <ReportsTableScroll className="mt-2">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[38%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
                  <tr>
                    <th className={reportTh}>Date</th>
                    <th className={reportTh}>Item</th>
                    <th className={cn(reportTh, "text-right")}>Change</th>
                    <th className={cn(reportTh, "text-right")}>Running total</th>
                    <th className={reportTh}>By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--fh-line)]">
                  {history.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-[var(--fh-muted)]"
                      >
                        No installation updates yet.
                      </td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr key={h.id}>
                        <td className={cn(reportTd, "tabular-nums")}>
                          {formatDisplayDate(h.at)}
                        </td>
                        <td className={reportTd}>{h.itemName}</td>
                        <td
                          className={cn(
                            qtyCell,
                            h.delta < 0 && "text-[var(--destructive)]"
                          )}
                        >
                          {h.delta > 0 ? "+" : ""}
                          {formatQty(h.delta)}
                        </td>
                        <td className={cn(qtyCell, "font-medium")}>
                          {formatQty(h.totalAfter)}
                        </td>
                        <td
                          className={cn(reportTd, "text-xs text-[var(--fh-muted)]")}
                        >
                          {h.by || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ReportsTableScroll>
            <ReportExportIcons
              filename={`installation-history-${contract.projectNo}`}
              title="Operations — Installation history"
              filters={reportFilterSummary({
                tab: "Installations · History",
                contract: `${contract.projectNo} · ${contract.projectName}`,
              })}
              headers={["Date", "Item", "Change", "Running total", "By"]}
              rows={history.map((h) => [
                formatDisplayDate(h.at),
                h.itemName,
                h.delta,
                h.totalAfter,
                h.by,
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}
