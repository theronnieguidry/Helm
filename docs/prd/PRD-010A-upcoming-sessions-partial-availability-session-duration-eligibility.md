# PRD-010A — Upcoming Sessions: Partial Availability, Session Duration, Real-Time Eligibility, and DM Rescheduling

## Story Status
Proposed (Follow-up to PRD-010 — Clarifications + Expanded Scope)

---

## Parent Story
**PRD-010 — Upcoming Sessions: Auto-Generated Recurrence + Attendance Eligibility + DM Override**

This PRD expands PRD-010 with clarified behavior for:
- partial availability counting
- session duration configuration
- real-time eligibility updates
- DM persistent cancellation behavior
- DM ability to shift/reschedule a week’s candidate session

---

## Summary

Upcoming Sessions should only appear when the session is **eligible**, meaning:

1. The session candidate exists (derived from team recurrence settings)
2. It is **not canceled**
3. The minimum attendance threshold is met by **members (excluding DM)**
4. Eligibility updates in **real time**
5. Member availability can be **Full** or **Partial**
   - Partial availability still counts toward eligibility
   - The DM must see a “Partial availability” indicator and inspect details

Additionally:
- Session duration is configurable (DM-only setting)
- DMs can **shift/reschedule** an auto-generated occurrence to another date/time

---

## Goals

- Count **partial overlap** as “available” for eligibility
- Provide clear **Partial availability indicator** in Upcoming Sessions panel
- Add DM-only configurable **session duration**
- Require **real-time refresh** of eligibility as availability changes
- Persist DM cancellation until explicitly reinstated
- Allow DM to **reschedule** a week’s candidate session when a different time works better

---

## Non-Goals

- This PRD does not implement push notifications (noon-of-session, etc.)
- This PRD does not implement “best time suggestions” or auto-optimization
- This PRD does not implement recurring personal availability templates

---

## Definitions

### Session Candidate (from Recurrence)
A computed occurrence based on team recurrence settings (weekly/biweekly/monthly):
- `scheduledAt` (start)
- `endsAt` (start + duration)
- `occurrenceKey` (stable identity)

### Availability Types (Relative to the Session Window)
Given:
- Session window = `[start, end)`
- Member availability window = `[availStart, availEnd)`

A member’s availability status is:

1. **Full**
   - `availStart <= start` AND `availEnd >= end`

2. **Partial**
   - overlaps session window, but does not fully cover it:
   - `availStart < end` AND `availEnd > start`
   - AND NOT Full

3. **None**
   - no overlap:
   - `availEnd <= start` OR `availStart >= end`

### Eligibility Count (Threshold)
- Eligible attendee count = **Full + Partial**
- DM does **not** count toward threshold

---

## Functional Requirements

---

## FR-1: Session Duration Setting (DM-only)

### Description
The DM configures a default session duration that defines the session end-time.

### Requirements
- Add a Settings field: `Session Duration`
- DM-only editable
- Suggested UX:
  - dropdown (2h, 3h, 4h, custom)
  - store in minutes

### Acceptance Criteria
- Duration persists per team
- Duration is used to compute session window end time for:
  - eligibility checks
  - partial/full calculations
  - rescheduled sessions

---

## FR-2: Partial Availability Counts Toward Eligibility

### Description
If a user is unavailable at the start but overlaps later (or leaves early), the session can still be considered viable.

### Requirements
- Attendance threshold gating counts:
  - Full availability members
  - Partial availability members
- DM excluded from count

### Acceptance Criteria
- A session becomes eligible even if some contributors are partial
- Sessions do not require all attendees to be “Full”

---

## FR-3: Upcoming Sessions Panel Indicators for Partial Availability

### Description
Upcoming Sessions panel must signal when the threshold is met but partial availability exists.

### Requirements
For each eligible upcoming session row, display:
- session date/time
- attendee summary:
  - `X available` (where X = Full + Partial)
- If `partialCount > 0`, display:
  - badge: **“Partial availability”**
  - or a compact chip: **“Partial: N”**

### Acceptance Criteria
- Eligible session with partials shows the indicator
- Eligible session with all full availability does not show the indicator

---

## FR-4: Session Details View for Availability Breakdown

### Description
DM must be able to inspect who is fully vs partially available and where gaps exist.

### Requirements
Clicking an Upcoming Session opens a detail view (drawer/modal/page) that includes:

**Availability Breakdown**
- **Full availability** list:
  - member name
  - availability window (optional)
- **Partial availability** list:
  - member name
  - availability window
  - gap visualization:
    - “Available from 9:00–11:00” (if arriving late)
    - “Available until 10:00” (if leaving early)

Optional summary:
- `Full: 3 • Partial: 1 • Total: 4 / Threshold: 4`

### Acceptance Criteria
- DM can see exactly who is partial and what the overlap window is
- DM can make an informed “is this session happening” decision

---

## FR-5: Real-Time Refresh (Required)

### Description
Upcoming Sessions must update live as members add/edit availability.

