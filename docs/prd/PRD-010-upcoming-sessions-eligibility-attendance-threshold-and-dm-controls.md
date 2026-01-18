# PRD-010 — Upcoming Sessions: Eligibility, Attendance Threshold, and DM Controls

## Story Status
Proposed (High Priority – Behavioral Correction)

---

## Background / Current State

The **Upcoming Sessions** panel on the Schedule screen is currently driven by **manually created sessions only**, with the following logic:

**Current behavior (as implemented):**
1. Sessions must be manually created by a DM via **“Schedule Session”**
2. Only sessions with `scheduledAt` in the future appear
3. Sessions are sorted chronologically (soonest first)
4. The panel shows a maximum of 5 sessions
5. Team recurrence settings (weekly/biweekly/monthly) are **informational only**
6. No eligibility logic based on attendance

This behavior does not align with how Helm is intended to coordinate groups around *actual readiness to meet*.

---

## Problem Statement

The Upcoming Sessions panel should reflect **sessions that are realistically happening**, not merely sessions that were manually created.

Specifically:
- Attendance readiness is ignored
- Minimum attendance thresholds are not respected
- DMs cannot easily cancel or reinstate a session from the panel
- Testers cannot reliably verify this feature without full participation data

As a result:
- The panel may show sessions that won’t happen
- DMs lack operational control at the point of decision
- The panel does not reflect group consensus

---

## Goals

- Make Upcoming Sessions reflect **attendance readiness**
- Use the **minimum attendance threshold** as a gating mechanism
- Allow DMs to **cancel or reinstate** upcoming sessions
- Preserve existing session objects (no auto-generation required in this PRD)
- Enable easy testing in the dev environment

---

## Non-Goals

- This PRD does **not** introduce automatic session creation from recurrence rules
- This PRD does **not** alter how availability is collected
- This PRD does **not** implement notifications (future work)
- This PRD does **not** change how sessions are scheduled initially

---

## User Stories

### DM Story
> As a DM,  
> I want upcoming sessions to appear only when enough people can attend,  
> and I want to cancel or reinstate them easily,  
> so the schedule reflects reality.

### Member Story
> As a group member,  
> I want the Upcoming Sessions list to only show sessions that are actually happening,  
> so I can trust what I see.

---

## Definitions

### Minimum Attendance Threshold
- Configured in **Settings**
- **DM-only editable**
- Represents the minimum number of attendees required for a session to be considered viable

---

## Functional Requirements

---

## FR-1: Attendance Threshold Gating

### Description
A session is **eligible** to appear in the Upcoming Sessions panel only if attendance meets or exceeds the configured threshold.

### Rules
- Attendance count is derived from:
  - user availability matching the session date/time
- Session eligibility:
eligible = availableAttendees >= minimumAttendanceThreshold

### Acceptance Criteria
- Sessions below the threshold do **not** appear
- Sessions meeting or exceeding the threshold appear (unless canceled)

---

## FR-2: Session Status Toggle (Scheduled / Canceled)

### Description
Each session must have a status that controls whether it appears as upcoming.

### States
- `Scheduled`
- `Canceled`

### Rules
- Default state on creation: `Scheduled`
- `Canceled` sessions:
- never appear in Upcoming Sessions
- State is explicitly controlled by DM

### Acceptance Criteria
- Session status persists correctly
- UI reflects status accurately

---

## FR-3: DM Controls in Upcoming Sessions Panel

### Description
DMs need operational control directly from the Upcoming Sessions panel.

### Requirements
- For users with DM role:
- Show a toggle or control per session:
  - `Scheduled` ↔ `Canceled`
- For non-DM users:
- Session status is read-only

### Acceptance Criteria
- DMs can cancel a session from the panel
- DMs can reinstate a canceled session
- Non-DMs cannot see or interact with controls

---

## FR-4: Panel Inclusion Logic (Final Definition)

A session appears in **Upcoming Sessions** if and only if:

1. `scheduledAt` is in the future  
2. `status === Scheduled`  
3. Attendance threshold is met  
4. Session is within the top 5 upcoming sessions (chronological order)

### Acceptance Criteria
- All four conditions are enforced
- Ordering remains soonest-first
- `.slice(0, 5)` behavior preserved

---

## FR-5: Dev Environment Override (Testing Enablement)

### Description
To enable reliable testing of the cancel/reinstate controls, the attendance threshold gating must be bypassed in development. This allows a single developer (acting as DM) to test the full workflow without needing multiple users to mark availability.

### Testing Workflow (Dev Environment)
1. DM creates a session via "Schedule Session"
2. Session immediately appears in Upcoming Sessions panel (no attendance required)
3. DM can test the cancel button (X) to cancel the session
4. Canceled session disappears from the panel
5. DM can verify session status persists correctly

### Rules
- In `dev` environment only:
  - Attendance threshold check is **completely disabled**
  - Sessions appear as long as:
    - `scheduledAt` is in the future
    - `status === Scheduled`
- In `production` environment:
  - Full attendance threshold gating applies (FR-1)

### Acceptance Criteria
- Dev environment shows upcoming sessions even with zero attendance/availability
- DM can immediately see and interact with cancel/reinstate controls after creating a session
- Toggle controls remain fully functional in dev mode
- Production behavior remains unchanged (threshold enforced)

---

## Data Model Changes

### Session
Add or confirm:
- `status: "Scheduled" | "Canceled"`

No other schema changes required.

---

## Acceptance Criteria (Global)

- ✅ Upcoming Sessions only show viable sessions
- ✅ Attendance threshold is respected in production
- ✅ DMs can cancel and reinstate sessions
- ✅ Non-DMs cannot modify session status
- ✅ Dev environment bypasses attendance gating
- ✅ Panel remains capped at 5 sessions
- ✅ No automatic session generation introduced

---

## Test Plan

### Unit Tests
- Eligibility calculation respects threshold
- Status toggle persists correctly
- Canceled sessions excluded from panel
- Dev-mode override bypasses threshold logic

### Integration Tests
- Session below threshold → does not appear
- Session reaches threshold → appears
- DM cancels session → disappears
- DM reinstates session → reappears
- Non-DM cannot toggle status

### Regression Tests
- Manual session creation still works
- Sorting remains chronological
- Slice limit remains enforced

---

## UX Considerations

- Status toggle should be:
- clearly labeled
- low-risk (no destructive confirmation needed)
- Canceled sessions should:
- disappear from the panel immediately
- Optional future enhancement:
- subtle “Canceled” badge elsewhere (out of scope)

---

## Priority

**High**

This PRD aligns the Schedule screen with Helm’s core philosophy:
> *Sessions happen when people can actually show up.*

---

## Implementation Notes

- Gate attendance logic behind an environment flag:
- `process.env.NODE_ENV === "development"`
- Do not conflate session status with attendance eligibility
- Keep session creation manual for now (future PRD)

---

## Future Enhancements (Out of Scope)

- Auto-creating tentative sessions from recurrence
- Automatic notifications on threshold crossing
- Session confidence indicators
- Waitlist behavior

---
