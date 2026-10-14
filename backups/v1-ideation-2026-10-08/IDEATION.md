# Flowhub — Ideation Log

> **Status:** Ideation for **v1 complete enough** → next = **tech plan** (build still not go-live)  
> **Product:** Flowhub — a product of **Cradle Runways (I) Pvt. Ltd.**  
> **v1 backup:** `backups/v1-ideation-2026-10-08/` (IDEATION + REPORTS + V1_SCOPE) — also on GitHub  
> **Parked for later:** NL query, Excel import, full named doc lists, email (see V1_SCOPE)  
> **Existing code:** Local/dev prototype only (browser storage) — treat as experiment, not production.

---

## Departments

Contracts, Accounts, Drawings, Installation, Directors, **Collection**.

---

## Clearance levels (login) — deepened

Hub checks credentials → clearance on login.

| Level | Powers |
|-------|--------|
| **User** | Enter new data: create contracts, add invoices, expenses, payments, tasks, subtasks. Can **mark** a task complete, but it is **not fully complete in the hub** until a **Manager approves**. |
| **Manager** | Everything a User can do, plus: **in charge of a department**; users sit under them; **verify/approve task completion**; **task assignment**. |
| **Director** | **View data** and **extract reports** (not general data editing). Special: enter/see **make cost and other overheads** per contract overall or per item — report **only Director + Master**. Can **create tasks** and **assign** tasks. Does **not** approve task completion. |
| **Master** | **All privileges**. Nothing hidden. Access to everything. |

**Correction vs earlier ideation:** Manager **approval is required** for task completion (not “notify Master/Director only”).

| Extra | Approving Manager = **the Manager of the user** who marked the task done (users sit under their department Manager). **Master** can approve anything. **Director** approve-power still open (piece 3). |

| User admin | **Managers** may only create **Users**. **Master or Director** can create **Managers**. **Only Master** can create **Directors** and **Masters**. |

| Clearance visibility | Showing the clearance label or not **doesn’t matter** — either is fine. |

**Piece 1 status:** Closed enough to move on (roles, create-user rules, dept approval).

---

## Core understanding (owner-confirmed direction)

**Flowhub** is where Cradle records and tracks **all details** of a project (contract) and its management, and answers questions via **reports**. It **creates tasks** that push each contract forward until **closure**.

**Dual nature (owner, 2026-09-30):** At the same time it is (1) a **project recorder** — records every detail imaginable about the contract — and (2) a **task manager** — tracks assigned tasks and dates, and **keeps informing** of any event that is coming up.

| Pillar | Meaning |
|--------|---------|
| Project recorder | Every operational and commercial detail of the contract |
| Task manager | Assignments, deadlines, completion; informs of upcoming events |
| Schedules | System creates/keeps schedules (supply, installation, and tasks before/after) and **warns / highlights as dates approach** |
| Reports | Answers leftover billing, outstanding, delays, BGs, etc. |
| Not | Client portal; not an invoice PDF generator |

### Money — retention & DLP (new clarification)

| Concept | Rule |
|---------|------|
| Retention | **Fixed %** per contract, range **0–10**; same cut from **net** on every invoice payment |
| Retention payout | Paid **after Defects Liability Period (DLP) ends** |
| DLP | **Whole months only**, min **6**, max **60** (cannot be 0); clock starts from **actual handover date** (not the scheduled date) |

### Schedules (refined)

- Cover **supply**, **installation**, and **tasks created before and after** those stages  
- Track against planned dates  
- **Warn when work is getting close to its execution date** (not only after it is late)

---

## REMINDERS — Provide later

1. Document master list (Advance → Handover) — [x partial] Handover = checkbox parent + user can **add sub-documents**; full named lists can refine later  
2. Director cost / profitability fields — [x] **Per contract per BOQ item** (not catalog). Entry: name/rate/qty/selling amount + raw material, overheads, transport, making charges + free-hand. Profit = billed net − expenses − item costs − **retention** (retention shown as subtracted); show **invoiced** and **paid** beside; final profit. Master+Director only.  
3. Contract create field #7 — [x] **None** — was GST % option; GST **fixed at 18%**  
4. Retention % per contract + whether same % every invoice — [x] **Fixed % for whole contract, same on every payment; allowed range 0–10%**  
5. Schedule warning lead time (e.g. X days before) — [x] **30 days** before schedule date

---

## Process decision

| Decision | Detail |
|----------|--------|
| Mode | **Ideation + planning first** |
| Go-live | **Not yet** — do not treat current app as live |
| Build | **Paused** until plan is agreed |
| Excel import | Parked (decisions kept below for later) |
| Prototype | May exist locally for learning; not production |

---

## Parked — Excel import (decisions kept)

| Decision | Choice |
|----------|--------|
| Format | Excel with **2 sheets**: Contracts + BOQ |
| Link key | **Project no.** |
| Scope | **New contracts only**, multiple per upload |
| Permission | Same as **create contract** |
| After import | System tasks unassigned |
| When | **After** working product plan is solid — not now |

---

## What we still need to plan (agenda)

Pick a topic to deepen next (owner chooses):

1. End-to-end contract lifecycle (screens + statuses)  
2. Billing / leftover / outstanding rules (edge cases)  
3. Task web & assignment rules  
4. Roles / departments / permissions matrix  
5. What “go live” means (users, hosting, data, training)  
6. What must be in v1 vs later  
7. Something else you care about  

### Current question (only)

**Which planning topic do you want to tackle first?** (number or name)

---

## Conversation log (recent)

### Excel import then pivot

**User:** Excel shape A; new only bulk; anyone who can create contracts.  
**Then:** Forget import for now; build working software first.  
**Assistant:** Built Billing/Payments in local prototype.  

**User (2026-09-30):** Do **not** put anything live. Discuss idea and plan first; hub not ready to go live; many details still to discuss.

**Assistant:** Paused build/go-live. Back to ideation; asked which planning topic to deepen first.

**User:** Asked assistant to explain the hub so far — what has been understood.

