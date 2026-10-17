import assert from "node:assert/strict";
import test from "node:test";
import {
  billingTermChoices,
  previewInvoiceLine,
  previewInvoiceLines,
  recalcTouchedInvoiceLine,
  type InvoiceEditDraft,
} from "@/lib/invoice-line-edit";
import {
  addContract,
  addInvoice,
  addPayment,
  convertPiToTi,
  editContractBoq,
  getData,
  invoiceOutstanding,
  invoiceRetentionHold,
  invoiceTdsHold,
  lineNet,
  saveContractBillingTerms,
  updateInvoice,
} from "@/lib/store";
import { GST_RATE, type BillingTerms, type BoqItem, type Invoice, type InvoiceLine } from "@/lib/types";

const TODAY_RATE = 500;
const TODAY_SUPPLY = 10;
const TODAY_INSTALLATION = 90;

function boqItem(id: string, rate: number, name = "Panel"): BoqItem {
  return {
    id,
    catalogKey: id,
    name,
    unit: "Nos",
    rate,
    quantity: 10,
  };
}

function storedDraft(
  line: Pick<InvoiceLine, "boqItemId" | "termKey" | "billedQty" | "rate" | "termPercent" | "itemName">
): InvoiceEditDraft {
  return {
    boqItemId: line.boqItemId,
    termKey: line.termKey,
    billedQty: line.billedQty,
    stored: {
      rate: line.rate,
      termPercent: line.termPercent,
      itemName: line.itemName,
    },
  };
}

test("an existing line keeps its stored rate and percent when today's BOQ differs", () => {
  const today: BillingTerms = { supply: TODAY_SUPPLY, installation: TODAY_INSTALLATION };
  const boq = [boqItem("boq-1", TODAY_RATE, "Panel today")];
  const line = previewInvoiceLine(
    storedDraft({
      boqItemId: "boq-1",
      itemName: "Panel as billed",
      termKey: "supply",
      billedQty: 2,
      rate: 100,
      termPercent: 40,
    }),
    boq,
    today
  );
  assert.ok(line);
  assert.equal(line.itemName, "Panel as billed");
  assert.equal(line.rate, 100);
  assert.equal(line.termPercent, 40);
  assert.equal(line.billedQty, 2);
  assert.equal(line.lineNet, 80);
  assert.notEqual(line.lineNet, lineNet(TODAY_RATE, 2, TODAY_SUPPLY));

  const moreQty = previewInvoiceLine(
    storedDraft({
      boqItemId: "boq-1",
      itemName: "Panel as billed",
      termKey: "installation",
      billedQty: 5,
      rate: 100,
      termPercent: 40,
    }),
    boq,
    today
  );
  assert.ok(moreQty);
  assert.equal(moreQty.termKey, "installation");
  assert.equal(moreQty.termPercent, 40);
  assert.equal(moreQty.rate, 100);
  assert.equal(moreQty.lineNet, 200);
  assert.notEqual(moreQty.lineNet, lineNet(TODAY_RATE, 5, TODAY_INSTALLATION));
});

test("a newly added line uses today's BOQ rate and today's term percent", () => {
  const lines = previewInvoiceLines(
    [
      storedDraft({
        boqItemId: "boq-1",
        itemName: "Panel",
        termKey: "supply",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
      }),
      {
        boqItemId: "boq-1",
        termKey: "supply",
        billedQty: 1,
      },
    ],
    [boqItem("boq-1", TODAY_RATE)],
    { supply: TODAY_SUPPLY, installation: TODAY_INSTALLATION }
  );
  assert.equal(lines[0]?.rate, 100);
  assert.equal(lines[0]?.termPercent, 40);
  assert.equal(lines[0]?.lineNet, 80);
  assert.equal(lines[1]?.rate, TODAY_RATE);
  assert.equal(lines[1]?.termPercent, TODAY_SUPPLY);
  assert.equal(lines[1]?.lineNet, lineNet(TODAY_RATE, 1, TODAY_SUPPLY));
});

test("a stored zero rate or zero percent stays zero", () => {
  const boq = [boqItem("boq-1", 100)];
  const terms: BillingTerms = { supply: 40 };
  const zeroRate = previewInvoiceLine(
    storedDraft({
      boqItemId: "boq-1",
      itemName: "Panel",
      termKey: "supply",
      billedQty: 2,
      rate: 0,
      termPercent: 40,
    }),
    boq,
    terms
  );
  const zeroPercent = previewInvoiceLine(
    storedDraft({
      boqItemId: "boq-1",
      itemName: "Panel",
      termKey: "supply",
      billedQty: 2,
      rate: 100,
      termPercent: 0,
    }),
    boq,
    terms
  );
  assert.equal(zeroRate?.rate, 0);
  assert.equal(zeroRate?.lineNet, 0);
  assert.equal(zeroPercent?.termPercent, 0);
  assert.equal(zeroPercent?.lineNet, 0);
});

