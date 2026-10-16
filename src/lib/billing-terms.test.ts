import assert from "node:assert/strict";
import test from "node:test";
import {
  addCustomBillingTerm,
  billingTermLabel,
  deleteCustomBillingTerm,
  renameCustomBillingTerm,
  startingBillingTerms,
} from "@/lib/billing-terms";
import {
  addContract,
  addInvoice,
  commitContractBillingTerms,
  deleteContractBillingTerm,
  getData,
  renameContractBillingTerm,
  saveContractBillingTerms,
} from "@/lib/store";
import {
  DEFAULT_BILLING_TERM_KEYS,
  type BillingTerms,
  type Invoice,
} from "@/lib/types";

function makeContract(projectNo: string, billingTerms: BillingTerms) {
  return addContract({
    projectName: projectNo,
    projectNo,
    orderNos: projectNo,
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 1000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms,
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
    boq: [
      {
        id: `boq-${projectNo}`,
        catalogKey: `item-${projectNo}`,
        name: "Item",
        unit: "Nos",
        rate: 100,
        quantity: 10,
      },
    ],
  }).contract;
}

function contractTerms(id: string): BillingTerms {
  const contract = getData().contracts.find((row) => row.id === id);
  assert.ok(contract);
  return contract.billingTerms;
}

function invoiceById(id: string): Invoice {
  const invoice = getData().invoices.find((row) => row.id === id);
  assert.ok(invoice);
  return invoice;
}

test("rename keeps the percent and rejects a name already on the form", () => {
  const terms: BillingTerms = {
    ...startingBillingTerms(),
    advance: 75,
    site_visit: 25,
  };
  const renamed = renameCustomBillingTerm(terms, "site_visit", "  Final Stage  ");
  assert.equal(renamed.ok, true);
  if (!renamed.ok) return;
  assert.equal(renamed.toKey, "Final Stage");
  assert.equal(renamed.terms["Final Stage"], 25);
  assert.equal(Object.hasOwn(renamed.terms, "site_visit"), false);
  assert.equal(renamed.terms.advance, 75);
  assert.equal(terms.site_visit, 25);

  const duplicate = renameCustomBillingTerm(renamed.terms, "Final Stage", "Advance");
  assert.deepEqual(duplicate, {
    ok: false,
    error: "A term with that name already exists.",
  });
  assert.equal(renamed.terms["Final Stage"], 25);

  const builtin = renameCustomBillingTerm(terms, "advance", "Mobilization");
  assert.equal(builtin.ok, false);
  assert.equal(terms.advance, 75);
});

test("delete on the new form removes the custom term and its percent", () => {
  const terms: BillingTerms = {
    ...startingBillingTerms(),
    advance: 80,
    site_visit: 20,
  };
  const removed = deleteCustomBillingTerm(terms, "site_visit");
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(Object.hasOwn(removed.terms, "site_visit"), false);
  assert.equal(removed.terms.advance, 80);
  assert.equal(terms.site_visit, 20);

  const builtin = deleteCustomBillingTerm(terms, "supply");
  assert.deepEqual(builtin, {
    ok: false,
    error: "Built-in billing terms cannot be deleted.",
  });
  assert.equal(terms.supply, 0);
});

