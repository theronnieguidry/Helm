# PRD-013 — DM Session Cancellation from Calendar Day Click

## Story Status
Implemented

---

## Parent Story
**PRD-010B — Upcoming Sessions: DM Visibility, Reinstate Toggle, and Dev Mode Fix**

This PRD extends PRD-010B by allowing DMs to cancel or reinstate sessions directly from the calendar day click popover, in addition to the existing sidebar toggle.

---

## Summary

Currently, DMs can only cancel or reinstate sessions using the toggle switch in the "Upcoming Sessions" sidebar. This PRD adds the same capability to the calendar day popover, allowing DMs to click any calendar day with a session and toggle its status directly.

The session status control appears **above** the availability section in the popover, separated by a visual divider. Non-DM users do not see this section at all.

---

## Goals

- Allow DMs to cancel/reinstate sessions directly from calendar day click
- Provide a more intuitive workflow (click day → manage session)
- Match the existing toggle pattern from the sidebar for consistency
- Support both recurrence-based sessions and manually created sessions

---

## Non-Goals

- This PRD does not add confirmation dialogs (action is reversible)
- This PRD does not change the sidebar toggle behavior
- This PRD does not add session cancellation for non-DM users

---

## Definitions

### Session Status
- **Scheduled** — Session is active and visible to members meeting threshold
- **Canceled** — Session is inactive; DMs see it muted, members don't see it

### Session Types
- **Recurrence Session** — Auto-generated from team recurrence settings, managed via `session_overrides` table
- **Manual Session** — Created explicitly by DM via "Schedule Session" dialog, managed via `game_sessions` table

---

## Functional Requirements

---

## FR-1: Session Status Control Component

### Description
A new component that displays session time and status, with a toggle switch for DMs to cancel/reinstate.

### Requirements
- Component: `SessionStatusControl`
- Location: `client/src/components/session-status-control.tsx`
- Props:
  - `candidate`: SessionCandidate or null (for recurrence sessions)
  - `session`: GameSession or null (for manual sessions)
  - `userTimezone`: User's timezone string
  - `onToggle`: Callback with new status
  - `isPending`: Loading state
- Display:
  - Session time window (e.g., "7:00 PM - 10:00 PM EST")
  - Current status badge ("Scheduled" or "Canceled")
  - Toggle switch to change status
- Visual treatment when canceled:
  - Strikethrough on session time
  - Red/muted color for "Canceled" badge

### Acceptance Criteria
- Component displays session time correctly in user's timezone
- Toggle updates session status via mutation
- Loading state disables toggle during mutation
- Canceled sessions show visual indicators

---

## FR-2: Calendar Day Popover Enhancement

### Description
The existing calendar day popover is enhanced to include session status controls for DMs.

### Requirements
- When a DM clicks a calendar day:
  - If the day has a session (recurrence or manual), show `SessionStatusControl` above the availability section
  - Show a visual separator between session controls and availability
  - Non-DMs see only the availability section (no session controls)
- When there's no session on the day:
  - Only show the availability section (for all users)

### Popover Layout (DM with session)
```
+------------------------------------------+
| Friday, January 24, 2026                 |
|                                          |
| [SessionStatusControl]                   |
| Session: 7:00 PM - 10:00 PM EST          |
| Status: [Toggle: Scheduled / Canceled]   |
|                                          |
| ─────────────────────────────────────── |
|                                          |
| [AvailabilityPanel]                      |
| Set your availability for this day       |
| ...existing availability controls...     |
+------------------------------------------+
```

### Acceptance Criteria
- DMs see session toggle when clicking day with session
- Non-DMs see only availability section
- Days without sessions show only availability for all users
- Separator visually divides the two sections

---

## FR-3: Multiple Sessions on Same Day

### Description
When a day has multiple sessions (e.g., both a recurrence session and a manual session), display controls for each.

### Requirements
- Show each session with its own toggle
- Label to differentiate session types if needed
- Each toggle operates independently

### Acceptance Criteria
- Multiple sessions on same day each have their own toggle
- Toggling one does not affect the other

---

## Data Model Changes

None. This feature uses existing APIs:
- **Recurrence sessions**: POST `/api/teams/:teamId/session-overrides` with `{ occurrenceKey, status }`
- **Manual sessions**: PATCH `/api/teams/:teamId/sessions/:sessionId` with `{ status }`

Both mutations already exist in `schedule.tsx`.

---

## Helper Functions

### getCandidateForDay
```typescript
getCandidateForDay(day: Date): SessionCandidate | undefined
// Returns the recurrence session candidate for a specific day, if any
```

### getManualSessionForDay
```typescript
getManualSessionForDay(day: Date): GameSession | undefined
// Returns the manual session for a specific day, if any
```

---

## UX Notes

- **Consistency**: Toggle matches the sidebar's toggle pattern
- **Discoverability**: Session controls appear at top of popover where DMs expect them
- **Non-intrusive**: Non-DMs see the same popover as before (no changes)
- **Reversible**: No confirmation needed since action can be immediately reversed
- **Past sessions**: DMs can update historical sessions for record-keeping

---

## Acceptance Criteria (Global)

- [x] DM clicking calendar day with session sees toggle control
- [x] Toggle successfully cancels recurrence session via override
- [x] Toggle successfully cancels manual session via PATCH
- [x] Toggle successfully reinstates canceled sessions
- [x] Non-DM clicking calendar day sees only availability
- [x] Days without sessions show only availability for all users
- [x] Multiple sessions on same day each have separate toggles
- [x] Session time displays in user's local timezone
- [x] Visual indicators show canceled state (strikethrough, badge)
- [x] All existing tests pass (297 tests)

---

## Test Plan

### Unit Tests
1. **SessionStatusControl component**
   - Renders session time correctly
   - Shows scheduled/canceled badge based on status
   - Calls onToggle with correct new status
   - Disabled state during pending mutation

### Integration Tests
1. **Calendar popover**
   - DM sees session control for day with recurrence session
   - DM sees session control for day with manual session
   - Non-DM does not see session control
   - Days without sessions show only availability

2. **Mutations**
   - Canceling recurrence session creates/updates override
   - Reinstating recurrence session updates override to scheduled
   - Canceling manual session updates session status
   - Reinstating manual session updates session status

### Regression Tests
- Existing sidebar toggle functionality preserved
- Existing calendar click-to-set-availability preserved
- Session availability modal still works
- All existing tests pass

---

## Priority

**High**

This feature addresses a user-requested workflow improvement for DM session management.

---

## Implementation Notes

### Files Created
- `client/src/components/session-status-control.tsx` — New component for session toggle

### Files Modified
- `client/src/pages/schedule.tsx`:
  - Added `getCandidateForDay` helper
  - Added `getManualSessionForDay` helper
  - Enhanced PopoverContent to include SessionStatusControl for DMs
  - Added Separator between session and availability sections

### Key Implementation Decisions
1. **Inline in popover** — Rather than a separate component for the popover, integrate directly into schedule.tsx for simplicity
2. **Reuse existing mutations** — Both `updateSessionOverrideMutation` and `updateSessionStatusMutation` already exist
3. **No confirmation** — Matches sidebar toggle behavior; action is reversible

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-17 | Initial implementation |