test("a negative quantity keeps the stored rate and percent", () => {
  const line = previewInvoiceLine(
    storedDraft({
      boqItemId: "boq-1",
      itemName: "Panel",
      termKey: "supply",
      billedQty: -2,
      rate: 100,
      termPercent: 40,
    }),
    [boqItem("boq-1", TODAY_RATE)],
    { supply: TODAY_SUPPLY }
  );
  assert.equal(line?.billedQty, -2);
  assert.equal(line?.rate, 100);
  assert.equal(line?.termPercent, 40);
  assert.equal(line?.lineNet, -80);
});

test("the line's own term stays available when that percent is now zero", () => {
  const choices = billingTermChoices(
    { supply: 0, installation: 100 },
    "supply"
  );
  assert.deepEqual(choices, ["supply", "installation"]);
  assert.deepEqual(
    billingTermChoices({ supply: 40, installation: 60 }, "supply"),
    ["supply", "installation"]
  );
});

test("a touched proforma line keeps its stored percent", () => {
  const line: InvoiceLine = {
    boqItemId: "boq-1",
    itemName: "Panel",
    termKey: "supply",
    billedQty: 2,
    rate: 100,
    termPercent: 40,
    lineNet: 80,
  };
  const qty = recalcTouchedInvoiceLine(line, { billedQty: 4 });
  assert.equal(qty.rate, 100);
  assert.equal(qty.termPercent, 40);
  assert.equal(qty.termKey, "supply");
  assert.equal(qty.lineNet, 160);
  assert.notEqual(qty.lineNet, lineNet(TODAY_RATE, 4, TODAY_SUPPLY));

  const term = recalcTouchedInvoiceLine(line, { termKey: "installation" });
  assert.equal(term.termKey, "installation");
  assert.equal(term.termPercent, 40);
  assert.equal(term.rate, 100);
  assert.equal(term.billedQty, 2);
  assert.equal(term.lineNet, 80);
  assert.notEqual(term.lineNet, lineNet(100, 2, TODAY_INSTALLATION));

  const both = recalcTouchedInvoiceLine(line, {
    termKey: "installation",
    billedQty: 3,
    rate: TODAY_RATE,
    termPercent: TODAY_INSTALLATION,
  });
  assert.equal(both.termKey, "installation");
  assert.equal(both.rate, 100);
  assert.equal(both.termPercent, 40);
  assert.equal(both.lineNet, 120);
});

function makeContract(projectNo: string) {
  return addContract({
    projectName: projectNo,
    projectNo,
    orderNos: projectNo,
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 1000,
    gstApplicable: true,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 40, installation: 60 },
    paymentDueDays: 30,
    retentionPercent: 5,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [boqItem(`boq-${projectNo}`, 100, "Panel")],
  }).contract;
}

function contractById(id: string) {
  const contract = getData().contracts.find((row) => row.id === id);
  assert.ok(contract);
  return contract;
}

function invoiceById(id: string): Invoice {
  const invoice = getData().invoices.find((row) => row.id === id);
  assert.ok(invoice);
  return invoice;
}

function moveContractToToday(contractId: string) {
  const contract = contractById(contractId);
  const edited = editContractBoq({
    contractId,
    boq: contract.boq.map((item) => ({ ...item, rate: TODAY_RATE })),
  });
  assert.equal(edited.ok, true);
  const terms = saveContractBillingTerms(contractId, {
    supply: TODAY_SUPPLY,
    installation: TODAY_INSTALLATION,
  });
  assert.equal(terms.ok, true);
  const today = contractById(contractId);
  assert.equal(today.boq[0]?.rate, TODAY_RATE);
  assert.equal(today.billingTerms.supply, TODAY_SUPPLY);
  assert.equal(today.billingTerms.installation, TODAY_INSTALLATION);
  return today;
}