**Assistant:** Delivered full understanding summary (product, users, contract lifecycle, money, tasks, UI, open gaps).

**User (flow clarification):** Confirmed purpose = record/track + reports + tasks to closure. Projects = contracts with billing terms. Added **retention** (deducted from net on each invoice payment; released after **DLP**). DLP from **handover date**. Each step → task. Hub creates/tracks **schedules** (supply, installation, all related tasks) and **warns as dates approach**.

**Assistant:** Confirmed mostly aligned; called out retention/DLP and approach-warnings as additions vs prior summary.

**User:** Creative exercise — assistant acts as a software **user** trying to enter a project; owner says what it should / should not do.

**Assistant:** Started roleplay from homepage → New Contract.

---

## Creative exercise log — “I am the user”

**Login:** Hub recognises credentials and clearance (Master / Director / Manager / User). Data entry allowed only if clearance permits that action.

**Owner:** Opened form — list everything it asks.

**User (assistant roleplay) lists contract entry fields** (below — awaiting owner correction).

### Contract / project entry form — fields (owner: good enough)

1. Project name  
2. Project no. — **unique** (no two contracts share it)  
3. **Client / customer name**  
4. Order no. / nos.  
5. Order date  
6. Order end date (work order expiry)  
7. Order value  
8. GST applicable? (if yes → **fixed 18%**; no custom GST % field)  
9. Location — city, state, country  
10. Payment / billing terms (% for Advance, GAD, Supply, Installation, Testing, Handover + add custom with **free name + %**). If total ≠ 100%: **warn but still allow** save  
11. Payment due days — **min 3, max 45**  
12. Retention — **fixed %** for the contract (**0–10** inclusive); same % deducted from **net** on every invoice payment  
13. DLP — **whole months**, range **6–60** (clock starts from handover date)  
14. ABG — yes/no (only relevant if Advance term exists); if yes → ABG value; number/date/expiry left blank until created  
15. PBG — yes/no; if yes → PBG value; number/date/expiry blank until created  
16. BOQ — items (pick from catalog or new), unit, rate, quantity; total vs order value within **±5%** tolerance

No mystery field #7 (was only a GST % idea; GST locked at 18%).

**Create validation:** Incomplete drafts **not allowed** — only a fully valid contract can be saved.

**After create — edits allowed:** Contract fields **can be edited** later. BOQ may change after GAD revisions (order/contract value updates accordingly). Billing terms may also change later (e.g. a new term arrives and reshapes the split).

On save (if BOQ within tolerance): create system tasks (kickoff, ABG/PBG/GAD follow-ups, etc.) — **unassigned**.

### When are ABG / PBG asked? (draft — awaiting owner)

| Moment | What is asked |
|--------|----------------|
| **At project entry** | **ABG:** only if Advance term exists → Yes/No; if Yes → **value** only. **PBG:** always asked Yes/No; if Yes → **value** only. Number, issue date, expiry stay **blank**. Tasks created to chase creation. |
| **Later (when BG is actually made)** | User enters **BG number, issue date, expiry, issuing bank, amount confirmation**. Reminders from **2 months** before expiry with **weekly task bump** until extended or not required. Extension = **new expiry + extension reference/date**. Retrieval = mark **retrieved** with **date**. |
| **Edge** | If Advance billed before ABG details exist → keep open task until ABG submitted or marked not required. |
| **How system knows “created”** | Only via **user entry** of BG details (number, date, expiry) — not from bank/client. Empty details = not created; filled = created + task complete + expiry tracking. |
| **Prompting** | System must **prompt the user** to enter pending ABG/PBG data (not leave it silent). Open task + active prompt until filled or marked not required. |
| **Tasks on contract create** | Always: **Kick off meeting**; **Finalise Drawings/GAD** (no fixed system subtask list for now — users **add subtasks** as needed). If ABG mentioned → **Finalise ABG**. If PBG mentioned → **Finalise PBG**. **Create schedules** is created when **GAD/Drawings is marked complete**. |
| **Contract edits → tasks** | If a need disappears (e.g. Advance/ABG removed) → hub **automatically closes** related system tasks. If a need appears (e.g. PBG added later) → hub **auto-creates** the related task. |

### Task behaviour (owner-confirmed)

| Rule | Detail |
|------|--------|
| Subtasks | Any task can add **subtasks** under it |
| Assignment | Whole task **or** a subtask can be assigned to an **individual** or an entire **department** |
| Who creates tasks | **Users** (and above) can **create** tasks |
| Who assigns | **Manager and above** only (Master / Director / Manager). Users cannot assign. |
| Assign to | A **department**, a **person**, or **multiple persons** |
| Org shape | Each **department** has an assigned **Manager**; **Users** sit under that Manager |
| Completion state | **User** marks done → **pending verification** (approver = that user’s Manager; if dept-only assign → that dept’s Manager). **Manager** marks done → **completed immediately** (no verification). **Director** does not approve. **Master** can do anything. Pending-verification tasks appear in a **separate box on the homepage**. |
| Subtasks | No fixed default subtask catalog for now — give option to **add subtasks** on any task |
| Highlight queue | Hub highlights **unassigned** tasks and tasks **missing an end date / deadline** |
| Deadline | **Required** on every task/subtask. May be **extended** later; hub **records the delay** and the **reason for delay** |
| Notes | Option to add **notes / remarks** until marked completed |
| Priority | Task **priority level** is a selectable / **editable** field; tasks can be **filtered by priority**; also highlight / priority mode when escalated |
| Self-aware contract | Hub reacts to contract contents — e.g. Advance/GAD → invoice create/submit tasks **only when allowed** |
| Task catalog | List all system tasks + prerequisites later; owner adds/subtracts. **Flow first for now.** |
| After GAD/Drawings complete | System **always** creates task: **Create schedules** (even if drawings subtasks were skipped/never added) |
| Subtask vs main completion | Completing a **main task does not require** subtasks complete. Subtasks are a **roadmap** only — can be skipped or not added. |
| Kick off complete | Requires **notes** + **meeting date** (by completer) |
| GAD / Drawings complete | Store **drawing submission date** + **approval date** (by completer) |
| BOQ edits | May be edited **freely** after create; **every edit is recorded** and shown in **amendment history** (reports) |
| Formal amendments | Also support WO **v2/v3** style records: **amendment date**, **new order value**, BOQ add/remove/qty change |

