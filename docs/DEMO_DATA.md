# Demo data coverage

Loaded with `npm run db:seed-demo`. Hard-refresh the browser afterward.

## Users

| Email | Clearance | Department | Notes |
| --- | --- | --- | --- |
| `master@cradle.local` | MASTER | Contracts (on paper) | From `.env`; password unchanged on re-seed |
| `director@cradle.local` | DIRECTOR | — | |
| `director.paper@cradle.local` | DIRECTOR | Contracts (on paper) | |
| `manager.contracts@cradle.local` | MANAGER | Contracts | |
| `manager.accounts@cradle.local` | MANAGER | Accounts | |
| `user.drawings@cradle.local` | USER | Drawings | |
| `user.install@cradle.local` | USER | Installation | |
| `user.quality@cradle.local` | USER | Quality (custom) | |
| `user.new@cradle.local` | USER | Contracts | Must change password (`TempPass12!`) |

Demo password for the others: `NexusDemo1!`

Custom departments in workspace: Quality Department, Logistics Department.

## Contracts (`C-DEMO-001` … `006`)

| Project no. | Covers |
| --- | --- |
| C-DEMO-001 | GST on; advance+ABG+PBG filled; retention 5%; TDS 2%; expenses; guarantee edit history; contractor assigned |
| C-DEMO-002 | GST off; custom billing term; ABG off; PBG required but blank; retention/TDS 0; no contractor |
| C-DEMO-003 | Past-due billing candidate; short payment days; retention+TDS |
| C-DEMO-004 | Status **complete**; historical ABG/PBG |
| C-DEMO-005 | High retention 10% / TDS 5% / DLP 60; multi-item BOQ for schedule splits; PBG blank |
| C-DEMO-006 | Minimal (due days 3, DLP 6, no BGs) |

## Tasks

System + manual; pending / in_progress / completed; priority + notes; assigned to department and/or person; unassigned; overdue; no-deadline; subtask under GAD; contract-less manual task.

## Invoices

Open PI; PI with extra charges; TI converted from PI; past-due unpaid TI; fully paid TI; partially paid TI (with extras); fresh TI not yet due; no-GST TI; TI on completed contract.

## Payments

TI-linked full settle (cash + retention + TDS); TI partial with other deductions; PI-linked; **unlinked** (auto-applies); no-GST settle; closed-contract settle.

## Schedules

Supply near (30-day highlight) + far; installation qty split (two lines); past supply; testing + handover (one each); committed and uncommitted.
