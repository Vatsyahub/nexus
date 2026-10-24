import assert from "node:assert/strict";
import test from "node:test";
import {
  boqCallbackOffers,
  taxInvoiceQuantityIssues,
} from "@/lib/amendment-callback";
import { buildItemListRows } from "@/lib/execution-reports";
import { formatMoney } from "@/lib/format-money";
import {
  addContract,
  addDeliveryChallan,
  addInvoice,
  amendContractBoq,
  boqAmendmentIssues,
  boqPlainEditIssues,
  editContractBoq,
  editLatestAmendment,
  getData,
  leftToSupplyQty,
  recordInstallationTotal,
  saveContractSchedulePlan,
  updateInvoice,
} from "@/lib/store";
import { boqTotal, type BoqItem, type Contract, type InvoiceLine } from "@/lib/types";

const NAME = "Nut - Bolt";

function line(id: string, qty: number, rate: number): BoqItem {
  return {
    id,
    catalogKey: NAME.toLowerCase(),
    name: NAME,
    unit: "Nos",
    rate,
    quantity: qty,
  };
}

const at400 = () => line("nut-400", 432, 400);
const at1000 = () => line("nut-1000", 72, 1000);
const at900 = () => line("nut-900", 180, 900);

function threeLines(): BoqItem[] {
  return [at400(), at1000(), at900()];
}

function makeContract(projectNo: string, boq: BoqItem[]): Contract {
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
    boq,
  }).contract;
}

function saved(id: string): Contract {
  const contract = getData().contracts.find((row) => row.id === id);
  assert.ok(contract);
  return contract;
}

function invoiceLine(
  source: BoqItem,
  billedQty: number,
  rate = source.rate
): InvoiceLine {
  return {
    boqItemId: source.id,
    itemName: source.name,
    termKey: "supply",
    billedQty,
    rate,
    termPercent: 100,
    lineNet: rate * billedQty,
  };
}

test("the same name at three rates saves, and the same rate is still a duplicate", () => {
  const contract = makeContract("C-RATE-PLAIN", [at400()]);
  const savedThree = editContractBoq({
    contractId: contract.id,
    boq: threeLines(),
  });
  assert.equal(savedThree.ok, true);
  if (!savedThree.ok) return;
  assert.equal(savedThree.contract.boq.length, 3);
  assert.deepEqual(
    savedThree.contract.boq.map((row) => [row.quantity, row.rate]),
    [
      [432, 400],
      [72, 1000],
      [180, 900],
    ]
  );
  assert.deepEqual(boqPlainEditIssues(contract.id, threeLines()), []);

  const copy = boqPlainEditIssues(contract.id, [
    ...threeLines(),
    line("nut-400-copy", 1, 400),
  ]);
  assert.ok(copy.some((issue) => /Duplicate BOQ item: Nut - Bolt/.test(issue)));

  const collided = editContractBoq({
    contractId: contract.id,
    boq: [at400(), { ...at1000(), rate: 400 }, at900()],
  });
  assert.equal(collided.ok, false);
  if (collided.ok) return;
  assert.match(collided.error, /Duplicate BOQ item: Nut - Bolt/);
  assert.equal(saved(contract.id).boq.length, 3);
});

test("an amendment can add the other rates and still refuses the same rate twice", () => {
  const contract = makeContract("C-RATE-AMD", [at400()]);
  const value = boqTotal(threeLines());
  const amended = amendContractBoq({
    contractId: contract.id,
    boq: threeLines(),
    newOrderValue: value,
    date: "2026-10-02",
    number: "A-RATES",
  });
  assert.equal(amended.ok, true);
  if (!amended.ok) return;
  assert.equal(amended.contract.boq.length, 3);

  const dup = boqAmendmentIssues(contract.id, [
    ...threeLines(),
    line("nut-900-copy", 1, 900),
  ]);
  assert.ok(dup.some((issue) => /Duplicate BOQ item: Nut - Bolt/.test(issue)));

  const edited = editLatestAmendment({
    contractId: contract.id,
    boq: [...threeLines(), line("nut-400-again", 2, 400)],
    newOrderValue: value + 800,
    date: "2026-10-02",
    number: "A-RATES",
  });
  assert.equal(edited.ok, false);
  if (edited.ok) return;
  assert.match(edited.error, /Duplicate BOQ item: Nut - Bolt/);
  assert.equal(saved(contract.id).boq.length, 3);
});