### Requirements
- When availability changes (create/update/delete):
  - eligibility recalculates
  - Upcoming Sessions panel updates in real time
- Real-time may be implemented via:
  - WebSockets (preferred)
  - SSE
  - short polling fallback (dev-only acceptable)

### Acceptance Criteria
- If threshold becomes met, session appears without refresh
- If threshold drops below, session disappears without refresh
- Partial availability indicator updates live

---

## FR-6: DM Cancellation Persists Until Re-enabled

### Description
Canceled sessions must remain canceled regardless of availability changes.

### Requirements
- If DM cancels an occurrence:
  - it is excluded from Upcoming Sessions
  - it stays canceled until DM explicitly reinstates it

### Acceptance Criteria
- Availability changes do not “un-cancel” a session
- Reinstate returns session to eligibility evaluation

---

## FR-7: DM Reschedule (“Shift Candidate”) Override

### Description
DM can shift the candidate session to a different date/time if the group can meet then.

### Requirements
From Upcoming Session detail view, DM can choose:
- **Reschedule**
  - pick new date
  - pick new start time
  - uses team session duration to compute end time
- Rescheduled session remains tied to the original `occurrenceKey`
  - but with an effective `scheduledAtOverride`

Rules:
- Reschedule does not create a duplicate session
- Rescheduled sessions still require eligibility to display (prod)
- In dev, still displayed regardless of threshold

### Acceptance Criteria
- DM can shift session from “Saturday 8 PM” to “Sunday 7 PM”
- The Upcoming Sessions panel reflects the new time
- Eligibility is recalculated against the new session window
- Partial availability indicator recalculates correctly for the new window

---

## FR-8: Eligibility Rules (Final, Updated)

An occurrence appears in **Upcoming Sessions** if and only if:

1. effective `scheduledAt` is in the future  
2. status is `Scheduled` (not canceled)  
3. `Full + Partial >= minimumAttendanceThreshold` (production only)  
4. results sorted soonest-first  
5. display top 5  

### Dev Environment Behavior
If `NODE_ENV === development`:
- rule #3 is bypassed
- all scheduled future occurrences appear (unless canceled)
- partial availability indicators may still appear when applicable

---

## Data Model Changes

### Team Settings (DM-only)
- `minimumAttendanceThreshold` (existing)
- `defaultSessionDurationMinutes` (**new**)

### Availability (existing / required)
- `date`
- `startTime`
- `endTime`
- `userId`
- `teamId`

### Session Overrides (recommended approach)
Table: `session_overrides`
- `teamId`
- `occurrenceKey`
- `status` ("Scheduled" | "Canceled")
- `scheduledAtOverride` (nullable)
- `updatedBy`
- `updatedAt`

Notes:
- If `scheduledAtOverride` is present, it becomes the effective time used for eligibility + display.
- If `status === Canceled`, the occurrence is excluded regardless.

---

## UX Notes (based on intent)

- **Upcoming Sessions should feel trustworthy**
  - It should only show sessions that are realistically on
- Partial availability must be visible at a glance
  - but not scary or complex
- Details view is “DM command center”
  - inspect
  - reschedule
  - cancel/reinstate

---

## Acceptance Criteria (Global)

- ✅ Sessions are not shown unless attendance threshold is met (prod)
- ✅ Partial overlap counts toward threshold
- ✅ DM does not count toward threshold
- ✅ Session duration is configurable and affects eligibility math
- ✅ Upcoming Sessions updates in real time without refresh
- ✅ Canceled sessions stay canceled until DM reenables
- ✅ DM can reschedule a week’s candidate to a new date/time
- ✅ “Partial availability” indicator appears when partials exist

---

## Test Plan

### Unit Tests
1. **Availability classification**
   - full overlap correctly detected
   - partial overlap correctly detected
   - non-overlap returns none

2. **Eligibility calc**
   - counts full + partial
   - excludes DM

3. **Session window math**
   - end time computed from duration
   - rescheduled occurrences use override window

4. **Override application**
   - canceled excludes always
   - rescheduled changes effective scheduledAt

### Integration Tests
1. **Real-time eligibility**
   - member adds availability → panel updates live
   - member removes availability → session disappears live

2. **Partial indicator**
   - session eligible w/ partials shows badge
   - becomes full-only after edits → badge removed

3. **DM override persistence**
   - cancel persists across reload
   - reinstate persists across reload

4. **DM reschedule**
   - reschedule to new date/time → panel updates live
   - eligibility recalculates on new window

### Regression Tests
- Slice to 5 sessions still enforced
- Sorting remains chronological
- Dev bypass preserves testability

---

## Priority

**High**

This PRD aligns the system with real-world attendance behavior:
- people arrive late
- leave early
- and sessions still happen

---

## Implementation Notes

- Treat recurrence as candidate generation only; availability is the gatekeeper.
- Eligibility should be computed using effective scheduledAt (after overrides).
- Real-time refresh should update:
  - panel list membership
  - partial availability badges
  - counts
- Store overrides separately from generated candidates to avoid data sprawl.

---
