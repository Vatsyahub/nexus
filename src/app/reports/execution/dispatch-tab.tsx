"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { FlowhubData } from "@/lib/types";
import {
  addDeliveryChallan,
  flushWorkspace,
  leftToSupplyQty,
  suppliedQty,
} from "@/lib/store";
import { formatQty } from "@/lib/execution-reports";
import { ContractTypeahead } from "@/components/contract-typeahead";
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

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="max-w-xl shrink-0">
        <ContractTypeahead
          contracts={data.contracts}
          value={contractId}
          onChange={(id) => {
            setMsg(null);
            onContractChange(id);
          }}
          optionSuffix={(c) => {
            const n = data.deliveryChallans.filter(
              (dc) => dc.contractId === c.id
            ).length;
            return n ? `${n} DC${n === 1 ? "" : "s"}` : null;
          }}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <FormMessage msg={msg} />

      {canEdit && contract && hasLeftToSupply && (
        <AddDcForm
          key={contract.id}
          data={data}
          contractId={contract.id}
          actorName={actorName}
          onResult={setMsg}
        />
      )}
      {canEdit && contract && !hasLeftToSupply && contract.boq.length > 0 && (
        <p className="rounded-lg border border-[var(--fh-line)] px-4 py-3 text-sm text-[var(--fh-muted)]">
          All BOQ qty for this contract is already on DCs — nothing left to
          supply.
        </p>
      )}
      {canEdit && contract && contract.boq.length === 0 && (
        <p className="rounded-lg border border-[var(--fh-line)] px-4 py-3 text-sm text-[var(--fh-muted)]">
          This contract has no BOQ items — add BOQ before recording a DC.
        </p>
      )}
      </div>
    </div>
  );
}

function AddDcForm({
  data,
  contractId,
  actorName,
  onResult,
}: {
  data: FlowhubData;
  contractId: string;
  actorName: string;
  onResult: (m: Msg) => void;
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
    await flushWorkspace();
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
      className="space-y-4 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)]/50 p-4"
    >
      <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
        Add delivery challan
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
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
        <div className="space-y-1">
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
      </div>

      <ReportsTableScroll className="max-h-72 flex-none bg-white">
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

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
        >
          {saving ? "Saving…" : "Save DC"}
        </Button>
      </div>
    </form>
  );
}
