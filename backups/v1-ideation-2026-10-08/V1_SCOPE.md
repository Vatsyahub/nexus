# Flowhub v1 — Ideation backup scope

**Snapshot date:** 2026-10-08  
**Product:** Flowhub — a product of Cradle Runways (I) Pvt. Ltd.  
**Purpose of this folder:** Full local + GitHub backup of agreed ideation before tech plan / build.

## Files in this backup

| File | Contents |
|------|----------|
| `IDEATION.md` | Full living ideation log (roles, flow, rules, money, ops, close-out, BG, tasks, notifications) |
| `REPORTS.md` | Frozen report formats (PDF/Excel; detail + summary) — all 15 families signed off |
| `V1_SCOPE.md` | This summary: what is in v1 vs parked for later |

Also mirrored at repo root as live working copies: `/IDEATION.md`, `/REPORTS.md`.

---

## In v1 (agreed)

### Product shape
- Internal recorder + task manager for contracts (projects)
- Not a client portal; not an invoice PDF generator
- Homepage + left nav; **Tasks** as its own section
- **Director/Master-only** private section for item costs / profitability

### Users & org
- Clearances: User, Manager, Director, Master
- Departments: Contracts, Accounts, Drawings, Installation, Directors, Collection
- Task create / assign / verify / notify rules as in IDEATION
- Deadlines required; extend with delay + reason history

### Contract create & edits
- Full field list (client, unique project no., GST 18%, retention 0–10%, DLP 6–60 months, etc.)
- BOQ ±5% vs order value; no incomplete drafts; fields editable later
- Amendments: free BOQ history + formal WO v2/v3 fields

### Flow
- System tasks on create; Finalise Drawings / ABG / PBG; Create schedules after GAD
- Schedules: split qty by date; committed vs uncommitted; cascade; calendar; 30-day warn
- Supply via DC + qty supplied (no qty-ready / ready-for-dispatch)
- Install weekly qty; one subcontractor per contract (replaceable)
- Testing / handover; DLP from actual handover; close-out Master-only
- ABG/PBG lifecycle; value/expiry editable with history; auto-show on contract page

### Money
- PI/TI entry free; TI drives most calculations; PI only in PI-related reports
- Payments partial; expected/outstanding formulas; TDS suggested 2%
- Expenses contract-only; Master audit of who entered what

### Reports
- All formats in `REPORTS.md` — export **PDF** and **Excel**
- One contract = detail; all contracts = summary
- TI-only money rules; leftover ≠ amount left for billing (WO − billed)

### Notifications
- Task created → Manager + Master
- Assigned to user → that user
- Assigned to department → all users + managers in that department
- In-hub Overdue Tasks surface

---

## Parked for later (not v1)

| Item | Notes |
|------|--------|
| **Natural-language (NL) query** | “Ask the hub like AI” — park; v1 uses structured reports |
| **Excel bulk contract import** | Decisions kept in IDEATION; build after core works |
| **Named handover/Advance document master lists** | Checkbox + add sub-docs for now; full named lists refine later |
| **Email notifications** | In-hub first unless owner adds email later |

---

## Next stage

**Tech plan** → then build.  
Do not treat current prototype as production. Go-live only when owner says so.

---

## Restore note

To restore this snapshot over working copies:

```bash
cp backups/v1-ideation-2026-10-08/IDEATION.md ./IDEATION.md
cp backups/v1-ideation-2026-10-08/REPORTS.md ./REPORTS.md
```
