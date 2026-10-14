# Nexus

**Nexus** is an internal contract tracking hub — a product of **Cradle Runways (I) Pvt. Ltd.**

Contracts, tasks, invoices, payments, and the BOQ catalog persist in Postgres (shared workspace), so they survive new tunnel URLs — not only browser `localStorage`. Users live in Postgres.

## Run locally

1. Copy `.env.example` → `.env` and set `DATABASE_URL`, `AUTH_SECRET`, seed Master credentials.
2. Start Postgres, then:

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Sign in with the seeded Master email/password (you will be asked to change password on first login).

New people start on **Edit** for every door. User management stays **Block** except Master. Nexus Core stays **Block** except Director and Master. Master can change those ticks on Edit user.

Settings stays because it is the password screen. First login, and a Master recovery sign-in, are sent to Change password before the rest of the hub opens.

If Master forgets the password, set `MASTER_RECOVERY_CODE` in `.env` (at least 8 characters) and type that code in the password field. Nexus then asks for a new password. The code is not shown on the login screen. Other people still use Forgot password, which tells them to contact the administrator.

### Beta 3

This snapshot is the hub as saved on 14 Oct 2026: the handover date fix, contracts C-001 through C-011, and the four user accounts. `npm run db:restore-beta3` replaces the workspace and those accounts.

```bash
npm install
cp .env.example .env
npm run db:setup
npm run db:restore-beta3
npm run dev
```

Sign in with the same Master account as before. Set `DATABASE_URL` and `AUTH_SECRET` in `.env` first.

### Demo / test data

Load a full sample workspace (contracts, tasks, invoices, payments, schedules, users of every clearance):

```bash
npm run db:seed-demo
```

Then hard-refresh the browser (workspace hydrates from Postgres). Demo users share password `NexusDemo1!` except `user.new@cradle.local` / `TempPass12!` (must change password). Master stays as in `.env`.

If you are on a Cloud Agent and the browser says connection refused: open **Forwarded Ports** (plug icon) and forward **3000**, then open from that menu.

## What’s working now

- Home dashboard (active contracts, payment due / due in 7 days, tasks)
- Login: show/hide password; forgot password is an on-screen note to contact the administrator
- **User management (Master only):** search, create, edit, delete; optional department for Master on paper (full Master access remains)
- Contracts list / create / detail (closure date, ABG/PBG %, expenses)
- BOQ table (item, unit, rate, qty, amount). Save is allowed if BOQ ≠ order value after a warning
- TDS defaults to 2% of invoice net (editable). Extra charges are not reduced by retention or TDS
- Tasks: catalog + custom create; chip filters (All first); list with project, deadline, dept, people, priority, overdue, subtasks, last update; dept assign by anyone, people by Manager+; subtask checklist with complete / not-required
- **In-app notifications:** bell in the nav; each user sees jobs assigned to them by name, or to their department when no people are set; click opens the data-entry page for that job (ABG/PBG → contract guarantees, schedules → planner, other jobs → expanded Tasks row); mark read / mark all read. **Unread stay until opened**; once read they last **24 hours**, then are permanently deleted (no archive / history)
- Auto tasks: kickoff + ABG/PBG on contract create; after kickoff complete → ask if GAD required; after GAD complete → Create schedules + optional BOQ amendment; BG expiry chase 2 months before expiry; Collect retention 30 days before DLP end (from handover schedule)
- **Billing:** PI/TI table with date, total, expected payment, due date; **Past due** for tax invoices only
- **Payments:** contract first; link to TI, PI, or unlinked. Unlinked cash applies to later tax invoices. Outstanding and extra payment shown as-is (retention and TDS are not due as cash)
- **Schedules:** Add/plan by contract (type-to-search by contract no. or name) → progressive supply/install qty splits (installation locked until that item has a supply date); testing + handover once per contract; handover after closure warns, then marks closure red on Contracts; closure also red when today is past it with no handover; complete only when every BOQ item is fully scheduled; **View** tab → Item / supply start–end / installation start–end; Edit for Contracts + Master; Delete for Master only; All / Near / Overdue / View / Change log
- **Restart Schedules:** Tell the agent “restart schedules” (no Reset button in the UI)
- **Expenses:** Contract-linked costs (amount, date, person paid, reason, category). Everyone can add; Manager+ edit/delete with history. Category dropdown remembers new values. Separate from Nexus Core.
- **Nav clearance:** Expenses = everyone; User management = Master only; **Nexus Core** = Master + Director only

Dates are shown throughout the hub as **dd-mmm-yyyy** (e.g. `12-Oct-2026`). Storage and date inputs still use ISO `YYYY-MM-DD`.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
