# Scheduling + Push Notification Audit

**Owner's requirement**: *"At least a week out from the session, determine if everyone has
their availability in. If not: push-notify the person who hasn't responded, and push-notify
the rest of the group that we're awaiting that person's availability."* Plus: think through
everything else so nothing obvious is missed.

**Date**: 2026-09-02, on `claude/note-taking-completion-49gfvg` at `45a6be8`.

> **UPDATE (2026-09-03): all five stages of §4.5 are implemented** on this
> branch — see `docs/prd/PRD-051-availability-reminders-and-push-notifications.md`
> for the shipped spec, decisions, and deviations. Findings S1–S14 are closed
> (S10's day-hover shows response state rather than session classification by
> design; PRD tracker drift S15 fixed). Deferred, documented in PRD-051:
> per-occurrence DM exemptions, new-member digest grace, email channel.
**Method**: three fresh auditors (server scheduling surface, client scheduling surface,
PRD/directive intent) + direct schema and dependency reads in the main session. Every claim
below carries a file:line anchor. Findings are numbered `S#`.

---

## 1. Verdict

**The reminder feature cannot be built on today's foundation — three whole layers are
missing, and a fourth (timezones) is broken in ways that would make "a week out" fire on
the wrong day.** The scheduling core (recurrence → computed candidates → availability →
threshold) genuinely works for the solo browse case, and it already computes exactly the
thing the reminder needs — the "No Response" member list. But:

1. **Nobody can say "I'm not available"** — so "everyone has their availability in" is
   currently *undefined* in the data model (S1).
2. **There is no delivery channel** — no push, no email, no PWA, no notification center;
   the landing page advertises reminders that do not exist (S2).
3. **There is no scheduler** — nothing runs on a clock except in-process cache cleanup (S3).
4. **The server can't determine who hasn't responded** — eligibility/threshold logic lives
   only in the client (S4), and candidate generation is timezone-broken server-side (S5).

The original build directive *did* specify this feature (§5 "Game-Day Notification" +
"Availability Reminder", §11 "Notifications" — `attached_assets/Pasted--Gaming-...txt:164-171,242-250`),
and four consecutive PRDs (010, 010A, 010B, 011) each explicitly deferred it. No PRD ever
picked it up. This audit is the spec for finally doing so (§4).

## 2. What exists today (the foundation)

- **Recurrence lives on `teams`** (`shared/schema.ts:102-109`): frequency, dayOfWeek,
  daysOfMonth, startTime, timezone, anchor date, `minAttendanceThreshold` (default 2),
  `defaultSessionDurationMinutes` (default 180).
- **Future sessions are computed, not stored**: `generateSessionCandidates()`
  (`shared/recurrence.ts:143`) produces candidates with stable `occurrenceKey`s
  (`"2026-01-24"`); DM cancel/reschedule persists per-occurrence in `session_overrides`
  (`shared/schema.ts:301-309`). Served by GET `/session-candidates` (`server/routes.ts:3057`).
- **Availability = positive time windows**: `user_availability` rows (teamId, userId,
  date, startTime HH:MM, endTime HH:MM) (`shared/schema.ts:274-283`), entered by clicking
  a calendar day (`client/src/pages/schedule.tsx:599-724`,
  `client/src/components/availability-panel.tsx`).
- **Eligibility** (client-only): Full/Partial/None classification
  (`shared/recurrence.ts:28-57`), eligible = full + partial, DM excluded, compared to the
  threshold (`schedule.tsx:338-371,494-517`).
- **Who-responded display already exists**: `team-availability-list.tsx` groups members
  into Available / Partial / **No Response** — the exact audience a reminder targets
  (PRD-011 built the data, then explicitly declined to notify: PRD-011:42).
- **A legacy second model**: session-keyed `availability` with statuses
  available/maybe/busy, only reachable through manually-created sessions
  (`shared/schema.ts:248-257`, `schedule.tsx:892-977`).

## 3. Findings

### 3.1 Blocking for the owner's requirement (the missing layers)

