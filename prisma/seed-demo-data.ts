/**
 * Comprehensive demo data for everything live in Nexus.
 * Idempotent: upserts users by email; replaces WorkspaceStore blob.
 *
 * Run: npx tsx prisma/seed-demo-data.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type {
  BoqItem,
  Contract,
  FlowhubData,
  Invoice,
  Payment,
  ScheduleLine,
  Task,
} from "../src/lib/types";
import { GST_RATE, guaranteeAmount } from "../src/lib/types";

function isoDaysFromToday(delta: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + delta);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function lineNet(rate: number, qty: number, termPercent: number) {
  return money((rate * qty * termPercent) / 100);
}

function boq(
  id: string,
  name: string,
  unit: string,
  rate: number,
  quantity: number
): BoqItem {
  return {
    id,
    catalogKey: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    unit,
    rate,
    quantity,
  };
}

function invoiceFrom(
  partial: Omit<Invoice, "netAmount" | "gstAmount" | "finalAmount"> & {
    gstApplicable: boolean;
  }
): Invoice {
  const netAmount = money(
    partial.lines.reduce((s, l) => s + l.lineNet, 0)
  );
  const gstAmount = partial.gstApplicable ? money(netAmount * GST_RATE) : 0;
  const extraTotal = money(
    (partial.extraCharges ?? []).reduce((s, e) => s + e.amount, 0)
  );
  const { gstApplicable: _, ...rest } = partial;
  return {
    ...rest,
    netAmount,
    gstAmount,
    extraCharges: partial.extraCharges ?? [],
    finalAmount: money(netAmount + gstAmount + extraTotal),
  };
}

function buildWorkspace(): FlowhubData {
  const now = new Date().toISOString();

  // ——— Contracts covering ABG/PBG, GST, retention, TDS, status, expenses ———
  const cAdv: Contract = {
    id: "demo-c-adv-gst",
    projectName: "Metro Depot Crane Package",
    projectNo: "C-DEMO-001",
    orderNos: "WO/2026/001, WO/2026/001-A",
    orderDate: isoDaysFromToday(-120),
    closureDate: isoDaysFromToday(90),
    orderValue: 500000,
    gstApplicable: true,
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    billingTerms: {
      advance: 10,
      gad: 10,
      supply: 40,
      installation: 25,
      testing: 10,
      handover: 5,
    },
    paymentDueDays: 30,
    retentionPercent: 5,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: true,
    abgPercent: 10,
    abgValue: guaranteeAmount(500000, 10),
    abgNumber: "ABG/HDFC/7791",
    abgDate: isoDaysFromToday(-100),
    abgExpiry: isoDaysFromToday(200),
    abgBankName: "HDFC",
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: guaranteeAmount(500000, 5),
    pbgNumber: "PBG/SBI/4412",
    pbgDate: isoDaysFromToday(-90),
    pbgExpiry: isoDaysFromToday(400),
    pbgBankName: "SBI",
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    contractorAssigned: "Southern Erection Co.",
    boq: [
      boq("demo-boq-adv-1", "EOT Crane 10T", "Nos", 200000, 2),
      boq("demo-boq-adv-2", "Festoon system", "Set", 50000, 2),
    ],
    amendments: [],
    expenses: [
      {
        id: "demo-exp-1",
        amount: 12500,
        date: isoDaysFromToday(-40),
        personPaid: "R. Kumar",
        reason: "Site visit travel",
        category: "Travel",
        createdAt: isoDaysFromToday(-40) + "T10:00:00.000Z",
        createdBy: "Priya Manager",
        editHistory: [],
        deletedAt: null,
        deletedBy: null,
      },
      {
        id: "demo-exp-2",
        amount: 3200,
        date: isoDaysFromToday(-20),
        personPaid: "Accounts",
        reason: "Courier of drawings",
        category: "Courier",
        createdAt: isoDaysFromToday(-20) + "T10:00:00.000Z",
        createdBy: "Anil User",
        editHistory: [],
        deletedAt: null,
        deletedBy: null,
      },
      {
        id: "demo-exp-3",
        amount: 45000,
        date: isoDaysFromToday(-12),
        personPaid: "Local fabricator",
        reason: "Temporary scaffolding hire",
        category: "Subcontractor",
        createdAt: isoDaysFromToday(-12) + "T10:00:00.000Z",
        createdBy: "Site Lead",
        editHistory: [],
        deletedAt: null,
        deletedBy: null,
      },
    ],
    guaranteeEdits: [
      {
        id: "demo-ge-1",
        kind: "ABG",
        at: isoDaysFromToday(-50) + "T08:00:00.000Z",
        by: "Master Admin",
        summary: "ABG ABG/HDFC/7791 · expiry extended",
      },
    ],
    retentionRecoveredAt: null,
    handoverDate: null,
    status: "active",
    createdAt: isoDaysFromToday(-120) + "T09:00:00.000Z",
  };

  const cNoGst: Contract = {
    id: "demo-c-nogst",
    projectName: "Warehouse Hoist Retrofit",
    projectNo: "C-DEMO-002",
    orderNos: "PO-88421",
    orderDate: isoDaysFromToday(-60),
    closureDate: isoDaysFromToday(45),
    orderValue: 150000,
    gstApplicable: false,
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    billingTerms: {
      supply: 60,
      installation: 30,
      handover: 5,
      "commissioning support": 5,
    },
    paymentDueDays: 15,
    retentionPercent: 0,
    tdsPercent: 0,
    dlpMonths: 6,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    abgNumber: null,
    abgDate: null,
    abgExpiry: null,
    abgBankName: null,
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: guaranteeAmount(150000, 5),
    pbgNumber: null,
    pbgDate: null,
    pbgExpiry: null,
    pbgBankName: null,
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    contractorAssigned: "",
    boq: [
      boq("demo-boq-ng-1", "Electric hoist 5T", "Nos", 75000, 2),
      // Same name as C-DEMO-001, different case and unit, so Item list can show a summed qty.
      boq("demo-boq-ng-2", "eot crane 10t", "m", 0, 3),
    ],
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    retentionRecoveredAt: null,
    handoverDate: null,
    status: "active",
    createdAt: isoDaysFromToday(-60) + "T09:00:00.000Z",
  };

  const cPastDue: Contract = {
    id: "demo-c-pastdue",
    projectName: "Port Gantry Spares",
    projectNo: "C-DEMO-003",
    orderNos: "WO/PORT/19",
    orderDate: isoDaysFromToday(-200),
    closureDate: isoDaysFromToday(-10),
    orderValue: 100000,
    gstApplicable: true,
    city: "Kochi",
    state: "Kerala",
    country: "India",
    billingTerms: { supply: 80, installation: 20 },
    paymentDueDays: 7,
    retentionPercent: 5,
    tdsPercent: 2,
    dlpMonths: 24,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    abgNumber: null,
    abgDate: null,
    abgExpiry: null,
    abgBankName: null,
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    pbgNumber: null,
    pbgDate: null,
    pbgExpiry: null,
    pbgBankName: null,
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    contractorAssigned: "Harbour Fitters",
    boq: [boq("demo-boq-pd-1", "Wheel assembly", "Nos", 25000, 4)],
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    retentionRecoveredAt: null,
    handoverDate: null,
    status: "active",
    createdAt: isoDaysFromToday(-200) + "T09:00:00.000Z",
  };

  const cComplete: Contract = {
    id: "demo-c-complete",
    projectName: "Foundry Bridge Crane (Closed)",
    projectNo: "C-DEMO-004",
    orderNos: "WO/OLD/77",
    orderDate: isoDaysFromToday(-500),
    closureDate: isoDaysFromToday(-60),
    orderValue: 300000,
    gstApplicable: true,
    city: "Coimbatore",
    state: "Tamil Nadu",
    country: "India",
    billingTerms: {
      advance: 10,
      supply: 50,
      installation: 30,
      testing: 5,
      handover: 5,
    },
    paymentDueDays: 30,
    retentionPercent: 5,
    tdsPercent: 2,
    dlpMonths: 18,
    abgRequired: true,
    abgPercent: 10,
    abgValue: guaranteeAmount(300000, 10),
    abgNumber: "ABG/CLOSED/1",
    abgDate: isoDaysFromToday(-480),
    abgExpiry: isoDaysFromToday(-30),
    abgBankName: "CLOSED",
    abgRetrieved: true,
    abgRetrievedDate: isoDaysFromToday(-45),
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: guaranteeAmount(300000, 5),
    pbgNumber: "PBG/CLOSED/1",
    pbgDate: isoDaysFromToday(-470),
    pbgExpiry: isoDaysFromToday(100),
    pbgBankName: "CLOSED",
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    contractorAssigned: "Closed Works Ltd",
    boq: [boq("demo-boq-cl-1", "Bridge crane 20T", "Nos", 300000, 1)],
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    retentionRecoveredAt: isoDaysFromToday(-40),
    handoverDate: null,
    status: "complete",
    createdAt: isoDaysFromToday(-500) + "T09:00:00.000Z",
  };

  const cSplit: Contract = {
    id: "demo-c-split",
    projectName: "Steel Mill Runway Beams",
    projectNo: "C-DEMO-005",
    orderNos: "WO/MILL/55",
    orderDate: isoDaysFromToday(-30),
    closureDate: isoDaysFromToday(180),
    orderValue: 800000,
    gstApplicable: true,
    city: "Jamshedpur",
    state: "Jharkhand",
    country: "India",
    billingTerms: {
      gad: 15,
      supply: 45,
      installation: 30,
      testing: 5,
      handover: 5,
    },
    paymentDueDays: 45,
    retentionPercent: 10,
    tdsPercent: 5,
    dlpMonths: 60,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    abgNumber: null,
    abgDate: null,
    abgExpiry: null,
    abgBankName: null,
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: true,
    pbgPercent: 10,
    pbgValue: guaranteeAmount(800000, 10),
    pbgNumber: null,
    pbgDate: null,
    pbgExpiry: null,
    pbgBankName: null,
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    contractorAssigned: "East Engg JV",
    boq: [
      boq("demo-boq-sp-1", "Runway beam RH", "Nos", 200000, 2),
      boq("demo-boq-sp-2", "Runway beam LH", "Nos", 200000, 2),
    ],
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    retentionRecoveredAt: null,
    handoverDate: null,
    status: "active",
    createdAt: isoDaysFromToday(-30) + "T09:00:00.000Z",
  };

  const cMin: Contract = {
    id: "demo-c-min",
    projectName: "Tool Room Jib Crane",
    projectNo: "C-DEMO-006",
    orderNos: "QT-991",
    orderDate: isoDaysFromToday(-14),
    closureDate: isoDaysFromToday(60),
    orderValue: 80000,
    gstApplicable: true,
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    billingTerms: { supply: 70, installation: 30 },
    paymentDueDays: 3,
    retentionPercent: 0,
    tdsPercent: 2,
    dlpMonths: 6,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    abgNumber: null,
    abgDate: null,
    abgExpiry: null,
    abgBankName: null,
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    pbgNumber: null,
    pbgDate: null,
    pbgExpiry: null,
    pbgBankName: null,
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    contractorAssigned: "",
    boq: [boq("demo-boq-mn-1", "Jib crane 2T", "Nos", 80000, 1)],
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    retentionRecoveredAt: null,
    handoverDate: null,
    status: "active",
    createdAt: isoDaysFromToday(-14) + "T09:00:00.000Z",
  };

  const contracts = [cAdv, cNoGst, cPastDue, cComplete, cSplit, cMin];

  // ——— Tasks: system/manual, statuses, assignees, overdue, subtasks ———
  const task = (
    partial: Omit<
      Task,
      | "notes"
      | "assignees"
      | "catalogKey"
      | "notesUpdatedAt"
      | "completedAt"
      | "notRequiredReason"
    > &
      Partial<
        Pick<
          Task,
          | "notes"
          | "assignees"
          | "catalogKey"
          | "notesUpdatedAt"
          | "completedAt"
          | "notRequiredReason"
        >
      > & { assignee?: string | null }
  ): Task => {
    const { assignee, ...rest } = partial;
    const assignees =
      partial.assignees ?? (assignee ? [assignee] : []);
    const closed =
      rest.status === "completed" || rest.status === "not_required";
    return {
      notes: "",
      catalogKey: null,
      notesUpdatedAt: null,
      completedAt: closed ? rest.createdAt : null,
      notRequiredReason: null,
      ...rest,
      assignees,
    };
  };

  const tasks: Task[] = [
    task({
      id: "demo-t-kick-adv",
      title: "Kick off meeting pending",
      contractId: cAdv.id,
      department: "Contracts Department",
      assignee: "Priya Manager",
      status: "completed",
      dueDate: isoDaysFromToday(-110),
      parentId: null,
      source: "system",
      catalogKey: "kickoff",
      createdAt: isoDaysFromToday(-120) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-gad-adv",
      title: "Finalise Drawings/GAD",
      contractId: cAdv.id,
      department: "Drawings Department",
      assignee: null,
      status: "in_progress",
      dueDate: isoDaysFromToday(10),
      parentId: null,
      source: "system",
      catalogKey: "gad",
      notes: "Rev-B with client for markups",
      notesUpdatedAt: isoDaysFromToday(-1) + "T09:00:00.000Z",
      createdAt: isoDaysFromToday(-120) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-gad-sub",
      title: "Client markups on GAD rev-B",
      contractId: cAdv.id,
      department: "Drawings Department",
      assignee: "Anil User",
      status: "pending",
      dueDate: isoDaysFromToday(5),
      parentId: "demo-t-gad-adv",
      source: "manual",
      catalogKey: "custom",
      createdAt: isoDaysFromToday(-15) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-abg-adv",
      title: `Create ABG — ${cAdv.projectNo}`,
      contractId: cAdv.id,
      department: "Accounts Department",
      assignee: null,
      status: "completed",
      dueDate: isoDaysFromToday(-95),
      parentId: null,
      source: "system",
      catalogKey: "create_abg",
      createdAt: isoDaysFromToday(-120) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-pbg-adv",
      title: `Create PBG — ${cAdv.projectNo}`,
      contractId: cAdv.id,
      department: null,
      assignee: null,
      status: "completed",
      dueDate: isoDaysFromToday(-85),
      parentId: null,
      source: "system",
      catalogKey: "create_pbg",
      createdAt: isoDaysFromToday(-120) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-kick-ng",
      title: "Kick off meeting pending",
      contractId: cNoGst.id,
      department: null,
      assignee: null,
      status: "pending",
      dueDate: null,
      parentId: null,
      source: "system",
      catalogKey: "kickoff",
      createdAt: isoDaysFromToday(-60) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-pbg-ng",
      title: `Create PBG — ${cNoGst.projectNo}`,
      contractId: cNoGst.id,
      department: "Accounts Department",
      assignee: null,
      status: "pending",
      dueDate: isoDaysFromToday(-5),
      parentId: null,
      source: "system",
      catalogKey: "create_pbg",
      createdAt: isoDaysFromToday(-60) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-manual-overdue",
      title: "Chase client for site access clearance",
      contractId: cPastDue.id,
      department: "Contracts Department",
      assignees: ["Priya Manager", "New Joiner"],
      status: "in_progress",
      dueDate: isoDaysFromToday(-14),
      parentId: null,
      source: "manual",
      catalogKey: "custom",
      notes: "Site fence not opened; client PO contacted twice.",
      notesUpdatedAt: isoDaysFromToday(-2) + "T14:00:00.000Z",
      createdAt: isoDaysFromToday(-40) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-split-kick",
      title: "Kick off meeting pending",
      contractId: cSplit.id,
      department: null,
      assignee: null,
      status: "pending",
      dueDate: isoDaysFromToday(7),
      parentId: null,
      source: "system",
      catalogKey: "kickoff",
      createdAt: isoDaysFromToday(-30) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-min-kick",
      title: "Kick off meeting pending",
      contractId: cMin.id,
      department: "Installation Department",
      assignee: "Site Lead",
      status: "pending",
      dueDate: isoDaysFromToday(3),
      parentId: null,
      source: "system",
      catalogKey: "kickoff",
      createdAt: isoDaysFromToday(-14) + "T10:00:00.000Z",
    }),
    task({
      id: "demo-t-onhold-custom",
      title: "Confirm load test window with client",
      contractId: cAdv.id,
      department: "Contracts Department",
      assignees: ["Priya Manager"],
      status: "on_hold",
      dueDate: isoDaysFromToday(12),
      parentId: null,
      source: "manual",
      catalogKey: "custom",
      notes: "Waiting on client holiday calendar",
      notesUpdatedAt: isoDaysFromToday(-3) + "T11:00:00.000Z",
      createdAt: isoDaysFromToday(-8) + "T10:00:00.000Z",
    }),
  ];

  // ——— Invoices: PI, TI, extra charges, converted, past due, unpaid/partial/paid ———
  const invPiOpen = invoiceFrom({
    id: "demo-inv-pi-open",
    type: "PI",
    number: "PI/DEMO/001",
    date: isoDaysFromToday(-10),
    contractId: cAdv.id,
    lines: [
      {
        boqItemId: "demo-boq-adv-1",
        itemName: "EOT Crane 10T",
        termKey: "advance",
        billedQty: 2,
        rate: 200000,
        termPercent: 10,
        lineNet: lineNet(200000, 2, 10),
      },
    ],
    extraCharges: [],
    convertedFromPiId: null,
    createdAt: isoDaysFromToday(-10) + "T11:00:00.000Z",
    gstApplicable: true,
  });

  const invPiExtras = invoiceFrom({
    id: "demo-inv-pi-extra",
    type: "PI",
    number: "PI/DEMO/002",
    date: isoDaysFromToday(-5),
    contractId: cNoGst.id,
    lines: [
      {
        boqItemId: "demo-boq-ng-1",
        itemName: "Electric hoist 5T",
        termKey: "supply",
        billedQty: 1,
        rate: 75000,
        termPercent: 60,
        lineNet: lineNet(75000, 1, 60),
      },
    ],
    extraCharges: [
      {
        id: "demo-xc-1",
        label: "Packing & forwarding",
        amount: 2500,
      },
    ],
    convertedFromPiId: null,
    createdAt: isoDaysFromToday(-5) + "T11:00:00.000Z",
    gstApplicable: false,
  });

  // Converted TI (from a historical PI id)
  const invTiConverted = invoiceFrom({
    id: "demo-inv-ti-conv",
    type: "TI",
    number: "TI/DEMO/010",
    date: isoDaysFromToday(-45),
    contractId: cAdv.id,
    lines: [
      {
        boqItemId: "demo-boq-adv-1",
        itemName: "EOT Crane 10T",
        termKey: "gad",
        billedQty: 2,
        rate: 200000,
        termPercent: 10,
        lineNet: lineNet(200000, 2, 10),
      },
    ],
    extraCharges: [],
    convertedFromPiId: "demo-inv-pi-converted-source",
    createdAt: isoDaysFromToday(-45) + "T12:00:00.000Z",
    gstApplicable: true,
  });

  // Past-due TI unpaid (invoice date old + short due days)
  const invTiPastDue = invoiceFrom({
    id: "demo-inv-ti-pastdue",
    type: "TI",
    number: "TI/DEMO/020",
    date: isoDaysFromToday(-40),
    contractId: cPastDue.id,
    lines: [
      {
        boqItemId: "demo-boq-pd-1",
        itemName: "Wheel assembly",
        termKey: "supply",
        billedQty: 4,
        rate: 25000,
        termPercent: 80,
        lineNet: lineNet(25000, 4, 80),
      },
    ],
    extraCharges: [],
    convertedFromPiId: null,
    createdAt: isoDaysFromToday(-40) + "T12:00:00.000Z",
    gstApplicable: true,
  });

  // TI fully paid: cash + retention + TDS covers final
  // net 80000, gst 14400, final 94400; ret 5%=4000, tds 2%=1600; expected cash 88800
  const invTiPaid = invoiceFrom({
    id: "demo-inv-ti-paid",
    type: "TI",
    number: "TI/DEMO/030",
    date: isoDaysFromToday(-25),
    contractId: cPastDue.id,
    lines: [
      {
        boqItemId: "demo-boq-pd-1",
        itemName: "Wheel assembly",
        termKey: "installation",
        billedQty: 4,
        rate: 25000,
        termPercent: 20,
        lineNet: lineNet(25000, 4, 20),
      },
    ],
    extraCharges: [],
    convertedFromPiId: null,
    createdAt: isoDaysFromToday(-25) + "T12:00:00.000Z",
    gstApplicable: true,
  });

  // TI partial: leave due remaining
  const invTiPartial = invoiceFrom({
    id: "demo-inv-ti-partial",
    type: "TI",
    number: "TI/DEMO/040",
    date: isoDaysFromToday(-8),
    contractId: cAdv.id,
    lines: [
      {
        boqItemId: "demo-boq-adv-2",
        itemName: "Festoon system",
        termKey: "supply",
        billedQty: 2,
        rate: 50000,
        termPercent: 40,
        lineNet: lineNet(50000, 2, 40),
      },
    ],
    extraCharges: [
      { id: "demo-xc-2", label: "Site handling", amount: 1000 },
    ],
    convertedFromPiId: null,
    createdAt: isoDaysFromToday(-8) + "T12:00:00.000Z",
    gstApplicable: true,
  });

  // Fresh TI not yet due (recent date, long payment days)
  const invTiFresh = invoiceFrom({
    id: "demo-inv-ti-fresh",
    type: "TI",
    number: "TI/DEMO/050",
    date: isoDaysFromToday(-2),
    contractId: cSplit.id,
    lines: [
      {
        boqItemId: "demo-boq-sp-1",
        itemName: "Runway beam RH",
        termKey: "gad",
        billedQty: 2,
        rate: 200000,
        termPercent: 15,
        lineNet: lineNet(200000, 2, 15),
      },
    ],
    extraCharges: [],
    convertedFromPiId: null,
    createdAt: isoDaysFromToday(-2) + "T12:00:00.000Z",
    gstApplicable: true,
  });

  // No-GST TI
  const invTiNoGst = invoiceFrom({
    id: "demo-inv-ti-nogst",
    type: "TI",
    number: "TI/DEMO/060",
    date: isoDaysFromToday(-12),
    contractId: cNoGst.id,
    lines: [
      {
        boqItemId: "demo-boq-ng-1",
        itemName: "Electric hoist 5T",
        termKey: "supply",
        billedQty: 1,
        rate: 75000,
        termPercent: 60,
        lineNet: lineNet(75000, 1, 60),
      },
    ],
    extraCharges: [],
    convertedFromPiId: null,
    createdAt: isoDaysFromToday(-12) + "T12:00:00.000Z",
    gstApplicable: false,
  });

  // Closed-contract TI (historical)
  const invTiClosed = invoiceFrom({
    id: "demo-inv-ti-closed",
    type: "TI",
    number: "TI/DEMO/070",
    date: isoDaysFromToday(-100),
    contractId: cComplete.id,
    lines: [
      {
        boqItemId: "demo-boq-cl-1",
        itemName: "Bridge crane 20T",
        termKey: "handover",
        billedQty: 1,
        rate: 300000,
        termPercent: 5,
        lineNet: lineNet(300000, 1, 5),
      },
    ],
    extraCharges: [],
    convertedFromPiId: null,
    createdAt: isoDaysFromToday(-100) + "T12:00:00.000Z",
    gstApplicable: true,
  });

  const invoices: Invoice[] = [
    invPiOpen,
    invPiExtras,
    invTiConverted,
    invTiPastDue,
    invTiPaid,
    invTiPartial,
    invTiFresh,
    invTiNoGst,
    invTiClosed,
  ];

  // ——— Payments: TI / PI / unlinked; ret+tds; other; full / partial ———
  const payments: Payment[] = [
    // Fully settles invTiPaid: cash = final - ret - tds
    {
      id: "demo-pay-full",
      contractId: cPastDue.id,
      invoiceId: invTiPaid.id,
      link: "TI",
      date: isoDaysFromToday(-20),
      netAmount: money(
        invTiPaid.netAmount -
          (invTiPaid.netAmount * 5) / 100 -
          (invTiPaid.netAmount * 2) / 100
      ),
      gstAmount: invTiPaid.gstAmount,
      retentionAmount: money((invTiPaid.netAmount * 5) / 100),
      tdsAmount: money((invTiPaid.netAmount * 2) / 100),
      otherDeductions: 0,
      otherDeductionReason: "",
      recovered: 0,
      createdAt: isoDaysFromToday(-20) + "T14:00:00.000Z",
    },
    // Partial on invTiPartial — leave due
    {
      id: "demo-pay-partial",
      contractId: cAdv.id,
      invoiceId: invTiPartial.id,
      link: "TI",
      date: isoDaysFromToday(-3),
      netAmount: 10000,
      gstAmount: 1800,
      retentionAmount: money((invTiPartial.netAmount * 5) / 100),
      tdsAmount: money((invTiPartial.netAmount * 2) / 100),
      otherDeductions: 500,
      otherDeductionReason: "Freight shortfall",
      recovered: 0,
      createdAt: isoDaysFromToday(-3) + "T14:00:00.000Z",
    },
    // PI-linked payment
    {
      id: "demo-pay-pi",
      contractId: cAdv.id,
      invoiceId: invPiOpen.id,
      link: "PI",
      date: isoDaysFromToday(-8),
      netAmount: 20000,
      gstAmount: 3600,
      retentionAmount: 0,
      tdsAmount: 0,
      otherDeductions: 0,
      otherDeductionReason: "",
      recovered: 0,
      createdAt: isoDaysFromToday(-8) + "T14:00:00.000Z",
    },
    // Unlinked cash on past-due contract — auto-applies to oldest TI need
    {
      id: "demo-pay-unlinked",
      contractId: cPastDue.id,
      invoiceId: null,
      link: "unlinked",
      date: isoDaysFromToday(-15),
      netAmount: 25000,
      gstAmount: 4500,
      retentionAmount: 0,
      tdsAmount: 0,
      otherDeductions: 0,
      otherDeductionReason: "",
      recovered: 0,
      createdAt: isoDaysFromToday(-15) + "T14:00:00.000Z",
    },
    // Payment on no-GST TI (ret/tds 0)
    {
      id: "demo-pay-nogst",
      contractId: cNoGst.id,
      invoiceId: invTiNoGst.id,
      link: "TI",
      date: isoDaysFromToday(-10),
      netAmount: invTiNoGst.netAmount,
      gstAmount: 0,
      retentionAmount: 0,
      tdsAmount: 0,
      otherDeductions: 0,
      otherDeductionReason: "",
      recovered: 0,
      createdAt: isoDaysFromToday(-10) + "T14:00:00.000Z",
    },
    // Closed contract settlement
    {
      id: "demo-pay-closed",
      contractId: cComplete.id,
      invoiceId: invTiClosed.id,
      link: "TI",
      date: isoDaysFromToday(-90),
      netAmount: money(
        invTiClosed.netAmount -
          (invTiClosed.netAmount * 5) / 100 -
          (invTiClosed.netAmount * 2) / 100
      ),
      gstAmount: invTiClosed.gstAmount,
      retentionAmount: money((invTiClosed.netAmount * 5) / 100),
      tdsAmount: money((invTiClosed.netAmount * 2) / 100),
      otherDeductions: 0,
      otherDeductionReason: "",
      recovered: 0,
      createdAt: isoDaysFromToday(-90) + "T14:00:00.000Z",
    },
  ];

  // ——— Schedules ———
  // Helper for a dated supply/install window
  const sch = (
    id: string,
    contractId: string,
    boqItemId: string | null,
    kind: ScheduleLine["kind"],
    quantity: number | null,
    startDelta: number,
    endDelta: number,
    opts?: { committed?: boolean; done?: boolean }
  ): ScheduleLine => {
    const start = isoDaysFromToday(startDelta);
    const end = isoDaysFromToday(endDelta);
    return {
      id,
      contractId,
      boqItemId,
      kind,
      quantity,
      startDate: start,
      endDate: end,
      committed: opts?.committed ?? true,
      baselineStartDate: start,
      baselineEndDate: end,
      done: opts?.done ?? false,
      doneAt: opts?.done ? now : null,
      doneBy: opts?.done ? "Priya Manager" : null,
      createdAt: now,
      updatedAt: now,
    };
  };

  /**
   * Complete multi-item schedule on C-DEMO-005 (Steel Mill Runway Beams).
   * Interleaved supply dates so View order is RH → LH → RH → LH.
   * Both BOQ items fully covered for supply + install; testing + handover set.
   */
  const splitComplete: ScheduleLine[] = [
    // Supply windows (sorted by start for View): RH-1, LH-1, RH-2, LH-2
    sch("demo-sch-sp-rh-s1", cSplit.id, "demo-boq-sp-1", "supply", 1, 8, 14),
    sch("demo-sch-sp-lh-s1", cSplit.id, "demo-boq-sp-2", "supply", 1, 18, 24),
    sch("demo-sch-sp-rh-s2", cSplit.id, "demo-boq-sp-1", "supply", 1, 28, 34),
    sch("demo-sch-sp-lh-s2", cSplit.id, "demo-boq-sp-2", "supply", 1, 38, 44),
    // Installation windows paired by index with supplies
    sch("demo-sch-sp-rh-i1", cSplit.id, "demo-boq-sp-1", "installation", 1, 48, 54),
    sch("demo-sch-sp-lh-i1", cSplit.id, "demo-boq-sp-2", "installation", 1, 58, 64),
    sch("demo-sch-sp-rh-i2", cSplit.id, "demo-boq-sp-1", "installation", 1, 68, 74),
    sch("demo-sch-sp-lh-i2", cSplit.id, "demo-boq-sp-2", "installation", 1, 78, 84),
    sch("demo-sch-sp-testing", cSplit.id, null, "testing", null, 95, 95),
    sch("demo-sch-sp-handover", cSplit.id, null, "handover", null, 110, 110),
  ];

  const schedules: ScheduleLine[] = [
    // Partial / edge cases on other contracts (not complete schedules)
    sch("demo-sch-supply-near", cAdv.id, "demo-boq-adv-1", "supply", 1, 10, 18),
    {
      ...sch(
        "demo-sch-supply-far",
        cAdv.id,
        "demo-boq-adv-1",
        "supply",
        1,
        60,
        70,
        { committed: false, done: true }
      ),
    },
    sch(
      "demo-sch-supply-past",
      cPastDue.id,
      "demo-boq-pd-1",
      "supply",
      4,
      -50,
      -40
    ),
    sch("demo-sch-testing", cAdv.id, null, "testing", null, 80, 80, {
      committed: false,
    }),
    sch("demo-sch-handover", cAdv.id, null, "handover", null, 95, 95, {
      committed: false,
    }),
    sch("demo-sch-near-highlight", cMin.id, "demo-boq-mn-1", "supply", 1, 5, 8),
    // Full complete multi-item schedule for View / planner testing
    ...splitComplete,
  ];

  const itemCatalog = [
    { key: "eot-crane-10t", name: "EOT Crane 10T", unit: "Nos", lastRate: 200000 },
    { key: "festoon-system", name: "Festoon system", unit: "Set", lastRate: 50000 },
    { key: "electric-hoist-5t", name: "Electric hoist 5T", unit: "Nos", lastRate: 75000 },
    { key: "wheel-assembly", name: "Wheel assembly", unit: "Nos", lastRate: 25000 },
    { key: "bridge-crane-20t", name: "Bridge crane 20T", unit: "Nos", lastRate: 300000 },
    { key: "runway-beam-rh", name: "Runway beam RH", unit: "Nos", lastRate: 200000 },
    { key: "runway-beam-lh", name: "Runway beam LH", unit: "Nos", lastRate: 200000 },
    { key: "jib-crane-2t", name: "Jib crane 2T", unit: "Nos", lastRate: 80000 },
  ];

  return {
    workspaceRevision: 5,
    contracts,
    tasks,
    itemCatalog,
    invoices,
    payments,
    schedules,
    notifications: [],
    scheduleChangeLog: [
      {
        id: "demo-sch-log-1",
        at: now,
        by: "Priya Manager",
        contractId: cAdv.id,
        scheduleId: "demo-sch-supply-far",
        summary: "Marked Supply done",
      },
    ],
    taskDeadlineChangeLog: [],
    customDepartments: ["Quality Department", "Logistics Department"],
    expenseCategories: [],
    deliveryChallans: [],
    installationProgress: [],
    nexusCosts: {
      contracts: {
        "demo-c-adv-gst": { spent: 180000, yetToSpend: 220000 },
        "demo-c-nogst": { spent: 40000, yetToSpend: 70000 },
        "demo-c-pastdue": { spent: 20000, yetToSpend: 55000 },
        "demo-c-complete": { spent: 250000, yetToSpend: 10000 },
        "demo-c-split": { spent: 300000, yetToSpend: 350000 },
        "demo-c-min": { spent: 60000, yetToSpend: 40000 },
      },
    },
  };
}

