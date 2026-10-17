/**
 * Enter on create/edit screens moves to the next field and never stores.
 * A click on the save control is the only way to submit.
 * List search bars and filters do not use this.
 */

const FIELD_SELECTOR = [
  "input:not([type='hidden']):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[role='checkbox']:not([disabled]):not([aria-disabled='true'])",
  "button[data-entry-save]:not([disabled])",
].join(",");

const openSelects = new WeakSet<HTMLSelectElement>();

export type EnterDecision =
  | "ignore"
  | "newline"
  | "choose-select"
  | "block-save"
  | "next";

export function decideEnter(input: {
  key: string;
  composing: boolean;
  tag: string;
  isSave: boolean;
  selectOpen: boolean;
  inListbox: boolean;
}): EnterDecision {
  if (input.composing || input.key === "Process") return "ignore";
  if (input.key === " " || input.key === "Spacebar") {
    return input.isSave ? "block-save" : "ignore";
  }
  if (input.key !== "Enter") return "ignore";
  if (input.tag === "TEXTAREA") return "newline";
  if (input.inListbox) return "ignore";
  if (input.tag === "SELECT" && input.selectOpen) return "choose-select";
  // A datalist suggestion and implicit submit share one Enter, so Enter
  // moves on instead of accepting the suggestion.
  if (input.isSave) return "block-save";
  if (
    input.tag === "INPUT" ||
    input.tag === "SELECT" ||
    input.tag === "CHECKBOX"
  ) {
    return "next";
  }
  return "ignore";
}

type KeyLike = {
  key: string;
  altKey?: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

function isComposing(event: KeyLike): boolean {
  return (
    !!event.isComposing ||
    !!event.nativeEvent?.isComposing ||
    event.nativeEvent?.keyCode === 229
  );
}

export function noteSelectPointer(select: HTMLSelectElement) {
  if (openSelects.has(select)) openSelects.delete(select);
  else openSelects.add(select);
}

export function clearSelectOpen(select: HTMLSelectElement) {
  openSelects.delete(select);
}

export function selectPickerOpen(select: HTMLSelectElement): boolean {
  try {
    // Trust :open when the browser supports it. The popup consumes Enter
    // before script, so a remembered "opened" flag would stick and the
    // next Enter would not move to the following field.
    return select.matches(":open");
  } catch {
    return openSelects.has(select);
  }
}

function saveControl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-entry-save]");
}

function isShown(el: HTMLElement): boolean {
  if (el.closest("[hidden], [aria-hidden='true']")) return false;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({
      checkOpacity: false,
      checkVisibilityCSS: true,
    });
  }
  return true;
}

function isFieldTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return false;
  if (target instanceof HTMLSelectElement) return !target.disabled;
  if (target instanceof HTMLInputElement) {
    return target.type !== "hidden" && !target.disabled;
  }
  if (target instanceof HTMLElement && target.getAttribute("role") === "checkbox") {
    return !target.hasAttribute("disabled");
  }
  return false;
}

export function focusNextEntryField(from: HTMLElement) {
  const root = from.closest<HTMLElement>("[data-entry]");
  if (!root) return;
  const fields = [...root.querySelectorAll<HTMLElement>(FIELD_SELECTOR)].filter(
    (el) =>
      !el.closest("[role='listbox'], [data-entry-ignore]") && isShown(el)
  );
  const index = fields.findIndex((el) => el === from || el.contains(from));
  const next = index >= 0 ? fields[index + 1] : undefined;
  next?.focus();
}

function armSelect(target: EventTarget | null, event: KeyLike) {
  if (!(target instanceof HTMLSelectElement)) return;
  if (event.key === "Escape") {
    openSelects.delete(target);
    return;
  }
  if (
    event.key === " " ||
    event.key === "F4" ||
    (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp"))
  ) {
    openSelects.add(target);
  }
}

/** Form or panel keydown for a create/edit surface. */
export function onEntryKeyDown(event: KeyLike) {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-entry-ignore]")) return;
  armSelect(target, event);

  const save = saveControl(target);
  const tag =
    target instanceof HTMLElement && target.getAttribute("role") === "checkbox"
      ? "CHECKBOX"
      : target instanceof Element
        ? target.tagName
        : "";
  const decision = decideEnter({
    key: event.key,
    composing: isComposing(event),
    tag,
    isSave: !!save,
    selectOpen: target instanceof HTMLSelectElement && selectPickerOpen(target),
    inListbox: target instanceof Element && !!target.closest("[role='listbox']"),
  });

  if (decision === "choose-select" && target instanceof HTMLSelectElement) {
    openSelects.delete(target);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (decision === "newline" || decision === "ignore") return;

  event.preventDefault();
  event.stopPropagation();
  if (decision === "next" && isFieldTarget(target) && target instanceof HTMLElement) {
    focusNextEntryField(target);
  }
}