test("a tax invoice bills each rate up to its own quantity", () => {
  const lines = threeLines();
  const contract = makeContract("C-RATE-TI", lines);
  const within = taxInvoiceQuantityIssues({
    contract,
    invoices: getData().invoices,
    lines: [
      invoiceLine(lines[0], 432),
      invoiceLine(lines[1], 72),
      invoiceLine(lines[2], 180),
    ],
  });
  assert.deepEqual(within, []);

  const savedInvoice = addInvoice({
    type: "TI",
    number: "TI-RATE-ALL",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [
      invoiceLine(lines[0], 432),
      invoiceLine(lines[1], 72),
      invoiceLine(lines[2], 180),
    ],
  });
  assert.ok(savedInvoice);

  const over400 = taxInvoiceQuantityIssues({
    contract: saved(contract.id),
    invoices: [],
    lines: [invoiceLine(lines[0], 433)],
  });
  assert.equal(over400.length, 1);
  assert.match(over400[0], /Nut - Bolt, Supply at ₹400\.00/);
  assert.match(over400[0], /above the BOQ quantity 432/);
  assert.equal(
    addInvoice({
      type: "TI",
      number: "TI-RATE-433",
      date: "2026-10-03",
      contractId: contract.id,
      lines: [invoiceLine(lines[0], 1)],
    }),
    null
  );

  const fresh = makeContract("C-RATE-TI-CAP", threeLines());
  const over1000 = taxInvoiceQuantityIssues({
    contract: fresh,
    invoices: [],
    lines: [invoiceLine(at1000(), 73)],
  });
  assert.match(over1000[0], /above the BOQ quantity 72/);
  assert.match(over1000[0], new RegExp(formatMoney(1000).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const over900 = taxInvoiceQuantityIssues({
    contract: fresh,
    invoices: [],
    lines: [invoiceLine(at900(), 181)],
  });
  assert.match(over900[0], /above the BOQ quantity 180/);
  assert.match(over900[0], /₹900\.00/);

  const first = addInvoice({
    type: "TI",
    number: "TI-RATE-400-ONLY",
    date: "2026-10-04",
    contractId: fresh.id,
    lines: [invoiceLine(at400(), 432)],
  });
  assert.ok(first);
  const otherRate = addInvoice({
    type: "TI",
    number: "TI-RATE-900-AFTER",
    date: "2026-10-05",
    contractId: fresh.id,
    lines: [invoiceLine(at900(), 180)],
  });
  assert.ok(otherRate);

  const offers = boqCallbackOffers({
    contract: saved(fresh.id),
    invoices: getData().invoices,
  });
  assert.deepEqual(offers, []);

  const rateChange = boqCallbackOffers({
    contract: { ...saved(fresh.id), boq: [at1000()] },
    invoices: getData().invoices,
  });
  const reversed400 = rateChange.find((offer) => offer.rate === 400);
  const reversed900 = rateChange.find((offer) => offer.rate === 900);
  assert.ok(reversed400);
  assert.equal(reversed400.quantity, -432);
  assert.ok(reversed900);
  assert.equal(reversed900.quantity, -180);
  assert.equal(
    rateChange.some((offer) => offer.rate === 1000),
    false
  );
});

test("billing a small quantity at 400 is not a rate change against the other lines", () => {
  const lines = threeLines();
  const contract = makeContract("C-RATE-CB", lines);
  const billed = addInvoice({
    type: "TI",
    number: "TI-RATE-SMALL",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [invoiceLine(lines[0], 10)],
  });
  assert.ok(billed);
  assert.deepEqual(
    boqCallbackOffers({
      contract: saved(contract.id),
      invoices: getData().invoices,
    }),
    []
  );
  const reduced = boqCallbackOffers({
    contract: {
      ...saved(contract.id),
      boq: [line("nut-400", 4, 400), at1000(), at900()],
    },
    invoices: getData().invoices,
  });
  assert.equal(reduced.length, 1);
  assert.equal(reduced[0]?.rate, 400);
  assert.equal(reduced[0]?.quantity, -6);
});

test("dispatch checks each rate's own quantity and does not add the three lines together", () => {
  const lines = threeLines();
  const contract = makeContract("C-RATE-DC", lines);
  const tooMany = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-RATE-433",
    date: "2026-10-02",
    lines: [{ boqItemId: lines[0].id, qty: 433 }],
  });
  assert.equal(tooMany.ok, false);
  if (tooMany.ok) return;
  assert.match(tooMany.error, /Nut - Bolt at ₹400\.00/);
  assert.match(tooMany.error, /432/);
  assert.doesNotMatch(tooMany.error, /684/);

  const supplied400 = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-RATE-400",
    date: "2026-10-03",
    lines: [{ boqItemId: lines[0].id, qty: 432 }],
  });
  assert.equal(supplied400.ok, true);
  assert.equal(leftToSupplyQty(contract.id, lines[2].id), 180);
  assert.equal(leftToSupplyQty(contract.id, lines[1].id), 72);

  const supplied900 = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-RATE-900",
    date: "2026-10-04",
    lines: [{ boqItemId: lines[2].id, qty: 180 }],
  });
  assert.equal(supplied900.ok, true);
  const supplied1000 = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-RATE-1000",
    date: "2026-10-05",
    lines: [{ boqItemId: lines[1].id, qty: 72 }],
  });
  assert.equal(supplied1000.ok, true);

  const oneMore = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-RATE-400-MORE",
    date: "2026-10-06",
    lines: [{ boqItemId: lines[0].id, qty: 1 }],
  });
  assert.equal(oneMore.ok, false);
  if (oneMore.ok) return;
  assert.match(oneMore.error, /₹400\.00/);
  assert.doesNotMatch(oneMore.error, /684/);

  const challans = getData().deliveryChallans.filter(
    (dc) => dc.contractId === contract.id
  );
  const qtys = challans.flatMap((dc) => dc.lines.map((row) => row.qty));
  assert.deepEqual(qtys.sort((a, b) => a - b), [72, 180, 432]);
  assert.equal(
    qtys.some((qty) => qty === 684),
    false
  );
});