**S1 · "Availability is in" is not representable.** `user_availability` has no status
column and no negative response — a member who is busy that night has *no way to say so*
except not creating a row, which renders identically to never having opened the app
(`shared/schema.ts:274-283`; the entry panel offers only "regular time" or "custom range",
no "can't make it" — `availability-panel.tsx:106-132`; the UI collapses both cases to
"No Response" — `schedule.tsx:397-405,418`). **Consequence for the reminder**: the app
would nag people who already answered "no" forever, and the group notice would name them
as non-responders. This must be fixed *before* any notification work — otherwise the
feature ships wrong on day one.

**S2 · No delivery channel exists.** Repo-wide: no `web-push`, VAPID keys, service worker,
manifest, notification table, email library, or FCM/APNs integration (verified in
`package.json` and by sweep). `client/public/` holds only a favicon; `client/index.html`
has no manifest link; `main.tsx` registers nothing. Meanwhile the landing page *sells*
this: "Coordinate times and send reminders" (`client/src/pages/landing.tsx:17`, also `:69`)
— a live marketing promise with no implementation behind it. Note the iOS reality: web
push on iPhone requires the app installed to the Home Screen as a PWA (iOS 16.4+), so PWA
installability is not optional polish — it is the delivery prerequisite for the group's
phones.

**S3 · No scheduler exists.** The only timers are in-process cache cleanups
(`server/routes.ts:107,130,155`); `server/jobs/enrichment-worker.ts` is invoked inline,
not scheduled; `server/index.ts` starts Express and nothing else. A T-7 check needs a
clock-driven job that (a) survives restarts, (b) catches up if a tick was missed (a
sleeping/autoscaled host will miss ticks — if the deployment is not an always-on VM, the
job must be either externally triggered or catch-up-on-wake), and (c) is idempotent so a
double-fire never double-notifies.

**S4 · The server cannot compute "who hasn't responded."** `minAttendanceThreshold`
appears in zero server code paths; the candidate route ships raw candidates and the
client does all eligibility math (`server/routes.ts:3078-3088` vs
`schedule.tsx:338-371,494-517`). The reminder engine is a server-side consumer of exactly
this logic, so the eligibility/respondent computation must move into `shared/` (some of it
— `classifyAvailability` — already lives there) and be exercised by the server.

**S5 · Timezone handling would make "a week out" fire on the wrong day.** The
authoritative frame today is *accidental*:
- `team.timezone` is stored but **never read by any computation** — candidates are
  generated with `setHours` in the *deploy host's* timezone (`shared/recurrence.ts:81-86`),
  and the client falls back to a silent hardcoded `"America/New_York"`
  (`schedule.tsx:153`, `availability-panel.tsx:59`).
- `occurrenceKey` is derived from host-local dates (`recurrence.ts:71`), so a host TZ
  change silently detaches every existing `session_overrides` row.
- Availability dates are saved as local-midnight ISO (`schedule.tsx:249`) and matched with
  local `isSameDay` — a user west of UTC saves onto the *next* UTC day; the server's
  duplicate check uses yet another (server-local) day boundary (`server/storage.ts:585-588`).
- HH:MM strings are timezone-naive and compared against browser-local session times
  (`schedule.tsx:346-347`); sessions crossing midnight break entirely
  (`recurrence.ts:275` wraps with `% 24`; classification then returns garbage);
  biweekly week-bucketing drifts across DST (`recurrence.ts:116`).
A reminder that says "Saturday's session" while firing on the wrong calendar day — or at
3am — burns exactly the trust this feature is meant to build. Candidate generation must
become team-timezone-aware (bring in `date-fns-tz` or equivalent) before the engine ships.

### 3.2 Serious adjacent findings (fix alongside — most are small)

**S6 · Authorization holes in availability routes.** Any team member can PATCH or DELETE
*another member's* availability rows — no ownership or team-scope check
(`server/routes.ts:3006,3038`; storage takes a bare id, `server/storage.ts:609,618`).
Same class: DELETE `/session-overrides/:id` has no team-scope check
(`routes.ts:3151`), and POST availability doesn't verify the session belongs to the team
(`routes.ts:2821`).

