import assert from "node:assert/strict";
import test from "node:test";
import {
  amendmentDeleteError,
  boqCallbackOffers,
  taxInvoiceQuantityIssues,
} from "@/lib/amendment-callback";
import {
  addContract,
  addDeliveryChallan,
  addInvoice,
  addPayment,
  amendContractBoq,
  deleteLatestAmendment,
  editLatestAmendment,
  editLatestAmendmentIn,
  getData,
  installedQty,
  recordInstallationTotal,
  saveContractSchedulePlan,
  suppliedQty,
} from "@/lib/store";
import {
  boqTotal,
  type BoqItem,
  type Invoice,
  type InvoiceLine,
} from "@/lib/types";

function item(
  id: string,
  name: string,
  rate: number,
  quantity = 10
): BoqItem {
  return {
    id,
    catalogKey: name.toLowerCase(),
    name,
    unit: "Nos",
    rate,
    quantity,
  };
}

function makeContract(projectNo: string, boq: BoqItem[]) {
  return addContract({
    projectName: projectNo,
    projectNo,
    orderNos: projectNo,
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: boqTotal(boq),
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { advance: 40, supply: 60 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 0,
    dlpMonths: 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    contractorAssigned: "",
    boq,
  }).contract;
}

function invoiceLine(
  source: { id: string; name: string; rate: number },
  termKey: string,
  billedQty: number,
  rate = source.rate,
  termPercent = termKey === "advance" ? 40 : 60
): InvoiceLine {
  return {
    boqItemId: source.id,
    itemName: source.name,
    termKey,
    billedQty,
    rate,
    termPercent,
    lineNet: (rate * billedQty * termPercent) / 100,
  };
}

function savedContract(id: string) {
  const contract = getData().contracts.find((row) => row.id === id);
  assert.ok(contract);
  return contract;
}

function savedInvoice(id: string): Invoice {
  const invoice = getData().invoices.find((row) => row.id === id);
  assert.ok(invoice);
  return invoice;
}

function offerText(contractId: string) {
  const contract = savedContract(contractId);
  return boqCallbackOffers({
    contract,
    invoices: getData().invoices,
  }).map(
    (offer) =>
      `${offer.itemName}|${offer.termKey}|${offer.quantity}|${offer.rate}|${offer.termPercent}`
  );
}

test("worked example carries supply, leaves invoices, and lists the callback mismatch", () => {
  const itemA = item("ex-a", "Item A", 100);
  const itemB = item("ex-b", "Item B", 200);
  const itemC = item("ex-c", "Item C", 300);
  const itemD = item("ex-d", "Item D", 400);
  const itemE = item("ex-e", "Item E", 500);
  const contract = makeContract("C-AMD-EXAMPLE", [
    itemA,
    itemB,
    itemC,
    itemD,
    itemE,
  ]);
  const advance = addInvoice({
    type: "TI",
    number: "TI-EX-ADV",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [itemA, itemB, itemC, itemD, itemE].map((row) =>
      invoiceLine(row, "advance", 10)
    ),
  });
  const supply = addInvoice({
    type: "TI",
    number: "TI-EX-SUP",
    date: "2026-10-03",
    contractId: contract.id,
    lines: [
      invoiceLine(itemA, "supply", 5),
      invoiceLine(itemB, "supply", 5),
    ],
  });
  const proforma = addInvoice({
    type: "PI",
    number: "PI-EX",
    date: "2026-10-04",
    contractId: contract.id,
    lines: [invoiceLine(itemC, "advance", 100)],
  });
  assert.ok(advance && supply && proforma);
  const advanceBefore = structuredClone(savedInvoice(advance.id));
  const supplyBefore = structuredClone(savedInvoice(supply.id));
  const challan = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-EX-A",
    date: "2026-10-04",
    lines: [{ boqItemId: itemA.id, qty: 4 }],
  });
  assert.equal(challan.ok, true);
  const installed = recordInstallationTotal({
    contractId: contract.id,
    boqItemId: itemA.id,
    newTotal: 2,
    date: "2026-10-05",
  });
  assert.equal(installed.ok, true);
  const removedSupply = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-EX-E",
    date: "2026-10-05",
    lines: [{ boqItemId: itemE.id, qty: 3 }],
  });
  assert.equal(removedSupply.ok, true);

  const itemANext = item("ex-a-new", "Item A", 1000, 10);
  const amended = amendContractBoq({
    contractId: contract.id,
    boq: [
      itemANext,
      { ...itemB, quantity: 20 },
      { ...itemC, quantity: 5 },
      itemD,
    ],
    newOrderValue: 10 * 1000 + 20 * 200 + 5 * 300 + 10 * 400,
    date: "2026-10-06",
    number: "A1",
  });
  assert.equal(amended.ok, true);
  if (!amended.ok) return;

  const next = savedContract(contract.id);
  assert.equal(next.orderValue, 19500);
  const shownA = next.boq.find((row) => row.name === "Item A");
  assert.ok(shownA);
  assert.equal(shownA.id, "ex-a-new");
  assert.equal(shownA.rate, 1000);
  assert.equal(shownA.quantity, 10);
  assert.equal(suppliedQty(contract.id, shownA.id), 4);
  assert.equal(installedQty(contract.id, shownA.id), 2);
  assert.equal(suppliedQty(contract.id, itemA.id), 0);
  assert.equal(installedQty(contract.id, itemA.id), 0);
  assert.equal(next.boq.find((row) => row.name === "Item B")?.quantity, 20);
  assert.equal(next.boq.find((row) => row.name === "Item B")?.rate, 200);
  assert.equal(next.boq.find((row) => row.name === "Item C")?.quantity, 5);
  assert.equal(next.boq.find((row) => row.name === "Item E"), undefined);
  assert.equal(suppliedQty(contract.id, itemE.id), 3);
  assert.deepEqual(savedInvoice(advance.id), advanceBefore);
  assert.deepEqual(savedInvoice(supply.id), supplyBefore);
  assert.equal(savedInvoice(proforma.id).type, "PI");

  assert.deepEqual(offerText(contract.id), [
    "Item A|advance|-10|100|40",
    "Item A|supply|-5|100|60",
    "Item C|advance|-5|300|40",
    "Item E|advance|-10|500|40",
  ]);

  const room = taxInvoiceQuantityIssues({
    contract: next,
    invoices: getData().invoices,
    lines: [invoiceLine(itemB, "advance", 10), invoiceLine(itemB, "supply", 15)],
  });
  assert.deepEqual(room, []);
  const over = taxInvoiceQuantityIssues({
    contract: next,
    invoices: getData().invoices,
    lines: [invoiceLine(itemB, "advance", 11)],
  });
  assert.match(over[0] ?? "", /above the BOQ quantity 20/);

  const schedule = saveContractSchedulePlan({
    contractId: contract.id,
    committed: false,
    testingDate: "",
    handoverDate: "",
    items: [
      {
        boqItemId: itemD.id,
        supplies: [
          { startDate: "2026-10-07", endDate: "2026-10-08", quantity: 10 },
        ],
        installations: [],
      },
    ],
  });
  assert.equal(schedule.ok, true);
  assert.deepEqual(offerText(contract.id), [
    "Item A|advance|-10|100|40",
    "Item A|supply|-5|100|60",
    "Item C|advance|-5|300|40",
    "Item E|advance|-10|500|40",
  ]);
  const scheduleLine = getData().schedules.find(
    (row) => row.contractId === contract.id && row.boqItemId === itemD.id
  );
  assert.equal(scheduleLine?.boqItemId, itemD.id);

  const payment = addPayment({
    contractId: contract.id,
    invoiceId: advance.id,
    link: "TI",
    date: "2026-10-08",
    netAmount: 100,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
  });
  assert.ok(payment);

  const billedNewRate = addInvoice({
    type: "TI",
    number: "TI-EX-NEW",
    date: "2026-10-09",
    contractId: contract.id,
    lines: [invoiceLine(itemANext, "advance", 10, 1000)],
  });
  assert.ok(billedNewRate);
  const overNewRate = taxInvoiceQuantityIssues({
    contract: savedContract(contract.id),
    invoices: getData().invoices,
    lines: [invoiceLine(itemANext, "advance", 1, 1000)],
  });
  assert.match(overNewRate[0] ?? "", /Item A, Advance/);
  assert.match(overNewRate[0] ?? "", /above the BOQ quantity 10/);
  assert.deepEqual(
    offerText(contract.id).filter((row) => row.startsWith("Item A|advance")),
    ["Item A|advance|-10|100|40"]
  );

  const callbackOnly = addInvoice({
    type: "TI",
    number: "TI-EX-E",
    date: "2026-10-09",
    contractId: contract.id,
    lines: [invoiceLine(itemE, "advance", -10, 500)],
  });
  assert.ok(callbackOnly);
  assert.ok(callbackOnly.finalAmount < 0);
  assert.equal(savedInvoice(advance.id).lines.find((line) => line.boqItemId === itemE.id)?.billedQty, 10);

  const callback = addInvoice({
    type: "TI",
    number: "TI-EX-CB",
    date: "2026-10-09",
    contractId: contract.id,
    lines: [
      invoiceLine(itemA, "advance", -10, 100),
      invoiceLine(itemB, "advance", 10),
      invoiceLine(itemC, "advance", -5, 300),
    ],
  });
  assert.ok(callback);
  assert.equal(savedInvoice(advance.id).lines[0]?.rate, 100);
  assert.equal(savedInvoice(advance.id).lines[0]?.billedQty, 10);
  assert.equal(getData().payments.find((row) => row.id === payment.id)?.netAmount, 100);
  assert.equal(
    getData().payments.find((row) => row.id === payment.id)?.invoiceId,
    advance.id
  );
  assert.deepEqual(
    offerText(contract.id).filter((row) => row.startsWith("Item A|advance")),
    []
  );
  assert.deepEqual(
    offerText(contract.id).filter((row) => row.startsWith("Item A|supply")),
    ["Item A|supply|-5|100|60"]
  );

  const belowZero = addInvoice({
    type: "TI",
    number: "TI-EX-FLOOR",
    date: "2026-10-10",
    contractId: contract.id,
    lines: [invoiceLine(itemA, "supply", -6, 100)],
  });
  assert.equal(belowZero, null);
  const floor = taxInvoiceQuantityIssues({
    contract: savedContract(contract.id),
    invoices: getData().invoices,
    lines: [invoiceLine(itemA, "supply", -6, 100)],
  });
  assert.match(floor[0] ?? "", /cannot go below 0/);
  const supplyCallback = addInvoice({
    type: "TI",
    number: "TI-EX-SUP-CB",
    date: "2026-10-10",
    contractId: contract.id,
    lines: [invoiceLine(itemA, "supply", -5, 100)],
  });
  assert.ok(supplyCallback);
  assert.deepEqual(offerText(contract.id), []);
});

