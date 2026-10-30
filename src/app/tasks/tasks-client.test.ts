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

function openSubtasksHtml(html: string) {
  const marker = 'data-open-subtasks=""';
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const end = html.indexOf("</ul>", start);
  return html.slice(start, end === -1 ? html.length : end);
}

test("opening a task shows the summary and Add updates with the box closed", () => {
  const html = htmlOf(editorProps());
  const openList = openSubtasksHtml(html);
  assert.match(html, /data-task-summary/);
  assert.match(html, /Add updates/);
  assert.equal(html.includes("data-task-updates"), false);
  assert.equal(html.includes("Save updates"), false);
  assert.equal(html.includes("Add subtask"), false);
  assert.match(openList, /Lay cable/);
  assert.match(openList, /Contracts/);
  assert.equal((html.match(/Lay cable/g) ?? []).length, 1);
  assert.equal(html.includes("Update note"), false);
  assert.equal((html.match(/Task name/g) ?? []).length, 1);
  assert.match(html, /Pending/);
  assert.equal(html.includes("Priority"), false);
  assert.match(html, /Check site/);
});

test("the summary lists open subtasks in task order and hides finished ones", () => {
  const parent = task();
  const subtasks = [
    task({
      id: "open-1",
      title: "Mark drawings",
      parentId: parent.id,
      department: "Contracts Department",
      status: "pending",
    }),
    task({
      id: "done",
      title: "Sent to client",
      parentId: parent.id,
      department: "Accounts Department",
      status: "completed",
    }),
    task({
      id: "open-2",
      title: "Site measure",
      parentId: parent.id,
      department: "Installation Department",
      status: "in_progress",
    }),
    task({
      id: "skip",
      title: "Skip paint",
      parentId: parent.id,
      department: "Drawings Department",
      status: "not_required",
      notRequiredReason: "Out of scope",
    }),
    task({
      id: "wait",
      title: "Waiting review",
      parentId: parent.id,
      department: "Accounts Department",
      status: "awaiting_verification",
    }),
    task({
      id: "held",
      title: "Hold crane",
      parentId: parent.id,
      department: "Drawings Department",
      status: "on_hold",
    }),
    task({
      id: "bare",
      title: "No department yet",
      parentId: parent.id,
      department: null,
      status: "pending",
    }),
  ];
  const html = htmlOf(editorProps({ task: parent, subtasks }));
  const openList = openSubtasksHtml(html);
  const lines = [
    "Mark drawings",
    "Contracts",
    "Site measure",
    "Installation",
    "Waiting review",
    "Accounts",
    "Hold crane",
    "Drawings",
    "No department yet",
    "—",
  ];
  let cursor = 0;
  for (const line of lines) {
    const at = openList.indexOf(line, cursor);
    assert.ok(at >= cursor, line);
    cursor = at + line.length;
  }
  assert.equal(html.includes("Sent to client"), false);
  assert.equal(html.includes("Skip paint"), false);
  assert.equal(html.includes(">0<"), false);
  assert.match(html, /Add updates/);
  assert.equal(html.includes("Add subtask"), false);

  const editing = htmlOf(
    editorProps({ task: parent, subtasks, startEditing: true })
  );
  assert.match(editing, /Sent to client/);
  assert.match(editing, /Skip paint/);
  assert.match(editing, /Add subtask/);
  assert.match(openSubtasksHtml(editing), /Mark drawings/);

  const noneOpen = htmlOf(
    editorProps({
      task: parent,
      subtasks: subtasks.filter(
        (row) => row.status === "completed" || row.status === "not_required"
      ),
    })
  );
  assert.equal(openSubtasksHtml(noneOpen), "");
  assert.equal(noneOpen.includes(">Subtasks<"), false);
  assert.equal(noneOpen.includes(">0<"), false);
  assert.match(noneOpen, /Add updates/);
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
  assert.equal(html.includes("Priority"), false);
  assert.equal(html.includes(">Low<"), false);
  assert.equal(html.includes(">Normal<"), false);
  for (const label of [
    "Task name",
    "Department",
    "People",
    "Deadline",
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

test("a parent updater picks any subtask department, and that department’s manager does not", () => {
  const departments = [
    "Contracts Department",
    "Installation Department",
    "Accounts Department",
  ];
  const parent = task({
    department: "Contracts Department",
    assignees: ["Priya Manager"],
  });
  const sub = task({
    id: "s1",
    title: "Lay cable",
    parentId: parent.id,
    department: "Installation Department",
    assignees: ["Site Lead"],
  });
  const priya = htmlOf(
    editorProps({
      task: parent,
      subtasks: [sub],
      departments,
      startEditing: true,
      expandedSubId: "s1",
      actor: {
        name: "Priya Manager",
        clearance: "manager",
        department: "Contracts Department",
      },
    })
  );
  assert.match(priya, /Add subtask/);
  assert.match(priya, /value="Accounts Department"/);
  assert.match(priya, /value="Installation Department"/);
  assert.match(priya, /You can read this/);
  assert.equal((priya.match(/Update note/g) ?? []).length, 1);
  assert.match(priya, /data-task-access="read"/);

  const isha = htmlOf(
    editorProps({
      task: parent,
      subtasks: [sub],
      departments,
      expandedSubId: "s1",
      actor: {
        name: "Isha Install",
        clearance: "manager",
        department: "Installation Department",
      },
    })
  );
  assert.equal(isha.includes("Add subtask"), false);
  assert.match(isha, /data-department-locked="true"/);
  assert.match(isha, /Update note/);
  assert.equal(isha.includes('value="Accounts Department"'), false);
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
