import type {
  BoqItem,
  Contract,
  DeliveryChallan,
  FlowhubData,
  InstallationProgress,
  Invoice,
  ItemCatalogEntry,
  ScheduleLine,
} from "@/lib/types";

/** Same tolerance the BOQ editor uses when comparing rates. */
const RATE_EPS = 1e-6;

/** Catalog identity is the trimmed, lowercased name. One item, one key. */
export function itemNameKey(name: string | null | undefined): string {
  return String(name ?? "").trim().toLowerCase();
}

/** A BOQ line is the same item only when the name and the rate both match. */
export function sameItemRate(a: number, b: number): boolean {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= RATE_EPS;
}

export type RenameItemResult =
  | { ok: true; data: FlowhubData; from: string; to: string }
  | { ok: false; error: string };

function lineIsThisItem(name: string, fromKey: string): boolean {
  return itemNameKey(name) === fromKey;
}

function catalogEntryIsThisItem(entry: ItemCatalogEntry, fromKey: string): boolean {
  return (
    itemNameKey(entry.name) === fromKey ||
    entry.key.trim().toLowerCase() === fromKey
  );
}

type ItemFacts = { name: string; unit: string; lastRate: number };

function factsFor(
  data: FlowhubData,
  nameKey: string
): ItemFacts | null {
  const entry =
    (data.itemCatalog ?? []).find((row) => itemNameKey(row.name) === nameKey) ??
    (data.itemCatalog ?? []).find(
      (row) => row.key.trim().toLowerCase() === nameKey
    );
  let lineName = "";
  let lineUnit = "";
  let lineRate = 0;
  let found = false;
  for (const contract of data.contracts ?? []) {
    for (const line of contract.boq ?? []) {
      if (!lineIsThisItem(line.name, nameKey)) continue;
      found = true;
      lineName = String(line.name ?? "").trim();
      lineUnit = String(line.unit ?? "").trim() || "Nos";
      lineRate = Number(line.rate) || 0;
      break;
    }
    if (found) break;
  }
  if (!found) return null;
  const entryName = entry ? String(entry.name ?? "").trim() : "";
  return {
    name: (entry && itemNameKey(entryName) === nameKey ? entryName : lineName) || lineName,
    unit: String(entry?.unit ?? "").trim() || lineUnit || "Nos",
    lastRate: entry ? Number(entry.lastRate) || 0 : lineRate,
  };
}

type Involved = { line: BoqItem; index: number; wasTarget: boolean };

/**
 * On one contract, lines of the combined item that share a rate become one
 * line. The line that already had the surviving name is the one kept.
 * Different rates stay separate. Units do not split a rate.
 */
function foldContract(
  contract: Contract,
  fromKey: string,
  toKey: string,
  finalName: string,
  finalKey: string,
  finalUnit: string,
  remap: Map<string, string>
): Contract {
  const boq = contract.boq ?? [];
  const involved: Involved[] = [];
  const rest: { line: BoqItem; index: number }[] = [];
  boq.forEach((line, index) => {
    const key = itemNameKey(line.name);
    if (key === fromKey || key === toKey) {
      involved.push({ line, index, wasTarget: key === toKey });
    } else {
      rest.push({ line, index });
    }
  });
  if (involved.length === 0) return contract;

  const groups: Involved[][] = [];
  for (const row of involved) {
    const rate = Number(row.line.rate) || 0;
    const group = groups.find((rows) =>
      sameItemRate(Number(rows[0]?.line.rate) || 0, rate)
    );
    if (group) group.push(row);
    else groups.push([row]);
  }

  const kept: { line: BoqItem; index: number }[] = [];
  for (const group of groups) {
    const keeper = group.find((row) => row.wasTarget) ?? group[0];
    const quantity = group.reduce(
      (sum, row) => sum + (Number(row.line.quantity) || 0),
      0
    );
    kept.push({
      index: keeper.index,
      line: {
        ...keeper.line,
        name: finalName,
        catalogKey: finalKey,
        unit: finalUnit,
        quantity,
      },
    });
    for (const row of group) {
      if (row.line.id !== keeper.line.id) remap.set(row.line.id, keeper.line.id);
    }
  }

  const nextBoq = [...rest, ...kept]
    .sort((a, b) => a.index - b.index)
    .map((row) => row.line);
  return { ...contract, boq: nextBoq };
}

