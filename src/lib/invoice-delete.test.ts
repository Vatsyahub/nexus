import assert from "node:assert/strict";
import test from "node:test";
import {
  addContract,
  addInvoice,
  addPayment,
  clearScheduleChangeLog,
  deleteInvoice,
  getData,
  saveContractSchedulePlan,
} from "@/lib/store";

test("deleting an invoice unlinks its payments and leaves them in the list", () => {
  const created = addContract({
    projectName: "Invoice delete",
    projectNo: "C-INV-DEL",
    orderNos: "T-DEL",
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 1000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
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
        id: "boq-inv-del",
        catalogKey: "item-del",
        name: "Delete me",
        unit: "Nos",
        rate: 100,
        quantity: 1,
      },
    ],
  });
  const contractId = created.contract.id;
  const invoice = addInvoice({
    type: "PI",
    number: "PI-DEL-TEST",
    date: "2026-10-14",
    contractId,
    lines: [
      {
        boqItemId: "boq-inv-del",
        itemName: "Delete me",
        termKey: "supply",
        billedQty: 1,
        rate: 100,
        termPercent: 100,
        lineNet: 100,
      },
    ],
  });
  assert.ok(invoice);
  const other = addInvoice({
    type: "TI",
    number: "TI-KEEP",
    date: "2026-10-14",
    contractId,
    lines: [
      {
        boqItemId: "boq-inv-del",
        itemName: "Delete me",
        termKey: "supply",
        billedQty: 1,
        rate: 100,
        termPercent: 100,
        lineNet: 100,
      },
    ],
  });
  assert.ok(other);
  const payment = addPayment({
    contractId,
    invoiceId: invoice.id,
    link: "PI",
    date: "2026-10-14",
    netAmount: 10,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
  });
  assert.ok(payment);
  const unrelated = addPayment({
    contractId,
    invoiceId: other.id,
    link: "TI",
    date: "2026-10-14",
    netAmount: 5,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
  });
  assert.ok(unrelated);

  assert.equal(deleteInvoice(invoice.id), true);
  const data = getData();
  assert.equal(
    data.invoices.some((row) => row.id === invoice.id),
    false
  );
  assert.equal(
    data.invoices.some((row) => row.id === other.id),
    true
  );
  const kept = data.payments.find((row) => row.id === payment.id);
  assert.ok(kept);
  assert.equal(kept.invoiceId, null);
  assert.equal(kept.link, "unlinked");
  const stillLinked = data.payments.find((row) => row.id === unrelated.id);
  assert.equal(stillLinked?.invoiceId, other.id);
  assert.equal(stillLinked?.link, "TI");
});

test("clearing the schedule change log leaves schedule lines", () => {
  const created = addContract({
    projectName: "Log clear",
    projectNo: "C-LOG-CLR",
    orderNos: "T-LOG",
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 1000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
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
        id: "boq-log-clr",
        catalogKey: "item-log",
        name: "Line",
        unit: "Nos",
        rate: 10,
        quantity: 1,
      },
    ],
  });
  const contractId = created.contract.id;
  const saved = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate: "",
      handoverDate: "",
      items: [
        {
          boqItemId: "boq-log-clr",
          supplies: [
            { startDate: "2026-10-14", endDate: "2026-10-14", quantity: 1 },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(saved.ok, true);
  const before = getData();
  assert.ok(
    before.scheduleChangeLog.some((row) => row.contractId === contractId)
  );
  const lineCount = before.schedules.filter(
    (row) => row.contractId === contractId
  ).length;
  assert.ok(lineCount > 0);
  assert.equal(clearScheduleChangeLog(), true);
  const after = getData();
  assert.equal(after.scheduleChangeLog.length, 0);
  assert.equal(
    after.schedules.filter((row) => row.contractId === contractId).length,
    lineCount
  );
});