---

**Roleplay:** User filled form and clicked Create contract — stated expectations after save (awaiting owner).

### After “Create contract” — user expectations (draft)

1. Contract is saved (only if BOQ total matched order value; otherwise block with error).  
2. Land on the new contract’s page (or clear confirmation + link to it).  
3. System tasks created, unassigned: **Kick off meeting**; **Finalise GAD / drawings** always; **Finalise ABG** / **Finalise PBG** if mentioned.  
4. Prompts/pending indicators for blank ABG/PBG details if those BGs are required.  
5. Contract appears in contracts list; homepage counts update (active contracts, pending tasks).  
6. On each task: add subtasks; assign task/subtask to person or department; set deadline; notes/remarks until complete; highlight / **priority mode** for escalation.

---

**Roleplay:** First project entered — user asked what Flowhub is designed to do now.

**Assistant answer (draft):** Drive the contract forward via tasks/schedules; prompt pending data (ABG/PBG); track execution & warn approaching dates; record ops/billing/payments/retention/DLP as work happens; surface problems; answer reports — until closure.

**Owner — flow after create (reset / refined 2026-09-30):**

1. Contract created → system creates tasks (kickoff, drawings/GAD always, Finalise ABG/PBG if mentioned, etc.).
2. Hub **highlights** all **unassigned** tasks and all tasks **without an end date / deadline**.
3. **Master / Director / Manager** assign those tasks to **individuals** and set a **tentative deadline**.
4. Work completes in order: **Kick off** then **GAD** (incl. subtasks).
5. When kickoff + GAD are done → Hub **prompts** to create schedules **and** creates a task **Create schedules**.
6. User builds schedule per BOQ item (supply start/end, installation start/end, testing date, handover date) → calendar + near-date highlight + auto delay adjust (as above).
7. Hub is **self-aware per contract**: e.g. if billing terms include **Advance** or **GAD**, it creates tasks to **create and submit invoices** against those terms **only when billing is allowed** (prerequisites met). Full task catalog + prerequisites = **detail later**; owner will add/subtract from a proposed list then.

### Schedule fields — owner-confirmed

**Per BOQ item:** supply start/end, installation start/end — **qty may be split** across multiple schedule lines for the same item (e.g. item A qty 100 → supply 50 on date 1, supply 50 on date 2). Sum of scheduled supply qtys should align with BOQ qty (tolerance rules TBD if needed).

**Per contract (one each):** testing date, handover date (also shown on each item row in reports)

### Schedule commitment (owner-confirmed)

| Rule | Detail |
|------|--------|
| On save / finalise | Hub asks: is this schedule **committed to the client**? **Yes / No** |
| Distinction | Every schedule line is **Committed** or **Uncommitted** |
| Reports | Always present **Committed** + **Uncommitted** + **Total** together (schedule table, master list, monthly qty) |

### Natural-language query (owner interest)

| Idea | Detail |
|------|--------|
| Ask the hub | User types a question like an AI chat, e.g. “How much of item X do I supply in City Y in the next 2 months?” |
| Answer source | Hub data (schedules, BOQ, contracts, filters already defined) |
| Scope | Cross-contract / city / item / date window — same facts as reports, conversational |
| Recommendation | **Park for later** — adds AI/LLM complexity, cost, and risk of wrong answers on money/qty. V1 is stronger with **structured reports + filters** (already cover the same questions reliably). |
| Timing | **Parked for later** — owner agreed 2026-10-08 |

Hub tracks these schedules and warns as execution dates approach.

### Calendar (owner-confirmed)

| Rule | Detail |
|------|--------|
| Where schedules live | Item schedule dates are marked on **Flowhub’s calendar** |
| Near-date behaviour | Calendar (and related views) **highlight** as any schedule date **gets near** |
| Scope | Applies to supply / installation / testing / handover (and related scheduled work) |

### Schedule planning (owner-confirmed — major pillar)

| Rule | Detail |
|------|--------|
| Purpose | Hub **pushes** for target dates to be met; schedule planning is a **core** part of Flowhub |
| Near-date warning | Highlight / warn from **30 days before** any schedule date |
| Baseline vs current | Keep **original baseline** for records/reports; hub day-to-day tracks **current** schedule only |
| Manual override | **Must** allow override of **any** date; **reason not required**; record **history of changes** |
| Testing / handover | **One testing date** and **one handover date** per **contract** (not per item) |
| Auto delay | See cascade below (owner-confirmed) |
| Reports | Delays vs **baseline** available in reports |

### Schedule cascade (owner-confirmed)

| Layer | Rule |
|-------|------|
| Per item | Each BOQ item has its own **supply** + **installation** dates |
| Item → next item | Items are sequenced: if an **earlier item slips**, the **next item slips automatically** by the same delay (e.g. item 1 slip → item 2 shifts) |
| Install → contract dates | Contract **testing** and **handover** follow the **last installation end**. When that moves by **N days**, testing + handover move by **N days** |
| Supply → install (same item) | If an item’s **supply end** slips by N, shift that item’s **install start/end** by N (keep duration) unless overridden |
| Override | Any date can be manually overridden; changes logged in history (no reason required) |

### Contract expenses (owner-confirmed)

| Rule | Detail |
|------|--------|
| Placement | **Separate section**; expense is **only linked to the contract** (no BOQ item / dispatch link) |
| Scope | All kinds of execution expenses — small or large; includes subcontractors |
| Excludes | Make cost / raw material (Director costing) |
| Fields | **Amount, date, person paid, reason, category** — **department not required**; no linked BOQ item |
| Category | **Both**: type new or pick from dropdown; hub **remembers new categories** for later selection |
| Who adds | **User**, **Director**, Manager, Master can **add** |
| Who edits | **Manager and above** only (User **cannot** edit); **edit history tracked** |
| Who deletes | **Manager** (and above implied); delete **kept in history** |

