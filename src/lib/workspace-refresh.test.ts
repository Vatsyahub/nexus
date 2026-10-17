import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import type { Contract, FlowhubData, Invoice, Task } from "@/lib/types";
import { confirmWorkspaceSave, getSaveNotice } from "@/lib/save-notice";
import {
  flushWorkspace,
  getData,
  hydrateWorkspace,
  onWorkspacePageHide,
  refreshWorkspace,
  resetWorkspaceClientForTests,
  startWorkspaceRefresh,
  updateContract,
} from "@/lib/store";
import type { Payment } from "@/lib/types";

type Held = {
  method: string;
  resolve: (response: Response) => void;
};

const held: Held[] = [];
let hangPuts = false;
let putCount = 0;
let lastPutBody = "";
let putResponder: ((body: string) => Response) | null = null;
const originalFetch = globalThis.fetch;
const bus = new EventTarget();
const documentStub = {
  visibilityState: "visible" as DocumentVisibilityState,
  addEventListener: bus.addEventListener.bind(bus),
  removeEventListener: bus.removeEventListener.bind(bus),
  dispatchEvent: bus.dispatchEvent.bind(bus),
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installBrowser() {
  const storage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  };
  globalThis.window = {
    location: { pathname: "/contracts/c1", search: "", assign() {} },
    dispatchEvent() {
      return true;
    },
    addEventListener() {},
    removeEventListener() {},
    setInterval: (...args: Parameters<typeof setInterval>) =>
      globalThis.setInterval(...args),
    clearInterval: (...args: Parameters<typeof clearInterval>) =>
      globalThis.clearInterval(...args),
    setTimeout: (...args: Parameters<typeof setTimeout>) =>
      globalThis.setTimeout(...args),
    clearTimeout: (...args: Parameters<typeof clearTimeout>) =>
      globalThis.clearTimeout(...args),
  } as unknown as Window & typeof globalThis;
  globalThis.document = documentStub as unknown as Document;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "PUT") {
      putCount += 1;
      const raw = typeof init?.body === "string" ? init.body : "";
      lastPutBody = raw;
      if (putResponder) return putResponder(raw);
      if (!hangPuts) return jsonResponse({ ok: true });
    }
    return new Promise<Response>((resolve) => {
      held.push({ method, resolve });
    });
  }) as typeof fetch;
}

function releaseNext(method: string, body: unknown, status = 200) {
  const index = held.findIndex((item) => item.method === method);
  if (index < 0) {
    throw new Error(`no pending ${method}`);
  }
  const [item] = held.splice(index, 1);
  item.resolve(jsonResponse(body, status));
}

async function waitFor(method: string) {
  for (let i = 0; i < 30; i++) {
    if (held.some((item) => item.method === method)) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`timed out waiting for ${method}`);
}

