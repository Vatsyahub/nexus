import assert from "node:assert/strict";
import test from "node:test";
import { recentContracts } from "@/lib/recent-contracts";

type Row = { id: string; createdAt: string; closureDate: string };

const rows: Row[] = [
  {
    id: "old-early-closure",
    createdAt: "2026-01-01T00:00:00.000Z",
    closureDate: "2026-01-02",
  },
  {
    id: "old-missing-closure",
    createdAt: "2026-01-15T00:00:00.000Z",
    closureDate: "",
  },
  {
    id: "mid",
    createdAt: "2026-03-01T00:00:00.000Z",
    closureDate: "2026-12-31",
  },
  {
    id: "newer-missing-closure",
    createdAt: "2026-06-01T00:00:00.000Z",
    closureDate: "",
  },
  {
    id: "newest",
    createdAt: "2026-08-01T00:00:00.000Z",
    closureDate: "2027-01-01",
  },
];

test("recent contracts are the three newest by createdAt", () => {
  assert.deepEqual(
    recentContracts(rows).map((c) => c.id),
    ["newest", "newer-missing-closure", "mid"]
  );
});

test("a missing closure date does not change who appears", () => {
  const allMissing = rows.map((c) => ({ ...c, closureDate: "" }));
  const allFilled = rows.map((c) => ({
    ...c,
    closureDate: c.closureDate || "2026-01-01",
  }));
  assert.deepEqual(
    recentContracts(allMissing).map((c) => c.id),
    recentContracts(rows).map((c) => c.id)
  );
  assert.deepEqual(
    recentContracts(allFilled).map((c) => c.id),
    recentContracts(rows).map((c) => c.id)
  );
});

test("fewer than three contracts stay newest first", () => {
  const two = [rows[0], rows[4]];
  assert.deepEqual(
    recentContracts(two).map((c) => c.id),
    ["newest", "old-early-closure"]
  );
});

test("sorting does not rewrite the source list", () => {
  const source = rows.slice();
  recentContracts(source);
  assert.deepEqual(
    source.map((c) => c.id),
    rows.map((c) => c.id)
  );
});