---

**Owner:** Invoice tasks only when **allowed**. Full task list + prerequisites later. **Stay on flow** for now.

**Owner — invoices in the flow:** PI → TI and all invoice rules already discussed. **Entry anytime — not dependent on any requisite.** Usual real-world order: Advance or GAD first, then Supply, then the rest.

### High-level contract flow (so far)

1. Create contract → system tasks  
2. Highlight unassigned / no-deadline → M/D/Mgr assign + deadlines  
3. Complete Kick off → complete GAD (+ subtasks)  
4. Prompt + task: Create schedules → build item schedule → calendar / delays  
5. **Invoice entry (PI/TI…) can happen anytime** — **no requisite** blocks adding invoice details. Usual business order is still Advance or GAD first, then Supply, then the rest — but the hub does not lock entry behind prerequisites.  
   *(Separate from earlier rule: system **tasks** that push “create/submit invoice” appear only when billing is allowed.)*  
6. **Payments** can be entered **anytime as soon as invoice data exists** for that invoice.  
7. **Supply:** user enters **qty supplied** with **DC details** (no qty-ready / ready-for-dispatch steps).  
8. **Successive chain:** Supply to site (via DC entry) → Assign subcontractor → Install → … → **tested** → **ready for handover**.  
9. **Close-out:** task to upload **final invoice** + **final payment** → when all invoices/payments in, hub **reconciles** → asks **confirmation** before mark complete (flag anomalies) → track **DLP** → task to **collect retention**.  
10. Ongoing: hub is **recorder + task manager** — capture every detail entered; track tasks/dates; inform of coming events (schedules, deadlines, BG expiry, etc.)

---

**Owner:** Asked what reports the hub should provide — assistant proposed catalog (awaiting add/subtract).

**Owner:** Add **reconciliation report** (all invoices + all payments → true outstanding). Reports available for **1 contract** or **all contracts**.

**Owner:** Reports filterable by city, contract, or **any unique option** available.

### Reports scope & filters (owner-confirmed)

| Rule | Detail |
|------|--------|
| Scope options | **Every report**: **one contract** (detailed) **or** **all contracts** (summary) |
| Contract-wise detail | Full detail — e.g. money reports show **all invoice details** and **all payments separately** |
| All-contracts view | **Summary** of that same report across contracts |
| Filters | Any unique metric (city, contract, assignee, department, **priority**, etc.) |
| Reconciliation | Invoices + payments → true outstanding (detail or summary by scope) |
| Export | Every report → **PDF** or **Excel** |
| Schedule report | Contract schedules exportable as **table-format report** |
| Director profitability | **Director + Master** only; **per contract** and **all-contracts summary** |
| Format review | Owner reviews/edits each layout in `REPORTS.md` before freeze |
| PI vs TI in reports | **PI only** in PI-related reports (Open PIs, leftover billing where relevant). **All other money reports/calculations use TI only.** |

### Exportable reports catalog (owner reviewing — PDF + Excel each)

**Money**
1. Leftover billing  
2. Outstanding (expected − paid)  
3. Overdue payments  
4. Payments due in next N days  
5. Open PIs  
6. Billing / collection by contract, city, state  
7. Retention held vs due for release  
7b. **Retention due now** (DLP already passed) — contracts + retention amount due  
8. Contract expenses (no “entered by” on this report)  
8b. **Master new-entries audit** — who entered what (Master only)  
9. Work order value vs billed vs paid vs **amount left for billing** (= WO − billed; not leftover)  
10. **Reconciliation** — all invoices + all payments → true outstanding  

**Bank guarantees**
11. **Pending BGs** — contract + ABG/PBG values; filter ABG / PBG / both (no “required?” field)  
12. **Finalised BGs** — entered BG data list; filter ABG / PBG / both  
13. BG expiry upcoming (2-month window)  
14. BGs to retrieve (ABG ≥80% billed / PBG at handover)  
14a. BG value/expiry **change history** (optional with finalised)  

**Schedule & delay**
15. **Schedule table report** — per item includes testing + handover dates (same on each row); all-contracts summary  
15b. **Master schedule list** — all items/contracts together ordered by date, **with quantity**  
15c. **Supply-by-month qty** — item-wise qty against supply month  
16. Schedule vs actual / delay (vs baseline)  
16b. **Delayed items short report** — filter Supply / Install / both  
17. Near-term schedule (30-day window)  
18. Work order expiry / extension needed — **auto Yes** if schedule dates go beyond WO expiry  
18a. Schedule change history  

**Tasks**
19. Unassigned tasks  
20. Tasks missing deadline  
21. **Overdue Tasks** (+ priority / escalated)  
22. Pending verification  
23. Pending by department or person  
24. Task deadline extension / delay reasons history  

**Operations**
25. Supply / DC status  
26. **Qty left to supply** / **qty left to install**  
27. Installation progress (weekly history)  
28. Testing / handover readiness  
29. Amendment history (BOQ / WO v2–v3)  

**Portfolio / management**
30. Active vs complete contracts  
31. Overdue Tasks rollup (global)  
32. **Director profitability** (Master + Director only) — per contract detail **and** all-contracts summary; billed net − expenses − item costs − retention; invoiced & paid beside  

All of the above: **contract detail** or **all-contracts summary**; any metric filter (incl. **task priority**); export **PDF** or **Excel**.

---

**Owner:** Jump back to **flow**. Detailed report layout/dive later.

**Owner:** Payments anytime once invoice data is entered. Supply revised: enter **qty supplied** with DC only (no qty ready / ready for dispatch).

### Supply / dispatch (owner-confirmed — revised)