function contract(partial: Partial<Contract> = {}): Contract {
  return {
    id: "c1",
    projectName: "Alpha",
    projectNo: "P-1",
    orderNos: "WO-1",
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 5000,
    gstApplicable: true,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: true,
    abgPercent: 10,
    abgValue: 500,
    abgNumber: "ABG/OLD/1",
    abgDate: "2026-01-15",
    abgExpiry: "2030-06-01",
    abgBankName: "HDFC",
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: 250,
    pbgNumber: "PBG/OLD/1",
    pbgDate: "2026-02-01",
    pbgExpiry: "2030-08-01",
    pbgBankName: "SBI",
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    retentionRecoveredAt: null,
    contractorAssigned: "Ada",
    boq: [],
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function task(id: string): Task {
  return {
    id,
    title: "Kick off",
    contractId: "c1",
    department: null,
    assignees: [],
    status: "pending",
    dueDate: null,
    parentId: null,
    source: "manual",
    catalogKey: null,
    priority: "normal",
    notes: "",
    notesUpdatedAt: null,
    completedAt: null,
    notRequiredReason: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function invoice(id: string): Invoice {
  return {
    id,
    type: "TI",
    number: "TI-9",
    date: "2026-03-01",
    contractId: "c1",
    lines: [],
    netAmount: 10,
    gstAmount: 0,
    extraCharges: [],
    finalAmount: 10,
    convertedFromPiId: null,
    createdAt: "2026-03-01T00:00:00.000Z",
  };
}

function workspace(
  revision: number,
  partial: Partial<Contract> = {},
  extra: Partial<FlowhubData> = {}
): FlowhubData {
  return {
    workspaceRevision: revision,
    contracts: [contract(partial)],
    tasks: [],
    itemCatalog: [],
    invoices: [],
    payments: [],
    schedules: [],
    scheduleChangeLog: [],
    notifications: [],
    clearedNotices: {},
    customDepartments: [],
    departmentRenames: {},
    deletedDepartments: [],
    expenseCategories: [],
    deliveryChallans: [],
    installationProgress: [],
    ...extra,
  };
}

async function hydrateWith(data: FlowhubData) {
  const pending = hydrateWorkspace();
  await waitFor("GET");
  releaseNext("GET", data);
  await pending;
}

describe("workspace refresh", { concurrency: false }, () => {
  beforeEach(() => {
    held.length = 0;
    hangPuts = false;
    putCount = 0;
    lastPutBody = "";
    putResponder = null;
    documentStub.visibilityState = "visible";
    resetWorkspaceClientForTests();
    installBrowser();
  });

  afterEach(async () => {
    hangPuts = false;
    for (const item of held.splice(0)) item.resolve(jsonResponse({ ok: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    resetWorkspaceClientForTests();
    globalThis.fetch = originalFetch;
    delete (globalThis as { window?: unknown }).window;
  });

  test("a second GET updates the snapshot after the first hydrate", async () => {
    await hydrateWith(
      workspace(4, {}, { tasks: [task("t-old")] })
    );
    const first = getData();
    assert.equal(first.contracts[0]?.abgNumber, "ABG/OLD/1");
    assert.equal(first.contracts[0]?.pbgNumber, "PBG/OLD/1");
    assert.equal(first.tasks.some((row) => row.id === "t-old"), true);

    await hydrateWorkspace();
    assert.equal(held.some((item) => item.method === "GET"), false);

    const refreshing = refreshWorkspace();
    await waitFor("GET");
    releaseNext(
      "GET",
      workspace(
        4,
        {
          abgNumber: "ABG/NEW/2",
          abgBankName: "ICICI",
          abgValue: 800,
          pbgNumber: "PBG/NEW/2",
          pbgBankName: "Axis",
          pbgValue: 400,
        },
        { tasks: [], invoices: [invoice("inv-new")] }
      )
    );
    await refreshing;

    const next = getData();
    assert.equal(next.contracts[0]?.abgNumber, "ABG/NEW/2");
    assert.equal(next.contracts[0]?.abgBankName, "ICICI");
    assert.equal(next.contracts[0]?.abgValue, 800);
    assert.equal(next.contracts[0]?.pbgNumber, "PBG/NEW/2");
    assert.equal(next.contracts[0]?.pbgBankName, "Axis");
    assert.equal(next.contracts[0]?.pbgValue, 400);
    assert.equal(next.invoices[0]?.id, "inv-new");
    assert.equal(next.tasks.some((row) => row.id === "t-old"), false);
  });

  test("an equal workspace revision is still applied", async () => {
    await hydrateWith(workspace(4));
    assert.equal(getData().workspaceRevision, 4);

    const refreshing = refreshWorkspace();
    await waitFor("GET");
    releaseNext("GET", workspace(4, { abgNumber: "ABG/SAME-REV/3" }));
    await refreshing;

    assert.equal(getData().workspaceRevision, 4);
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/SAME-REV/3");
  });

  test("a refetch is skipped while a save is in flight", async () => {
    await hydrateWith(workspace(4));
    hangPuts = true;
    const updated = updateContract("c1", { abgNumber: "ABG/LOCAL/9" });
    assert.equal(updated?.abgNumber, "ABG/LOCAL/9");
    await refreshWorkspace();
    await waitFor("PUT");
    await refreshWorkspace();
    assert.equal(held.some((item) => item.method === "GET"), false);
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/LOCAL/9");

    for (const item of held.splice(0)) item.resolve(jsonResponse({ ok: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const raced = refreshWorkspace();
    await waitFor("GET");
    updateContract("c1", { abgNumber: "ABG/RACE/10" });
    releaseNext("GET", workspace(4, { abgNumber: "ABG/STALE/1" }));
    await raced;
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/RACE/10");
  });

  test("becoming visible refetches, and the open tab refetches about every 15 seconds", async () => {
    await hydrateWith(workspace(4));
    documentStub.visibilityState = "hidden";
    const stop = startWorkspaceRefresh();
    try {
      documentStub.dispatchEvent(new Event("visibilitychange"));
      assert.equal(held.some((item) => item.method === "GET"), false);

      documentStub.visibilityState = "visible";
      documentStub.dispatchEvent(new Event("visibilitychange"));
      await waitFor("GET");
      releaseNext("GET", workspace(4, { abgNumber: "ABG/VISIBLE/4" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(getData().contracts[0]?.abgNumber, "ABG/VISIBLE/4");

      mock.timers.enable({ apis: ["setInterval"] });
      stop();
      const stopTimer = startWorkspaceRefresh();
      try {
        mock.timers.tick(15_000);
        await waitFor("GET");
        releaseNext("GET", workspace(4, { abgNumber: "ABG/TICK/5" }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(getData().contracts[0]?.abgNumber, "ABG/TICK/5");
      } finally {
        stopTimer();
        mock.timers.reset();
      }
    } finally {
      stop();
    }
  });

  test("pagehide does not PUT when this tab has no unsaved change", async () => {
    await hydrateWith(workspace(4, { abgNumber: "ABG/SERVER/1" }));
    const afterLoad = putCount;
    onWorkspacePageHide();
    assert.equal(putCount, afterLoad);
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/SERVER/1");

    hangPuts = true;
    updateContract("c1", { abgNumber: "ABG/UNSAVED/1" });
    await waitFor("PUT");
    const inflight = putCount;
    const inflightBody = JSON.parse(lastPutBody) as { baseRevision?: number };
    onWorkspacePageHide();
    assert.equal(putCount, inflight + 1);
    const hiddenBody = JSON.parse(lastPutBody) as {
      baseRevision?: number;
      contracts?: unknown;
    };
    assert.equal(inflightBody.baseRevision, 4);
    assert.equal(hiddenBody.baseRevision, 4);
    assert.equal(hiddenBody.contracts, undefined);
    assert.equal(getData().workspaceRevision, 5);
  });

  test("a failed or empty GET does not PUT localStorage", async () => {
    localStorage.setItem(
      "nexus-ws-v5",
      JSON.stringify(workspace(4, { abgNumber: "ABG/LOCAL/1" }))
    );
    const failed = hydrateWorkspace();
    await waitFor("GET");
    releaseNext("GET", { error: "down" }, 500);
    await failed;
    assert.equal(putCount, 0);
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/LOCAL/1");

    resetWorkspaceClientForTests();
    putCount = 0;
    held.length = 0;
    localStorage.setItem(
      "nexus-ws-v5",
      JSON.stringify(workspace(4, { abgNumber: "ABG/LOCAL/1" }))
    );
    const emptyRemote = { ...workspace(4), contracts: [] as FlowhubData["contracts"] };
    const emptied = hydrateWorkspace();
    await waitFor("GET");
    releaseNext("GET", emptyRemote);
    await emptied;
    assert.equal(putCount, 0);
    assert.equal(getData().contracts.length, 0);
  });

  test("a cold load with a non-empty server blob replaces localStorage", async () => {
    localStorage.setItem(
      "nexus-ws-v5",
      JSON.stringify(workspace(3, { abgNumber: "ABG/LOCAL/1", pbgNumber: "PBG/LOCAL/1" }))
    );
    await hydrateWith(
      workspace(4, { abgNumber: "ABG/SERVER/9", pbgNumber: "PBG/SERVER/9" })
    );
    assert.equal(putCount, 0);
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/SERVER/9");
    assert.equal(getData().contracts[0]?.pbgNumber, "PBG/SERVER/9");
    const cached = JSON.parse(localStorage.getItem("nexus-ws-v5") ?? "{}") as FlowhubData;
    assert.equal(cached.contracts[0]?.abgNumber, "ABG/SERVER/9");
  });

  test("an ABG/PBG save increments workspaceRevision", async () => {
    await hydrateWith(workspace(4));
    assert.equal(getData().workspaceRevision, 4);
    const updated = updateContract("c1", {
      abgNumber: "ABG/NEW/9",
      abgDate: "2026-04-01",
      abgExpiry: "2030-01-01",
      abgBankName: "HDFC",
      abgValue: 500,
      pbgNumber: "PBG/NEW/9",
      pbgDate: "2026-04-02",
      pbgExpiry: "2030-02-01",
      pbgBankName: "SBI",
      pbgValue: 250,
    });
    assert.equal(updated?.abgNumber, "ABG/NEW/9");
    assert.equal(updated?.pbgNumber, "PBG/NEW/9");
    assert.equal(getData().workspaceRevision, 5);
  });

  test("a refetch skips an older revision and applies a newer one", async () => {
    await hydrateWith(workspace(5, { abgNumber: "ABG/PAINTED/5" }));
    const older = refreshWorkspace();
    await waitFor("GET");
    releaseNext("GET", workspace(4, { abgNumber: "ABG/OLDER/4" }));
    await older;
    assert.equal(getData().workspaceRevision, 5);
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/PAINTED/5");

    const newer = refreshWorkspace();
    await waitFor("GET");
    releaseNext(
      "GET",
      workspace(6, { abgNumber: "ABG/NEWER/6", pbgNumber: "PBG/NEWER/6" })
    );
    await newer;
    assert.equal(getData().workspaceRevision, 6);
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/NEWER/6");
    assert.equal(getData().contracts[0]?.pbgNumber, "PBG/NEWER/6");
  });

  test("a save sends changes and adopts the merged hub", async () => {
    await hydrateWith(workspace(4));
    const payment: Payment = {
      id: "pay-other",
      contractId: "c1",
      invoiceId: null,
      link: "unlinked",
      date: "2026-04-01",
      netAmount: 25,
      gstAmount: 0,
      retentionAmount: 0,
      tdsAmount: 0,
      otherDeductions: 0,
      otherDeductionReason: "",
      recovered: 0,
      createdAt: "2026-04-01T00:00:00.000Z",
    };
    putResponder = () =>
      jsonResponse({
        ok: true,
        workspaceRevision: 9,
        data: workspace(9, { abgNumber: "ABG/NEW/9" }, { payments: [payment] }),
      });
    updateContract("c1", { abgNumber: "ABG/NEW/9" });
    await flushWorkspace();
    const sent = JSON.parse(lastPutBody) as {
      baseRevision?: number;
      changes?: { contracts?: { upsert?: { abgNumber?: string | null }[] } };
      contracts?: unknown;
    };
    assert.equal(sent.baseRevision, 4);
    assert.equal(sent.contracts, undefined);
    assert.equal(sent.changes?.contracts?.upsert?.[0]?.abgNumber, "ABG/NEW/9");
    assert.equal(getData().workspaceRevision, 9);
    assert.equal(getData().contracts[0]?.abgNumber, "ABG/NEW/9");
    assert.equal(getData().payments[0]?.id, "pay-other");
  });

  test("a refused save does not count as saved", async () => {
    await hydrateWith(workspace(4, { abgNumber: "ABG/SERVER/1" }));
    putResponder = () =>
      jsonResponse(
        { ok: true, skipped: "refuse-wholesale-replace" },
        200
      );
    updateContract("c1", { abgNumber: "ABG/UNSTORED/1" });
    await assert.rejects(() => flushWorkspace(), /not stored/);
    const saved = await confirmWorkspaceSave();
    assert.equal(saved, false);
    assert.equal(getSaveNotice()?.tone, "error");
    assert.notEqual(getSaveNotice()?.text, "Saved.");
  });

  test("the next save sends the revision returned by the previous save", async () => {
    await hydrateWith(workspace(4, { projectName: "Old" }));
    const seen: number[] = [];
    putResponder = (raw) => {
      const sent = JSON.parse(raw) as {
        baseRevision: number;
        changes?: { contracts?: { upsert?: Array<Partial<Contract>> } };
      };
      seen.push(sent.baseRevision);
      const upsert = sent.changes?.contracts?.upsert?.[0] ?? {};
      const rev = sent.baseRevision === 4 ? 9 : sent.baseRevision + 1;
      return jsonResponse({
        ok: true,
        workspaceRevision: rev,
        data: workspace(rev, {
          projectName: upsert.projectName ?? "Old",
          city: upsert.city ?? "Delhi",
        }),
      });
    };
    updateContract("c1", { projectName: "New" });
    await flushWorkspace();
    assert.equal(getData().workspaceRevision, 9);
    assert.equal(getData().contracts[0]?.projectName, "New");
    updateContract("c1", { city: "Mumbai" });
    await flushWorkspace();
    assert.deepEqual(seen, [4, 9]);
    assert.equal(getData().workspaceRevision, 10);
    assert.equal(getData().contracts[0]?.projectName, "New");
    assert.equal(getData().contracts[0]?.city, "Mumbai");
  });

  test("a save queued behind another sends the revision that save stored", async () => {
    await hydrateWith(workspace(4, { projectName: "Alpha", city: "Delhi" }));
    hangPuts = true;
    updateContract("c1", { projectName: "New" });
    await waitFor("PUT");
    const first = JSON.parse(lastPutBody) as {
      baseRevision?: number;
      changes?: { contracts?: { upsert?: Array<{ projectName?: string }> } };
    };
    assert.equal(first.baseRevision, 4);
    updateContract("c1", { city: "Mumbai" });
    assert.equal(putCount, 1);

    hangPuts = false;
    putResponder = (raw) => {
      const sent = JSON.parse(raw) as {
        baseRevision: number;
        changes?: {
          contracts?: { upsert?: Array<{ projectName?: string; city?: string }> };
        };
      };
      assert.equal(sent.baseRevision, 8);
      const upsert = sent.changes?.contracts?.upsert?.[0] ?? {};
      return jsonResponse({
        ok: true,
        workspaceRevision: 9,
        data: workspace(9, {
          projectName: upsert.projectName ?? "New",
          city: upsert.city ?? "Mumbai",
        }),
      });
    };
    releaseNext(
      "PUT",
      {
        ok: true,
        workspaceRevision: 8,
        data: workspace(8, {
          projectName: first.changes?.contracts?.upsert?.[0]?.projectName ?? "New",
        }),
      }
    );
    await flushWorkspace();
    assert.equal(putCount, 2);
    assert.equal(getData().workspaceRevision, 9);
    assert.equal(getData().contracts[0]?.projectName, "New");
    assert.equal(getData().contracts[0]?.city, "Mumbai");
  });

  test("a stale save is not shown as saved and loads the current hub", async () => {
    await hydrateWith(workspace(4, { projectName: "Old" }));
    putResponder = () =>
      jsonResponse(
        {
          ok: false,
          skipped: "refuse-stale-revision",
          error: "Could not save. This entry was not stored.",
          currentRevision: 9,
          incomingRevision: 4,
          data: workspace(9, { projectName: "Kept on hub" }),
        },
        409
      );
    updateContract("c1", { projectName: "Local only" });
    await assert.rejects(() => flushWorkspace(), /The hub changed/);
    const saved = await confirmWorkspaceSave();
    assert.equal(saved, false);
    assert.equal(getSaveNotice()?.tone, "error");
    assert.equal(
      getSaveNotice()?.text,
      "The hub changed. This save was not kept."
    );
    assert.equal(getData().workspaceRevision, 9);
    assert.equal(getData().contracts[0]?.projectName, "Kept on hub");

    putResponder = (raw) => {
      const sent = JSON.parse(raw) as { baseRevision?: number };
      assert.equal(sent.baseRevision, 9);
      return jsonResponse({
        ok: true,
        workspaceRevision: 10,
        data: workspace(10, { projectName: "Retried" }),
      });
    };
    updateContract("c1", { projectName: "Retried" });
    const retried = await confirmWorkspaceSave();
    assert.equal(retried, true);
    assert.equal(getSaveNotice()?.text, "Saved.");
    assert.equal(getData().workspaceRevision, 10);
    assert.equal(getData().contracts[0]?.projectName, "Retried");
  });

  test("a stale save with no copy in the response still loads the hub", async () => {
    await hydrateWith(workspace(4, { projectName: "Old" }));
    putResponder = () =>
      jsonResponse({ ok: false, skipped: "refuse-stale-revision" }, 409);
    updateContract("c1", { projectName: "Local only" });
    const pending = flushWorkspace();
    await waitFor("GET");
    releaseNext("GET", workspace(9, { projectName: "Kept on hub" }));
    await assert.rejects(() => pending, /The hub changed/);
    const saved = await confirmWorkspaceSave();
    assert.equal(saved, false);
    assert.notEqual(getSaveNotice()?.text, "Saved.");
    assert.equal(getData().workspaceRevision, 9);
    assert.equal(getData().contracts[0]?.projectName, "Kept on hub");
  });
});