**S7 · Team PATCH is mass-assignable.** `req.body` passes straight to `updateTeam` with
only a DM guard — `ownerId` and `aiEnabled` (the paywall flag) are writable
(`server/routes.ts:533`). Session POST spreads raw body unvalidated (`routes.ts:2750`).

**S8 · The prod/test route divergence class is alive in scheduling.** Test routes
validate availability status; production does not (`server/test/test-routes.ts:662` vs
`routes.ts:2825`) — the exact bug family that caused the notes-surface privacy leak
before P2-3 unified handlers. Scheduling handlers should get the same shared-factory
treatment, *especially* before a notification engine starts reading this data. Also: no
HTTP tests exist for `/session-candidates` or `/session-overrides`, and MemoryStorage
hardcodes recurrence fields to null/defaults (`server/test/memory-storage.ts:204-206`),
making biweekly recurrence untestable.

**S9 · Dev and prod behave differently for the DM.** `import.meta.env.DEV` forks the DM's
upcoming-sessions filter (`schedule.tsx:502`, mandated by PRD-010 FR-5/010B FR-1) — what
you verify locally is not what ships.

**S10 · Below-threshold sessions silently vanish for members.** No "at risk" state exists
(`schedule.tsx:507-516`) — a member sees nothing rather than "Needs 2 more people." For
this feature, *at risk* is precisely when the group most needs the session surfaced (it's
the state the reminder is trying to fix). Related display bugs: the day hover card
mislabels partial availability as full (`schedule.tsx:444`), and a 15-minute overlap
counts toward the threshold identically to full attendance (`schedule.tsx:370`).

**S11 · The dashboard is disconnected from real scheduling.** It reads only legacy manual
sessions, so recurrence-based teams permanently see "No upcoming sessions"
(`dashboard.tsx:80-83`), with no timezone conversion (`dashboard.tsx:227,230`), no
availability prompt, and no threshold display. The dashboard is where an "you haven't
responded for Saturday" banner belongs.

**S12 · Convergence is invisible without a reload.** `staleTime: Infinity`, no refetch on
focus, no polling (`client/src/lib/queryClient.ts:48-51`) — availability entered by other
members never appears until manual invalidation. PRD-010A FR-5 mandated real-time
eligibility updates (WebSocket/SSE); nothing was built. A feature whose whole point is
"did everyone respond yet" needs at least focus-refetch/short polling on the schedule page.

**S13 · Two contradictory availability models coexist.** The legacy session-keyed
tri-state table is still served and still writable from the manual-session dialog
(`routes.ts:2802,2821`, `schedule.tsx:61-65,892-977`), it uses "busy" where the new model
has nothing, its `getAvailability` does a full-table scan filtered in JS
(`storage.ts:470`), and its upsert is racy (no unique constraint, `storage.ts:483`).
Decide: migrate manual sessions onto the date-based model (recommended) or clearly fence
the legacy path. The reminder engine must have *one* definition of "responded."

**S14 · Data hygiene under the future engine.** No unique constraint on
`(teamId, userId, date)` — uniqueness is a racy read-then-409 (`routes.ts:2986`); the
monthly clamp maps day 30 and 31 both onto Feb 28, producing duplicate `occurrenceKey`s
(`recurrence.ts:214`); `recurrenceAnchorDate`/threshold/duration cannot be set at team
creation (`routes.ts:487`) so biweekly teams need a follow-up PATCH; team timezone is a
free-text input on settings (`settings.tsx:532-537`) rather than the validated
`TimezoneSelect` used on the profile page.

**S15 · Paper trail drift.** The scheduling family (PRD-009…014) is absent from the
`docs/prd/README.md` status table; PRD-009/009A/010/010A/010B still read "Proposed"
despite being implemented; PRD-011's acceptance boxes are unchecked. And per S2, the
landing page promises the feature this audit finds missing.

## 4. The feature spec: availability reminders + group notices

