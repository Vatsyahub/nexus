/** Open/close state for the task page updates box. */

export type TaskUpdatesBox = {
  editing: boolean;
  addingSubtask: boolean;
  subtaskEditorId: string | null;
};

export function initialTaskUpdatesBox(
  subtaskEditorId: string | null = null
): TaskUpdatesBox {
  return {
    editing: false,
    addingSubtask: false,
    subtaskEditorId,
  };
}

export function openTaskUpdates(box: TaskUpdatesBox): TaskUpdatesBox {
  return { ...box, editing: true };
}

/** Close without saving. The subtask editor and add-subtask form close too. */
export function closeTaskUpdates(box: TaskUpdatesBox): TaskUpdatesBox {
  return {
    ...box,
    editing: false,
    addingSubtask: false,
    subtaskEditorId: null,
  };
}

export type TaskUpdatesSave =
  | { ok: true }
  | { ok: false; error: string };

/**
 * A finished save closes the box the same way Close does.
 * A refusal leaves the box open and keeps the error.
 */
export function settleTaskUpdatesSave(
  box: TaskUpdatesBox,
  save: TaskUpdatesSave
): { box: TaskUpdatesBox; error: string | null } {
  if (!save.ok) {
    return {
      box: { ...box, editing: true },
      error: save.error,
    };
  }
  return { box: closeTaskUpdates(box), error: null };
}

/** True only when the save finished and nothing refused it. */
export function taskUpdatesSaveCloses(input: {
  errors: readonly string[];
  persisted: boolean;
  statusSaved: boolean;
}): boolean {
  return input.errors.length === 0 && input.persisted && input.statusSaved;
}

/** Add subtask is rendered only while the updates box is open. */
export function updatesBoxShowsAddSubtask(editing: boolean): boolean {
  return editing;
}

export const addSubtaskControl = {
  label: "Add subtask",
  heightPx: 32,
  className: "rounded-md px-3 py-1.5 text-sm",
} as const;

export const saveUpdatesControl = {
  label: "Save updates",
  heightPx: 48,
  centred: true,
  className: "min-h-12 min-w-48 px-10 text-base",
  rowClassName: "flex justify-center pt-2",
} as const;