test("a schedule stops the amendment and is not moved onto the new line", () => {
  const kept = item("sch-a", "Scheduled item", 100, 10);
  const contract = makeContract("C-AMD-SCH", [kept]);
  const plan = saveContractSchedulePlan({
    contractId: contract.id,
    committed: false,
    testingDate: "",
    handoverDate: "",
    items: [
      {
        boqItemId: kept.id,
        supplies: [
          { startDate: "2026-10-02", endDate: "2026-10-03", quantity: 4 },
        ],
        installations: [],
      },
    ],
  });
  assert.equal(plan.ok, true);
  const before = getData().schedules.filter((row) => row.contractId === contract.id);
  const amended = amendContractBoq({
    contractId: contract.id,
    boq: [item("sch-a-new", "Scheduled item", 250, 10)],
    newOrderValue: 2500,
    date: "2026-10-04",
    number: "A1",
  });
  assert.equal(amended.ok, false);
  if (amended.ok) return;
  assert.match(amended.error, /Scheduled item: delete the schedule first/);
  const after = getData().schedules.filter((row) => row.contractId === contract.id);
  assert.deepEqual(after, before);
  assert.equal(savedContract(contract.id).boq[0]?.id, kept.id);
  assert.equal(savedContract(contract.id).amendments.length, 0);

  const testingOnly = makeContract("C-AMD-TEST", [item("test-a", "Plain item", 50, 2)]);
  const testing = saveContractSchedulePlan({
    contractId: testingOnly.id,
    committed: false,
    testingDate: "2026-11-01",
    testingEdited: true,
    handoverDate: "",
    items: [],
  });
  assert.equal(testing.ok, true);
  const stopped = amendContractBoq({
    contractId: testingOnly.id,
    boq: [item("test-a", "Plain item", 50, 1)],
    newOrderValue: 50,
    date: "2026-10-05",
    number: "A1",
  });
  assert.equal(stopped.ok, false);
  if (stopped.ok) return;
  assert.equal(stopped.error, "Delete the schedule first.");
});

