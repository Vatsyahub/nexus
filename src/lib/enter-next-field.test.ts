import assert from "node:assert/strict";
import test from "node:test";
import { decideEnter } from "@/lib/enter-next-field";

const field = {
  composing: false,
  isSave: false,
  selectOpen: false,
  inListbox: false,
};

test("Enter on a text, number, date, or select field moves on", () => {
  for (const tag of ["INPUT", "SELECT"]) {
    assert.equal(decideEnter({ ...field, key: "Enter", tag }), "next");
  }
  assert.equal(
    decideEnter({ ...field, key: "Enter", tag: "CHECKBOX" }),
    "next"
  );
});

test("Enter in a textarea inserts a newline and does not save", () => {
  assert.equal(
    decideEnter({ ...field, key: "Enter", tag: "TEXTAREA" }),
    "newline"
  );
});

test("Enter on the save control does not activate it", () => {
  assert.equal(
    decideEnter({ ...field, key: "Enter", tag: "BUTTON", isSave: true }),
    "block-save"
  );
  assert.equal(
    decideEnter({ ...field, key: " ", tag: "BUTTON", isSave: true }),
    "block-save"
  );
});

test("an open select keeps Enter for the highlighted option", () => {
  assert.equal(
    decideEnter({
      ...field,
      key: "Enter",
      tag: "SELECT",
      selectOpen: true,
    }),
    "choose-select"
  );
  assert.equal(
    decideEnter({ ...field, key: "Enter", tag: "SELECT", selectOpen: false }),
    "next"
  );
});

test("Enter in a datalist field moves on instead of saving", () => {
  assert.equal(decideEnter({ ...field, key: "Enter", tag: "INPUT" }), "next");
});

test("listbox options and other keys are left alone", () => {
  assert.equal(
    decideEnter({ ...field, key: "Enter", tag: "BUTTON", inListbox: true }),
    "ignore"
  );
  assert.equal(decideEnter({ ...field, key: "Tab", tag: "INPUT" }), "ignore");
  assert.equal(
    decideEnter({ ...field, key: "Enter", tag: "INPUT", composing: true }),
    "ignore"
  );
});