test("rename moves termKey on that contract's invoices and keeps amounts", () => {
  const left = makeContract("C-TERM-REN-A", {
    supply: 60,
    stage_payment: 40,
  });
  const right = makeContract("C-TERM-REN-B", {
    supply: 60,
    stage_payment: 40,
  });
  const moved = addInvoice({
    type: "TI",
    number: "TI-TERM-REN",
    date: "2026-10-14",
    contractId: left.id,
    lines: [
      {
        boqItemId: `boq-${left.projectNo}`,
        itemName: "Item",
        termKey: "stage_payment",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
      {
        boqItemId: `boq-${left.projectNo}`,
        itemName: "Item",
        termKey: "supply",
        billedQty: 1,
        rate: 50,
        termPercent: 60,
        lineNet: 30,
      },
    ],
    extraCharges: [{ id: "freight", label: "Freight", amount: 15 }],
  });
  assert.ok(moved);
  const other = addInvoice({
    type: "PI",
    number: "PI-TERM-REN",
    date: "2026-10-14",
    contractId: right.id,
    lines: [
      {
        boqItemId: `boq-${right.projectNo}`,
        itemName: "Item",
        termKey: "stage_payment",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
    ],
  });
  assert.ok(other);
  const beforeMoved = structuredClone(invoiceById(moved.id));
  const beforeOther = structuredClone(invoiceById(other.id));

  const renamed = renameContractBillingTerm(left.id, "stage_payment", "Final Stage");
  assert.deepEqual(renamed, { ok: true, toKey: "Final Stage" });
  assert.equal(contractTerms(left.id)["Final Stage"], 40);
  assert.equal(Object.hasOwn(contractTerms(left.id), "stage_payment"), false);
  assert.equal(contractTerms(right.id).stage_payment, 40);

  const afterMoved = invoiceById(moved.id);
  assert.equal(afterMoved.lines[0]?.termKey, "Final Stage");
  assert.equal(afterMoved.lines[1]?.termKey, "supply");
  assert.deepEqual(
    { ...afterMoved.lines[0], termKey: beforeMoved.lines[0]?.termKey },
    beforeMoved.lines[0]
  );
  assert.deepEqual(afterMoved.lines[1], beforeMoved.lines[1]);
  assert.equal(afterMoved.netAmount, beforeMoved.netAmount);
  assert.equal(afterMoved.gstAmount, beforeMoved.gstAmount);
  assert.equal(afterMoved.finalAmount, beforeMoved.finalAmount);
  assert.deepEqual(afterMoved.extraCharges, beforeMoved.extraCharges);
  assert.deepEqual(invoiceById(other.id), beforeOther);

  const duplicate = renameContractBillingTerm(left.id, "Final Stage", "Supply");
  assert.deepEqual(duplicate, {
    ok: false,
    error: "A term with that name already exists.",
  });
  assert.equal(invoiceById(moved.id).lines[0]?.termKey, "Final Stage");
  assert.equal(contractTerms(left.id)["Final Stage"], 40);

  const caseOnly = renameContractBillingTerm(left.id, "Final Stage", "supply");
  assert.equal(caseOnly.ok, false);
  assert.equal(invoiceById(moved.id).lines[0]?.termKey, "Final Stage");
});

test("delete on a saved contract refuses when an invoice uses the term", () => {
  const contract = makeContract("C-TERM-DEL", {
    supply: 70,
    stage_payment: 20,
    mobilization: 10,
  });
  const invoice = addInvoice({
    type: "TI",
    number: "TI-TERM-DEL",
    date: "2026-10-14",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Item",
        termKey: "stage_payment",
        billedQty: 1,
        rate: 100,
        termPercent: 20,
        lineNet: 20,
      },
    ],
  });
  assert.ok(invoice);
  const other = makeContract("C-TERM-DEL-B", { mobilization: 100 });
  const otherInvoice = addInvoice({
    type: "PI",
    number: "PI-TERM-DEL-B",
    date: "2026-10-14",
    contractId: other.id,
    lines: [
      {
        boqItemId: `boq-${other.projectNo}`,
        itemName: "Item",
        termKey: "mobilization",
        billedQty: 1,
        rate: 100,
        termPercent: 100,
        lineNet: 100,
      },
    ],
  });
  assert.ok(otherInvoice);

  const refused = deleteContractBillingTerm(contract.id, "stage_payment");
  assert.deepEqual(refused, {
    ok: false,
    error: "This term is used on an invoice and cannot be deleted.",
  });
  assert.equal(contractTerms(contract.id).stage_payment, 20);
  assert.equal(invoiceById(invoice.id).lines[0]?.termKey, "stage_payment");

  const builtin = deleteContractBillingTerm(contract.id, "supply");
  assert.equal(builtin.ok, false);
  assert.equal(contractTerms(contract.id).supply, 70);

  const removed = deleteContractBillingTerm(contract.id, "mobilization");
  assert.deepEqual(removed, { ok: true });
  assert.equal(Object.hasOwn(contractTerms(contract.id), "mobilization"), false);
  assert.equal(contractTerms(contract.id).stage_payment, 20);
  assert.equal(invoiceById(otherInvoice.id).lines[0]?.termKey, "mobilization");
  assert.equal(contractTerms(other.id).mobilization, 100);
});