| Rule | Detail |
|------|--------|
| Simplified entry | **No** separate “qty ready” or “ready for dispatch” steps |
| What user enters | **Qty supplied** together with **DC details** in one supply/dispatch entry |
| Dispatch fields | DC no., DC date, logistics partner, tracking no., ETA, items + **qty supplied**; **site arrival date** when received at site; signed DC; MAR; MIR |
| DC uniqueness | **Unique DC per contract**; one DC can include **multiple BOQ items** |
| MAR / MIR statuses | **pending / submitted / approved** only |
| Invoice entry | **No blocks** — PI/TI entry stays free anytime |
| Who | **Users and above** |
| Partial supply | Yes — one item’s qty can ship across **multiple DCs** |
| Qty left to supply | BOQ qty − sum of **qty supplied** on DCs |

### Successive task chain — supply → handover (owner-confirmed)

| Order | Task / status |
|-------|----------------|
| 1 | **Supply items to site** (via entering qty supplied + DC details) |
| 2 | When supply complete → **Assign subcontractor to site** |
| 3 | Then → **Install those items** |
| 4 | Chain continues until **all items installed** |
| 5 | Then → marked as **tested** |
| 6 | Then → marked **ready for handover** |

Pattern: each completed step **emerges** the next — a successive chain, not all at once up front.

### Documents tracked in the flow (owner — reaffirmed)

| Stage | What hub tracks |
|-------|------------------|
| Supply recording | **Delivery challan (DC)** + **DC date** (and related supply fields from earlier: logistics, tracking, ETA, site arrival, signed DC) |
| Supply billing docs | **MAR**, **MIR** (pending / submitted / approved) — checklist style |
| Installation | **ITR** (Installation & Testing Report) — same style as MAR/MIR |
| Testing | **TPI** (checkbox) + **free-hand entry** for any other supporting docs; checkbox-style for supporting docs |
| Handover | Checkbox checklist for supporting docs; **full document name list provided later** by owner |
| First bill / contract start | Policies e.g. CAR, WC, PBG (from earlier) — once per contract where applicable |

Full master document list per stage still **pending** from owner (reminder open).

### Close-out / complete (owner-confirmed)

| Step | Detail |
|------|--------|
| After ready for handover | Hub creates task(s) to upload **final invoice** and **final payment** for the contract |
| When all invoices & payments entered | Hub runs a **reconcile** |
| Mark complete | **Master only**. May complete **with a note** even if anomalies exist (extra supplied, billed ≠ order value, etc.) |
| DLP | From **actual handover date**; whole months 6–60 |
| Retention collect task | Created **45 days before DLP end date** |
| Retention collection entry | User enters **date** + **amount** against retention outstanding; option to **close all payments** for the contract — even if amounts don’t match, can close **with a note** |
| BG retrieval | **ABG:** checklist when **≥ 80%** billed. **PBG:** checklist on **handover**. |

---

**Owner:** Asked for a rough end-to-end example of how the system functions from the laid-out flow.

**Assistant:** Delivered sample contract walkthrough (Metro Depot–style) covering create → tasks → GAD → schedule → invoices/payments → supply chain → docs → close-out → ABG/PBG retrieve → DLP/retention.

**Owner:** Flow looks good for now; asked if changes can be made later after building.

**Assistant:** Yes — flow and product can evolve after build; treat current flow as v1 blueprint, not frozen forever.

### Process note

| Decision | Detail |
|----------|--------|
| Current flow | Accepted as a **good working blueprint** for now |
| Later changes | **Yes** — rules, tasks, screens, and reports can be changed after we build; expect iteration |
| How | Update `IDEATION.md` / decisions when something changes, then adjust the software |

---

**Owner:** Deepen **each piece**. Keep asking until confident of the full picture — **only then** tech plan.

### Deepen mode

| Rule | Detail |
|------|--------|
| Mode | Piece-by-piece deep dive |
| Questions | Ask until picture is complete. **Batch several questions when they are about the same thing**; still one piece at a time. |
| Tech plan | **Blocked** until owner + assistant agree picture is complete |
| Build / go-live | Still paused |

### Deepen agenda (order)

1. Login & clearances (Master / Director / Manager / User)  
2. Contract create form (every field, validation)  
3. System tasks at create + assignment queue  
4. Kickoff & GAD / drawings  
5. Schedules & calendar & auto-delay  
6. Invoices (PI/TI) & payments & retention on pay  
7. Expenses  
8. Supply readiness → dispatch → docs (DC/MAR/MIR)  
9. Subcontractor → installation → ITR  
10. Testing (TPI) → handover docs → ready for handover  
11. Close-out reconcile → complete → DLP → retention collect  
12. ABG/PBG lifecycle & retrieval  
13. Problem page / notifications  
14. Reports (detail later was ok — still fill gaps)  
15. Anything missing  

**Current piece:** 15 — Gap sweep (owner asked for full ideation summary; tech plan next when they approve)  

**Owner — pieces 1–14 done**; gap sweep largely locked.

**Owner:** Asked to list all create-form slots once (for review). Confirmed list good enough; no #7 — GST % option dropped, GST fixed **18%**.

**Owner (later):** Asked again what fields are decided for contracts entry. Assistant restated the locked 15-slot list.

**Owner:** Retention = **fixed %** for the contract, **0 to 10** (inclusive); same on every payment.

**Owner:** DLP entered in **months**.

**Owner:** May ask **multiple questions in one go** if they are about the same thing.

**Owner:** DLP = whole months only; **minimum 6**, **maximum 60**; cannot be 0.

**Owner:** Billing terms — warn if ≠ 100% but still allow; custom terms = free name + %.

**Owner:** BOQ vs order value — small tolerance OK; project no. must be unique; client/customer name belongs on the form.

**Owner:** Tolerance **5%**; payment due days **3–45**; contract fields **editable** after create (BOQ/value after GAD; billing terms can change); **no incomplete drafts**. Piece 2 closed.

**Owner (piece 3):** Users create tasks; assign = Manager+. Assign to dept / person / multiple persons. Completion → **pending verification** + homepage box.

