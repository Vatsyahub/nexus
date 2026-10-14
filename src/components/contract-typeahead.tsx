"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Contract } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function labelFor(c: Contract): string {
  return `${c.projectNo} · ${c.projectName}`;
}

function matches(c: Contract, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    c.projectNo.toLowerCase().includes(needle) ||
    c.projectName.toLowerCase().includes(needle) ||
    (c.city || "").toLowerCase().includes(needle)
  );
}

export function ContractTypeahead({
  contracts,
  value,
  onChange,
  label = "Contract",
  placeholder = "Type contract no. or name…",
  emptyMessage = "No contracts match.",
  disabled,
  optionSuffix,
}: {
  contracts: Contract[];
  value: string;
  onChange: (contractId: string) => void;
  label?: string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Extra text after the contract label in the dropdown (e.g. schedule exists). */
  optionSuffix?: (c: Contract) => string | null;
}) {
  const selected = contracts.find((c) => c.id === value) ?? null;
  const [query, setQuery] = useState(selected ? labelFor(selected) : "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setQuery(labelFor(selected));
    else if (!value) setQuery("");
  }, [selected, value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    return contracts.filter((c) => matches(c, query)).slice(0, 40);
  }, [contracts, query]);

  function pick(c: Contract) {
    onChange(c.id);
    setQuery(labelFor(c));
    setOpen(false);
  }

  function onInputChange(next: string) {
    setQuery(next);
    setOpen(true);
    if (selected && labelFor(selected) !== next) {
      onChange("");
    }
  }

  return (
    <div ref={rootRef} className="relative space-y-1">
      <Label htmlFor="contract-typeahead">{label}</Label>
      <Input
        id="contract-typeahead"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        className="bg-white"
      />
      {open && !disabled && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--fh-line)] bg-white py-1 shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--fh-muted)]">
              {emptyMessage}
            </li>
          ) : (
            filtered.map((c) => {
              const suffix = optionSuffix?.(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.id === value}
                    className={cn(
                      "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--fh-bg)]",
                      c.id === value && "bg-[var(--fh-accent)]/15"
                    )}
                    onClick={() => pick(c)}
                  >
                    <span className="font-medium text-[var(--fh-steel)]">
                      {c.projectNo}
                    </span>
                    <span className="text-xs text-[var(--fh-muted)]">
                      {c.projectName}
                      {suffix ? ` · ${suffix}` : ""}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