type SeedUser = {
  email: string;
  name: string;
  clearance: "USER" | "MANAGER" | "DIRECTOR" | "MASTER";
  department: string | null;
  mustChangePassword: boolean;
  password: string;
};

const DEMO_USERS: SeedUser[] = [
  {
    email: "director@cradle.local",
    name: "Deepa Director",
    clearance: "DIRECTOR",
    department: null,
    mustChangePassword: false,
    password: "NexusDemo1!",
  },
  {
    email: "director.paper@cradle.local",
    name: "Dev Director (on paper)",
    clearance: "DIRECTOR",
    department: "Contracts Department",
    mustChangePassword: false,
    password: "NexusDemo1!",
  },
  {
    email: "manager.contracts@cradle.local",
    name: "Priya Manager",
    clearance: "MANAGER",
    department: "Contracts Department",
    mustChangePassword: false,
    password: "NexusDemo1!",
  },
  {
    email: "manager.accounts@cradle.local",
    name: "Asha Accounts Manager",
    clearance: "MANAGER",
    department: "Accounts Department",
    mustChangePassword: false,
    password: "NexusDemo1!",
  },
  {
    email: "user.drawings@cradle.local",
    name: "Anil User",
    clearance: "USER",
    department: "Drawings Department",
    mustChangePassword: false,
    password: "NexusDemo1!",
  },
  {
    email: "user.install@cradle.local",
    name: "Site Lead",
    clearance: "USER",
    department: "Installation Department",
    mustChangePassword: false,
    password: "NexusDemo1!",
  },
  {
    email: "user.quality@cradle.local",
    name: "Quality Lead",
    clearance: "USER",
    department: "Quality Department",
    mustChangePassword: false,
    password: "NexusDemo1!",
  },
  {
    email: "user.new@cradle.local",
    name: "New Joiner",
    clearance: "USER",
    department: "Contracts Department",
    mustChangePassword: true,
    password: "TempPass12!",
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  // Master (preserve existing password flags if already there)
  const masterEmail = (
    process.env.SEED_MASTER_EMAIL ?? "master@cradle.local"
  )
    .toLowerCase()
    .trim();
  const masterPassword =
    process.env.SEED_MASTER_PASSWORD ?? "NexusMaster1!";
  const masterName = process.env.SEED_MASTER_NAME ?? "Master Admin";
  const masterHash = await bcrypt.hash(masterPassword, 12);
  const existingMaster = await prisma.user.findUnique({
    where: { email: masterEmail },
  });
  if (existingMaster) {
    await prisma.user.update({
      where: { email: masterEmail },
      data: {
        name: masterName,
        clearance: "MASTER",
        department: "Contracts Department", // on paper
      },
    });
    console.log(`Master: ${masterEmail} (password unchanged, dept on paper)`);
  } else {
    await prisma.user.create({
      data: {
        email: masterEmail,
        name: masterName,
        passwordHash: masterHash,
        clearance: "MASTER",
        department: "Contracts Department",
        mustChangePassword: true,
      },
    });
    console.log(`Master created: ${masterEmail}`);
  }

  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      await prisma.user.update({
        where: { email: u.email },
        data: {
          name: u.name,
          clearance: u.clearance,
          department: u.department,
          mustChangePassword: u.mustChangePassword,
          passwordHash,
        },
      });
      console.log(`Updated user: ${u.email} (${u.clearance})`);
    } else {
      await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          clearance: u.clearance,
          department: u.department,
          mustChangePassword: u.mustChangePassword,
          passwordHash,
        },
      });
      console.log(`Created user: ${u.email} (${u.clearance})`);
    }
  }

  const workspace = buildWorkspace();
  await prisma.workspaceStore.upsert({
    where: { id: "default" },
    create: { id: "default", data: workspace },
    update: { data: workspace },
  });

  console.log("Workspace demo data written:");
  console.log(
    `  contracts=${workspace.contracts.length} tasks=${workspace.tasks.length} invoices=${workspace.invoices.length} payments=${workspace.payments.length} schedules=${workspace.schedules.length} catalog=${workspace.itemCatalog.length} customDepts=${workspace.customDepartments.length}`
  );
  console.log("Demo login password for non-master users: NexusDemo1!");
  console.log("New joiner (must change password): user.new@cradle.local / TempPass12!");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
