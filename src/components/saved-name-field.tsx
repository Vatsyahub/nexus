"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  chooseSavedNameOnEnter,
  matchingContractPlaces,
} from "@/lib/contract-place-names";
import { cn } from "@/lib/utils";

/**
 * Free-text city or state on the new contract page.
 * Suggestions are names already stored on contracts. Nothing is written into
 * the field until a match is picked; any other typed name stays as typed.
 */
export function SavedNameField({
  id,
  label,
  value,
  onChange,
  names,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  names: readonly string[];
  required?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = useMemo(
    () => matchingContractPlaces(names, value).slice(0, 40),
    [names, value]
  );
  const listOpen = open && matches.length > 0;
  const highlighted = listOpen && active >= 0 && active < matches.length;

  function choose(name: string) {
    onChange(name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && matches.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i < 0 ? 0 : (i + 1) % matches.length));
      return;
    }
    if (e.key === "ArrowUp" && matches.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) =>
        i < 0 ? matches.length - 1 : (i - 1 + matches.length) % matches.length
      );
      return;
    }
    if (e.key === "Escape") {
      if (!listOpen) return;
      e.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (
      e.key === "Enter" &&
      chooseSavedNameOnEnter(listOpen, highlighted)
    ) {
      e.preventDefault();
      e.stopPropagation();
      choose(matches[active]);
    }
  }

  return (
    <div className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-activedescendant={
          highlighted ? `${id}-option-${active}` : undefined
        }
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
          aria-label={label}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--fh-line)] bg-white py-1 shadow-md"
        >
          {matches.map((name, index) => {
            const isActive = index === active;
            return (
              <li key={name} role="presentation">
                <button
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={cn(
                    "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-[var(--fh-bg)]",
                    isActive && "bg-[var(--fh-bg)]"
                  )}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(name)}
                >
                  <span className="font-medium text-[var(--fh-steel)]">{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
