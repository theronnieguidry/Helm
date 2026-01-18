# PRD-014 — Conditional Info Icon Based on Team Availability

## Story Status
Implemented

---

## Parent Story
**PRD-011 — View Team Availability on Schedule Screen**

This PRD refines PRD-011 by only showing the info icon when there is team availability to display.

---

## Summary

The info icon on calendar days (which shows team availability on hover) should only appear when at least one team member has set availability for that day. This reduces visual clutter on the calendar and makes it easier to identify which days have team availability data at a glance.

---

## Goals

- Reduce visual clutter on the calendar
- Make days with team availability more discoverable
- Maintain existing hover functionality when icon is shown

---

## Non-Goals

- This PRD does not change the content of the HoverCard
- This PRD does not change how availability is stored or queried

---

## Functional Requirements

---

## FR-1: Conditional Info Icon Rendering

### Description
The info icon should only appear on calendar days where at least one team member has set availability.

### Requirements
- Add helper function `hasTeamAvailabilityForDay(day: Date): boolean`
- Check if any `userAvailability` entry exists for the given day
- Conditionally render the HoverCard/info icon based on this check

### Acceptance Criteria
- Days with no team availability: No info icon displayed
- Days with one or more team members having availability: Info icon displayed
- Covers both full and partial availability (any availability entry counts)

---

## Data Model Changes

None. This feature uses existing `userAvailability` data.

---

## Implementation Notes

### Files Modified
- `client/src/pages/schedule.tsx`:
  - Added `hasTeamAvailabilityForDay` helper function
  - Wrapped HoverCard in conditional render

### Key Implementation
```typescript
const hasTeamAvailabilityForDay = (day: Date): boolean => {
  if (!userAvailability) return false;
  return userAvailability.some(ua => isSameDay(new Date(ua.date), day));
};
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-17 | Initial implementation |