test("quantity can fall below supply and installation, and a removed invoice line can go", () => {
  const cut = item("cut-a", "Cut item", 80, 10);
  const contract = makeContract("C-AMD-CUT", [cut, item("cut-b", "Other item", 10, 1)]);
  const challan = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-CUT",
    date: "2026-10-02",
    lines: [{ boqItemId: cut.id, qty: 8 }],
  });
  assert.equal(challan.ok, true);
  const installed = recordInstallationTotal({
    contractId: contract.id,
    boqItemId: cut.id,
    newTotal: 6,
    date: "2026-10-03",
  });
  assert.equal(installed.ok, true);
  const invoice = addInvoice({
    type: "TI",
    number: "TI-CUT",
    date: "2026-10-03",
    contractId: contract.id,
    lines: [invoiceLine(cut, "advance", 9)],
  });
  assert.ok(invoice);
  const amended = amendContractBoq({
    contractId: contract.id,
    boq: [{ ...cut, quantity: 3 }, item("cut-b", "Other item", 10, 1)],
    newOrderValue: 3 * 80 + 10,
    date: "2026-10-04",
    number: "A1",
  });
  assert.equal(amended.ok, true);
  assert.equal(savedContract(contract.id).boq.find((row) => row.id === cut.id)?.quantity, 3);
  assert.equal(suppliedQty(contract.id, cut.id), 8);
  assert.equal(installedQty(contract.id, cut.id), 6);
  assert.equal(savedInvoice(invoice.id).lines[0]?.billedQty, 9);
});

