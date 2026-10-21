"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  flushWorkspace,
  leftToSupplyQty,
  setNexusSpend,
  suppliedQty,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { defaultAccess, levelForPath, mayMutate } from "@/lib/access";
import { formatQty } from "@/lib/execution-reports";
import { normalizeNexusCosts } from "@/lib/nexus-core";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import type { BoqItem, FlowhubData } from "@/lib/types";
import { cn } from "@/lib/utils";

const entryRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default function AddCostsPage() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { data: session } = useSession();
  const access =
    session?.user?.access ?? defaultAccess(session?.user?.clearance ?? "user");
  const canEdit = mayMutate(levelForPath("/nexus-core/costs/add", access));
  const costs = useMemo(() => normalizeNexusCosts(data.nexusCosts), [data]);
  const [contractId, setContractId] = useState("");
  const [draftSpent, setDraftSpent] = useState<number | null | undefined>(
    undefined
  );
  const [draftYet, setDraftYet] = useState<number | null | undefined>(
    undefined
  );

  const contracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );
  const contract = contracts.find((c) => c.id === contractId) ?? null;
  const entry = contract ? costs.contracts[contract.id] : undefined;
  const spentShown =
    draftSpent !== undefined ? (draftSpent ?? 0) : (entry?.spent ?? 0);
  const yetShown =
    draftYet !== undefined ? (draftYet ?? 0) : (entry?.yetToSpend ?? 0);
  const totalShown = spentShown + yetShown;

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
        <HubDataScroll className="space-y-4">
          <section className="rounded-xl border border-[var(--fh-line)] bg-white p-4">
            <div className="max-w-xl">
              <ContractTypeahead
                contracts={contracts}
                value={contract?.id ?? ""}
                onChange={(id) => {
                  setContractId(id);
                  setDraftSpent(undefined);
                  setDraftYet(undefined);
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
            <section className="overflow-hidden rounded-xl border border-[var(--fh-line)] bg-white">
              <dl className="grid grid-cols-1 gap-px bg-[var(--fh-line)] sm:grid-cols-2 lg:grid-cols-5">
                <Readout label="Project name" value={contract.projectName} />
                <Readout label="Project number" value={contract.projectNo} />
                <div className="bg-white px-3 py-3 sm:px-4">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                    Spent
                  </dt>
                  <dd className="mt-1">
                    {canEdit ? (
                      <RupeeInput
                        key={`${contract.id}-spent`}
                        value={entry?.spent ?? null}
                        ariaLabel="Spent in rupees"
                        onDraft={setDraftSpent}
                        onCommit={async (amount) => {
                          setDraftSpent(amount);
                          setNexusSpend(contract.id, "spent", amount);
                          await flushWorkspace();
                        }}
                      />
                    ) : (
                      <AmountText value={entry?.spent ?? null} />
                    )}
                  </dd>
                </div>
                <div className="bg-white px-3 py-3 sm:px-4">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                    Yet to spend
                  </dt>
                  <dd className="mt-1">
                    {canEdit ? (
                      <RupeeInput
                        key={`${contract.id}-yet`}
                        value={entry?.yetToSpend ?? null}
                        ariaLabel="Yet to spend in rupees"
                        onDraft={setDraftYet}
                        onCommit={async (amount) => {
                          setDraftYet(amount);
                          setNexusSpend(contract.id, "yetToSpend", amount);
                          await flushWorkspace();
                        }}
                      />
                    ) : (
                      <AmountText value={entry?.yetToSpend ?? null} />
                    )}
                  </dd>
                </div>
                <Readout
                  label="Total cost"
                  value={entryRupees.format(totalShown)}
                />
              </dl>
              <BoqList contractId={contract.id} items={contract.boq} data={data} />
            </section>
          )}
        </HubDataScroll>
      )}
    </HubPage>
  );
}

function BoqList({
  contractId,
  items,
  data,
}: {
  contractId: string;
  items: BoqItem[];
  data: FlowhubData;
}) {
  return (
    <div className="border-t border-[var(--fh-line)]">
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--fh-muted)]">No BOQ items.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--fh-line)]">
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)] sm:px-4">
                  Item
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)] sm:px-4">
                  Rate
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)] sm:px-4">
                  BOQ qty
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)] sm:px-4">
                  Supplied qty
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)] sm:px-4">
                  Left to supply qty
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--fh-line)] last:border-b-0">
                  <td className="px-3 py-2 sm:px-4">
                    <span className="font-medium text-[var(--fh-steel)]">
                      {item.name}
                    </span>
                    <span className="block text-xs text-[var(--fh-muted)]">
                      {item.unit}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--fh-ink)] sm:px-4">
                    {entryRupees.format(Number(item.rate) || 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--fh-ink)] sm:px-4">
                    {formatQty(Number(item.quantity) || 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--fh-ink)] sm:px-4">
                    {formatQty(suppliedQty(contractId, item.id, data))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--fh-ink)] sm:px-4">
                    {formatQty(leftToSupplyQty(contractId, item.id, data))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-3 sm:px-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
        {label}
      </dt>
      <dd className="mt-1 break-words font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
        {value}
      </dd>
    </div>
  );
}

function AmountText({ value }: { value: number | null }) {
  return (
    <p className="text-sm tabular-nums text-[var(--fh-steel)]">
      {value == null ? "—" : entryRupees.format(value)}
    </p>
  );
}

function RupeeInput({
  value,
  onCommit,
  onDraft,
  ariaLabel,
}: {
  value: number | null;
  onCommit: (amount: number | null) => Promise<void>;
  onDraft: (amount: number | null | undefined) => void;
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
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const trimmed = next.trim().replace(/,/g, "");
        if (!trimmed) {
          onDraft(null);
          return;
        }
        const n = Number(trimmed);
        if (Number.isFinite(n)) onDraft(n);
      }}
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
