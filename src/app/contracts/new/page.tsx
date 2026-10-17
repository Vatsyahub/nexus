"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addContract,
  rememberCatalogItem,
  useFlowhubData,
} from "@/lib/store";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import {
  DLP_MONTHS_MAX,
  DLP_MONTHS_MIN,
  DLP_MONTHS_RANGE_MESSAGE,
  acceptedDlpMonths,
} from "@/lib/dlp-months";
import {
  addCustomBillingTerm,
  billingTermLabel,
  billingTermsTotalIs100,
  deleteCustomBillingTerm,
  isBuiltinBillingTerm,
  renameCustomBillingTerm,
  startingBillingTerms,
} from "@/lib/billing-terms";
import {
  DEFAULT_TDS_PERCENT,
  GST_RATE,
  orderedBillingTermKeys,
  type BoqItem,
  type BillingTerms,
} from "@/lib/types";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DeleteIconButton, EditIconButton } from "@/components/icon-actions";

function uid() {
  return crypto.randomUUID();
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

type CatalogHit = { name: string; unit: string; lastRate: number };

export default function NewContractPage() {
  const router = useRouter();
  const data = useFlowhubData();
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestActive, setSuggestActive] = useState(-1);

  const [projectName, setProjectName] = useState("");
  const [projectNo, setProjectNo] = useState("");
  const [orderNos, setOrderNos] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [closureDate, setClosureDate] = useState("");
  const [orderValue, setOrderValue] = useState("");
  const [gstApplicable, setGstApplicable] = useState(true);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("India");
  const [paymentDueDays, setPaymentDueDays] = useState("30");
  const [retentionPercent, setRetentionPercent] = useState("0");
  const [tdsPercent, setTdsPercent] = useState(String(DEFAULT_TDS_PERCENT));
  const [dlpMonths, setDlpMonths] = useState("12");
  const [boqWarn, setBoqWarn] = useState(false);
  const [terms, setTerms] = useState<BillingTerms>(() => startingBillingTerms());
  const [customTermName, setCustomTermName] = useState("");
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [termError, setTermError] = useState<string | null>(null);
  const [abgRequired, setAbgRequired] = useState(false);
  const [abgPercent, setAbgPercent] = useState("");
  const [pbgRequired, setPbgRequired] = useState(false);
  const [pbgPercent, setPbgPercent] = useState("");

  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [editingBoqId, setEditingBoqId] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemUnit, setItemUnit] = useState("Nos");
  const [itemRate, setItemRate] = useState("");
  const [itemQty, setItemQty] = useState("");

  const termsTotal = useMemo(
    () => Object.values(terms).reduce((a, b) => a + (Number(b) || 0), 0),
    [terms]
  );

  const boqTotal = useMemo(
    () => boq.reduce((s, l) => s + l.rate * l.quantity, 0),
    [boq]
  );

  const orderValueNum = Number(orderValue) || 0;
  const hasAdvance = (terms.advance || 0) > 0;
  const valueMatch =
    orderValueNum > 0 && Math.abs(boqTotal - orderValueNum) < 0.01;

  /** Catalog from prior contracts + lines already on this BOQ */
  const itemCatalog = useMemo(() => {
    const map = new Map<string, CatalogHit>();
    for (const c of data.itemCatalog) {
      map.set(c.key, { name: c.name, unit: c.unit, lastRate: c.lastRate });
    }
    for (const line of boq) {
      const key = line.catalogKey || line.name.toLowerCase();
      map.set(key, { name: line.name, unit: line.unit, lastRate: line.rate });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.itemCatalog, boq]);

  /** Prefix match → first 3 alphabetical choices */
  const topMatches = useMemo(() => {
    const q = itemName.trim().toLowerCase();
    if (!q) return [] as CatalogHit[];
    return itemCatalog
      .filter((c) => c.name.toLowerCase().startsWith(q))
      .slice(0, 3);
  }, [itemCatalog, itemName]);

  function pickCatalog(hit: CatalogHit) {
    setItemName(hit.name);
    setItemUnit(hit.unit);
    setItemRate(String(hit.lastRate));
    setShowSuggestions(false);
  }

  function clearBoqEditor() {
    setEditingBoqId(null);
    setItemName("");
    setItemUnit("Nos");
    setItemRate("");
    setItemQty("");
    setShowSuggestions(false);
  }

  function startEditBoq(line: BoqItem) {
    setEditingBoqId(line.id);
    setItemName(line.name);
    setItemUnit(line.unit);
    setItemRate(String(line.rate));
    setItemQty(String(line.quantity));
    setShowSuggestions(false);
    setError(null);
  }

  function saveBoqLine() {
    const rate = Number(itemRate);
    const quantity = Number(itemQty);
    if (!itemName.trim() || !rate || !quantity) {
      setError("Enter item name, rate, and quantity.");
      return;
    }
    const nextLine: BoqItem = {
      id: editingBoqId ?? uid(),
      catalogKey: itemName.trim().toLowerCase(),
      name: itemName.trim(),
      unit: itemUnit.trim() || "Nos",
      rate,
      quantity,
    };
    setBoq((prev) =>
      editingBoqId
        ? prev.map((l) => (l.id === editingBoqId ? nextLine : l))
        : [...prev, nextLine]
    );
    rememberCatalogItem(nextLine.name, nextLine.unit, nextLine.rate);
    clearBoqEditor();
    setError(null);
  }

  function addCustomTerm() {
    const result = addCustomBillingTerm(terms, customTermName);
    if (!result.ok) {
      if (customTermName.trim()) setTermError(result.error);
      return;
    }
    setTerms(result.terms);
    setCustomTermName("");
    setTermError(null);
  }

  function renameCustomTerm(fromKey: string) {
    const result = renameCustomBillingTerm(
      terms,
      fromKey,
      renameDrafts[fromKey] ?? ""
    );
    if (!result.ok) {
      setTermError(result.error);
      return;
    }
    setTerms(result.terms);
    setRenameDrafts((prev) => {
      const next = { ...prev };
      delete next[fromKey];
      return next;
    });
    setTermError(null);
  }

  function deleteCustomTerm(key: string) {
    const result = deleteCustomBillingTerm(terms, key);
    if (!result.ok) {
      setTermError(result.error);
      return;
    }
    setTerms(result.terms);
    setRenameDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setTermError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!projectName || !projectNo || !orderNos || !orderDate || !closureDate || !orderValue) {
      setError("Fill project, order dates, and value fields.");
      return;
    }
    if (!city || !state || !country) {
      setError("Enter city, state, and country.");
      return;
    }
    const retention = Number(retentionPercent);
    if (Number.isNaN(retention) || retention < 0 || retention > 10) {
      setError("Retention must be between 0% and 10%.");
      return;
    }
    const tds = Number(tdsPercent);
    if (Number.isNaN(tds) || tds < 0 || tds > 100) {
      setError("TDS % must be between 0 and 100.");
      return;
    }
    const dlp = acceptedDlpMonths(dlpMonths);
    if (dlp == null) {
      setError(DLP_MONTHS_RANGE_MESSAGE);
      return;
    }
    const dueDays = Number(paymentDueDays);
    if (!Number.isInteger(dueDays) || dueDays < 3 || dueDays > 45) {
      setError("Payment due days must be between 3 and 45.");
      return;
    }
    if (!billingTermsTotalIs100(terms)) {
      setError(`Billing terms must total 100% (currently ${termsTotal}%).`);
      return;
    }
    if (boq.length === 0) {
      setError("Add at least one BOQ line.");
      return;
    }
    if (!valueMatch && !boqWarn) {
      setBoqWarn(true);
      setError(
        `BOQ total ${formatMoney(boqTotal)} does not match order value ${formatMoney(orderValueNum)}. Save again to continue anyway.`
      );
      return;
    }
    if (hasAdvance && abgRequired && !(Number(abgPercent) > 0)) {
      setError("Enter ABG % or turn ABG off.");
      return;
    }
    if (pbgRequired && !(Number(pbgPercent) > 0)) {
      setError("Enter PBG % or turn PBG off.");
      return;
    }

    const duplicate = data.contracts.some(
      (c) => c.projectNo.trim().toLowerCase() === projectNo.trim().toLowerCase()
    );
    if (duplicate) {
      setError("Project no. must be unique — that number already exists.");
      return;
    }

    try {
      const { contract } = addContract({
        projectName: projectName.trim(),
        projectNo: projectNo.trim(),
        orderNos: orderNos.trim(),
        orderDate,
        closureDate,
        orderValue: orderValueNum,
        gstApplicable,
        city: city.trim(),
        state: state.trim(),
        country: country.trim(),
        billingTerms: terms,
        paymentDueDays: dueDays,
        retentionPercent: retention,
        tdsPercent: tds,
        dlpMonths: dlp,
        abgRequired: hasAdvance ? abgRequired : false,
        abgPercent: hasAdvance && abgRequired ? Number(abgPercent) : null,
        abgValue: null,
        pbgRequired,
        pbgPercent: pbgRequired ? Number(pbgPercent) : null,
        pbgValue: null,
        contractorAssigned: "",
        boq,
      });

      // Ensure Postgres has the contract before we leave the page
      const saved = await confirmWorkspaceSave();
      if (!saved) return;
      router.push(`/contracts/${contract.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create contract. Try again."
      );
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          New contract
        </h1>
      </div>

      <form
        onSubmit={submit}
        {...entryRootProps}
        className="space-y-8 rounded-xl border border-[var(--fh-line)] bg-white p-5 sm:p-6"
      >
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" value={projectName} onChange={setProjectName} required />
          <Field label="Project no." value={projectNo} onChange={setProjectNo} required />
          <Field label="Order no. / nos" value={orderNos} onChange={setOrderNos} required />
          <div className="space-y-2">
            <Label>Order date</Label>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Closure date</Label>
            <Input
              type="date"
              value={closureDate}
              onChange={(e) => setClosureDate(e.target.value)}
              required
            />
          </div>
          <Field
            label="Order value (before GST)"
            value={orderValue}
            onChange={(v) => {
              setOrderValue(v);
              setBoqWarn(false);
            }}
            type="number"
            required
          />
          <div className="flex items-end gap-3 pb-2">
            <Checkbox
              id="gst"
              checked={gstApplicable}
              onCheckedChange={(v) => setGstApplicable(v === true)}
            />
            <Label htmlFor="gst" className="leading-snug">
              GST applicable (auto 18%)
              {gstApplicable && orderValueNum > 0 && (
                <span className="mt-1 block text-xs text-[var(--fh-muted)]">
                  With GST: {formatMoney(orderValueNum * (1 + GST_RATE))}
                </span>
              )}
            </Label>
          </div>
          <Field label="City" value={city} onChange={setCity} required />
          <Field label="State" value={state} onChange={setState} required />
          <Field label="Country" value={country} onChange={setCountry} required />
          <Field
            label="Payment due days (3–45)"
            value={paymentDueDays}
            onChange={setPaymentDueDays}
            type="number"
            required
          />
          <Field
            label="Retention % (0–10)"
            value={retentionPercent}
            onChange={setRetentionPercent}
            type="number"
            required
          />
          <Field
            label="TDS % (default 2)"
            value={tdsPercent}
            onChange={setTdsPercent}
            type="number"
            required
          />
          <Field
            label={`DLP period (months, ${DLP_MONTHS_MIN}–${DLP_MONTHS_MAX})`}
            value={dlpMonths}
            onChange={setDlpMonths}
            type="number"
            required
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
              Payment / billing terms
            </h2>
            <Badge variant={Math.abs(termsTotal - 100) < 0.01 ? "default" : "destructive"}>
              Total {termsTotal}%
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {orderedBillingTermKeys(terms).map((key) => {
              const label = billingTermLabel(key);
              const custom = !isBuiltinBillingTerm(key);
              return (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={terms[key]}
                    aria-label={`${label} percent`}
                    onChange={(e) =>
                      setTerms((t) => ({ ...t, [key]: Number(e.target.value) }))
                    }
                  />
                  {custom && (
                    <div className="flex flex-wrap gap-2">
                      <Input
                        placeholder="Rename term"
                        value={renameDrafts[key] ?? ""}
                        aria-label={`Rename ${label}`}
                        onChange={(e) =>
                          setRenameDrafts((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="max-w-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => renameCustomTerm(key)}
                      >
                        Rename
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => deleteCustomTerm(key)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Add custom term name"
              value={customTermName}
              onChange={(e) => setCustomTermName(e.target.value)}
              className="max-w-xs"
            />
            <Button type="button" variant="outline" onClick={addCustomTerm}>
              Add term
            </Button>
          </div>
          {termError && (
            <p
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {termError}
            </p>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {hasAdvance && (
            <div className="space-y-3 rounded-lg border border-[var(--fh-line)] p-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="abg"
                  checked={abgRequired}
                  onCheckedChange={(v) => setAbgRequired(v === true)}
                />
                <Label htmlFor="abg">ABG required</Label>
              </div>
              {abgRequired && (
                <div className="space-y-2">
                  <Field label="ABG %" value={abgPercent} onChange={setAbgPercent} type="number" />
                  {Number(abgPercent) > 0 && orderValueNum > 0 && (
                    <p className="text-xs text-[var(--fh-muted)]">
                      Value: {formatMoney((orderValueNum * Number(abgPercent)) / 100)} (from order value)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="space-y-3 rounded-lg border border-[var(--fh-line)] p-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="pbg"
                checked={pbgRequired}
                onCheckedChange={(v) => setPbgRequired(v === true)}
              />
              <Label htmlFor="pbg">PBG required</Label>
            </div>
            {pbgRequired && (
              <div className="space-y-2">
                <Field label="PBG %" value={pbgPercent} onChange={setPbgPercent} type="number" />
                {Number(pbgPercent) > 0 && orderValueNum > 0 && (
                  <p className="text-xs text-[var(--fh-muted)]">
                    Value: {formatMoney((orderValueNum * Number(pbgPercent)) / 100)} (from order value)
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
              BOQ
            </h2>
            <Badge variant={valueMatch ? "default" : "secondary"}>
              BOQ {formatMoney(boqTotal)} / Order {formatMoney(orderValueNum)}
            </Badge>
          </div>

          <div className="relative space-y-2">
            <Label htmlFor="itemName">Item name</Label>
            <Input
              id="itemName"
              placeholder="Start typing to match previous items"
              value={itemName}
              autoComplete="off"
              onChange={(e) => {
                const v = e.target.value;
                setItemName(v);
                setShowSuggestions(true);
                setSuggestActive(-1);
                const exact = itemCatalog.find(
                  (c) => c.name.toLowerCase() === v.trim().toLowerCase()
                );
                if (exact) {
                  setItemUnit(exact.unit);
                  setItemRate(String(exact.lastRate));
                }
              }}
              onKeyDown={(e) => {
                if (topMatches.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setShowSuggestions(true);
                  setSuggestActive((i) =>
                    i < 0 ? 0 : (i + 1) % topMatches.length
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setShowSuggestions(true);
                  setSuggestActive((i) =>
                    i <= 0 ? topMatches.length - 1 : i - 1
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setShowSuggestions(false);
                  setSuggestActive(-1);
                  return;
                }
                if (
                  e.key === "Enter" &&
                  showSuggestions &&
                  suggestActive >= 0 &&
                  topMatches[suggestActive]
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  pickCatalog(topMatches[suggestActive]);
                  setSuggestActive(-1);
                }
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Allow click on suggestion before closing
                window.setTimeout(() => setShowSuggestions(false), 150);
              }}
            />
            {showSuggestions && topMatches.length > 0 && (
              <ul
                className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-[var(--fh-line)] bg-white shadow-md"
                role="listbox"
              >
                {topMatches.map((hit, index) => (
                  <li key={hit.name}>
                    <button
                      type="button"
                      role="option"
                      data-active={index === suggestActive ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--fh-bg)]${
                        index === suggestActive ? " bg-[var(--fh-bg)]" : ""
                      }`}
                      onMouseEnter={() => setSuggestActive(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        pickCatalog(hit);
                        setSuggestActive(-1);
                      }}
                    >
                      <span className="font-medium text-[var(--fh-steel)]">{hit.name}</span>
                      <span className="text-xs text-[var(--fh-muted)]">
                        {hit.unit} · {formatMoney(hit.lastRate)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Unit" value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} />
            <Input
              placeholder="Rate"
              type="number"
              value={itemRate}
              onChange={(e) => setItemRate(e.target.value)}
            />
            <Input
              placeholder="Qty"
              type="number"
              value={itemQty}
              onChange={(e) => setItemQty(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={saveBoqLine}>
              {editingBoqId ? "Save BOQ changes" : "Add BOQ line"}
            </Button>
            {editingBoqId && (
              <Button type="button" variant="ghost" onClick={clearBoqEditor}>
                Cancel edit
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--fh-line)]">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {boq.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-3 text-[var(--fh-muted)]">
                      No lines yet
                    </td>
                  </tr>
                ) : (
                  boq.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 font-medium">{l.name}</td>
                      <td className="px-3 py-2">{l.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(l.rate)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatMoney(l.rate * l.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <EditIconButton onClick={() => startEditBoq(l)} />
                        <DeleteIconButton
                          onClick={() => {
                            setBoq((b) => b.filter((x) => x.id !== l.id));
                            if (editingBoqId === l.id) clearBoqEditor();
                          }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {error && (
          <p
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          {...entrySaveProps}
          className="bg-[var(--fh-steel)] hover:bg-[#244a5e]"
        >
          {boqWarn && !valueMatch
            ? "Save anyway"
            : "Create contract & kickoff task"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}