test("an existing line cannot take a new rate in place", () => {
  const row = item("rate-a", "Rate item", 100, 4);
  const contract = makeContract("C-AMD-RATE", [row]);
  const amended = amendContractBoq({
    contractId: contract.id,
    boq: [{ ...row, rate: 250 }],
    newOrderValue: 1000,
    date: "2026-10-04",
    number: "A1",
  });
  assert.equal(amended.ok, false);
  if (amended.ok) return;
  assert.match(amended.error, /cannot change the rate on an existing line/);
  assert.equal(savedContract(contract.id).boq[0]?.rate, 100);
});

test("deleting the latest amendment restores the previous BOQ and moves quantities back", () => {
  const row = item("del-a", "Carry item", 100, 10);
  const contract = makeContract("C-AMD-DEL", [row]);
  const challan = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-DEL",
    date: "2026-10-02",
    lines: [{ boqItemId: row.id, qty: 4 }],
  });
  assert.equal(challan.ok, true);
  const installed = recordInstallationTotal({
    contractId: contract.id,
    boqItemId: row.id,
    newTotal: 2,
    date: "2026-10-03",
  });
  assert.equal(installed.ok, true);
  const first = amendContractBoq({
    contractId: contract.id,
    boq: [{ ...row, quantity: 12 }],
    newOrderValue: 1200,
    date: "2026-10-04",
    number: "A1",
  });
  assert.equal(first.ok, true);
  const replacement = item("del-a-new", "Carry item", 1000, 12);
  const second = amendContractBoq({
    contractId: contract.id,
    boq: [replacement],
    newOrderValue: 12000,
    date: "2026-10-05",
    number: "A2",
  });
  assert.equal(second.ok, true);
  assert.equal(suppliedQty(contract.id, replacement.id), 4);
  assert.equal(installedQty(contract.id, replacement.id), 2);

  const removedSecond = deleteLatestAmendment(contract.id);
  assert.equal(removedSecond.ok, true);
  if (!removedSecond.ok) return;
  assert.equal(removedSecond.contract.amendments.length, 1);
  assert.equal(removedSecond.contract.amendments[0]?.number, "A1");
  assert.equal(removedSecond.contract.orderValue, 1200);
  assert.equal(removedSecond.contract.boq[0]?.id, row.id);
  assert.equal(removedSecond.contract.boq[0]?.rate, 100);
  assert.equal(removedSecond.contract.boq[0]?.quantity, 12);
  assert.equal(suppliedQty(contract.id, row.id), 4);
  assert.equal(installedQty(contract.id, row.id), 2);
  assert.equal(suppliedQty(contract.id, replacement.id), 0);

  const removedFirst = deleteLatestAmendment(contract.id);
  assert.equal(removedFirst.ok, true);
  if (!removedFirst.ok) return;
  assert.equal(removedFirst.contract.amendments.length, 0);
  assert.equal(removedFirst.contract.orderValue, 1000);
  assert.equal(removedFirst.contract.boq[0]?.quantity, 10);
  assert.equal(suppliedQty(contract.id, row.id), 4);
  assert.equal(getData().contracts.find((c) => c.id === contract.id)?.amendments.length, 0);
});