test("installation follows the supplied quantity of that rate", () => {
  const lines = threeLines();
  const contract = makeContract("C-RATE-INST", lines);
  const supplied = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-RATE-INST",
    date: "2026-10-02",
    lines: [{ boqItemId: lines[2].id, qty: 10 }],
  });
  assert.equal(supplied.ok, true);
  const installed = recordInstallationTotal({
    contractId: contract.id,
    boqItemId: lines[2].id,
    newTotal: 10,
    date: "2026-10-03",
  });
  assert.equal(installed.ok, true);
  const over = recordInstallationTotal({
    contractId: contract.id,
    boqItemId: lines[2].id,
    newTotal: 11,
    date: "2026-10-04",
  });
  assert.equal(over.ok, false);
  if (over.ok) return;
  assert.match(over.error, /Nut - Bolt at ₹900\.00/);
  assert.match(over.error, /exceeds supplied 10/);
  assert.doesNotMatch(over.error, /432/);
});

test("a schedule caps each rate on its own and leaves the other rates alone", () => {
  const lines = threeLines();
  const contract = makeContract("C-RATE-SCH", lines);
  const over = saveContractSchedulePlan({
    contractId: contract.id,
    committed: false,
    testingDate: "",
    handoverDate: "",
    items: [
      {
        boqItemId: lines[0].id,
        supplies: [
          { startDate: "2026-10-03", endDate: "2026-10-04", quantity: 433 },
        ],
        installations: [],
      },
    ],
  });
  assert.equal(over.ok, false);
  if (over.ok) return;
  assert.match(over.error, /Nut - Bolt at ₹400\.00/);
  assert.match(over.error, /433 > 432/);
  assert.doesNotMatch(over.error, /684/);

  const planned = saveContractSchedulePlan({
    contractId: contract.id,
    committed: false,
    testingDate: "",
    handoverDate: "",
    items: [
      {
        boqItemId: lines[2].id,
        supplies: [
          { startDate: "2026-10-05", endDate: "2026-10-06", quantity: 180 },
        ],
        installations: [],
      },
    ],
  });
  assert.equal(planned.ok, true);
});

test("editing one line's rate keeps its own quantity and leaves the other rates alone", () => {
  const lines = threeLines();
  const contract = makeContract("C-RATE-KEEP", lines);
  const billed = addInvoice({
    type: "TI",
    number: "TI-RATE-KEEP",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [invoiceLine(lines[0], 10)],
  });
  assert.ok(billed);
  const edited = editContractBoq({
    contractId: contract.id,
    boq: [{ ...lines[0], rate: 450 }, lines[1], lines[2]],
  });
  assert.equal(edited.ok, true);

  const kept = updateInvoice(billed.id, {
    lines: [invoiceLine(lines[0], 11)],
  });
  assert.ok(kept);
  const over = taxInvoiceQuantityIssues({
    contract: saved(contract.id),
    invoices: getData().invoices,
    lines: [invoiceLine(lines[0], 433)],
    exceptInvoiceId: billed.id,
  });
  assert.match(over[0] ?? "", /above the BOQ quantity 432/);
  assert.match(over[0] ?? "", /₹400\.00/);

  const otherRate = addInvoice({
    type: "TI",
    number: "TI-RATE-KEEP-900",
    date: "2026-10-03",
    contractId: contract.id,
    lines: [invoiceLine(lines[2], 180)],
  });
  assert.ok(otherRate);
  assert.deepEqual(
    boqCallbackOffers({
      contract: saved(contract.id),
      invoices: getData().invoices,
    }).filter((offer) => offer.rate === 400 || offer.rate === 450),
    []
  );
});

test("the item list is the only total, and it still adds the three rates", () => {
  const contract = makeContract("C-RATE-LIST", threeLines());
  const data = getData();
  const rows = buildItemListRows({
    ...data,
    contracts: data.contracts.filter((row) => row.id === contract.id),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.itemName, NAME);
  assert.equal(rows[0]?.totalQty, 684);
});