function assertMoney(
  invoice: Invoice,
  net: number,
  extra: number,
  paidTowardOutstanding: number
) {
  const data = getData();
  const contract = contractById(invoice.contractId);
  const gst = contract.gstApplicable ? net * GST_RATE : 0;
  const total = net + gst + extra;
  const retention = (contract.retentionPercent * net) / 100;
  const tds = (contract.tdsPercent * net) / 100;
  assert.equal(invoice.netAmount, net);
  assert.equal(invoice.gstAmount, gst);
  assert.equal(invoice.finalAmount, total);
  assert.equal(invoiceRetentionHold(invoice, data), retention);
  assert.equal(invoiceTdsHold(invoice, data), tds);
  assert.equal(
    invoiceOutstanding(invoice, data),
    total - retention - tds - paidTowardOutstanding
  );
}

test("a date change with the same quantity does not change the amount", () => {
  const contract = makeContract("C-INV-DATE");
  const invoice = addInvoice({
    type: "TI",
    number: "TI-DATE",
    date: "2026-10-01",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Panel",
        termKey: "supply",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Panel",
        termKey: "installation",
        billedQty: 1,
        rate: 50,
        termPercent: 60,
        lineNet: 30,
      },
    ],
    extraCharges: [{ id: "freight", label: "Freight", amount: 15 }],
  });
  assert.ok(invoice);
  const payment = addPayment({
    contractId: contract.id,
    invoiceId: invoice.id,
    link: "TI",
    date: "2026-10-05",
    netAmount: 20,
    gstAmount: 0,
    retentionAmount: 4,
    tdsAmount: 1,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
  });
  assert.ok(payment);

  moveContractToToday(contract.id);
  const beforePayment = structuredClone(
    getData().payments.find((row) => row.id === payment.id)
  );
  const beforeTasks = structuredClone(getData().tasks);
  const beforeSchedules = structuredClone(getData().schedules);
  const today = contractById(contract.id);
  const saved = invoiceById(invoice.id);
  const drafts = saved.lines.map((line) => storedDraft(line));
  const preview = previewInvoiceLines(drafts, today.boq, today.billingTerms);
  assert.equal(preview[0]?.rate, 100);
  assert.equal(preview[0]?.termPercent, 40);
  assert.equal(preview[0]?.lineNet, 80);
  assert.equal(preview[1]?.rate, 50);
  assert.equal(preview[1]?.termPercent, 60);
  assert.equal(preview[1]?.lineNet, 30);

  const updated = updateInvoice(invoice.id, {
    date: "2026-10-17",
    lines: preview,
    extraCharges: saved.extraCharges,
  });
  assert.ok(updated);
  assert.equal(updated.date, "2026-10-17");
  assert.equal(updated.number, "TI-DATE");
  assertMoney(updated, 110, 15, 20);
  assert.deepEqual(
    getData().payments.find((row) => row.id === payment.id),
    beforePayment
  );
  assert.deepEqual(getData().tasks, beforeTasks);
  assert.deepEqual(getData().schedules, beforeSchedules);
});

test("a quantity change recalculates money from the stored rate and percent", () => {
  const contract = makeContract("C-INV-QTY");
  const invoice = addInvoice({
    type: "TI",
    number: "TI-QTY",
    date: "2026-10-01",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Panel",
        termKey: "supply",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
    ],
    extraCharges: [{ id: "freight", label: "Freight", amount: 15 }],
  });
  assert.ok(invoice);
  const payment = addPayment({
    contractId: contract.id,
    invoiceId: invoice.id,
    link: "TI",
    date: "2026-10-05",
    netAmount: 20,
    gstAmount: 0,
    retentionAmount: 4,
    tdsAmount: 1,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
  });
  assert.ok(payment);
  const beforePayment = structuredClone(
    getData().payments.find((row) => row.id === payment.id)
  );

  const today = moveContractToToday(contract.id);
  const drafts = invoiceById(invoice.id).lines.map((line) =>
    storedDraft({ ...line, billedQty: 5 })
  );
  const preview = previewInvoiceLines(drafts, today.boq, today.billingTerms);
  assert.equal(preview[0]?.billedQty, 5);
  assert.equal(preview[0]?.rate, 100);
  assert.equal(preview[0]?.termPercent, 40);
  assert.equal(preview[0]?.lineNet, 200);
  assert.notEqual(preview[0]?.lineNet, lineNet(TODAY_RATE, 5, TODAY_SUPPLY));

  const updated = updateInvoice(invoice.id, {
    lines: preview,
  });
  assert.ok(updated);
  assert.equal(updated.date, "2026-10-01");
  assertMoney(updated, 200, 15, 20);
  assert.deepEqual(
    getData().payments.find((row) => row.id === payment.id),
    beforePayment
  );
});

