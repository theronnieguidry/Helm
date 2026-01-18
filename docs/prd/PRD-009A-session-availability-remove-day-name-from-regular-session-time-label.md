# PRD-009A — Session Availability: Remove Day Name from “Regular Session Time” Label

## Story Status
Proposed (Sub-PRD to PRD-009-session-availability-add-ability-to-create-availability.md)

---

## Parent Story
**PRD-009-session-availability-add-ability-to-create-availability.md**

This PRD refines copy and logic introduced in PRD-009 to resolve a UX inconsistency when selecting availability on days that differ from the regular session day.

---

## Summary

When a user selects a calendar day that is **not** the regular session day (e.g., clicking Sunday when the regular session is Saturday), the availability option:

> “Available for regular session time (Saturday · 20:00 MST)”

creates confusion.

The **time** is still relevant, but the **day name is misleading**, because availability is being added to the currently selected date, not the regular session’s weekday.

This PRD removes the weekday reference from this label and clarifies the meaning of “regular session time.”

---

## Problem Statement

The Schedule UI currently conflates two concepts:
- **Regular session cadence** (Saturday)
- **Regular session start time** (20:00 MST)

When adding availability on a different day:
- The user is thinking in terms of *this selected date*
- Seeing a different weekday in the label breaks trust and causes hesitation

This is a copy + logic mismatch, not a scheduling logic problem.

---

## Goals

- Eliminate contradictory weekday references in the availability UI
- Preserve the convenience of one-click availability for the regular session time
- Align labels with the **selected calendar day**, not the recurring schedule day
- Reduce cognitive friction and second-guessing

---

## Non-Goals

- This PRD does **not** change:
  - how regular schedules are defined
  - availability storage or calculations
  - scheduling thresholds or logic
- This PRD does **not** introduce new availability modes

---

## User Story

> As a user adding availability,  
> when I select a specific day on the calendar,  
> I want the availability options to clearly apply to that day,  
> so I’m not confused by references to a different weekday.

---

## Functional Requirements

---

## FR-1: Remove Weekday from “Regular Session Time” Label

### Description
The availability option should reference **only the session time**, not the session weekday.

### Current (Problematic) Copy
> “Available for regular session time (Saturday · 20:00 MST)”

### Updated Copy
> **“Available for regular session time (20:00 MST)”**

### Acceptance Criteria
- The label never includes a weekday name
- The label includes:
  - start time
  - timezone (if applicable)

---

## FR-2: Availability Applies to Selected Calendar Date

### Description
Selecting “Available for regular session time” must clearly apply the regular session **time** to the **selected date**.

### Requirements
- The system applies:
  - `startTime = regularSessionStartTime`
  - `date = selectedCalendarDate`
- No implicit or displayed reference to the regular session weekday

### Acceptance Criteria
- Availability created on Sunday uses Sunday’s date
- Time matches the regular session start time
- UI messaging matches actual behavior

---

## FR-3: Optional Clarifying Microcopy (Recommended)

### Description
Add subtle clarifying copy to reinforce correct interpretation.

### Optional Supporting Text (below option)
> “This applies the usual start time to the selected day.”

### Acceptance Criteria
- Copy is optional but, if present:
  - is secondary text
  - does not clutter the panel
  - appears only once per panel

---

## FR-4: Default Selection Logic (No Change)

### Description
Default selection behavior remains unchanged.

### Rules
- If a Regular Schedule exists:
  - “Available for regular session time” remains the default option
- If no Regular Schedule exists:
  - Default to “Specify a time range”

### Acceptance Criteria
- Behavior matches PRD-009
- Only label content changes

---

## Edge Cases

- If timezone is not explicitly shown elsewhere in the panel:
  - Include timezone in the label
- If the regular session time changes later:
  - Newly created availability uses the updated time
  - Existing availability remains unchanged

---

## Acceptance Criteria (Global)

- ✅ No weekday name appears in availability labels
- ✅ Time shown always matches regular session start time
- ✅ Availability applies to the selected calendar date
- ✅ UI language aligns with actual behavior
- ✅ User confusion is eliminated when selecting non-regular days

---

## Test Plan

### Unit Tests
- Label generation excludes weekday name
- Time formatting matches regular session start time
- Timezone included when required

### Integration Tests
- Select Sunday → choose regular session time → availability saved on Sunday at correct time
- Change regular session day → label remains unchanged
- Change regular session time → label updates accordingly

### UX Regression Tests
- Users do not see conflicting weekday references
- No copy overlap or truncation in narrow layouts

---

## Priority

**Medium–High**

This is a small but critical clarity fix that prevents user distrust and hesitation during availability entry.

---

## Implementation Notes

- Derive label text from:
  - `regularSessionStartTime`
  - `timezone`
- Explicitly exclude:
  - `regularSessionDayOfWeek`
- Avoid hardcoding copy strings with day references

---

## Success Metric

- Zero user confusion when adding availability on non-regular days
- Reduced hesitation and correction during availability entry

---