test("delete is blocked by a new rate, extra quantity, supply, and a schedule", () => {
  const row = item("blk-a", "Blocked item", 100, 10);
  const contract = makeContract("C-AMD-BLOCK", [row]);
  const advance = addInvoice({
    type: "TI",
    number: "TI-BLK-ADV",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [invoiceLine(row, "advance", 10)],
  });
  assert.ok(advance);
  const challan = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-BLK",
    date: "2026-10-02",
    lines: [{ boqItemId: row.id, qty: 10 }],
  });
  assert.equal(challan.ok, true);
  const raised = amendContractBoq({
    contractId: contract.id,
    boq: [item("blk-a-new", "Blocked item", 1000, 20), item("blk-f", "Fresh item", 50, 4)],
    newOrderValue: 20 * 1000 + 4 * 50,
    date: "2026-10-03",
    number: "A1",
  });
  assert.equal(raised.ok, true);
  const fresh = item("blk-f", "Fresh item", 50, 4);
  const billedNew = addInvoice({
    type: "TI",
    number: "TI-BLK-NEW",
    date: "2026-10-04",
    contractId: contract.id,
    lines: [invoiceLine({ id: "blk-a-new", name: "Blocked item", rate: 1000 }, "advance", 10, 1000)],
  });
  assert.ok(billedNew);
  const oldCallback = addInvoice({
    type: "TI",
    number: "TI-BLK-OLD",
    date: "2026-10-05",
    contractId: contract.id,
    lines: [invoiceLine(row, "advance", -10, 100)],
  });
  assert.ok(oldCallback);
  const stillBilled = deleteLatestAmendment(contract.id);
  assert.equal(stillBilled.ok, false);
  if (stillBilled.ok) return;
  assert.match(stillBilled.error, /1,000/);
  assert.equal(savedContract(contract.id).amendments.length, 1);

  const clearedRate = addInvoice({
    type: "TI",
    number: "TI-BLK-CLEAR",
    date: "2026-10-06",
    contractId: contract.id,
    lines: [invoiceLine({ id: "blk-a-new", name: "Blocked item", rate: 1000 }, "advance", -10, 1000)],
  });
  assert.ok(clearedRate);
  const freshBill = addInvoice({
    type: "TI",
    number: "TI-BLK-FRESH",
    date: "2026-10-06",
    contractId: contract.id,
    lines: [invoiceLine(fresh, "supply", 2)],
  });
  assert.ok(freshBill);
  const freshBlock = deleteLatestAmendment(contract.id);
  assert.equal(freshBlock.ok, false);
  if (freshBlock.ok) return;
  assert.match(freshBlock.error, /Fresh item/);
  const freshClear = addInvoice({
    type: "TI",
    number: "TI-BLK-FRESH-CLEAR",
    date: "2026-10-06",
    contractId: contract.id,
    lines: [invoiceLine(fresh, "supply", -2)],
  });
  assert.ok(freshClear);
  const installBlock = amendmentDeleteError({
    contract: savedContract(contract.id),
    invoices: [],
    deliveryChallans: [],
    installationProgress: [
      {
        id: "inst-blk",
        contractId: contract.id,
        boqItemId: "blk-a-new",
        installedQty: 12,
        lastUpdatedAt: "2026-10-06",
        history: [],
      },
    ],
    schedules: [],
  });
  assert.match(
    installBlock ?? "",
    /installed quantity 12 is above the previous BOQ quantity 10/
  );
  const extraSupply = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-BLK-MORE",
    date: "2026-10-06",
    lines: [{ boqItemId: "blk-a-new", qty: 5 }],
  });
  assert.equal(extraSupply.ok, true);
  const supplyBlock = deleteLatestAmendment(contract.id);
  assert.equal(supplyBlock.ok, false);
  if (supplyBlock.ok) return;
  assert.match(supplyBlock.error, /supplied quantity 15 is above the previous BOQ quantity 10/);

  const schedule = saveContractSchedulePlan({
    contractId: contract.id,
    committed: false,
    testingDate: "",
    handoverDate: "",
    items: [
      {
        boqItemId: "blk-a-new",
        supplies: [
          { startDate: "2026-10-08", endDate: "2026-10-09", quantity: 1 },
        ],
        installations: [],
      },
    ],
  });
  assert.equal(schedule.ok, true);
  const scheduled = deleteLatestAmendment(contract.id);
  assert.equal(scheduled.ok, false);
  if (scheduled.ok) return;
  assert.match(scheduled.error, /Blocked item: delete the schedule first/);
  assert.equal(savedContract(contract.id).amendments[0]?.number, "A1");
});

