# PRD-011 — View Team Availability on Schedule Screen

## Story Status
Implemented

---

## Parent Story
**PRD-010A — Upcoming Sessions: Partial Availability, Session Duration, Eligibility**

This PRD extends PRD-010A by allowing any team member to view detailed availability breakdowns for:
- Upcoming session candidates
- Any calendar date

---

## Summary

The Schedule screen currently shows aggregated availability counts (e.g., "5 available (3 full, 2 partial)") but doesn't let users see **who** is available and **when**. This PRD adds:

1. **Session Availability Modal** — Click any upcoming session to see the full breakdown of who is available, partially available, or hasn't responded, including their specific time windows.

2. **Calendar Date Info Hover** — Hover over an info icon on any calendar date to see team availability for that date.

Both features display absolute times in the user's timezone (e.g., "7:00 PM - 11:00 PM EDT").

---

## Goals

- Allow any team member to see **who** is available for a session, not just counts
- Display **time windows** for members with availability set
- Show members who haven't responded as **"No Response"**
- Provide quick access via hover on calendar dates
- Maintain consistency with existing timezone handling

---

## Non-Goals

- This PRD does not add the ability to set availability for others
- This PRD does not add notifications for availability changes
- This PRD does not change how availability is stored or calculated

---

## Definitions

### Member Availability Status (for display)
- **Full** — Member's availability window covers the entire session
- **Partial** — Member's availability overlaps but doesn't fully cover the session
- **No Response** — Member has not set availability for the date

### Time Window Display
Format: `{startTime} - {endTime} {timezone}`
Example: `7:00 PM - 11:00 PM EDT`

---

## Functional Requirements

---

## FR-1: Session Availability Modal

### Description
Clicking any upcoming session card opens a modal showing detailed member availability.

### Requirements
- Click target: The entire upcoming session card in the sidebar
- DM toggle (schedule/cancel) must not trigger the modal (click stopped)
- Modal displays:
  - Session date (e.g., "Friday, January 24")
  - Session time window (e.g., "7:00 PM - 10:00 PM EDT")
  - Team availability grouped by status

### Availability Display
Members grouped into sections:
1. **Available** (green header)
   - Members with full session coverage
   - Shows avatar, name, time window
2. **Partial** (yellow header)
   - Members with partial coverage
   - Shows avatar, name, time window
3. **No Response** (muted header)
   - Members without availability set
   - Shows avatar, name

### Acceptance Criteria
- Any team member can click an upcoming session to see availability
- Members are correctly classified as full/partial/no response
- Time windows display in user's local timezone
- DM badge appears next to DM's name
- DM toggle still works without opening modal

---

## FR-2: Calendar Date Info Hover

### Description
Each calendar date displays an info icon that shows team availability on hover.

### Requirements
- Info icon position: Top-right corner of calendar day cell
- Icon: Small info circle (12x12px), muted color
- Hover behavior: Opens HoverCard after 200ms delay
- Click on icon is stopped (doesn't trigger date selection)

### HoverCard Content
- Date header (e.g., "Friday, Jan 24")
- Subheader: "Team availability for this date"
- Compact availability list:
  - Members who set availability: name + time window
  - Members without availability: "No Response"

### Acceptance Criteria
- Info icon appears on every calendar date
- Hovering shows team availability in compact format
- Click on info icon doesn't open the availability panel
- Time windows display in user's local timezone

---

## FR-3: Reusable Availability List Component

### Description
A shared component for displaying member availability lists, used in both the session modal and calendar hover.

### Requirements
Create `TeamAvailabilityList` component with:
- Props: `members` (availability data), `compact` (boolean for hover vs modal)
- Sections: Available, Partial, No Response
- Per-member display:
  - Avatar (hidden in compact mode)
  - Name
  - Time window (if available)
  - DM badge (if applicable)

### Acceptance Criteria
- Component works in both modal and hover contexts
- Compact mode reduces visual density for hover use
- Empty state handled gracefully

---

## Data Model Changes

None. This feature uses existing data:
- `userAvailability` — Member availability with startTime/endTime
- `teamMembers` — Member list with user info
- `SessionCandidate` — Session time windows for classification

---

## Helper Functions

### formatTimeWindow
```typescript
formatTimeWindow(startTime: string, endTime: string, timezoneAbbr: string): string
// "19:00", "23:00", "EDT" → "7:00 PM - 11:00 PM EDT"
```

### getSessionMemberAvailability
```typescript
getSessionMemberAvailability(candidate: SessionCandidate): MemberAvailability[]
// Returns members with full/partial/no_response status and time windows
```

### getDayMemberAvailability
```typescript
getDayMemberAvailability(day: Date): MemberAvailability[]
// Returns members with availability status for a calendar date
```

---

## UX Notes

- **Discoverability**: Info icon on every date makes team availability always accessible
- **Non-intrusive**: Hover doesn't interrupt the primary click-to-set-availability flow
- **Consistency**: Time format matches existing schedule display patterns
- **Accessibility**: Info icon has aria-label for screen readers

---

## Acceptance Criteria (Global)

- [ ] Clicking upcoming session opens availability modal
- [ ] Modal shows members grouped by availability status
- [ ] Modal shows time windows for available/partial members
- [ ] Modal shows "No Response" for members without availability
- [ ] Info icon appears on all calendar dates
- [ ] Hovering info icon shows compact team availability
- [ ] Time displays use user's local timezone
- [ ] DM toggle on session cards still works
- [ ] All existing tests pass

---

## Test Plan

### Unit Tests
1. **Time formatting**
   - `formatTimeWindow` converts HH:MM to readable format
   - Timezone abbreviation appended correctly

2. **Member classification**
   - Full availability correctly identified
   - Partial availability correctly identified
   - No availability returns no_response

### Integration Tests
1. **Session modal**
   - Click session card opens modal
   - Correct members in each section
   - Time windows display correctly

2. **Calendar hover**
   - Info icon hover opens HoverCard
   - Correct availability shown
   - Click on icon doesn't trigger date selection

### Regression Tests
- Existing session toggle functionality preserved
- Existing calendar click-to-set-availability preserved
- Existing tests pass (297 tests)

---

## Priority

**Medium**

This feature improves visibility and decision-making for all team members, but is not blocking for core scheduling functionality.

---

## Implementation Notes

### Files Created
- `client/src/components/team-availability-list.tsx` — Reusable availability list component

### Files Modified
- `client/src/pages/schedule.tsx`:
  - Added HoverCard import
  - Added Info icon import
  - Added selectedCandidate state
  - Added getSessionMemberAvailability helper
  - Added getDayMemberAvailability helper
  - Made session cards clickable buttons
  - Added HoverCard to calendar day cells
  - Added session availability dialog

### Key Implementation Decisions
1. **Reusable component** — Single source of truth for availability display
2. **HoverCard over Tooltip** — Supports structured content for member lists
3. **Compact mode** — Reduces visual density in hover context
4. **Button for session cards** — Proper semantics for clickable elements
5. **stopPropagation** — Prevents DM toggle from opening modal

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-17 | Initial implementation |
