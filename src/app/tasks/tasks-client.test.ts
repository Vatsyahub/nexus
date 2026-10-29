import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { build, type BuildResult } from "esbuild";
import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TaskActor } from "@/lib/store";
import type { Task } from "@/lib/types";
import type { AssignablePerson } from "./tasks-client";

type EditorProps = {
  task: Task;
  subtasks: Task[];
  people: AssignablePerson[];
  departments: string[];
  canAssignPeople: boolean;
  canDeleteTasks: boolean;
  canEditTasks: boolean;
  actor: TaskActor;
  expandedSubId: string | null;
  setExpandedSubId: (id: string | null) => void;
  onClose: () => void;
  startEditing?: boolean;
};

const require = createRequire(import.meta.url);
const outfile = path.join(
  process.cwd(),
  "node_modules",
  ".cache",
  "task-editor-render.cjs"
);

let TaskEditor: ComponentType<EditorProps>;

test.before(async () => {
  mkdirSync(path.dirname(outfile), { recursive: true });
  const built: BuildResult = await build({
    entryPoints: [path.join(process.cwd(), "src/app/tasks/tasks-client.tsx")],
    bundle: true,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    outfile,
    alias: { "@": path.join(process.cwd(), "src") },
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "next/link",
      "next/navigation",
    ],
    logLevel: "silent",
  });
  assert.equal(built.errors.length, 0);
  const loaded = require(outfile) as { TaskEditor: ComponentType<EditorProps> };
  TaskEditor = loaded.TaskEditor;
});

function task(partial: Partial<EditorProps["task"]> = {}): EditorProps["task"] {
  return {
    id: "t1",
    title: "Check site",
    contractId: "c1",
    department: "Contracts Department",
    assignees: ["Ada"],
    status: "pending",
    dueDate: "2026-12-01",
    parentId: null,
    source: "manual",
    catalogKey: "custom",
    priority: "low",
    notes: "Bring the drawing",
    notesUpdatedAt: null,
    completedAt: null,
    notRequiredReason: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function editorProps(extra: Partial<EditorProps> = {}): EditorProps {
  const parent = task();
  return {
    task: parent,
    subtasks: [
      task({
        id: "s1",
        title: "Lay cable",
        parentId: parent.id,
        priority: "normal",
      }),
    ],
    people: [
      {
        id: "p1",
        name: "Ada",
        department: "Contracts Department",
        clearance: "USER",
      },
    ],
    departments: ["Contracts Department"],
    canAssignPeople: true,
    canDeleteTasks: true,
    canEditTasks: true,
    actor: { name: "Master Admin", clearance: "master", department: null },
    expandedSubId: "s1",
    setExpandedSubId: () => {},
    onClose: () => {},
    ...extra,
  };
}

function htmlOf(props: EditorProps) {
  return renderToStaticMarkup(React.createElement(TaskEditor, props));
}

test("opening a task shows the summary and Add updates with the box closed", () => {
  const html = htmlOf(editorProps());
  assert.match(html, /data-task-summary/);
  assert.match(html, /Add updates/);
  assert.equal(html.includes("data-task-updates"), false);
  assert.equal(html.includes("Save updates"), false);
  assert.equal(html.includes("Add subtask"), false);
  assert.equal(html.includes("Lay cable"), false);
  assert.equal(html.includes("Update note"), false);
  assert.equal((html.match(/Task name/g) ?? []).length, 1);
  assert.match(html, /Low/);
  assert.match(html, /Check site/);
});

test("Add updates shows the fields, subtasks, and a larger centred Save updates", () => {
  const html = htmlOf(editorProps({ startEditing: true }));
  const boxAt = html.indexOf("data-task-updates");
  const addAt = html.indexOf("data-add-subtask");
  const saveAt = html.indexOf("data-save-updates");
  assert.ok(boxAt >= 0);
  assert.ok(addAt > boxAt);
  assert.ok(saveAt > addAt);
  assert.match(html, /Add updates|Close/);
  assert.match(html, />Close</);
  assert.equal(html.includes("Add updates"), false);
  assert.match(html, /Lay cable/);
  assert.match(html, /Update note/);
  assert.match(html, /<option[^>]*>Low<\/option>/);
  for (const label of [
    "Task name",
    "Department",
    "People",
    "Deadline",
    "Priority",
    "Status",
  ]) {
    assert.ok(html.includes(label), label);
  }

  const addButton = html.slice(addAt, html.indexOf(">", addAt) + 1);
  const saveRegion = html.slice(Math.max(0, saveAt - 240), saveAt + 900);
  assert.match(addButton, /text-sm/);
  assert.match(addButton, /px-3/);
  assert.equal(addButton.includes("min-h-12"), false);
  assert.match(saveRegion, /flex justify-center/);
  assert.match(saveRegion, /min-h-12/);
  assert.match(saveRegion, /Save updates/);
});

test("someone who cannot update the parent still sees subtasks and not Add subtask", () => {
  const html = htmlOf(
    editorProps({
      canAssignPeople: false,
      actor: {
        name: "Site Lead",
        clearance: "user",
        department: "Installation Department",
      },
    })
  );
  assert.equal(html.includes("Add updates"), false);
  assert.equal(html.includes("data-task-updates"), false);
  assert.equal(html.includes("Add subtask"), false);
  assert.equal(html.includes("Save updates"), false);
  assert.match(html, /Lay cable/);
  assert.match(html, /data-task-summary/);
});