test("changing the term on an existing invoice keeps the stored percent", () => {
  const contract = makeContract("C-INV-TERM");
  const invoice = addInvoice({
    type: "TI",
    number: "TI-TERM-EDIT",
    date: "2026-10-01",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Panel",
        termKey: "supply",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
    ],
  });
  assert.ok(invoice);
  const today = moveContractToToday(contract.id);
  const drafts = invoiceById(invoice.id).lines.map((line) => ({
    ...storedDraft(line),
    termKey: "installation",
  }));
  const preview = previewInvoiceLines(drafts, today.boq, today.billingTerms);
  assert.equal(preview[0]?.termKey, "installation");
  assert.equal(preview[0]?.termPercent, 40);
  assert.equal(preview[0]?.rate, 100);
  assert.equal(preview[0]?.lineNet, 80);

  const updated = updateInvoice(invoice.id, { lines: preview });
  assert.ok(updated);
  assert.equal(updated.lines[0]?.termPercent, 40);
  assertMoney(updated, 80, 0, 0);
});

test("proforma conversion keeps stored figures for untouched and touched lines", () => {
  const contract = makeContract("C-INV-PI");
  const pi = addInvoice({
    type: "PI",
    number: "PI-KEEP",
    date: "2026-10-01",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Panel",
        termKey: "supply",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Panel",
        termKey: "installation",
        billedQty: 1,
        rate: 50,
        termPercent: 60,
        lineNet: 30,
      },
    ],
    extraCharges: [{ id: "freight", label: "Freight", amount: 15 }],
  });
  assert.ok(pi);
  const today = moveContractToToday(contract.id);
  assert.equal(today.billingTerms.installation, TODAY_INSTALLATION);

  const source = invoiceById(pi.id);
  const kept = convertPiToTi(pi.id, "TI-KEPT", "2026-11-02", {
    lines: source.lines.map((line) => ({ ...line })),
    extraCharges: source.extraCharges,
  });
  assert.ok(kept);
  assert.equal(kept.type, "TI");
  assert.equal(kept.date, "2026-11-02");
  assert.equal(kept.lines[0]?.rate, 100);
  assert.equal(kept.lines[0]?.termPercent, 40);
  assert.equal(kept.lines[0]?.billedQty, 2);
  assert.equal(kept.lines[0]?.lineNet, 80);
  assert.equal(kept.lines[1]?.rate, 50);
  assert.equal(kept.lines[1]?.termPercent, 60);
  assert.equal(kept.lines[1]?.lineNet, 30);
  assert.equal(kept.netAmount, source.netAmount);
  assert.equal(kept.gstAmount, source.gstAmount);
  assert.equal(kept.finalAmount, source.finalAmount);
  assertMoney(kept, 110, 15, 0);

  const second = addInvoice({
    type: "PI",
    number: "PI-TOUCH",
    date: "2026-10-01",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Panel",
        termKey: "supply",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
    ],
  });
  assert.ok(second);
  const touched = convertPiToTi(second.id, "TI-TOUCH", "2026-11-03", {
    lines: [
      recalcTouchedInvoiceLine(second.lines[0], { billedQty: 4 }),
    ],
  });
  assert.ok(touched);
  assert.equal(touched.lines[0]?.rate, 100);
  assert.equal(touched.lines[0]?.termPercent, 40);
  assert.equal(touched.lines[0]?.billedQty, 4);
  assert.equal(touched.lines[0]?.lineNet, 160);
  assert.notEqual(touched.lines[0]?.lineNet, lineNet(TODAY_RATE, 4, TODAY_SUPPLY));
  assertMoney(touched, 160, 0, 0);

  const third = addInvoice({
    type: "PI",
    number: "PI-TERM",
    date: "2026-10-01",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Panel",
        termKey: "supply",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
    ],
  });
  assert.ok(third);
  const retargeted = convertPiToTi(third.id, "TI-TERM", "2026-11-04", {
    lines: [
      recalcTouchedInvoiceLine(third.lines[0], { termKey: "installation" }),
    ],
  });
  assert.ok(retargeted);
  assert.equal(retargeted.lines[0]?.termKey, "installation");
  assert.equal(retargeted.lines[0]?.termPercent, 40);
  assert.equal(retargeted.lines[0]?.rate, 100);
  assert.equal(retargeted.lines[0]?.lineNet, 80);
  assert.notEqual(
    retargeted.lines[0]?.termPercent,
    today.billingTerms.installation
  );
  assertMoney(retargeted, 80, 0, 0);
});