test("percent save is refused unless the terms total 100 and does not rewrite invoices", () => {
  const contract = makeContract("C-TERM-PCT", {
    supply: 60,
    stage_payment: 40,
  });
  const invoice = addInvoice({
    type: "TI",
    number: "TI-TERM-PCT",
    date: "2026-10-14",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Item",
        termKey: "stage_payment",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
    ],
  });
  assert.ok(invoice);
  const before = structuredClone(invoiceById(invoice.id));

  const refused = saveContractBillingTerms(contract.id, {
    supply: 50,
    stage_payment: 40,
  });
  assert.deepEqual(refused, {
    ok: false,
    error: "Billing terms must total 100% (currently 90%).",
  });
  assert.equal(contractTerms(contract.id).supply, 60);
  assert.equal(contractTerms(contract.id).stage_payment, 40);
  assert.deepEqual(invoiceById(invoice.id), before);

  const edge = saveContractBillingTerms(contract.id, {
    supply: 60.01,
    stage_payment: 40,
  });
  assert.equal(edge.ok, true);
  assert.equal(contractTerms(contract.id).supply, 60.01);

  const tooFar = saveContractBillingTerms(contract.id, {
    supply: 60.03,
    stage_payment: 40,
  });
  assert.equal(tooFar.ok, false);
  assert.equal(contractTerms(contract.id).supply, 60.01);

  const saved = saveContractBillingTerms(contract.id, {
    supply: 75,
    stage_payment: 25,
  });
  assert.deepEqual(saved, { ok: true });
  assert.equal(contractTerms(contract.id).supply, 75);
  assert.equal(contractTerms(contract.id).stage_payment, 25);
  const after = invoiceById(invoice.id);
  assert.equal(after.lines[0]?.termPercent, 40);
  assert.equal(after.lines[0]?.lineNet, 80);
  assert.equal(after.lines[0]?.billedQty, 2);
  assert.equal(after.lines[0]?.rate, 100);
  assert.equal(after.lines[0]?.termKey, "stage_payment");
  assert.equal(after.netAmount, before.netAmount);
  assert.equal(after.finalAmount, before.finalAmount);
});

test("a custom term on one contract is absent from a new contract's starting terms", () => {
  const before = startingBillingTerms();
  assert.deepEqual(Object.keys(before), [...DEFAULT_BILLING_TERM_KEYS]);
  const saved = makeContract("C-TERM-START", {
    ...before,
    advance: 85,
    mobilization: 15,
  });
  assert.equal(saved.billingTerms.mobilization, 15);

  const start = startingBillingTerms();
  assert.equal(start.mobilization, undefined);
  assert.deepEqual(Object.keys(start), [...DEFAULT_BILLING_TERM_KEYS]);
  for (const key of DEFAULT_BILLING_TERM_KEYS) {
    assert.equal(start[key], 0);
  }

  const fresh = makeContract("C-TERM-START-NEW", startingBillingTerms());
  assert.equal(fresh.billingTerms.mobilization, undefined);
  assert.deepEqual(Object.keys(fresh.billingTerms), [...DEFAULT_BILLING_TERM_KEYS]);
  assert.equal(contractTerms(saved.id).mobilization, 15);
});

test("a typed custom term keeps capitals and spaces, and a case-only match is rejected", () => {
  const added = addCustomBillingTerm(startingBillingTerms(), "  GAD 2nd half  ");
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(added.toKey, "GAD 2nd half");
  assert.equal(added.terms["GAD 2nd half"], 0);
  assert.equal(Object.hasOwn(added.terms, "gad_2nd_half"), false);
  assert.equal(billingTermLabel("GAD 2nd half"), "GAD 2nd half");
  assert.equal(billingTermLabel("gad"), "GAD");
  assert.equal(billingTermLabel("advance"), "Advance");
  assert.equal(billingTermLabel("supply"), "Supply");

  const lower = addCustomBillingTerm(added.terms, "gad 2nd half");
  assert.deepEqual(lower, {
    ok: false,
    error: "A term with that name already exists.",
  });
  const builtin = addCustomBillingTerm(added.terms, "Supply");
  assert.deepEqual(builtin, {
    ok: false,
    error: "A term with that name already exists.",
  });
  assert.equal(Object.hasOwn(added.terms, "GAD 2nd half"), true);
  assert.equal(added.terms.supply, 0);
});

