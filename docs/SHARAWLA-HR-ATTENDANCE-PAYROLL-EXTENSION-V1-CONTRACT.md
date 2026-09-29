# Sharawla HR Attendance & Payroll Extension V1 Contract

Status: SOURCE IMPLEMENTATION CANDIDATE
Starting branch: `rc1-beta58-32-performance-hotfix`
Starting HEAD: `825a56839d21d32884b94aa428401a74d4468633`

## 1. Safety boundary

This extension is source-only. It does not deploy SQL or Edge Functions, mutate a
Supabase project, touch Production devices, or change Point 4, Canonical Stock,
POS licensing, activation, device fingerprinting, updating, or printing.

All schema changes are additive. Existing HR identities and financial history
remain authoritative:

- `hr_employees` remains the person record.
- `hr_employee_compensation` remains the compensation source.
- `hr_employee_advances` remains the advance source.
- `hr_employee_adjustments` remains the payroll adjustment source.
- `hr_payroll_periods` and `hr_payroll_items` remain the payroll header/items.
- `treasury_movements` remains the cash movement source.

No V1 attendance operation updates or deletes historical attendance evidence.

## 2. Identity and authorization

`hr_staff_accounts.employee_id` is unique and references `hr_employees.id`.
Creating a Staff account never creates an HR employee or POS user. An employee
that already has `hr_employees.login_employee_id` keeps that same person record.

POS/Admin authorization continues to use:

1. `permission_actions_v2`
2. `has_action_permission_v2`
3. `has_branch_access`
4. backend enforcement
5. `audit_logs`

Staff authentication is separate from Supabase/POS authentication:

- login identity is employee code or mobile;
- PIN is exactly six digits and stored only as a bcrypt hash (`crypt`);
- first login requires a PIN change;
- the server returns an opaque session token and stores only its SHA-256 digest;
- disabling an account, resetting a PIN, or "logout all" revokes sessions;
- every request is self-scoped to the Staff account's `hr_employee`;
- a Staff session grants no POS/Admin action permission.

Staff device IDs are random PWA-local IDs. They are not POS fingerprints and do
not participate in licensing or Canonical Fingerprint logic.

## 3. API boundary

The standalone PWA talks to `hr-staff-api`, an Edge Function source included in
this change. The Edge Function owns these public HTTP operations:

- login and first-PIN change;
- self profile, schedule, attendance history, and attendance summary;
- device registration/heartbeat;
- deterministic selfie upload;
- idempotent check-in/check-out submission;
- staff logout.

The Edge Function uses service-role credentials only on the server. The browser
uses a publishable key and the opaque Staff session. Selfie objects are private.
PostgreSQL stores a bucket/path reference and metadata, never image bytes.

## 4. Immutable attendance evidence

`hr_attendance_events` is append-only. A database trigger rejects UPDATE and
DELETE. Each row stores device capture time, server receipt time, GPS, computed
distance, selfie reference, device, offline flag, verification result, app
version, clock metadata, canonical payload digest, and `client_tx_id`.

Idempotency is account-scoped:

- same account + same `client_tx_id` + same canonical payload digest returns the
  original event;
- same identity with a different digest fails closed;
- selfie upload uses the same rule and a deterministic private storage path.

Administrative corrections are append-only rows in
`hr_attendance_adjustments`, with before/after JSON, reason, actor, timestamp,
branch, approval state, and audit log. Recalculation consumes approved
adjustments while preserving the original event.

## 5. Verification and privacy

The server calculates Haversine distance from the active branch geofence.
Outside-radius and poor-accuracy behavior comes from `hr_settings` and is either
`rejected` or `pending_review`. Valid events become `verified`; replayed offline
events become `verified_after_sync` only after server validation.

Location is requested only while attempting check-in/check-out. V1 has no
continuous tracking, face recognition, or liveness. The live camera stream is
captured to a canvas; the attendance flow contains no gallery/file picker.
Selfie retention is configured by `selfie_retention_days` and can later be
enforced by a scheduled server job without changing evidence rows.

## 6. Offline contract

The PWA persists event envelopes and selfie blobs in IndexedDB before declaring
local success. Queue states are `pending`, `syncing`, `acked`, and `failed`.
Replay runs on:

- `online`;
- application open/reopen;
- `visibilitychange` to foreground;
- `pageshow` and window focus;
- a foreground retry timer.

Replay uploads the selfie first, submits the event second, records the server
ACK, then removes the local blob. ACK loss is safe because both operations are
idempotent. Background Sync is an optional accelerator, not a correctness
dependency. Until ACK, UI text is exactly: **تم تسجيل الحركة محليًا - في انتظار
المزامنة**.

## 7. Schedule and daily-summary rules

Schedules define work days, start/end local times, timezone, grace, break,
overtime, early-leave policy, overnight behavior, and effective dates.
Assignments are employee-specific and date-effective; overlapping active
assignments for one employee are rejected.
In V1, an approved work schedule means the latest active, date-effective
schedule assignment saved through the permission-gated HR schedule workflow.

Daily summary is deterministic and recalculable from:

- the date-effective schedule/assignment;
- verified immutable events;
- approved leave/permission records;
- approved attendance adjustments.

For `10:00` start, 10-minute grace, and `10:17` check-in, late minutes are 7.
Overnight end is on the following date. Missing check-out produces an incomplete
summary. Approved leave suppresses absence. Summary state is draft until an HR
manager approves it; Payroll consumes approved summaries only.

## 8. Rules, recurring deductions, and payroll

Rule evaluation never changes salary directly. It creates an idempotent
`hr_employee_adjustments` row with `source_identity`, source event/summary,
rule, date, reason, and detail. A unique source identity prevents duplicates.

Recurring definitions generate one adjustment per scheduled period key. Paused,
completed, out-of-range, or exhausted definitions do not generate entries.

`hr_payroll_run_attendance_v1` extends the existing payroll data model:

- monthly basis uses the existing base salary. Attendance Summary never changes
  the monthly base salary directly; attendance affects monthly Payroll only
  through approved payroll adjustments/rules under this contract;
- daily basis uses approved worked days multiplied by the daily rate;
- hourly basis uses approved worked minutes divided by 60 multiplied by the
  hourly rate;
- before daily/hourly Payroll is created, every scheduled work day in the
  period must have an approved/finalized Attendance Summary. Missing, draft,
  pending-review, or rejected required days fail closed;
- a non-scheduled day is not a required attendance day. A scheduled shift fully
  covered by an approved `leave`, `sick_leave`, or `unpaid_leave` request is
  also excluded from required attendance coverage;
- approved overtime/bonus/deduction adjustments and existing advances remain
  the financial sources;
- `hr_payroll_item_lines` records every payslip component and reason;
- legacy aggregate columns remain populated for compatibility;
- Payroll never reads GPS or selfies.

## 9. POS integration boundary

Attendance is not a cash shift. A read-only status RPC may answer whether an
employee is present at a branch for future cash-shift policy/manager override,
but it does not open, close, or mutate a financial shift.

## 10. Deployment order (future, not performed here)

1. Review and approve this contract and SQL source.
2. Apply the additive SQL to an isolated Beta database only.
3. Configure the private selfie bucket and Edge Function secrets.
4. Deploy `hr-staff-api` to Beta only.
5. Host the standalone `/staff/` PWA over HTTPS.
6. Run database/API/browser acceptance on isolated Beta test identities.
7. Produce a separate rollout decision; Production remains out of scope.
