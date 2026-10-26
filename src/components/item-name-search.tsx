"use client";

import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format-money";
import { matchingItemNames } from "@/lib/item-name-matches";
import { cn } from "@/lib/utils";

function choiceDetail(item: { unit?: string; lastRate?: number }): string | null {
  const parts: string[] = [];
  if (item.unit) parts.push(item.unit);
  if (typeof item.lastRate === "number" && Number.isFinite(item.lastRate)) {
    parts.push(formatMoney(item.lastRate));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * BOQ item name box. The list stays closed until something is typed, then
 * shows the shared word matches (at most five). Clicking or focusing an
 * empty box does not open the catalog.
 */
export function ItemNameSearch<
  T extends { name: string; unit?: string; lastRate?: number },
>({
  id,
  label,
  labelClassName,
  value,
  onChange,
  onPick,
  items,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
}: {
  id: string;
  label?: string;
  labelClassName?: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (item: T) => void;
  items: readonly T[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
}) {
  const listId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [box, setBox] = useState({ top: 0, left: 0, width: 0 });
  const matches = useMemo(() => matchingItemNames(items, value), [items, value]);
  const query = value.trim();
  const listOpen = open && query.length > 0 && matches.length > 0;
  const highlighted = listOpen && active >= 0 && active < matches.length;

  useLayoutEffect(() => {
    if (!listOpen) return;
    function place() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const next = { top: rect.bottom + 4, left: rect.left, width: rect.width };
      setBox((prev) =>
        prev.top === next.top && prev.left === next.left && prev.width === next.width
          ? prev
          : next
      );
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [listOpen, value, matches]);

  function pick(item: T) {
    onPick(item);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!query || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i < 0 ? 0 : (i + 1) % matches.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      if (!listOpen) return;
      e.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === "Enter" && highlighted) {
      e.preventDefault();
      e.stopPropagation();
      pick(matches[active]);
    }
  }

  return (
    <div
      ref={anchorRef}
      className={cn("relative", label ? "space-y-2" : undefined, className)}
    >
      {label ? (
        <Label htmlFor={id} className={labelClassName}>
          {label}
        </Label>
      ) : null}
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-activedescendant={
          highlighted ? `${id}-option-${active}` : undefined
        }
        className={inputClassName}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          style={{ top: box.top, left: box.left, width: box.width }}
          className="fixed z-30 max-h-56 overflow-y-auto rounded-md border border-[var(--fh-line)] bg-white shadow-md"
        >
          {matches.map((hit, index) => {
            const detail = choiceDetail(hit);
            const isActive = index === active;
            return (
              <li key={`${hit.name}-${index}`} role="presentation">
                <button
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--fh-bg)]",
                    isActive && "bg-[var(--fh-bg)]"
                  )}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(hit)}
                >
                  <span className="font-medium text-[var(--fh-steel)]">{hit.name}</span>
                  {detail ? (
                    <span className="shrink-0 text-xs text-[var(--fh-muted)]">
                      {detail}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