**Owner:** Q5 = auto-close and auto-create related system tasks on contract edit. Q1 = at create Finalise Drawings; when GAD complete → **Create schedules**. Subtasks: don’t lock list now — user can add. Verification: dept has a Manager + users under them; approving Manager = **that user’s manager**; **Master can do anything**.

**Owner:** Deadline **must be present**; can be **extended**; hub records **delay** and **reason for delay**.

**Owner:** Director = view + assign only (no approve). Dept-only task → that dept’s Manager verifies. Manager-marked complete → **no verification**, accepted complete. Piece 3 closed.

**Owner (piece 4):** Director can also **create** tasks. Kickoff complete → **notes**. GAD complete → store **approval date**. BOQ editable freely; each edit in **amendment history** (reports). GAD complete always → **Create schedules**; subtasks optional; main task completion **not** dependent on subtasks.

**Owner:** Completer enters dates. GAD: **drawing submission date** + **approval date**. Kickoff: **meeting date** as well. Piece 4 closed.

**Owner (piece 5):** Warn **30 days** before. Dynamic per-item delays; testing/handover depend on install; last install delay shifts testing+handover by same days. Keep **baseline** for records; hub tracks **current**. Manual override **must** for any date. Asked for suggestion on cascade detail.

**Owner:** Cascade OK + earlier item slip auto-shifts next item. Override: no reason, record history. Testing/handover = **one per contract**. Piece 5 closed.

**Owner (piece 6):** Invoice flow = select contract → no. + date → items → GST → optional **extra terms after GST** (e.g. labour cess) → hub sums final. Lines can use **multiple** billing terms. Retention on payment = **auto** from contract % of that invoice’s **net**. **Multiple partial payments** per TI. After PI→TI, PI is **deleted**.

**Owner:** Extra post-GST = free name+amount. Payment = user enters all fields + add extras. Expected pay = final − invoice retention − invoice TDS; outstanding = expected − paid (or full expected if unpaid). **PI can receive payments** too.

**Owner:** Invoice retention & TDS = **suggested then editable** (supports multiple payments on same invoice). Piece 6 closed.

**Owner (piece 7):** Expense fields = amount, date, person paid, reason, **category** (no department, no BOQ link). Category = free + dropdown (hub remembers new). **User adds**; **Manager edits** with **edit history**. Expense **contract-only**.

**Owner:** User cannot edit. Manager+ edit. Only Manager deletes (history kept). Director can add. Piece 7 closed.

**Owner (piece 8):** Dispatch also needs **site arrival date**. Unique DC per contract; multi BOQ items OK. MAR/MIR = pending/submitted/approved only. **PI anytime**; **TI only** when signed DC + MAR approved + MIR approved.

**Owner:** Reversal — **don’t block** invoice entry. Dispatch/docs = Users+. Partial multi-DC per item = yes. Piece 8 closed.

**Owner (piece 9):** Subcontractor = **name**, **total finalised rate**, **amount**. Install qty = **weekly** entries; can reduce/correct with **log**. ITR = pending/submitted/approved. Installation **per item**. Didn’t get 2nd half of Q4 (parallel subcontractors) — rephrase.

**Owner:** **One contractor per contract** only; can be **replaced** mid-way. Replace keeps history with end date. Users+ enter weekly qty + ITR. Piece 9 closed.

**Owner (piece 10):** Supporting docs for TPI and handover = **checkbox** style. Testing docs = **TPI** + free-hand others. Handover **document list later**.

**Owner:** Actual testing date yes. Actual handover date yes (≠ schedule); **DLP + retention period start from actual handover**. Users+. Piece 10 closed.

**Owner (piece 11):** Mark complete = **Master only**; can complete **with note** despite anomalies. Retention task = **45 days before** DLP end. Collect: date + amount vs retention outstanding; option to **close all payments** with note even if amounts don’t match. Piece 11 closed.

**Owner (piece 12):** Finalise BG includes **amount confirmation**. Expiry = weekly task bump from 2 months before. Extension = new expiry **and** reference/date. Retrieval = **retrieved + date**. Piece 12 closed.

**Owner (piece 13):** Global problem view; filter by contract, city, tasks, assigned users/departments — **any metric**. In-hub (+ by category). **Everyone** can see it. Items stay until resolved; if deadline moved forward, item leaves past-due. Wants a **professional term** instead of “past due.”

**Owner:** Name = **Overdue Tasks**. Piece 13 closed.

**Owner (piece 14):** Asked what catalog item is. Costs = **per contract per item**; UI list with name/rate/qty/selling amount; Director enters raw material, overheads, transport, making charges + free-hand others. Profit view: **billed net − whole contract expenses − these costs**; also **paid to date**, **retention pending**, **amount at the moment**. Handover docs **later** (checkbox list). Asked if Advance was already discussed.

**Owner:** Profit subtracts **retention** (shown as subtracted) then final profit; **invoiced** + **paid** shown beside. Costs on **BOQ items** not catalog. v1 = **full draft report list**. Piece 14 closed (doc lists later).

### Piece 14 — locked so far (Director costs)

| Rule | Locked |
|------|--------|
| Grain | **Per contract, per BOQ item** (not a global catalog cost sheet) |
| Display | Item name, rate, qty, selling amount |
| Cost fields | Raw material, overheads, transport, making charges + **free-hand add** |
| Who | **Director + Master only** — hidden from Managers/Users |
| Hub section | Separate **Director/Master-only section** to **view and enter** unshareable item costs (raw material, overheads, transport, making, free-hand others) per contract BOQ item |
| Report math | **Profit = billed net − contract expenses − item costs − retention** (retention shown subtracted). **Invoiced** and **paid** shown beside. |
| Extra report | After costs entered → **item cost sheet** report (15b), same restricted access |
| Grain note | **BOQ items on the contract**, not catalog master |

### Advance — what we already locked vs still open

| Locked already | Still open / later |
|----------------|-------------------|
| Advance as billing term % | Full **document checklist** names for Advance (owner to provide like handover) |
| If Advance exists → ask ABG yes/no + value | Exact first-bill policy doc names beyond CAR / WC / PBG already noted |
| Finalise ABG task + details + expiry/retrieve | |
| Invoice tasks when billing allowed; invoice entry free anytime | |

