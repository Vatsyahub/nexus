# Nexus — Tech Plan (v1)

**Product:** Nexus — a product of Cradle Runways (I) Pvt. Ltd.  
**Credit:** Developed by Rahul Vatsyayan (footer)  
**Sources of truth:** `IDEATION.md` (rules) · `REPORTS.md` (report formats) · this plan (how we build)  
**Status:** Tech plan ready → **build in slices** (not go-live until owner says so)  
**Prototype:** Current Next.js + `localStorage` app is a **throwaway shell** for UX/nav — production data will not live in the browser.

---

## 1. What we are building

Internal hub where Cradle **records** every contract detail and **drives** work via tasks/schedules until close-out, and **answers** with structured reports (PDF + Excel).

| Is | Is not |
|----|--------|
| Staff-only web app | Client portal |
| Recorder + task manager + schedules | Invoice PDF generator |
| Clearance-gated (email + password) | Public signup |

**Brand (homepage):** **Nexus** (contrasting color) → *Where every contract breathes.* → a product of Cradle Runways (I) Pvt. Ltd. · CTAs · no extra sentence.

---

## 2. Stack (locked for build)

| Layer | Choice | Why |
|-------|--------|-----|
| App | **Next.js 15** (App Router) + TypeScript + Tailwind + shadcn/ui | Already scaffolded; good fit for forms + auth |
| Hosting (later) | Vercel or equivalent Node host | Matches Next.js |
| Database | **PostgreSQL** | Multi-user, audit, relations (contracts → BOQ → schedules → invoices → payments) |
| ORM | **Prisma** | Clear schema from ideation entities; migrations |
| Auth | **Auth.js (NextAuth v5)** Credentials provider | Email + password; session → clearance |
| Passwords | **bcrypt** (or argon2) hashed at rest | Standard |
| Files (docs later) | Object storage optional in v1; start with metadata + upload stub | Don’t block on S3 day one |
| PDF reports | **@react-pdf/renderer** or server PDF lib | Match REPORTS.md layouts |
| Excel reports | **ExcelJS** | Detail + summary sheets |
| Validation | **Zod** | Shared client/server schemas |

No second UI library. No NL/AI in v1.

---

## 3. Auth & clearance

| Rule | Implementation |
|------|----------------|
| Sign-in | Email + password form → Auth.js session |
| Clearance on user row | `USER` \| `MANAGER` \| `DIRECTOR` \| `MASTER` — set **only at create** by Master (editable later by Master only) |
| Create users | **User management** — Master only |
| Initial password | Master sets temporary password at create → user must **change password** on first login (or via Settings anytime) |
| Change own password | Settings — any signed-in user (current + new + confirm) |
| Master reset | User management — Master can set a new temporary password |
| Nav gating | Server + client: hide routes/nav per clearance (see below) |
| API gating | Every mutation checks session clearance; never trust client alone |

### Nav visibility

| Item | Who |
|------|-----|
| Home, Contracts, Billing, Payments, Tasks, Schedules, Expenses, Reports, Settings | Everyone |
| User management | Master |
| Nexus Core | Master + Director |

Unauthenticated → redirect to `/login`.

---

## 4. Data model (core entities)

High-level tables (names indicative):

| Area | Entities |
|------|----------|
| Org | `User` (email, passwordHash, clearance, departmentId?, managerId?), `Department` |
| Contract | `Contract` (client, projectNo unique, city, WO fields, GST, retention %, DLP months, payment terms, ABG/PBG flags + values/expiry, status, …) |
| BOQ | `CatalogItem`, `BoqLine` (contractId, item, qty, rate, …) |
| Tasks | `Task` (system/manual, contractId?, assignees, dept, dueDate, status, pendingVerification, …), `TaskHistory` |
| Schedules | `ScheduleLine` (contractId, boqLineId?, type supply/install/…, qty, dates, committed, baselineDates), `ScheduleChange` |
| Money | `Invoice` (PI/TI), `Payment`, `Expense` |
| BG | ABG/PBG fields on contract + `BgHistory` |
| Ops | Dispatch/DC, install weekly qty, ITR, testing/handover actuals, close-out |
| Nexus Core | `NexusCoreCost` — mode `PER_ITEM` \| `WHOLE_CONTRACT`; amount(s); contractId |
| Audit | `who` + `when` on create/update where Master needs trail (expenses, schedule edits, BG value changes) |

