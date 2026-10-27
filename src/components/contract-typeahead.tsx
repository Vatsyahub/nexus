"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Contract } from "@/lib/types";
import {
  ADD_CONTRACT_MATCH_LIMIT,
  matchingAddContracts,
} from "@/lib/add-contract-matches";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function labelFor(c: Contract): string {
  return `${c.projectNo} · ${c.projectName}`;
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
  maxMatches = ADD_CONTRACT_MATCH_LIMIT,
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
  /**
   * How many matches to show after a project number or name is typed.
   * An empty click or focus shows nothing.
   */
  maxMatches?: number;
}) {
  const selected = contracts.find((c) => c.id === value) ?? null;
  const [query, setQuery] = useState(selected ? labelFor(selected) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const chosenLabel = useRef<string | null>(selected ? labelFor(selected) : null);

  useEffect(() => {
    if (selected) {
      const label = labelFor(selected);
      chosenLabel.current = label;
      setQuery(label);
      return;
    }
    if (!value) {
      setQuery((current) => (current === chosenLabel.current ? "" : current));
      chosenLabel.current = null;
    }
  }, [selected, value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(
    () => matchingAddContracts(contracts, query, maxMatches),
    [contracts, maxMatches, query]
  );

  function showingChosen(text: string): boolean {
    return !!selected && text === labelFor(selected);
  }

  function canSuggest(text: string): boolean {
    return text.trim().length > 0 && !showingChosen(text);
  }

  function pick(c: Contract) {
    onChange(c.id);
    setQuery(labelFor(c));
    setOpen(false);
    setActive(-1);
  }

  function onInputChange(next: string) {
    setQuery(next);
    setActive(-1);
    if (selected && labelFor(selected) !== next) {
      onChange("");
    }
    setOpen(next.trim().length > 0 && !(selected && next === labelFor(selected)));
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const inEntry = !!rootRef.current?.closest("[data-entry]");
    const ignored = !!rootRef.current?.closest("[data-entry-ignore]");
    if (!inEntry || ignored) return;
    if (!canSuggest(query)) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => {
        if (filtered.length === 0) return -1;
        return i < 0 ? 0 : (i + 1) % filtered.length;
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => {
        if (filtered.length === 0) return -1;
        return i < 0 ? filtered.length - 1 : (i - 1 + filtered.length) % filtered.length;
      });
      return;
    }
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === "Enter" && open && active >= 0 && filtered[active]) {
      e.preventDefault();
      e.stopPropagation();
      pick(filtered[active]);
    }
  }

  const listOpen = open && !disabled && canSuggest(query);

  return (
    <div ref={rootRef} className="relative space-y-1" data-suggest="">
      <Label htmlFor="contract-typeahead">{label}</Label>
      <Input
        id="contract-typeahead"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => {
          if (!canSuggest(query)) return;
          setOpen(true);
        }}
        onKeyDown={onInputKeyDown}
        onBlur={() => {
          window.setTimeout(() => {
            if (!rootRef.current?.contains(document.activeElement)) {
              setOpen(false);
              setActive(-1);
            }
          }, 0);
        }}
        className="bg-white"
      />
      {listOpen && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--fh-line)] bg-white py-1 shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--fh-muted)]">
              {emptyMessage}
            </li>
          ) : (
            filtered.map((c, index) => {
              const suffix = optionSuffix?.(c);
              const highlighted = index === active;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.id === value}
                    data-active={highlighted ? "true" : undefined}
                    className={cn(
                      "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--fh-bg)]",
                      c.id === value && "bg-[var(--fh-accent)]/15",
                      highlighted && "bg-[var(--fh-bg)]"
                    )}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(e) => e.preventDefault()}
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