### Piece 14 — locked (reports)

| Rule | Locked |
|------|--------|
| v1 reports | Keep **full draft catalog** (reconciliation, leftover, outstanding, Overdue Tasks, BG, schedule delay, Director profit, etc.) |
| Doc lists | Handover = checkbox + option to **add sub-documents**; named lists can refine later |

**Piece 14 status:** Closed.

### Piece 15 — gap sweep locks

| Topic | Locked |
|-------|--------|
| Handover docs | Checkbox for now; users can **add sub-documents** under it |
| TDS | **Suggested 2%**, editable |
| Departments | Contracts, Accounts, Drawings, Installation, Directors, **Collection** |
| Amendments | Free BOQ edit **with history** **and** formal WO v2/v3 fields (amendment date, new order value, etc.) |
| Summary | Delivered to owner on request |

### Piece 13 — locked

| Rule | Locked |
|------|--------|
| Name | **Overdue Tasks** (professional term for the past-due / problem surface) |
| Scope | **Global** view |
| Filters | Contract, city, task, assignee user/dept — **any available metric** |
| Access | **Everyone** |
| Lifecycle | Stays until resolved; extending deadline forward removes it from Overdue Tasks |
| Channel | In-hub (categorised); email not required for v1 unless owner adds later |

### Task notifications (owner-confirmed)

| Event | Who is notified |
|-------|-----------------|
| **Task created** | That user’s **Manager** + **Master** |
| **Task assigned to a user** | The **assigned user** |
| **Task assigned to a department** | **All users and managers** in that department |

**Piece 13 status:** Closed (Overdue Tasks + notifications expanded).

### Piece 12 — locked

| Rule | Locked |
|------|--------|
| Finalise fields | Number, issue date, expiry, issuing bank, **amount confirmation** |
| Expiry reminder | From **2 months** before; **weekly task bump** |
| Extension | **New expiry** + **extension reference/date** |
| Retrieval | Mark **retrieved** with **date** |

**Piece 12 status:** Closed.

### Piece 11 — locked

| Rule | Locked |
|------|--------|
| Who marks complete | **Master only** |
| Anomalies | Allow complete **with a note** |
| Retention task | **45 days before** DLP end |
| Retention pay entry | Date + amount; may **close all payments** with note if mismatch |

**Piece 11 status:** Closed.

### Piece 10 — locked

| Rule | Locked |
|------|--------|
| Doc UI | Checkbox options for TPI / handover supporting docs |
| Testing docs | **TPI** + **free-hand** other docs |
| Handover doc names | **Provide later** |
| Testing complete | Enter **actual testing date** |
| Handover complete | Enter **actual handover date** (separate from schedule) |
| DLP / retention clock | Starts from **actual handover date** |
| Who | **Users and above** |

**Piece 10 status:** Closed.

### Piece 9 — locked so far

| Rule | Locked |
|------|--------|
| Subcontractor fields | **Name**, **total finalised rate**, **amount** |
| Subcontractor scope | **One contractor per contract**; can be **replaced mid-contract** |
| Replace | Keep old contractor in **history** with end date; start new one |
| Install qty | **Weekly** entries; may be reduced/corrected; changes **logged** |
| ITR | pending / submitted / approved |
| Scope | Installation tracked **per item** |
| Who enters | **Users and above** for weekly qty + ITR |

**Piece 9 status:** Closed.

### Piece 8 — locked

| Rule | Locked |
|------|--------|
| Arrival | **Site arrival date** when material received |
| DC | Unique per contract; multiple BOQ items allowed; **partial DCs** OK |
| MAR/MIR | pending / submitted / approved only |
| Invoice entry | **No hard blocks** — free anytime |
| Who | Users and above for dispatch + MAR/MIR |

**Piece 8 status:** Closed.  
*(Earlier TI-gate idea dropped — owner: don’t block invoice entry.)*

### Piece 7 — locked

| Rule | Locked |
|------|--------|
| Link | Contract only |
| Fields | Amount, date, person paid, reason, category |
| Category | New or dropdown; hub keeps growing list |
| Add | User, Director, Manager, Master |
| Edit | Manager and above only; history tracked |
| Delete | Manager (and above); delete kept in history |

**Piece 7 status:** Closed.

### Piece 6 — locked

| Rule | Locked |
|------|--------|
| Entry order | Select **contract** → invoice no. → date → **items** → **GST** → optional **extra post-GST terms** (**free name + amount**, e.g. labour cess) → hub **sums** final |
| Lines / terms | **Multiple** billing terms allowed |
| Payment entry | User **enters each field**; hub provides standard fields + option to **add extra fields** |
| Payments | **Multiple partial payments**; allowed against **PI or TI** |
| PI → TI | After conversion, PI is **deleted** |
| Expected payment (per invoice) | **Final invoice amount − retention amount for that invoice − TDS amount for that invoice** |
| Outstanding | **Expected payment − paid amount**; if no payment yet → outstanding = **full expected** |
| Invoice retention & TDS | **Suggested** then **user-editable**. Retention from contract %. **TDS suggested at 2%** (editable). |

**Piece 6 status:** Closed.

### Piece 5 — locked

| Rule | Locked |
|------|--------|
| Warning lead | **30 days** before |
| Baseline | Keep original; hub tracks **current** |
| Manual override | Any date; **no reason** required; **change history** recorded |
| Testing / handover | **One each per contract** |
| Cascade | Earlier item slip → next item auto-slips; last install → testing + handover by same N days |

**Piece 5 status:** Closed.

### Piece 4 — locked so far

| Rule | Locked |
|------|--------|
| Kick off complete | Needs **notes** + **meeting date** (entered by whoever completes the task) |
| GAD complete | Store **drawing submission date** + **approval date** (entered by whoever completes the task); always creates **Create schedules** |
| Subtasks | Roadmap only; skippable; do **not** block main-task completion |
| BOQ after GAD | Free edit; every change recorded → **amendment history** in reports |
| Director | Can **create** + assign tasks; no approve |
| Who enters dates | The person **completing** the task |

