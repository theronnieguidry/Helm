# PRD-051: Availability Reminders & Push Notifications

## Story Status
`Implemented`

## Problem

Scheduling is the thing the group has always struggled with, and nobody wants
to own the chasing. The app must own it: **at least a week out from each
session, determine whether everyone has their availability in. If not, the
member whose answer is missing gets a push notification asking them to answer,
and the rest of the group gets a notification saying whose availability we're
awaiting.**

The original build directive (§5 "Game-Day Notification" + "Availability
Reminder", §11 "Notifications") specified this in 2025; PRD-010, 010A, 010B,
and 011 each deferred it; the landing page advertised it anyway. The full gap
analysis is `docs/SCHEDULING_NOTIFICATIONS_AUDIT.md` (findings S1–S15); this
PRD covers its five-stage build.

## Functional Requirements

### FR-1 · Explicit availability responses (audit S1)
- A `user_availability` row is a **response**: an available time window
  (team-timezone HH:MM) or an explicit `unavailable` ("I can't make it").
- Absence of a row is the only thing that means "hasn't responded".
- One response per member per calendar day, enforced by a unique index;
  dates are normalized to UTC midnight of the calendar day.
- The availability panel offers Regular time / Custom range / **I can't make
  it**; the team list shows a "Can't Make It" bucket distinct from
  "No Response"; manual one-off sessions use the same model (the legacy
  session-keyed tri-state table has no remaining writers).

### FR-2 · The reminder ladder (audit S3/S4)
- An hourly server sweep (plus boot-time catch-up) evaluates every upcoming
  occurrence within 8 days, per team, on the **team's clock**.
- **T-7**: every non-respondent (DM included) receives a push + in-app nudge
  ("Are you in for Thursday, Jan 15? … Tap to answer" → deep-links to
  /schedule); every respondent receives **one aggregated digest** ("Still
  waiting on Alice and Bob for Thursday's session") — never one notification
  per laggard.
- **T-3 and T-1**: the ladder repeats for whoever still hasn't answered. A
  session created inside the window starts at the tightest applicable stage.
- Scheduled sends hold until 10:00 team-local; at most one nudge per member
  per occurrence per stage.

### FR-3 · Event-driven notices
- The moment the **last** response arrives: "Everyone's in — Thursday 7:00 PM
  is confirmed (4 available)" to the whole team (no quiet-hour hold).
- When enough explicit "can't make it" answers make the threshold
  mathematically unreachable: the DM is warned immediately.
- DM cancel → team notified; DM reschedule → team notified and the reminder
  ladder re-opens for the moved occurrence.
- Game day at 12:00 team-local, when the session clears the threshold:
  "Game is on today at 7:00 PM" (build directive §5).

### FR-4 · Delivery (audit S2)
- **Web Push** (VAPID) to every device the member enabled; dead endpoints
  are pruned automatically. Configured via `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` env vars.
- **In-app notification center** (bell + unread badge in the header) receives
  everything regardless of push permission; the dashboard shows a "You
  haven't answered for Saturday" banner when the member's own response is
  missing within 14 days.
- **PWA shell** (manifest, icons, service worker) so iPhones can install
  Helm and receive push (iOS 16.4+ requires Home-Screen install).
- Permission is only ever requested from a user gesture: the settings toggle,
  or a toast offered right after saving availability.
- Per-member, per-team preferences: availability reminders / group updates /
  game-day confirmations (all default on).

### FR-5 · Idempotency & operations
- Every send passes through a unique `dedupeKey` ledger (the `notifications`
  table), so the hourly sweep, boot catch-up after downtime, event triggers,
  and any external re-run can overlap without double-sending.
- `POST /api/jobs/reminder-sweep` (header `x-cron-token` =
  `REMINDER_CRON_TOKEN`) lets an external cron drive the sweep on hosts whose
  process sleeps; the route 404s when the token is unset.
  `DISABLE_REMINDER_ENGINE=1` disables the in-process timer.

## Acceptance Criteria (Global)
- [x] A member who hasn't responded a week out gets a push reminder
- [x] The rest of the group is told whose availability is awaited (aggregated)
- [x] Members can answer "I can't make it" and are never nagged after answering
- [x] Escalation at T-3/T-1; confirmation the moment everyone is in
- [x] Game-day noon confirmation; DM warned when the session is mathematically dead
- [x] All sends idempotent, timezone-correct, quiet-hours-safe, opt-out-able
- [x] Zero-permission in-app path works end to end

## Implementation Notes

- **Stages/commits**: (1) timezone-correct recurrence + shared attendance math
  + route unification + authz fixes; (2) response semantics; (3) push + PWA +
  in-app feed; (4) the engine; (5) convergence polish + this PRD.
- **Files (core)**: `shared/recurrence.ts`, `shared/scheduling.ts`,
  `server/scheduling-handlers.ts`, `server/notifications.ts`,
  `server/notification-handlers.ts`, `server/jobs/reminder-engine.ts`,
  `client/src/lib/push.ts`, `client/public/sw.js` + `manifest.webmanifest`,
  `client/src/components/{availability-panel,team-availability-list,notification-bell,notification-settings-card}.tsx`,
  `client/src/pages/{schedule,dashboard,settings}.tsx`.
- **Schema** (applies on next `npm run db:push`): `user_availability.status` +
  nullable times + unique `(teamId,userId,date)`; new `push_subscriptions` and
  `notifications` tables; three notification-pref booleans on `team_members`.
- **Key decisions**:
  - Availability windows are defined as **team-timezone** wall-clock times and
    labeled with the team zone everywhere.
  - Occurrence keys are team-calendar dates independent of host timezone;
    ladder dedupe keys include the occurrence's effective start instant, so a
    reschedule re-opens reminders.
  - The group digest sends once per responder per stage — not on every
    laggard-set change — to keep a slow week from becoming spam; the
    event-driven confirmation covers the "set finally emptied" moment.
  - The DM is a required responder (tracked/nudged) but stays excluded from
    the threshold count per PRD-010A.
- **PRD amendments shipped here**: PRD-010B's member visibility (below-
  threshold sessions now show "At risk — N more needed" instead of vanishing)
  and its dev/prod DM fork (removed; DM behavior is identical in both);
  PRD-009's regular-time default end is unchanged (start + 4h).
- **Deferred** (from the audit's edge matrix): per-occurrence DM "excuse this
  member" exemptions (edge case 4) — a member can mark themselves unavailable,
  which covers the practical need; new-member 24h digest grace (edge case 2);
  email as a second channel (the `notifications` schema accommodates it).
- **Test coverage**: `server/jobs/reminder-engine.test.ts` (16 tests, injected
  clock — full ladder, digests, quiet hours, idempotency, event triggers,
  cancel/reschedule), `server/notifications.test.ts` (delivery core),
  `server/notifications.api.test.ts`, `server/availability-response.api.test.ts`,
  `server/scheduling-authz.api.test.ts`, `shared/scheduling.test.ts`, rewritten
  host-TZ-independent `shared/recurrence.test.ts`, and client tests for the
  availability panel.
