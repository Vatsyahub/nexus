"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  addNexusCostColumn,
  flushWorkspace,
  removeNexusCostColumn,
  setNexusBoqRate,
  setNexusDirectCost,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { defaultAccess, levelForPath, mayMutate } from "@/lib/access";
import {
  boqLineCost,
  contractCostAmount,
  contractUsesBoqCost,
  formatCoreMoney,
  normalizeNexusCosts,
} from "@/lib/nexus-core";
import { confirmAction } from "@/components/confirm-panel";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";

export default function AddCostsPage() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { data: session } = useSession();
  const access =
    session?.user?.access ?? defaultAccess(session?.user?.clearance ?? "user");
  const canEdit = mayMutate(levelForPath("/nexus-core/costs/add", access));
  const costs = useMemo(() => normalizeNexusCosts(data.nexusCosts), [data]);
  const [header, setHeader] = useState("");
  const [columnError, setColumnError] = useState<string | null>(null);
  const [contractId, setContractId] = useState("");
  const [boqOpen, setBoqOpen] = useState(false);

  const contracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );
  const contract = contracts.find((c) => c.id === contractId) ?? null;
  const entry = contract ? costs.contracts[contract.id] : undefined;
  const fromBoq = contract ? contractUsesBoqCost(contract, costs) : false;
  const usedCost = contract ? contractCostAmount(contract, costs) : 0;

  async function onAddColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const result = addNexusCostColumn(header);
    if (!result.ok) {
      setColumnError(result.error);
      return;
    }
    setHeader("");
    setColumnError(null);
    await flushWorkspace();
  }

  async function onRemoveColumn(id: string, name: string) {
    if (!canEdit) return;
    if (
      !(await confirmAction({
        message: `Remove the “${name}” cost column from every contract?`,
        action: "Remove",
      }))
    ) {
      return;
    }
    removeNexusCostColumn(id);
    await flushWorkspace();
  }

  return (
    <HubPage>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            Nexus Core
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Add costs
          </h1>
        </div>
        <Link
          href="/nexus-core/costs"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to Cost centre
        </Link>
      </div>

      {!ready ? (
        <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
          Loading workspace from server…
        </p>
      ) : (
        <HubDataScroll className="space-y-6">
          <section className="rounded-xl border border-[var(--fh-line)] bg-[var(--fh-panel)] p-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
              Cost columns
            </h2>
            {canEdit && (
              <form
                onSubmit={(e) => void onAddColumn(e)}
                className="mt-3 flex flex-wrap items-center gap-2"
              >
                <Input
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  placeholder="Column header"
                  aria-label="New cost column header"
                  className="max-w-xs bg-white"
                  maxLength={40}
                />
                <Button type="submit" size="sm" className="bg-[var(--fh-steel)]">
                  Add column
                </Button>
              </form>
            )}
            {columnError && (
              <p className="mt-2 text-sm text-[var(--destructive)]" role="alert">
                {columnError}
              </p>
            )}
            {costs.columns.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {costs.columns.map((col) => (
                  <li
                    key={col.id}
                    className="flex items-center gap-1 rounded-md border border-[var(--fh-line)] bg-white px-2 py-1 text-sm"
                  >
                    <span>{col.header}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="text-[var(--fh-muted)] hover:text-[var(--destructive)]"
                        aria-label={`Remove ${col.header}`}
                        onClick={() => void onRemoveColumn(col.id, col.header)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--fh-muted)]">
                No cost columns yet.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-[var(--fh-line)] bg-white p-4">
            <div className="max-w-xl">
              <ContractTypeahead
                contracts={contracts}
                value={contract?.id ?? ""}
                onChange={(id) => {
                  setContractId(id);
                  setBoqOpen(false);
                }}
                label="Contract"
                placeholder="Type project number, name, or city…"
              />
            </div>
            {!contract && (
              <p className="mt-3 text-sm text-[var(--fh-muted)]">
                {contracts.length === 0
                  ? "No contracts yet."
                  : "Select a contract to enter its cost."}
              </p>
            )}
          </section>

          {contract && (
            <section className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-[var(--fh-panel)] p-4">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
                  Direct cost
                </h2>
              </div>
              <div className="max-w-xs">
                {canEdit ? (
                  <RupeeInput
                    key={contract.id}
                    value={entry?.directCost ?? null}
                    ariaLabel="Direct contract cost in rupees"
                    onCommit={async (amount) => {
                      setNexusDirectCost(contract.id, amount);
                      await flushWorkspace();
                    }}
                  />
                ) : (
                  <p className="text-sm tabular-nums text-[var(--fh-steel)]">
                    {entry?.directCost == null ? "—" : String(entry.directCost)}
                  </p>
                )}
              </div>
              <p className="text-sm text-[var(--fh-steel)]">
                Contract cost used{" "}
                <span className="font-semibold tabular-nums">
                  {formatCoreMoney(usedCost)}
                </span>
                {fromBoq
                  ? " from BOQ line totals. The typed cost is kept and not used."
                  : ". No BOQ rate yet, so the typed cost is used."}
              </p>

              <div className="border-t border-[var(--fh-line)] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
                    BOQ items
                  </h2>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[var(--fh-steel)]"
                    aria-expanded={boqOpen}
                    onClick={() => setBoqOpen((open) => !open)}
                  >
                    {boqOpen ? "Hide BOQ items" : "Open BOQ items"}
                  </Button>
                </div>
                {boqOpen && (
                  <BoqLines
                    contractId={contract.id}
                    canEdit={canEdit}
                    columns={costs.columns}
                    lineRates={entry?.lineRates ?? {}}
                    boq={contract.boq}
                  />
                )}
              </div>
            </section>
          )}
        </HubDataScroll>
      )}
    </HubPage>
  );
}

function BoqLines({
  contractId,
  canEdit,
  columns,
  lineRates,
  boq,
}: {
  contractId: string;
  canEdit: boolean;
  columns: { id: string; header: string }[];
  lineRates: Record<string, Record<string, number>>;
  boq: { id: string; name: string; unit: string; quantity: number }[];
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[11px] text-[var(--fh-muted)]">
        Line rate is the sum of that line&apos;s column rates. Line total is
        line rate × quantity. A filled rate replaces the typed contract cost.
      </p>
      {boq.length === 0 ? (
        <p className="rounded-lg border border-[var(--fh-line)] bg-white px-3 py-6 text-center text-sm text-[var(--fh-muted)]">
          No BOQ lines on this contract.
        </p>
      ) : columns.length === 0 ? (
        <p className="rounded-lg border border-[var(--fh-line)] bg-white px-3 py-6 text-center text-sm text-[var(--fh-muted)]">
          Add a cost column to enter rates per unit.
        </p>
      ) : (
        <ol className="space-y-4">
          {boq.map((line, index) => {
            const calc = boqLineCost(line, columns, lineRates[line.id]);
            return (
              <li
                key={line.id}
                className="overflow-hidden rounded-xl border border-[var(--fh-line)] bg-white"
              >
                <div className="flex min-w-0">
                  <div
                    className="w-1.5 shrink-0 bg-[var(--fh-accent)]"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--fh-steel)] font-[family-name:var(--font-display)] text-base font-semibold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium text-[var(--fh-steel)]">
                          {line.name}
                        </p>
                        {line.unit ? (
                          <p className="text-xs text-[var(--fh-muted)]">
                            {line.unit}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                          Qty
                        </p>
                        <p className="tabular-nums text-[var(--fh-steel)]">
                          {line.quantity}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {columns.map((col) => (
                        <label key={col.id} className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                            {col.header}
                          </span>
                          {canEdit ? (
                            <RupeeInput
                              value={lineRates[line.id]?.[col.id] ?? null}
                              ariaLabel={`${col.header} rate for ${line.name}`}
                              onCommit={async (amount) => {
                                setNexusBoqRate(
                                  contractId,
                                  line.id,
                                  col.id,
                                  amount
                                );
                                await flushWorkspace();
                              }}
                            />
                          ) : (
                            <p className="text-sm tabular-nums">
                              {lineRates[line.id]?.[col.id] ?? "—"}
                            </p>
                          )}
                        </label>
                      ))}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--fh-line)] pt-3">
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                          Line rate
                        </dt>
                        <dd className="mt-0.5 font-[family-name:var(--font-display)] text-lg tabular-nums text-[var(--fh-steel)]">
                          {formatCoreMoney(calc.lineRate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                          Line total
                        </dt>
                        <dd className="mt-0.5 font-[family-name:var(--font-display)] text-lg tabular-nums text-[var(--fh-steel)]">
                          {formatCoreMoney(calc.lineTotal)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RupeeInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number | null;
  onCommit: (amount: number | null) => Promise<void>;
  ariaLabel: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value == null ? "" : String(value));
  }, [value, focused]);

  return (
    <Input
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const trimmed = text.trim().replace(/,/g, "");
        if (!trimmed) {
          void onCommit(null);
          return;
        }
        const n = Number(trimmed);
        if (!Number.isFinite(n)) {
          setText(value == null ? "" : String(value));
          return;
        }
        void onCommit(n);
      }}
      className="bg-white"
      placeholder="Rs"
    />
  );
}