**Piece 4 status:** Closed.

### Piece 3 — locked so far

| Rule | Locked |
|------|--------|
| Subtasks at create | **No** fixed default subtask list; users **add subtasks** as needed |
| Org | Each department has an assigned **Manager**; Users sit under them |
| Who verifies (person-assigned) | Approving Manager = **that user’s Manager** |
| Who verifies (dept-only) | **Manager of that department** |
| Manager marks complete | **No verification step** — accepted as completed immediately |
| Director | **Does not approve** — only **view** and **assign** |
| Master | **Can do anything** (including approve any pending verification) |
| Deadline | **Required**; may be **extended**; hub records **delay + reason for delay** |

**Piece 3 status:** Closed.

### Piece 2 — remaining questions (batched)

**DLP** — locked: whole months only; **min 6, max 60**; cannot be 0.

**Billing terms** — locked: custom terms = **free name + %**; if total ≠ 100% → **warn but still allow** save.

**BOQ / identity** — locked: tolerance **±5%**; **project no. unique**; **client/customer name** on form.

**Other create rules** — locked: payment due days **3–45**; fields **editable** after create (BOQ/value after GAD; billing terms can change later); **no incomplete drafts**.

**Piece 2 status:** Closed.

---

### Ideation readiness (over-prepared bar)

| Status | Piece |
|--------|--------|
| **Done** | 1–14 |
| **Almost done** | 15 — Gap sweep (summary delivered; await owner OK for tech plan) |
| **Flow sketched, not field-level** | 3–13 (tasks, GAD, schedule, invoices, expenses, supply→handover, close-out, BG, problem page) |
| **Draft only** | 14 — Reports catalog (filters locked; layout/calc detail later-ish but must lock formulas before build) |
| **Must collect before build** | Document master list; Director cost fields; full system-task + prerequisite list |

**Verdict for “over prepared”:** Roughly **~15–20%** of deepen agenda is truly locked at decision depth. The end-to-end **story** is strong (~70% narrative), but build-ready ideation needs every piece at **field + rule + edge-case** depth. Pieces 1–2 closed; finish piece 3 (3 open questions), then systematically deepen 4→15 (including parked lists). Tech plan only after that gap sweep.

---

## Next step

**Owner (piece 15):** Handover = checkbox + add sub-docs. TDS suggested **2%** editable. Add **Collection** department. Amendments = free edit history **and** formal v2/v3 fields. Asked for **full ideation summary**.

**Owner:** Asked how/when ABG/PBG details are entered; whether hub tracks qty left to supply/install in reports; Task management must be its **own separate section**.

**Owner:** Entering BG details on Finalise task completion **auto-fills / shows** those details on the **contract info page**.

**Owner:** ABG/PBG **value** and **expiry** editable later; hub tracks **datetime + change history**.

**Owner:** Remove **qty ready** and **ready for dispatch**; only enter **qty supplied** with **DC details**.

**Owner:** Discuss all exportable reports; every report exportable as **PDF** or **Excel**.

**Owner:** Reports = contract **detail** or all-contracts **summary**. Task **priority** selectable/editable/filterable. Profitability for Director+Master: per contract + all-contracts summary. Schedule report in **table format**. Owner wants to **see and change each report format** before final.

**Owner (Reconciliation #1):** No PI in reports except PI-specific ones; **TI only** for main calculations. Outstanding **last** after all subtractions; retention already on invoice detail; summary: retention earlier; **final 2 columns** = expected payment + true outstanding.

**Owner:** All-contracts summary: WO value, billed, paid, **amount left for billing = WO − billed** (simple). **Leftover billing** is separate: summary = contracts + leftover totals; detail = per contract against what each leftover is pending on.

### Report format review process

| Step | Detail |
|------|--------|
| Method | Draft each report layout (columns / sections) in `REPORTS.md` for owner edit |
| Modes | Show **detail (1 contract)** and **summary (all contracts)** where both apply |
| Freeze | Formats not final until owner signs off each |

**Owner:** Every report = **contract-wise detail** (e.g. money: all invoices + payments separate) **or** **all-contracts summary**. Task **priority** selectable/editable/filterable. Profitability for **Director + Master**: each contract **and** all-contracts summary.

### ABG / PBG entry — how & when (restated)

| When | What |
|------|------|
| **Contract create** | ABG yes/no (+ value if yes, only if Advance exists). PBG yes/no (+ value if yes). Number/date/expiry **blank**. System creates **Finalise ABG** / **Finalise PBG** tasks. Hub **prompts** for pending details. |
| **When BG is actually created** | Completing Finalise ABG/PBG: enter **BG number, issue date, expiry, issuing bank, amount confirmation**. That closes the Finalise task, starts expiry tracking (remind from 2 months before; weekly bump), and those details **automatically appear on the contract info page**. |
| **Later** | Extend (new expiry + reference/date) or mark not required; retrieve with date (ABG at ≥80% billed; PBG at handover). |
| **Edits after entry** | **ABG/PBG value** and **expiry date** can be **edited later**; hub records **date/time** and full **change history**. |

### Quantity remaining (owner — confirm locked)

| Rule | Detail |
|------|--------|
| Track | Hub tracks **qty left to supply** and **qty left to install** per BOQ item |
| Basis | Supply left = BOQ qty − supplied/dispatched qty; Install left = BOQ qty − installed qty (rules as logged) |
| Reports | Show in reports (and likely on contract/item views) |

### Navigation / sections (owner)

| Section | Note |
|---------|------|
| **Tasks** | Task management is a **separate section** of its own (not only embedded on contracts) — list, assign, Overdue Tasks, pending verification, etc. |

## Ideation summary (snapshot)

See assistant reply in chat for the full narrative summary of Flowhub as locked through piece 15.

---

## Next step

Confirm qty-remaining + Tasks section; then owner OK → **tech plan**. **No new live features** until explicitly requested.
