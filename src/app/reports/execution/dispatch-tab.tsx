"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { FlowhubData } from "@/lib/types";
import {
  addDeliveryChallan,
  flushWorkspace,
  leftToSupplyQty,
  suppliedQty,
} from "@/lib/store";
import { formatQty } from "@/lib/execution-reports";
import { ADD_CONTRACT_MATCH_LIMIT } from "@/lib/add-contract-matches";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ReportsTableScroll,
  reportTd,
  reportTh,
} from "../reports-shell";
import { FormMessage, qtyCell, todayIsoLocal } from "./execution-ui";

type Msg = { kind: "ok" | "error"; text: string } | null;

export function DispatchTab({
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

  const hasLeftToSupply = useMemo(() => {
    if (!contract) return false;
    return contract.boq.some(
      (b) => leftToSupplyQty(contract.id, b.id, data) > 0
    );
  }, [contract, data]);

  const contractField = (
    <ContractTypeahead
      contracts={data.contracts}
      value={contractId}
      onChange={(id) => {
        setMsg(null);
        onContractChange(id);
      }}
      placeholder="Type project number or name…"
      maxMatches={ADD_CONTRACT_MATCH_LIMIT}
      optionSuffix={(c) => {
        const n = data.deliveryChallans.filter((dc) => dc.contractId === c.id)
          .length;
        return n ? `${n} DC${n === 1 ? "" : "s"}` : null;
      }}
    />
  );

  const showForm = Boolean(canEdit && contract && hasLeftToSupply);

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {showForm && contract ? (
        <AddDcForm
          key={contract.id}
          data={data}
          contractId={contract.id}
          actorName={actorName}
          msg={msg}
          onResult={setMsg}
          contractField={
            <div className="min-w-0" data-entry-ignore="">
              {contractField}
            </div>
          }
        />
      ) : (
        <>
          <div className="max-w-xl shrink-0">{contractField}</div>
          {msg ? (
            <div className="shrink-0">
              <FormMessage msg={msg} />
            </div>
          ) : null}
          {!contract && (
            <p className="shrink-0 rounded-lg border border-[var(--fh-line)] px-4 py-3 text-sm text-[var(--fh-muted)]">
              Select a contract to provide Delivery Challan details.
            </p>
          )}
          {canEdit && contract && !hasLeftToSupply && contract.boq.length > 0 && (
            <p className="shrink-0 rounded-lg border border-[var(--fh-line)] px-4 py-3 text-sm text-[var(--fh-muted)]">
              All BOQ qty for this contract is already on DCs — nothing left to
              supply.
            </p>
          )}
          {canEdit && contract && contract.boq.length === 0 && (
            <p className="shrink-0 rounded-lg border border-[var(--fh-line)] px-4 py-3 text-sm text-[var(--fh-muted)]">
              This contract has no BOQ items — add BOQ before recording a DC.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AddDcForm({
  data,
  contractId,
  actorName,
  msg,
  onResult,
  contractField,
}: {
  data: FlowhubData;
  contractId: string;
  actorName: string;
  msg: Msg;
  onResult: (m: Msg) => void;
  contractField: ReactNode;
}) {
  const contract = data.contracts.find((c) => c.id === contractId)!;
  const [dcNo, setDcNo] = useState("");
  const [date, setDate] = useState(todayIsoLocal);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const lines = contract.boq
      .map((b) => ({ boqItemId: b.id, qty: Number(qty[b.id] || 0) }))
      .filter((l) => l.qty > 0);
    const bad = contract.boq.find((b) => {
      const raw = (qty[b.id] ?? "").trim();
      return raw !== "" && !(Number(raw) >= 0);
    });
    if (bad) {
      onResult({ kind: "error", text: `${bad.name}: qty must be a positive number.` });
      return;
    }
    setSaving(true);
    const res = addDeliveryChallan(
      { contractId, dcNo, date, lines },
      { by: actorName }
    );
    if (!res.ok) {
      setSaving(false);
      onResult({ kind: "error", text: res.error });
      return;
    }
    try {
      await flushWorkspace();
    } catch (err) {
      setSaving(false);
      onResult({
        kind: "error",
        text:
          err instanceof Error && err.message ? err.message : "Could not save.",
      });
      return;
    }
    setSaving(false);
    setDcNo("");
    setQty({});
    onResult({
      kind: "ok",
      text: `Saved DC ${res.value.dcNo} (${res.value.lines.length} item${res.value.lines.length === 1 ? "" : "s"}) on ${contract.projectNo}.`,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      {...entryRootProps}
      className={cn(
        "grid min-h-0 flex-1 grid-cols-[minmax(0,36rem)_auto_auto_auto] justify-start gap-x-3 gap-y-4 overflow-hidden",
        msg
          ? "grid-rows-[auto_auto_minmax(0,1fr)]"
          : "grid-rows-[auto_minmax(0,1fr)]"
      )}
    >
      <div className="col-start-1 row-start-1 min-w-0 self-end">{contractField}</div>
      <div className="col-start-2 row-start-1 space-y-1 self-end">
        <Label htmlFor="dc-no">DC no.</Label>
        <Input
          id="dc-no"
          value={dcNo}
          onChange={(e) => setDcNo(e.target.value)}
          placeholder="e.g. DC/2026/014"
          className="w-56 bg-white"
          required
        />
      </div>
      <div className="col-start-3 row-start-1 space-y-1 self-end">
        <Label htmlFor="dc-date">DC date</Label>
        <Input
          id="dc-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[10.5rem] bg-white"
          required
        />
      </div>
      {/* Last in the DOM so Enter still walks the qty fields before Save. */}
      <Button
        type="submit"
        {...entrySaveProps}
        disabled={saving}
        className="col-start-4 row-start-1 self-end bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
      >
        {saving ? "Saving…" : "Save DC"}
      </Button>

      {msg ? (
        <div className="col-span-4 row-start-2">
          <FormMessage msg={msg} />
        </div>
      ) : null}

      <div
        className={cn(
          "col-span-4 flex min-h-0 flex-col gap-4 self-stretch overflow-hidden rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)]/50 p-4",
          msg ? "row-start-3" : "row-start-2"
        )}
      >
        <h3 className="shrink-0 font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
          Add delivery challan
        </h3>
        <ReportsTableScroll className="min-h-0 bg-white">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[10%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
              <tr>
                <th className={reportTh}>Item</th>
                <th className={reportTh}>Unit</th>
                <th className={cn(reportTh, "text-right")}>BOQ qty</th>
                <th className={cn(reportTh, "text-right")}>Supplied</th>
                <th className={cn(reportTh, "text-right")}>Left to supply</th>
                <th className={cn(reportTh, "text-right")}>Qty this DC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--fh-line)]">
              {contract.boq.map((b) => {
                const supplied = suppliedQty(contract.id, b.id, data);
                const left = leftToSupplyQty(contract.id, b.id, data);
                const entered = Number(qty[b.id] || 0);
                const over = entered > left + 1e-9;
                return (
                  <tr key={b.id}>
                    <td className={reportTd}>{b.name}</td>
                    <td className={reportTd}>{b.unit || "—"}</td>
                    <td className={qtyCell}>{formatQty(b.quantity)}</td>
                    <td className={qtyCell}>{formatQty(supplied)}</td>
                    <td className={qtyCell}>{formatQty(left)}</td>
                    <td className="px-1 py-1.5 sm:px-1.5">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={qty[b.id] ?? ""}
                        disabled={left <= 0}
                        placeholder={left <= 0 ? "Done" : "0"}
                        onChange={(e) =>
                          setQty((prev) => ({ ...prev, [b.id]: e.target.value }))
                        }
                        aria-label={`Qty for ${b.name}`}
                        aria-invalid={over || undefined}
                        className={cn(
                          "h-8 bg-white text-right tabular-nums",
                          over && "border-[var(--destructive)]"
                        )}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ReportsTableScroll>
      </div>
    </form>
  );
}