function retargetChallans(
  challans: DeliveryChallan[],
  remap: Map<string, string>
): DeliveryChallan[] {
  if (remap.size === 0) return challans;
  let changed = false;
  const next = challans.map((challan) => {
    let lineChanged = false;
    const lines: DeliveryChallan["lines"] = [];
    const at = new Map<string, number>();
    for (const line of challan.lines) {
      const id = remap.get(line.boqItemId) ?? line.boqItemId;
      if (id !== line.boqItemId) lineChanged = true;
      const prev = at.get(id);
      if (prev == null) {
        at.set(id, lines.length);
        lines.push(id === line.boqItemId ? line : { ...line, boqItemId: id });
      } else {
        lineChanged = true;
        const kept = lines[prev];
        if (!kept) continue;
        lines[prev] = {
          ...kept,
          qty: (Number(kept.qty) || 0) + (Number(line.qty) || 0),
        };
      }
    }
    if (!lineChanged) return challan;
    changed = true;
    return { ...challan, lines };
  });
  return changed ? next : challans;
}

function retargetInstall(
  rows: InstallationProgress[],
  remap: Map<string, string>
): InstallationProgress[] {
  if (remap.size === 0) return rows;
  const tagged = rows.map((row) => ({
    row,
    originalId: row.boqItemId,
    nextId: remap.get(row.boqItemId) ?? row.boqItemId,
  }));
  const groups = new Map<string, typeof tagged>();
  for (const item of tagged) {
    const key = `${item.row.contractId}\0${item.nextId}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  let changed = false;
  const next: InstallationProgress[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      const only = list[0];
      if (!only) continue;
      if (only.nextId === only.originalId) next.push(only.row);
      else {
        changed = true;
        next.push({ ...only.row, boqItemId: only.nextId });
      }
      continue;
    }
    changed = true;
    const keeper =
      list.find((item) => item.originalId === item.nextId) ?? list[0];
    if (!keeper) continue;
    const installedQty = list.reduce(
      (sum, item) => sum + (Number(item.row.installedQty) || 0),
      0
    );
    const history = list
      .flatMap((item) => item.row.history ?? [])
      .sort((a, b) => (a.recordedAt || a.at).localeCompare(b.recordedAt || b.at));
    const dates = list
      .map((item) => item.row.lastUpdatedAt)
      .filter((date): date is string => !!date)
      .sort();
    next.push({
      ...keeper.row,
      boqItemId: keeper.nextId,
      installedQty,
      history,
      lastUpdatedAt: dates[dates.length - 1] ?? keeper.row.lastUpdatedAt,
    });
  }
  return changed ? next : rows;
}

function retargetSchedules(
  schedules: ScheduleLine[],
  remap: Map<string, string>
): ScheduleLine[] {
  if (remap.size === 0) return schedules;
  let changed = false;
  const next = schedules.map((line) => {
    if (!line.boqItemId || !remap.has(line.boqItemId)) return line;
    changed = true;
    return { ...line, boqItemId: remap.get(line.boqItemId) ?? line.boqItemId };
  });
  return changed ? next : schedules;
}

/**
 * Rename one hub item, or combine it into an item that already has the
 * new name. The catalog row is updated, not copied. A new name only
 * renames. An existing name keeps that item: same-rate lines on a contract
 * fold together, and different rates stay separate under its name and unit.
 * Pass `unit` to put that one unit on every current line. Omit it and a
 * new name leaves each line's unit as it was. Combining into an existing
 * name keeps that item's unit unless the submitted unit differs from the
 * item being renamed. Amendment snapshots and line diffs keep the name
 * and unit they were saved with.
 */
export function renameItemRecords(
  data: FlowhubData,
  fromName: string,
  toName: string,
  unit?: string
): RenameItemResult {
  const from = fromName.trim();
  const to = toName.trim();
  if (!from) return { ok: false, error: "Item name is required." };
  if (!to) return { ok: false, error: "Enter a new item name." };
  const submittedUnit = unit == null ? null : unit.trim();
  if (unit != null && !submittedUnit) return { ok: false, error: "Enter a unit." };

  const fromKey = itemNameKey(from);
  const toKey = itemNameKey(to);
  const contracts = data.contracts ?? [];
  const source = factsFor(data, fromKey);
  if (!source) return { ok: false, error: "Item not found." };

  const target = toKey === fromKey ? null : factsFor(data, toKey);
  const merging = target != null;
  const unitEdited = submittedUnit != null && submittedUnit !== source.unit;
  let lineUnitDiffers = false;
  if (submittedUnit != null) {
    for (const contract of contracts) {
      for (const line of contract.boq ?? []) {
        if (!lineIsThisItem(line.name, fromKey)) continue;
        if (String(line.unit ?? "").trim() !== submittedUnit) lineUnitDiffers = true;
      }
    }
  }
  const unifyLines = submittedUnit != null && (unitEdited || lineUnitDiffers);
  const finalName = merging ? target.name : to;
  const finalKey = itemNameKey(finalName);
  const finalUnit = merging
    ? unitEdited
      ? submittedUnit!
      : target.unit
    : (submittedUnit ?? source.unit);
  const lastRate = merging ? target.lastRate : source.lastRate;

  const remap = new Map<string, string>();
  let changed = false;
  const nextContracts = merging
    ? contracts.map((contract) => {
        const next = foldContract(
          contract,
          fromKey,
          toKey,
          finalName,
          finalKey,
          finalUnit,
          remap
        );
        if (next !== contract) changed = true;
        return next;
      })
    : contracts.map((contract) => {
        let lineChanged = false;
        const boq = (contract.boq ?? []).map((line) => {
          if (!lineIsThisItem(line.name, fromKey)) return line;
          const nextUnit = unifyLines ? finalUnit : line.unit;
          if (
            line.name === finalName &&
            line.catalogKey === finalKey &&
            line.unit === nextUnit
          ) {
            return line;
          }
          lineChanged = true;
          changed = true;
          return {
            ...line,
            name: finalName,
            catalogKey: finalKey,
            unit: nextUnit,
          };
        });
        return lineChanged ? { ...contract, boq } : contract;
      });
  if (remap.size > 0) changed = true;

  const touchedIds = new Set<string>();
  const otherIds = new Set<string>();
  for (const contract of contracts) {
    for (const line of contract.boq ?? []) {
      const key = itemNameKey(line.name);
      if (key === fromKey || (merging && key === toKey)) touchedIds.add(line.id);
      else otherIds.add(line.id);
    }
  }

  const nextInvoices = (data.invoices ?? []).map((invoice) => {
    let lineChanged = false;
    const lines = invoice.lines.map((line) => {
      const nextId = remap.get(line.boqItemId) ?? line.boqItemId;
      const byId = touchedIds.has(line.boqItemId);
      const byName =
        itemNameKey(line.itemName) === fromKey && !otherIds.has(line.boqItemId);
      if (!byId && !byName) return line;
      if (nextId === line.boqItemId && line.itemName === finalName) return line;
      lineChanged = true;
      changed = true;
      return { ...line, boqItemId: nextId, itemName: finalName };
    });
    return lineChanged ? { ...invoice, lines } : invoice;
  });

  const nextEntry: ItemCatalogEntry = {
    key: finalKey,
    name: finalName,
    unit: finalUnit,
    lastRate,
  };
  let replaced = false;
  const nextCatalog: ItemCatalogEntry[] = [];
  for (const entry of data.itemCatalog ?? []) {
    const key = entry.key.trim().toLowerCase();
    const sameSource = catalogEntryIsThisItem(entry, fromKey);
    const sameTarget = merging && (key === toKey || itemNameKey(entry.name) === toKey);
    if (sameSource || sameTarget || key === finalKey) {
      if (!replaced) {
        nextCatalog.push(nextEntry);
        replaced = true;
        if (
          entry.key !== nextEntry.key ||
          entry.name !== nextEntry.name ||
          entry.unit !== nextEntry.unit ||
          entry.lastRate !== nextEntry.lastRate
        ) {
          changed = true;
        }
      } else {
        changed = true;
      }
      continue;
    }
    nextCatalog.push(entry);
  }
  if (!replaced) {
    nextCatalog.push(nextEntry);
    changed = true;
  }

  const deliveryChallans = retargetChallans(data.deliveryChallans ?? [], remap);
  const installationProgress = retargetInstall(data.installationProgress ?? [], remap);
  const schedules = retargetSchedules(data.schedules ?? [], remap);
  if (deliveryChallans !== data.deliveryChallans) changed = true;
  if (installationProgress !== data.installationProgress) changed = true;
  if (schedules !== data.schedules) changed = true;

  if (!changed) return { ok: true, data, from, to };
  return {
    ok: true,
    data: {
      ...data,
      contracts: nextContracts,
      invoices: nextInvoices,
      itemCatalog: nextCatalog,
      deliveryChallans,
      installationProgress,
      schedules,
    },
    from,
    to,
  };
}

/**
 * Distinct units on current BOQ lines, keyed by the item's lowercase name,
 * in the order they first appear. Repeated units are listed once. A blank
 * unit is skipped. Amendment history is not included.
 */
export function currentItemUnits(data: FlowhubData): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const contract of data.contracts ?? []) {
    for (const line of contract.boq ?? []) {
      const name = String(line?.name ?? "").trim();
      const unit = String(line?.unit ?? "").trim();
      if (!name || !unit) continue;
      const key = itemNameKey(name);
      const list = map.get(key);
      if (!list) {
        map.set(key, [unit]);
        continue;
      }
      if (!list.includes(unit)) list.push(unit);
    }
  }
  return map;
}

/**
 * Names the item pickers may offer. A name qualifies only when a current
 * BOQ line uses it. Amendment history, a renamed spelling, and a removed
 * name are not choices. This is the existing catalog, filtered to those
 * lines — not a second item list.
 */
export function itemNameChoices(data: FlowhubData): ItemCatalogEntry[] {
  const live = new Map<
    string,
    { name: string; unit: string; rate: number; catalogKey: string }
  >();
  for (const contract of data.contracts ?? []) {
    for (const line of contract.boq ?? []) {
      const name = String(line?.name ?? "").trim();
      if (!name) continue;
      const nameKey = itemNameKey(name);
      if (live.has(nameKey)) continue;
      const catalogKey = String(line.catalogKey ?? "").trim().toLowerCase();
      live.set(nameKey, {
        name,
        unit: line.unit || "Nos",
        rate: Number(line.rate) || 0,
        catalogKey: catalogKey || nameKey,
      });
    }
  }

  const byKey = new Map(
    (data.itemCatalog ?? []).map((entry) => [entry.key.trim().toLowerCase(), entry])
  );
  const byName = new Map(
    (data.itemCatalog ?? []).map((entry) => [itemNameKey(entry.name), entry])
  );

  const choices: ItemCatalogEntry[] = [];
  for (const [nameKey, row] of live) {
    const entry = byName.get(nameKey) ?? byKey.get(row.catalogKey);
    if (entry && itemNameKey(entry.name) === nameKey) {
      choices.push({
        key: entry.key,
        name: entry.name.trim(),
        unit: entry.unit || row.unit,
        lastRate: entry.lastRate,
      });
      continue;
    }
    choices.push({
      key: row.catalogKey,
      name: row.name,
      unit: row.unit,
      lastRate: row.rate,
    });
  }
  choices.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  return choices;
}

function boqLineInUse(
  data: FlowhubData,
  contractId: string,
  boqItemId: string
): boolean {
  if (
    (data.invoices ?? []).some(
      (invoice) =>
        invoice.contractId === contractId &&
        invoice.lines.some((line) => line.boqItemId === boqItemId)
    )
  ) {
    return true;
  }
  if (
    (data.schedules ?? []).some(
      (line) => line.contractId === contractId && line.boqItemId === boqItemId
    )
  ) {
    return true;
  }
  if (
    (data.deliveryChallans ?? []).some(
      (challan) =>
        challan.contractId === contractId &&
        challan.lines.some((line) => line.boqItemId === boqItemId)
    )
  ) {
    return true;
  }
  return false;
}

/**
 * A non-Master save cannot rename an item, or change its unit, when that
 * line is already on an invoice, schedule, or delivery challan. Quantity
 * and rate still follow the save. Unused lines can still be edited in the BOQ.
 */
export function keepInUseItemNames(
  current: FlowhubData,
  contracts: Contract[],
  invoices: Invoice[],
  itemCatalog: ItemCatalogEntry[]
): {
  contracts: Contract[];
  invoices: Invoice[];
  itemCatalog: ItemCatalogEntry[];
} {
  const locked = new Map<
    string,
    { name: string; catalogKey: string; unit: string }
  >();
  for (const contract of current.contracts ?? []) {
    for (const line of contract.boq ?? []) {
      if (!line?.id) continue;
      if (!boqLineInUse(current, contract.id, line.id)) continue;
      locked.set(`${contract.id}\0${line.id}`, {
        name: line.name,
        catalogKey: line.catalogKey,
        unit: line.unit,
      });
    }
  }
  if (locked.size === 0) return { contracts, invoices, itemCatalog };

  const nextContracts = contracts.map((contract) => {
    let changed = false;
    const boq = (contract.boq ?? []).map((line) => {
      const prev = locked.get(`${contract.id}\0${line.id}`);
      if (!prev) return line;
      if (
        line.name === prev.name &&
        line.catalogKey === prev.catalogKey &&
        line.unit === prev.unit
      ) {
        return line;
      }
      changed = true;
      return {
        ...line,
        name: prev.name,
        catalogKey: prev.catalogKey,
        unit: prev.unit,
      };
    });
    return changed ? { ...contract, boq } : contract;
  });

  const nextInvoices = invoices.map((invoice) => {
    let changed = false;
    const lines = invoice.lines.map((line) => {
      const prev = locked.get(`${invoice.contractId}\0${line.boqItemId}`);
      if (!prev || line.itemName === prev.name) return line;
      changed = true;
      return { ...line, itemName: prev.name };
    });
    return changed ? { ...invoice, lines } : invoice;
  });

  const lockedKeys = new Set<string>();
  const lockedNames = new Set<string>();
  for (const prev of locked.values()) {
    const key = prev.catalogKey.trim().toLowerCase();
    const name = itemNameKey(prev.name);
    if (key) lockedKeys.add(key);
    if (name) lockedNames.add(name);
  }
  const currentByKey = new Map(
    (current.itemCatalog ?? []).map((entry) => [
      entry.key.trim().toLowerCase(),
      entry,
    ])
  );
  const seen = new Set<string>();
  const nextCatalog: ItemCatalogEntry[] = [];
  for (const entry of itemCatalog) {
    const key = entry.key.trim().toLowerCase();
    seen.add(key);
    const stored = currentByKey.get(key);
    const storedName = stored ? itemNameKey(stored.name) : "";
    if (
      stored &&
      (lockedKeys.has(key) || (storedName && lockedNames.has(storedName)))
    ) {
      nextCatalog.push(stored);
      continue;
    }
    nextCatalog.push(entry);
  }
  for (const [key, stored] of currentByKey) {
    if (seen.has(key)) continue;
    const name = itemNameKey(stored.name);
    if (lockedKeys.has(key) || (name && lockedNames.has(name))) {
      nextCatalog.push(stored);
    }
  }

  return {
    contracts: nextContracts,
    invoices: nextInvoices,
    itemCatalog: nextCatalog,
  };
}