test("billing above the previous quantity blocks delete until that quantity is reversed", () => {
  const row = item("qty-a", "Qty item", 200, 10);
  const contract = makeContract("C-AMD-QTY", [row]);
  const first = addInvoice({
    type: "TI",
    number: "TI-QTY-1",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [invoiceLine(row, "advance", 10)],
  });
  assert.ok(first);
  const amended = amendContractBoq({
    contractId: contract.id,
    boq: [{ ...row, quantity: 20 }],
    newOrderValue: 4000,
    date: "2026-10-03",
    number: "A1",
  });
  assert.equal(amended.ok, true);
  const extra = addInvoice({
    type: "TI",
    number: "TI-QTY-2",
    date: "2026-10-04",
    contractId: contract.id,
    lines: [invoiceLine(row, "advance", 5)],
  });
  assert.ok(extra);
  const blocked = deleteLatestAmendment(contract.id);
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.match(blocked.error, /belongs to this amendment/);
  const reversed = addInvoice({
    type: "TI",
    number: "TI-QTY-3",
    date: "2026-10-05",
    contractId: contract.id,
    lines: [invoiceLine(row, "advance", -5)],
  });
  assert.ok(reversed);
  const removed = deleteLatestAmendment(contract.id);
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(removed.contract.boq[0]?.quantity, 10);
  assert.equal(removed.contract.orderValue, 2000);
  assert.equal(removed.contract.amendments.length, 0);
});

