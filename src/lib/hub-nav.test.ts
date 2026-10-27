import assert from "node:assert/strict";
import test from "node:test";
import {
  applySearchPatch,
  hrefWithPatch,
  hubBackTarget,
  noteHubLocation,
  returnHref,
} from "@/lib/hub-nav";

test("Outstandings back returns the tab and filters, not the invoice home", () => {
  let stack = noteHubLocation([], "/reports/outstanding");
  stack = noteHubLocation(
    stack,
    hrefWithPatch("/reports/outstanding", "", { tab: "outstandings" })
  );
  let search = "tab=outstandings";
  for (const typed of ["P", "Pu", "Pun", "Pune"]) {
    search = applySearchPatch(search, { q: typed, from: "2026-01-01", to: "2026-03-31" });
    stack = noteHubLocation(stack, `/reports/outstanding?${search}`, "replace");
  }
  assert.equal(stack.length, 1);
  const list = "/reports/outstanding?tab=outstandings&q=Pune&from=2026-01-01&to=2026-03-31";
  assert.equal(stack[0], list);

  stack = noteHubLocation(stack, "/billing/inv-1");
  assert.equal(hubBackTarget(stack)?.href, list);

  stack = noteHubLocation(hubBackTarget(stack)!.stack, "/payments/pay-1");
  assert.equal(hubBackTarget(stack)?.href, list);
});

test("filter typing keeps due-within-7, and a tab change still clears it", () => {
  const filtered = hrefWithPatch(
    "/reports/outstanding",
    "tab=outstandings&dueWithin=7",
    { q: "Godrej", from: "2026-01-01", to: "2026-02-01" }
  );
  assert.equal(
    filtered,
    "/reports/outstanding?tab=outstandings&dueWithin=7&q=Godrej&from=2026-01-01&to=2026-02-01"
  );

  const nextTab = hrefWithPatch(
    "/reports/outstanding",
    "tab=outstandings&dueWithin=7&q=Godrej",
    { tab: "proformas", dueWithin: null }
  );
  assert.equal(nextTab, "/reports/outstanding?tab=proformas&q=Godrej");
});

test("a fresh menu open does not carry another list's filters", () => {
  const stack = noteHubLocation(["/contracts?q=Yerwada"], "/billing");
  assert.deepEqual(stack, ["/contracts?q=Yerwada", "/billing"]);
});

test("Back to billing restores that billing list and not a report", () => {
  const outstanding =
    "/reports/outstanding?tab=outstandings&q=Pune&from=2026-01-01&to=2026-03-31";
  assert.equal(
    returnHref("/billing", {
      stack: [outstanding, "/billing/inv-1"],
      current: "/billing/inv-1",
    }),
    "/billing"
  );
  assert.equal(
    returnHref("/billing", {
      stack: ["/billing?q=Pune&type=TI&from=2026-01-01", "/billing/inv-1"],
      current: "/billing/inv-1",
    }),
    "/billing?q=Pune&type=TI&from=2026-01-01"
  );
  assert.equal(
    returnHref("/contracts", {
      stack: ["/contracts?q=Yerwada", "/contracts/c1"],
      current: "/contracts/c1",
    }),
    "/contracts?q=Yerwada"
  );
});

test("Operations tab change clears search and keeps the contract filter", () => {
  assert.equal(
    hrefWithPatch(
      "/reports/execution",
      "tab=supply&contract=c1&q=dc&from=2026-01-01&to=2026-02-01",
      { tab: "summary", q: null, from: null, to: null }
    ),
    "/reports/execution?tab=summary&contract=c1"
  );
});

test("Accounts keeps both date ranges while search stays shared", () => {
  assert.equal(
    hrefWithPatch("/reports/accounts", "q=Pune&cfrom=2026-01-01&cto=2026-01-31", {
      from: "2026-02-01",
      to: "2026-02-28",
    }),
    "/reports/accounts?q=Pune&cfrom=2026-01-01&cto=2026-01-31&from=2026-02-01&to=2026-02-28"
  );
});