Exact columns follow IDEATION field lists when each slice is built. Money formulas stay as locked (TI-driven; leftover ≠ WO−billed amount-left; retention on pay; etc.).

---

## 5. Reports

| Rule | Detail |
|------|--------|
| Formats | Frozen in `REPORTS.md` — do not invent new columns without owner |
| Export | **PDF** and **Excel** |
| Scope | One contract = detail; all contracts = summary |
| Entry points | Global **Reports** nav + **Schedules** page for schedule family (§10–11) |
| Reconciliation | Report #1 under Reports |
| Nexus Core profit | Restricted to Master + Director |

---

## 6. Build slices (order)

Each slice: schema + API + UI + clearance checks; commit runnable; no “big bang”.

| Slice | Deliverable |
|-------|-------------|
| **S0 — Foundation** | Postgres + Prisma; Auth.js login/logout; User model; Master seed user; session middleware; replace localStorage gate |
| **S1 — Users** | User management (Master): create user, email, clearance, temp password; Settings: change own password |
| **S2 — Shell & home** | Production nav (gated); homepage brand lock; footer credit; below-fold metrics from real data |
| **S3 — Contracts + BOQ** | Create/list/detail; catalog; ±5% order value; system tasks on create |
| **S4 — Tasks** | Assign, due dates, verify, Overdue Tasks, homepage pending-verification box |
| **S5 — Schedules** | Create-schedules after GAD; next-items page; filter; add/edit; cascade; 30-day warn; schedule reports entry |
| **S6 — Billing + Payments** | PI/TI; payments; retention/TDS; homepage money widgets |
| **S7 — Expenses** | Contract expenses for everyone; Master audit fields |
| **S8 — Supply / install / docs** | DC, weekly qty, ITR, testing/handover actuals, DLP start |
| **S9 — ABG/PBG + close-out** | Lifecycle, history, Master close-out |
| **S10 — Reports pack** | Reconciliation first, then leftover/outstanding/BG/schedule/Overdue Tasks per REPORTS.md |
| **S11 — Nexus Core** | Per-item or whole-contract cost → profitability calc; restricted nav |
| **S12 — Polish** | Notifications in-hub; empty/loading/error states; Master data checks |

Parked (not these slices): NL query, Excel bulk import, email notify, full named doc master lists.

---

## 7. Prototype → production

| Keep | Replace |
|------|---------|
| Next.js routes / shadcn patterns / visual direction | `localStorage` store (`flowhub-v3`) |
| Ideation + REPORTS as specs | Soft “soon” stubs → real pages slice by slice |

Migrate nothing from browser storage — treat as demo data only.

---

## 8. Environments & secrets

| Item | Notes |
|------|-------|
| `.env` | `DATABASE_URL`, `AUTH_SECRET`, seed Master email/password (local only) |
| Local | `npm run dev` on uncommon port (e.g. **4311**) |
| No secrets in git | `.env.example` committed with empty placeholders |

---

## 9. Quality bar before go-live

- [ ] Login + clearance gates verified for all four roles  
- [ ] Core contract path: create → tasks → schedules → bill → pay → close  
- [ ] Reconciliation + key money reports match REPORTS.md on a sample WO  
- [ ] Nexus Core hidden from Manager/User  
- [ ] User management hidden from non-Master  
- [ ] Owner walkthrough sign-off  

**Go-live only when owner says so.**

---

## 10. Immediate next action

| Slice | Status |
|-------|--------|
| **S0 — Foundation** | **Done** — Postgres + Prisma User, Auth.js email/password, `/login`, forced change-password, nav gated by session clearance, seed Master |
| **S1 — Users** | **Done** — Master User management: create user, set clearance, temp password, reset password |
| **S2 — Shell & home** | **Next** — production nav polish; homepage metrics from real data when contracts land |

Owner may adjust slice order; rules in IDEATION / REPORTS stay authoritative over this plan if they conflict (update the plan when that happens).
