"use client";

import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";
import {
  clearSelectOpen,
  noteSelectPointer,
  onEntryKeyDown,
} from "@/lib/enter-next-field";

function onEntryKeyDownReact(event: KeyboardEvent<HTMLElement>) {
  onEntryKeyDown(event);
}

function onEntryPointerDown(event: PointerEvent<HTMLElement>) {
  if (event.target instanceof HTMLSelectElement) noteSelectPointer(event.target);
}

function onEntryBlur(event: FocusEvent<HTMLElement>) {
  if (event.target instanceof HTMLSelectElement) clearSelectOpen(event.target);
}

/** Spread onto a create/edit form or panel. Does not belong on search or filters. */
export const entryRootProps = {
  "data-entry": "",
  onKeyDown: onEntryKeyDownReact,
  onPointerDown: onEntryPointerDown,
  onBlur: onEntryBlur,
};

/** Spread onto the control that stores the record. Enter and Space do not activate it. */
export const entrySaveProps = {
  "data-entry-save": "",
} as const;
