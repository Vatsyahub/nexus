import {
  DEFAULT_BILLING_TERM_KEYS,
  TERM_LABELS,
  type BillingTerms,
} from "@/lib/types";

/** Stored term text: trimmed, with the capitals and spaces the user typed. */
export function billingTermKey(name: string): string {
  return name.trim();
}

/** Built-in terms keep their labels. Custom terms, including old slugs, show the stored text. */
export function billingTermLabel(key: string): string {
  return TERM_LABELS[key] ?? key;
}

export function isBuiltinBillingTerm(key: string): boolean {
  return (DEFAULT_BILLING_TERM_KEYS as readonly string[]).includes(key);
}

/** Six built-in terms at 0%. Custom terms are never copied onto a new contract. */
export function startingBillingTerms(): BillingTerms {
  return Object.fromEntries(DEFAULT_BILLING_TERM_KEYS.map((key) => [key, 0]));
}

export function billingTermsTotal(terms: BillingTerms): number {
  return Object.values(terms).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

/** Contract create accepts a total within 0.01 of 100. */
export function billingTermsTotalIs100(terms: BillingTerms): boolean {
  return Math.abs(billingTermsTotal(terms) - 100) <= 0.01;
}

function hasTerm(terms: BillingTerms, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(terms, key);
}

function sameTermName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** True when another term on this map matches, ignoring capitals. */
function termNameTaken(
  terms: BillingTerms,
  name: string,
  exceptKey?: string
): boolean {
  return Object.keys(terms).some(
    (key) => key !== exceptKey && sameTermName(key, name)
  );
}

function termPercent(terms: BillingTerms, key: string): number {
  const value = Number(terms[key]);
  return Number.isFinite(value) ? value : 0;
}

export type BillingTermRenameResult =
  | { ok: true; terms: BillingTerms; toKey: string }
  | { ok: false; error: string };

export type BillingTermDeleteResult =
  | { ok: true; terms: BillingTerms }
  | { ok: false; error: string };

/** Add a custom term at 0%. A name that matches an existing term except for capitals is rejected. */
export function addCustomBillingTerm(
  terms: BillingTerms,
  rawName: string
): BillingTermRenameResult {
  const toKey = billingTermKey(rawName);
  if (!toKey) {
    return { ok: false, error: "Enter a term name." };
  }
  if (termNameTaken(terms, toKey)) {
    return { ok: false, error: "A term with that name already exists." };
  }
  return { ok: true, terms: { ...terms, [toKey]: 0 }, toKey };
}

/**
 * Rename a custom term. The percent moves with the term.
 * A name that matches another term except for capitals is rejected.
 */
export function renameCustomBillingTerm(
  terms: BillingTerms,
  fromKey: string,
  rawName: string
): BillingTermRenameResult {
  if (isBuiltinBillingTerm(fromKey)) {
    return { ok: false, error: "Built-in billing terms cannot be renamed." };
  }
  if (!hasTerm(terms, fromKey)) {
    return { ok: false, error: "That billing term is not on this contract." };
  }
  const toKey = billingTermKey(rawName);
  if (!toKey) {
    return { ok: false, error: "Enter a term name." };
  }
  if (toKey !== fromKey && termNameTaken(terms, toKey, fromKey)) {
    return { ok: false, error: "A term with that name already exists." };
  }
  if (toKey === fromKey) {
    return { ok: true, terms: { ...terms }, toKey };
  }
  const next: BillingTerms = { ...terms, [toKey]: termPercent(terms, fromKey) };
  delete next[fromKey];
  return { ok: true, terms: next, toKey };
}

/** Remove a custom term and its percent. Built-in terms stay. */
export function deleteCustomBillingTerm(
  terms: BillingTerms,
  key: string
): BillingTermDeleteResult {
  if (isBuiltinBillingTerm(key)) {
    return { ok: false, error: "Built-in billing terms cannot be deleted." };
  }
  if (!hasTerm(terms, key)) {
    return { ok: false, error: "That billing term is not on this contract." };
  }
  const next: BillingTerms = { ...terms };
  delete next[key];
  return { ok: true, terms: next };
}
