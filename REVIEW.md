# Nexus — Product & Build Review

**Product:** Nexus — a product of Cradle Runways (I) Pvt. Ltd.  
**Repo:** (was Flowhub working name)  
**Review date:** 2026-09-29  
**Audience:** Owner (internal fabrication contract hub)

---

## 1. What this software is

Nexus is an **internal tracking hub** for Cradle Runways contracts (work orders). It does **not** generate official invoices or client portals. Staff **enter** what happened; the system creates **tasks**, tracks contract data, and (later) answers money/progress questions.

**Core loop (intended)**  
Enter contract → system creates tasks → Master/Director **assigns** tasks to departments/people → fill operational & commercial details over the life of the job → reports & problem views.

---

## 2. What is built today (Slice A+)

Runnable at `http://127.0.0.1:4311` (local browser storage).

| Area | Status | Notes |
|------|--------|--------|
| Homepage | Done | Brand, stats (contracts/tasks live; payment stats placeholders) |
| Left navigation | Done | Live: Home, Contracts, Tasks. Stubbed: Billing, Payments, Users, Settings, Reports |
| New contract | Done | Project name/no., order no(s), order date, **order end date**, value, GST 18%, city/state/country, billing terms (+ custom), payment due days, ABG/PBG required + value, BOQ with reusable catalog; BOQ must match order value |
| Contract detail | Done | Summary, terms, BOQ, **ABG/PBG detail entry** (no./date/expiry), **expenses**, linked tasks |
| Tasks | Done | System tasks created **unassigned**; assign dept/person; nested subtasks; complete/reopen |
| Auto tasks on create | Done | Kickoff; Create ABG / Create PBG when required; BG task auto-completes when details filled |
| Expenses | Done | Per contract: amount, date, person paid, reason |
| Data persistence | Temporary | Browser `localStorage` only — not multi-user/server yet |

---

## 3. Product decisions locked in ideation (not all built)

### Roles & org
- Login classes: **Master** (full), **Director** (reports + cost entry later; no normal ops edits), **User** (entry)
- Roles known only to Master  
- Departments: Contracts, Accounts, Drawings, Installation, Directors  

### Money language
- **Leftover billing** = progress toward a term but not yet billed (e.g. supplied qty × term% × rate)  
- **Outstanding** = billed, unpaid  
- Invoices **entered**, not generated; PI → TI (edit or one-click with TI no. + date); PI list only while unconverted  
- Payments: against invoice; net, GST, retention, TDS, other deductions  

### Operations (vision)
- Supply/dispatch questionnaire (DC, logistics, tracking, ETA, site arrival, signed DC, MAR/MIR)  
- Install: supplied qty → start → daily/weekly installed qty + graphs; ITR like MAR/MIR  
- Testing: schedule → verify docs (e.g. TPI) → complete  
- Handover: after T&C; checklist; final bill → project complete  
- Schedule per item: supply / install / handover start–end  
- Production: qty ready → ready for dispatch; hindrances → tasks  
- Amendments: date, new value, BOQ changes; warnings if production/billed  
- BG reminders from 2 months before expiry; retrieve after handover close  

### Explicitly deferred by owner
- [ ] Full document list Advance → Handover  
- [ ] Director cost / profitability fields  
- [ ] Contract create “field #7” (was blank in original list)  

---

## 4. Gaps vs vision (priority order)

### High — next build slices
1. **Billing** — enter PI/TI (contract, BOQ items, terms/mix, billed qty, net + GST)  
2. **Payments** — link to TI; net/GST/retention/TDS/deductions  
3. **Home payment stats** — wire “payment due” / “due in 7 days” once payments exist  
4. **User management** — people under departments; assignment from real user list  

### Medium
5. Supply/dispatch entry + MAR/MIR statuses  
6. Client schedule on items + delay/problem signals  
7. Production ready-for-dispatch + hindrance tasks  
8. Install qty logging + ITR  
9. Testing schedule/complete; handover checklist  
10. Amendment (WO v2/v3) entry + value history  
11. BG expiry reminders  

### Later / platform
12. Real backend + auth (replace localStorage)  
13. Notifications to assignees  
14. Reports (leftover, outstanding, city-wise, pending BG)  
15. Director profitability module  

---

## 5. Risks & constraints

| Risk | Impact | Mitigation |
|------|--------|------------|
| localStorage only | Data per browser; no shared team use | Move to DB + auth before production |
| Large ideation surface | Easy to rebuild forever | Ship vertical slices (Billing next) |
| Doc lists / Director costs pending | Billing gates incomplete | Owner to provide lists before those modules |
| Token/budget on long chats | Limits deep features per run | One slice per agent request |

---

## 6. Recommended next step

**Slice B — Billing + Payments**  
Enter invoices and payments so homepage money widgets and leftover/outstanding become real. Keep using the same assign-tasks pattern.

After that: supply/dispatch **or** schedule + problem flags, depending on what operations need first.

---

## 7. How to run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4311  

Details: `README.md` · Living ideation notes: `IDEATION.md`
