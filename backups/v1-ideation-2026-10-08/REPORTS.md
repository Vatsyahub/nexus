# Flowhub — Report formats (draft for owner edit)

> Status: **Draft layouts only** — change freely before freeze.  
> Every report: **1 contract = detail** · **All contracts = summary** · Export **PDF** / **Excel** · Filters by any metric (incl. **task priority**).  
> **PI rule:** Proforma invoices appear **only** in PI-specific reports (e.g. Open PIs, and leftover billing where relevant). **All other money calculations use Tax Invoices (TI) only.**

---

## How to use this file

For each report below:
- Strike, rename, add, or reorder columns
- Say what must appear in **detail** vs **summary**
- We will not treat a layout as final until you say so

---

## 1. Reconciliation (money) — *under review*

**Rule:** TI only (no PI rows in this report).

### Detail (one contract)
| Section | Contents |
|---------|----------|
| Header | Project name, project no., client, city, order value, GST, retention %, status |
| Tax invoices | Table: TI number, date, net, GST, extras, final amount, **retention**, TDS, expected payment (before payments) |
| Payments | Table (separate): against TI, date, net/GST/retention/TDS/other/extras, paid total |
| Totals (order matters) | Sum TI final · sum retention (already visible on invoice lines) · sum TDS · sum expected · sum paid · then **true outstanding last** (after subtracting everything) |

### Summary (all contracts)
| Column order |
|--------------|
| Project no. · Project name · Client · City · Invoiced total (TI) · **Retention held** · …other middle columns as needed… · **Expected payment** · **True outstanding** (final two columns) |

**Owner notes:** PI excluded from reconciliation. Retention shown on invoice detail; summary has retention earlier; last two columns = expected payment + true outstanding. Outstanding is the **last** figure after all subtractions.

**Status:** OK — frozen for now (owner said next)

---

## 2. Leftover billing — *under review*