test("editing the latest amendment replaces it and moves supply onto the new name", () => {
  const row = item("edit-a", "Edit item", 100, 10);
  const contract = makeContract("C-AMD-EDIT", [row]);
  const billed = addInvoice({
    type: "TI",
    number: "TI-EDIT-OLD",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [invoiceLine(row, "advance", 4)],
  });
  if (!billed) {
    assert.fail("invoice was not saved");
    return;
  }
  const invoiceId = billed.id;
  const challan = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-EDIT",
    date: "2026-10-02",
    lines: [{ boqItemId: row.id, qty: 4 }],
  });
  assert.equal(challan.ok, true);
  const installed = recordInstallationTotal({
    contractId: contract.id,
    boqItemId: row.id,
    newTotal: 2,
    date: "2026-10-03",
  });
  assert.equal(installed.ok, true);
  const first = amendContractBoq({
    contractId: contract.id,
    boq: [{ ...row, quantity: 12 }],
    newOrderValue: 1200,
    date: "2026-10-04",
    number: "A1",
    note: "first",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = amendContractBoq({
    contractId: contract.id,
    boq: [{ ...row, quantity: 14 }],
    newOrderValue: 1400,
    date: "2026-10-05",
    number: "A2",
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const replacement = item("edit-a-new", "Edit item", 1000, 14);
  const edited = editLatestAmendment({
    contractId: contract.id,
    boq: [replacement],
    newOrderValue: 14000,
    date: "2026-11-01",
    number: "A2-R",
    note: "rate revised",
    by: "Master",
  });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.contract.amendments.length, 2);
  assert.equal(edited.contract.amendments[0]?.id, first.amendment.id);
  assert.equal(edited.contract.amendments[0]?.number, "A1");
  assert.equal(edited.contract.amendments[0]?.newOrderValue, 1200);
  const latest = edited.contract.amendments[1];
  assert.equal(latest?.id, second.amendment.id);
  assert.equal(latest?.number, "A2-R");
  assert.equal(latest?.date, "2026-11-01");
  assert.equal(latest?.note, "rate revised");
  assert.equal(latest?.previousOrderValue, 1200);
  assert.equal(latest?.newOrderValue, 14000);
  assert.equal(latest?.lineDiffs.find((diff) => diff.kind === "removed")?.previousQty, 12);
  assert.equal(edited.contract.orderValue, 14000);
  assert.equal(edited.contract.boq.length, 1);
  assert.equal(edited.contract.boq[0]?.id, replacement.id);
  assert.equal(edited.contract.boq[0]?.rate, 1000);
  assert.equal(suppliedQty(contract.id, replacement.id), 4);
  assert.equal(installedQty(contract.id, replacement.id), 2);
  assert.equal(suppliedQty(contract.id, row.id), 0);
  assert.equal(installedQty(contract.id, row.id), 0);
  const invoice = savedInvoice(invoiceId);
  assert.equal(invoice.lines[0]?.rate, 100);
  assert.equal(invoice.lines[0]?.boqItemId, row.id);
});

test("edit is blocked by the same schedule, billing, supply, and installation rules as delete", () => {
  const row = item("edit-blk", "Edit blocked", 100, 10);
  const contract = makeContract("C-AMD-EDIT-BLOCK", [row]);
  const raised = amendContractBoq({
    contractId: contract.id,
    boq: [item("edit-blk-new", "Edit blocked", 1000, 20)],
    newOrderValue: 20000,
    date: "2026-10-03",
    number: "A1",
  });
  assert.equal(raised.ok, true);
  const replacement = item("edit-blk-other", "Edit blocked", 800, 10);
  const attempt = () =>
    editLatestAmendment({
      contractId: contract.id,
      boq: [replacement],
      newOrderValue: 8000,
      date: "2026-10-09",
      number: "A1",
    });

  const billedNew = addInvoice({
    type: "TI",
    number: "TI-EDIT-NEW",
    date: "2026-10-04",
    contractId: contract.id,
    lines: [
      invoiceLine(
        { id: "edit-blk-new", name: "Edit blocked", rate: 1000 },
        "advance",
        10,
        1000
      ),
    ],
  });
  assert.ok(billedNew);
  const billedBlock = attempt();
  assert.equal(billedBlock.ok, false);
  if (billedBlock.ok) return;
  assert.match(billedBlock.error, /1,000/);
  assert.equal(savedContract(contract.id).amendments.length, 1);
  assert.equal(savedContract(contract.id).boq[0]?.id, "edit-blk-new");
  const cleared = addInvoice({
    type: "TI",
    number: "TI-EDIT-CLEAR",
    date: "2026-10-05",
    contractId: contract.id,
    lines: [
      invoiceLine(
        { id: "edit-blk-new", name: "Edit blocked", rate: 1000 },
        "advance",
        -10,
        1000
      ),
    ],
  });
  assert.ok(cleared);

  const extraSupply = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-EDIT-MORE",
    date: "2026-10-06",
    lines: [{ boqItemId: "edit-blk-new", qty: 15 }],
  });
  assert.equal(extraSupply.ok, true);
  const supplyBlock = attempt();
  const supplyDelete = amendmentDeleteError({
    contract: savedContract(contract.id),
    invoices: getData().invoices,
    deliveryChallans: getData().deliveryChallans,
    installationProgress: getData().installationProgress,
    schedules: getData().schedules,
  });
  assert.equal(supplyBlock.ok, false);
  if (supplyBlock.ok) return;
  assert.equal(supplyBlock.error, supplyDelete);
  assert.match(
    supplyBlock.error,
    /supplied quantity 15 is above the previous BOQ quantity 10/
  );

  const schedule = saveContractSchedulePlan({
    contractId: contract.id,
    committed: false,
    testingDate: "",
    handoverDate: "",
    items: [
      {
        boqItemId: "edit-blk-new",
        supplies: [
          { startDate: "2026-10-08", endDate: "2026-10-09", quantity: 1 },
        ],
        installations: [],
      },
    ],
  });
  assert.equal(schedule.ok, true);
  const scheduled = attempt();
  assert.equal(scheduled.ok, false);
  if (scheduled.ok) return;
  assert.match(scheduled.error, /Edit blocked: delete the schedule first/);
  assert.equal(savedContract(contract.id).amendments[0]?.number, "A1");
  assert.equal(savedContract(contract.id).boq[0]?.rate, 1000);

  const current = getData();
  const installBlock = editLatestAmendmentIn(
    {
      ...current,
      schedules: current.schedules.filter((line) => line.contractId !== contract.id),
      deliveryChallans: current.deliveryChallans.filter(
        (challan) => challan.contractId !== contract.id
      ),
      installationProgress: [
        ...current.installationProgress,
        {
          id: "inst-edit",
          contractId: contract.id,
          boqItemId: "edit-blk-new",
          installedQty: 12,
          lastUpdatedAt: "2026-10-06",
          history: [],
        },
      ],
    },
    {
      contractId: contract.id,
      boq: [replacement],
      newOrderValue: 8000,
      date: "2026-10-09",
      number: "A1",
    }
  );
  assert.equal(installBlock.ok, false);
  if (installBlock.ok) return;
  assert.match(
    installBlock.error,
    /installed quantity 12 is above the previous BOQ quantity 10/
  );
  assert.equal(savedContract(contract.id).amendments.length, 1);
});