What the owner asked for, thought through end-to-end. Defaults chosen so the group never
has to configure anything; everything marked *(config)* is a per-team DM setting.

### 4.1 Response semantics (prerequisite — fixes S1)

Add an explicit response state per member per occurrence:

- Extend `user_availability` with `status: "available" | "unavailable"` (times required
  only for `available`). The availability panel gains a third option: **"I can't make
  it"**. One row per (teamId, userId, date) — enforced by a real unique index.
- **"Responded" for occurrence X** ⇔ the member has any row (available window *or*
  unavailable) for X's team-timezone date. "Everyone" = all current team members,
  **including the DM** (the DM is excluded from the *threshold count* per PRD-010A, but a
  session without its DM isn't happening — their response state is tracked and nagged
  like anyone's).
- Retire the legacy session-keyed table by migrating manual sessions onto the same model
  (S13), so the engine has one truth.

### 4.2 The reminder engine (fixes S3/S4)

A daily server job (in-process interval + catch-up on boot; runnable via an admin
endpoint for external cron if the host isn't always-on). Per team, per upcoming
occurrence within the horizon:

1. Compute the next occurrences from recurrence + overrides **in the team timezone**
   (post-S5 fix), skipping canceled ones.
2. At **T-7 days** *(config: `reminderLeadDays`, min 7 per the owner's rule)*, determine
   the non-respondent set.
3. **To each non-respondent**: push — *"Are you in for Saturday, Sep 12 at 7:00 PM?
   Tap to answer."* Deep-links to the schedule page with that date's availability panel
   open.
4. **To everyone else (one aggregated digest, not one push per laggard)**: *"Still
   waiting on Alice and Bob for Saturday's session."* Sent once per stage; re-sent only
   when the laggard set changes.
5. **Escalation** *(config)*: repeat to remaining non-respondents at T-3 and T-1.
   Hard cap: one availability nudge per member per occurrence per day.
6. **Positive close**: the moment the last response lands (event-triggered, not
   tick-triggered): *"Everyone's in — Saturday 7:00 PM is confirmed (5 available)."*
   Or, if threshold is met but stragglers remain at T-1: *"Session is on — 4 in,
   awaiting Bob."*
7. **Game-day confirmation** (from the original build directive §5): at 12:00 PM
   team-local on game day, if scheduled + threshold met: *"Game is on today at 7:00 PM."*
8. **State changes**: threshold becomes unreachable (enough "unavailable" responses that
   remaining members can't reach it) → notify DM (*"Saturday can't reach 3 attendees —
   cancel or reschedule?"*); DM cancels/reschedules → notify the team; reschedule resets
   the occurrence's reminder ledger.

All sends are recorded in a `notification_log` keyed by
(type, teamId, occurrenceKey, targetUserId, stage) — that ledger IS the idempotency and
anti-spam mechanism, and the debugging answer to "I never got it."

### 4.3 Delivery (fixes S2)

- **Web Push**: `web-push` + VAPID keypair (env), a service worker with
  `push`/`notificationclick` handlers (click routes into the app), and a
  `push_subscriptions` table (userId, endpoint, p256dh, auth, userAgent, createdAt,
  lastSeenAt). Prune on 404/410 responses. A user may hold several subscriptions
  (phone + laptop) — send to all.
- **PWA shell**: manifest + icons + installability so iPhones can receive push at all
  (Home-Screen install, iOS 16.4+). Also remove `maximum-scale=1` from the viewport meta
  while in there (`client/index.html:5`).
- **In-app fallback** (zero-permission path): a notification bell/badge fed by the same
  log, plus a dashboard banner "You haven't answered for Saturday" — so a member who
  never grants push permission still gets nagged when they open the app. The group view
  already names non-responders (PRD-011); the DM additionally sees who is unreachable by
  push (no subscription) so they know a text message is needed.
- **Permission UX**: never prompt on page load. Prompt contextually — after a member
  first saves availability ("Want a reminder when the group needs your answer?") and
  from Settings. Per-user, per-team preference toggles: availability reminders /
  group-awaiting notices / game-day confirmations.
- Email is deliberately out of the first cut (no email infra exists; push + in-app
  covers the stated need) — the log schema should carry a `channel` column so email can
  be added without migration.

### 4.4 Edge cases the engine must handle (the "rest of it")

| # | Case | Behavior |
|---|------|----------|
| 1 | Member responds mid-window | Drops out of laggard set immediately; no further nudges for that occurrence; group digest not re-sent unless the set changed for other reasons |
| 2 | New member joins inside T-7 | Enters the laggard set at the next tick with a fresh (gentler) first nudge; grace of 24h before appearing in group digests |
| 3 | Member leaves team / is removed | Purge from laggard sets and future digests; their absence may flip threshold-unreachable → DM notice |
| 4 | DM marks a member away *(config per occurrence)* | "Exempt this week" — excluded from required-responder set and digests (vacation case; avoids the group nagging someone at a funeral) |
| 5 | Occurrence canceled by DM | All pending reminders for it suppressed; cancellation notice sent instead |
| 6 | Occurrence rescheduled | Ledger for the occurrenceKey resets stage-wise; "time changed" notice; T-computations rebase on the new time |
| 7 | Ad-hoc session created < 7 days out | T-7 stage fires immediately on creation; later stages follow the normal ladder |
| 8 | Multiple occurrences inside the horizon | Fully independent ledgers per occurrenceKey; pushes always name the date to disambiguate |
| 9 | Member in a different timezone | Nudges reference the session in *their* display timezone; sends happen at a civil hour (default 10:00 team-local *(config)*), never on the raw UTC tick |
| 10 | Server asleep/restarted over a tick | Catch-up on boot: any stage whose window has passed and isn't in the log fires once (and only once — the log is the guard) |
| 11 | User in multiple teams | Every notification is team-labeled; prefs are per-team |
| 12 | Push endpoint dead | 404/410 → delete subscription; member falls back to in-app path and shows as push-unreachable to the DM |
| 13 | Everyone responded but threshold unmet | No laggard nudges (nobody is missing); DM gets the threshold-unreachable notice; members see "at risk" state (S10) instead of a vanished session |
| 14 | DM never set recurrence | Engine no-ops for the team; dashboard prompts the DM to set a schedule instead |

### 4.5 Suggested build order

1. **Foundations** — timezone-correct candidate generation (team TZ end-to-end,
   occurrenceKey stability, midnight-crossing fix) + move eligibility/respondent math
   into `shared/` for server use + shared handler factories for scheduling routes +
   the S6/S7 authorization fixes. *(S4, S5, S6, S7, S8)*
2. **Response semantics** — "I can't make it", unique constraint, legacy-model
   migration, "Awaiting response from…" surfaced on session cards. *(S1, S13, S14)*
3. **Push + PWA shell** — subscriptions, service worker, manifest, permission UX,
   in-app notification center + dashboard banner (also fixes the dashboard, S11). *(S2)*
4. **The engine** — daily job + event triggers, notification log, T-7/T-3/T-1 ladder,
   group digest, confirmed/at-risk/game-day notices, DM controls + per-user prefs. *(S3)*
5. **Convergence polish** — focus-refetch/polling on schedule (S12), at-risk display
   (S10), dev/prod fork removal behind a proper flag (S9), PRD tracker cleanup (S15).

Each stage is shippable alone; stages 1–2 fix real bugs even if notifications never ship.

## 5. What was verified as working

Recurrence math for the common weekly case (candidates, occurrence keys, override
upsert/reinstate, DM toggle surfaces, 5-cap and multi-month span per PRD-012); Full/
Partial/None classification for same-day windows; the three-bucket who's-available
display with per-member windows (PRD-011); per-day availability entry with regular-time
defaulting (PRD-009/009A); DM-only guards on session create/cancel and override writes;
user-availability create path scoped to self with HH:MM validation and a (racy but
present) duplicate check. Test coverage exists for user-availability CRUD, session
status, and recurrence unit math — but not for the candidates/overrides HTTP routes.