test("an old slug stays until rename, which updates invoice termKeys and keeps amounts", () => {
  const contract = makeContract("C-TERM-SLUG", {
    supply: 60,
    gad_2nd_half: 40,
  });
  const invoice = addInvoice({
    type: "TI",
    number: "TI-TERM-SLUG",
    date: "2026-10-14",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Item",
        termKey: "gad_2nd_half",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
    ],
  });
  assert.ok(invoice);

  const saved = saveContractBillingTerms(contract.id, {
    supply: 70,
    gad_2nd_half: 30,
  });
  assert.equal(saved.ok, true);
  assert.equal(contractTerms(contract.id).gad_2nd_half, 30);
  assert.equal(Object.hasOwn(contractTerms(contract.id), "GAD 2nd half"), false);
  assert.equal(invoiceById(invoice.id).lines[0]?.termKey, "gad_2nd_half");
  assert.equal(invoiceById(invoice.id).lines[0]?.termPercent, 40);
  assert.equal(billingTermLabel("gad_2nd_half"), "gad_2nd_half");

  const before = structuredClone(invoiceById(invoice.id));
  const renamed = renameContractBillingTerm(
    contract.id,
    "gad_2nd_half",
    "  GAD 2nd half  "
  );
  assert.deepEqual(renamed, { ok: true, toKey: "GAD 2nd half" });
  assert.equal(contractTerms(contract.id)["GAD 2nd half"], 30);
  assert.equal(Object.hasOwn(contractTerms(contract.id), "gad_2nd_half"), false);
  assert.equal(billingTermLabel("GAD 2nd half"), "GAD 2nd half");

  const after = invoiceById(invoice.id);
  assert.equal(after.lines[0]?.termKey, "GAD 2nd half");
  assert.equal(after.lines[0]?.termPercent, before.lines[0]?.termPercent);
  assert.equal(after.lines[0]?.lineNet, before.lines[0]?.lineNet);
  assert.equal(after.lines[0]?.billedQty, before.lines[0]?.billedQty);
  assert.equal(after.lines[0]?.rate, before.lines[0]?.rate);
  assert.equal(after.netAmount, before.netAmount);
  assert.equal(after.gstAmount, before.gstAmount);
  assert.equal(after.finalAmount, before.finalAmount);
});

test("saving a billing-term draft keeps an old slug until rename and requires 100%", () => {
  const contract = makeContract("C-TERM-DRAFT", {
    supply: 60,
    gad_2nd_half: 40,
  });
  const invoice = addInvoice({
    type: "TI",
    number: "TI-TERM-DRAFT",
    date: "2026-10-14",
    contractId: contract.id,
    lines: [
      {
        boqItemId: `boq-${contract.projectNo}`,
        itemName: "Item",
        termKey: "gad_2nd_half",
        billedQty: 2,
        rate: 100,
        termPercent: 40,
        lineNet: 80,
      },
    ],
  });
  assert.ok(invoice);
  const before = structuredClone(invoiceById(invoice.id));
  const kept = commitContractBillingTerms(
    contract.id,
    { supply: 70, gad_2nd_half: 30 },
    { supply: "supply", gad_2nd_half: "gad_2nd_half" }
  );
  assert.equal(kept.ok, true);
  assert.equal(contractTerms(contract.id).gad_2nd_half, 30);
  assert.equal(Object.hasOwn(contractTerms(contract.id), "GAD 2nd half"), false);
  assert.deepEqual(invoiceById(invoice.id), before);

  const refused = commitContractBillingTerms(
    contract.id,
    { supply: 50, "GAD 2nd half": 40 },
    { supply: "supply", "GAD 2nd half": "gad_2nd_half" }
  );
  assert.equal(refused.ok, false);
  assert.equal(contractTerms(contract.id).gad_2nd_half, 30);
  assert.equal(invoiceById(invoice.id).lines[0]?.termKey, "gad_2nd_half");
  assert.equal(invoiceById(invoice.id).lines[0]?.termPercent, 40);

  const renamed = commitContractBillingTerms(
    contract.id,
    { supply: 75, "GAD 2nd half": 25 },
    { supply: "supply", "GAD 2nd half": "gad_2nd_half" }
  );
  assert.equal(renamed.ok, true);
  assert.equal(contractTerms(contract.id)["GAD 2nd half"], 25);
  assert.equal(Object.hasOwn(contractTerms(contract.id), "gad_2nd_half"), false);
  const after = invoiceById(invoice.id);
  assert.equal(after.lines[0]?.termKey, "GAD 2nd half");
  assert.equal(after.lines[0]?.termPercent, 40);
  assert.equal(after.lines[0]?.lineNet, 80);
  assert.equal(after.lines[0]?.billedQty, 2);
  assert.equal(after.lines[0]?.rate, 100);
  assert.equal(after.netAmount, before.netAmount);
  assert.equal(after.finalAmount, before.finalAmount);

  const blocked = commitContractBillingTerms(
    contract.id,
    { supply: 100 },
    { supply: "supply" }
  );
  assert.deepEqual(blocked, {
    ok: false,
    error: "This term is used on an invoice and cannot be deleted.",
  });
  assert.equal(contractTerms(contract.id)["GAD 2nd half"], 25);

  const added = commitContractBillingTerms(
    contract.id,
    { supply: 70, "GAD 2nd half": 20, "Site visit": 10 },
    { supply: "supply", "GAD 2nd half": "GAD 2nd half" }
  );
  assert.equal(added.ok, true);
  assert.equal(contractTerms(contract.id)["Site visit"], 10);
  assert.equal(billingTermLabel("Site visit"), "Site visit");
  assert.equal(invoiceById(invoice.id).lines[0]?.termPercent, 40);
});