**Meaning:** Billing that is **due from progress/eligibility** but not yet on a TI — broken down by **what it is pending against** (item, term, milestone, etc.).  
**Not the same as** “amount left for billing” (that is WO − billed; see report #8).

### Detail (one contract)
| Columns |
|---------|
| Pending against (item / billing term / basis) · Eligible / due amount · Already billed (TI) against this · **Leftover** |

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Project name · **Leftover billing** (total) |

**Owner notes:** Summary = contracts + leftover billing totals. Detail = per contract, lines for each pending-against.

**Status:** OK — frozen

---

## 3. Outstanding / overdue payments / due in N days

**Rule:** TI only (no PI). Outstanding = expected payment − paid (expected = TI final − retention − TDS, per locked money rules).

### Detail (one contract)
| Columns |
|---------|
| TI number · Date · Due date · Expected payment · Paid · **Outstanding** · Days overdue (if any) · Due within N days? |

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Name · Client · City · Outstanding total · Overdue count · Overdue amount · Due in N days amount |

**Owner notes:** _(edit here)_

**Status:** OK — frozen

---

## 4. Open PIs

*(PI-specific report — PIs allowed here.)*

### Detail (one contract)
| Columns |
|---------|
| PI number · Date · Final amount · Days open · Linked items/terms (optional) |

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Name · Client · City · PI number · Date · Final amount · Days open |

**Status:** OK — frozen

---

## 5. Billing / collection by city / state

**Rule:** TI only for billed; payments for collected; outstanding as locked.

### Detail (one contract)
| Columns |
|---------|
| City · State · Billed (TI) · Collected (paid) · Outstanding |

### Summary (all contracts / by city-state)
| Columns |
|---------|
| City · State · Contracts count · Billed (TI) · Collected · Outstanding |

**Status:** OK — frozen

---

## 6. Retention held vs due

**Rule:** Retention from TIs; DLP from **actual handover date**; collect task from 45 days before DLP end.

### Detail (one contract)
| Columns |
|---------|
| TI number · Retention held · Actual handover · DLP end · Due for release? · Collected · Balance |

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Name · City · Retention held · Due for release · Collected · Balance · DLP end |

### 6b. Retention due now (DLP already passed) — small report

**Filter:** DLP end date **&lt; today** and retention balance still due (not fully collected).

| Columns |
|---------|
| Project no. · Project name · **Retention amount due** |

Optional extras if useful: City · DLP end · Days past DLP.

**Owner notes:** Simple list of contracts + retention due after DLP passed.

**Status:** OK — frozen (#6 + #6b)

---

## 7. Contract expenses

### Detail (one contract)
| Columns |
|---------|
| Date · Amount · Person paid · Category · Reason |

*(No “entered by” on this report — that belongs in the Master audit report only.)*

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Name · City · Expense total · Entry count · Top categories |

**Owner notes:** Entered-by removed from expenses report.

**Status:** OK — frozen

---

## 7b. Master — new entries audit (Master only)

**Purpose:** Special report for **Master** showing **who entered what** — all new entries across the hub (expenses, invoices, payments, tasks completions, contract edits, etc. as available).

### Detail / feed style
| Columns |
|---------|
| Datetime · Entry type · Contract (if any) · Summary of what changed · **Entered by** (user) · Department |

### Summary (optional)
| Columns |
|---------|
| User · Entry count · Last entry datetime · Entry types breakdown |

**Owner notes:** Master-only; not mixed into normal operational reports.

**Status:** OK — frozen with #7

---

## 8. Work order value vs billed vs paid vs amount left for billing

**Purpose (owner):** Portfolio money snapshot.  
**Amount left for billing** = **WO value − billed value (TI)** — simple arithmetic.  
**Do not** put “leftover billing” (progress-due) in this report — that is report #2 only.

### Detail (one contract)
| Columns |
|---------|
| **Work order value** · **Billed value (TI)** · **Paid value** · **Amount left for billing** (= WO − billed) |

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Name · Client · City · **Work order value** · **Billed value (TI)** · **Paid value** · **Amount left for billing** (= WO − billed) |

**Status:** OK — frozen

---

## 9. Bank guarantees

**Not in reports:** “ABG/PBG required?” — that is only a create-time query.  
**Value** in reports = the BG value (amount confirmation is the same as value).

### 9a. Pending bank guarantees (not yet finalised)
Contracts where ABG and/or PBG was marked **yes** at create but details are **not yet entered**.

| Columns |
|---------|
| Project no. · Name · Client · City · ABG value (if pending) · PBG value (if pending) |

**Filter:** ABG only · PBG only · **both**

### 9b. Finalised bank guarantees (entered data)
Lists BG records already completed in the hub.

| Columns |
|---------|
| Project no. · Name · City · BG type (ABG/PBG) · Value · Number · Issue date · Expiry · Bank · Retrieve status |

**Filter:** ABG · PBG · both  

Optional: change history (value/expiry edits) as a sub-section or separate export.

**Owner notes:** Split pending vs finalised; no “required?” column; value = amount.

**Status:** OK — frozen (#9a + #9b)

---

## 10. Schedule report (table format) — *under review*

**Schedule entry rules (locked):**  
- Same item can have **multiple supply (or install) lines** with different dates and **split quantities** (e.g. 50 + 50 = 100).  
- Before finalising, hub asks: **Committed to client?** Yes/No.  
- Reports **always** show full picture: **Committed** + **Uncommitted** + **Total** (not pick-one-only).

### Detail (one contract) — one row per schedule line (not only one row per item)
| Item | Qty on this line | Supply start | Supply end | Install start | Install end | Testing date | Handover date | Committed? |
|------|------------------|--------------|------------|---------------|-------------|--------------|---------------|------------|

Testing and handover dates appear on each row even if the same for the contract.  
**Totals block:** Committed qty · Uncommitted qty · **Total qty** (and date rollups as useful).

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Name · City · Next supply · Next install · Testing · Handover · **Committed qty** · **Uncommitted qty** · **Total qty** · Max delay |

### 10b. Master schedule list (all contracts, all lines) — by date
Combined list ordered by date. **Quantity is required** (main field). Always includes committed and uncommitted lines.

| Columns |
|---------|
| Date · Date type · Project no. · Project name · Item · **Quantity** · City · **Committed?** |

**Footer / summary:** Committed qty total · Uncommitted qty total · **Grand total qty**

### 10c. Supply plan by month — item qty
Item-wise quantities against the **month they are to be supplied** (respecting split lines).

| Columns / layout |
|------------------|
| Project no. · Item · Supply month · **Committed qty** · **Uncommitted qty** · **Total qty** · (optional: BOQ qty) |

Or matrix by month with committed / uncommitted / total layers or sub-rows.

**Owner notes:** Always show committed + uncommitted + total together.

**Status:** OK — frozen (#10 + 10b + 10c)

---

## 11. Schedule vs actual / delay / WO expiry / change history

### Detail (one contract)
| Columns |
|---------|
| Item/stage · Baseline date · Current date · Actual (if any) · Delay days · WO end · **Extension needed?** (auto) · Committed / Uncommitted / Total where relevant |

**Extension needed:** Hub answers **Yes automatically** if any schedule date goes **beyond the work-order expiry date**.

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Name · City · Delayed items count · Max delay · WO expiry · Extension needed? (auto) |

### 11b. Delayed items (short report)
All delayed items across contracts.

| Columns |
|---------|
| Project no. · Name · Item · Stage (Supply / Install) · Planned / current date · Delay days · City |

**Filter:** Supply delays · Install delays · Both  

**Status:** OK — frozen (#11 + #11b) — owner said go ahead

---

## 12. Tasks reports (incl. priority filter)

Priority: selectable + editable on task; all task reports **filter by priority level**.

### Detail
| Columns |
|---------|
| Task · Contract · Department · Assignee(s) · Deadline · **Priority** · Status (incl. pending verification) · Delay reason (if extended) |

### Summary
| Columns |
|---------|
| Department / Person · Open · Overdue · Pending verification · By priority (counts) |

Reports in this family: Unassigned · Missing deadline · **Overdue Tasks** · Pending verification · By dept/person · Extension history.

**Status:** OK — frozen

---

## 13. Operations — supply / qty left / install / testing-handover / amendments

### Qty left (detail)
| Columns |
|---------|
| Item · BOQ qty · Qty supplied · **Left to supply** · Qty installed · **Left to install** |

### Supply / DC (detail)
| Columns |
|---------|
| DC no. · Date · Items/qtys · ETA · Arrival · Signed DC · MAR · MIR |

### Installation (detail)
| Columns |
|---------|
| Item · Week entry date · Qty · Cumulative · Corrections log |

### Testing / handover readiness (detail)
| Columns |
|---------|
| Checklist item · Done? · Actual testing date · Actual handover date · DLP end |

### Amendments (detail)
| Columns |
|---------|
| Amendment date · New order value · BOQ changes · Who · Datetime |

### Summary variants
| Columns |
|---------|
| Project no. · Left to supply (total) · Left to install (total) · Open DCs · Install % · Handover ready? · Amendment count |

**Owner notes:** _(edit here)_

**Status:** OK — frozen

---

## 14. Portfolio — active/complete · Overdue Tasks rollup

### Summary
| Columns |
|---------|
| Status · Count · Order value sum · Outstanding sum · Overdue Tasks count |

### Detail (optional filter to one status)
| Columns |
|---------|
| Project no. · Name · Client · City · Status · Order value · Outstanding · Overdue Tasks count |

**Status:** OK — frozen (owner reviewed example)

---

## 15. Director profitability (Master + Director only)

**Access:** **Master and Director only** — not visible to Managers/Users.

### Detail (one contract)
| Item | Rate | Qty | Selling amount | Raw material | Overheads | Transport | Making | Other (freehand) | Item cost total |
|------|------|-----|----------------|--------------|-----------|-----------|--------|------------------|-----------------|

Then contract rollup:
| Line | Amount |
|------|--------|
| Billed net | |
| − Contract expenses (all) | |
| − Item costs (sum) | |
| − Retention (shown subtracted) | |
| **Final profit** | |
| Beside: Invoiced amount · Paid amount | |

### Summary (all contracts)
| Columns |
|---------|
| Project no. · Name · Billed net · Expenses · Item costs · Retention · **Profit** · Invoiced · Paid |

### 15b. Item cost sheet report (after costs entered)
Once cost data is entered per item on a contract, Director/Master can export/view that **item cost sheet** (same restricted access).

| Columns |
|---------|
| Project no. · Item · Rate · Qty · Selling · Raw material · Overheads · Transport · Making · Other · Item cost total |

**Status:** OK — frozen (#15 + #15b; Master/Director only)

---

## Owner sign-off checklist

- [x] 1 Reconciliation  
- [x] 2 Leftover billing  
- [x] 3 Outstanding / overdue / due in N days  
- [x] 4 Open PIs  
- [x] 5 Billing / collection by city  
- [x] 6 Retention held vs due (+ 6b Retention due now / DLP passed)  
- [x] 7 Contract expenses (+ 7b Master new-entries audit)  
- [x] 8 Work order vs billed vs paid vs amount left for billing  
- [x] 9 Bank guarantees  
- [x] 10 Schedule table (+ 10b master date list + 10c supply-by-month qty)  
- [x] 11 Schedule delay / WO expiry (+ 11b delayed items by supply/install)  
- [x] 12 Tasks (+ priority)  
- [x] 13 Operations (supply / qty left / install / handover / amendments)  
- [x] 14 Portfolio active/complete  
- [x] 15 Director profitability (+ 15b item cost sheet; Master/Director only)  

**Review mode:** Report format pass **complete** (all 15 signed off). Formats may still be refined later if owner asks.

When all checked, formats freeze for tech plan / build.
