# PRD — Schedule Availability Interaction (Refined to Match Current Calendar UI)

## Story Status
Proposed (High Priority UX Refinement)

---

## Context & Visual Reference

This PRD refactors the availability interaction to align with the **existing Schedule UI**, which consists of:

- A **monthly calendar grid** (center/left)
- A **right-hand sidebar** with:
  - Upcoming Sessions
  - Regular Schedule (e.g., Weekly · Saturday · 20:00 · MST)
- A primary CTA: **“+ Schedule Session”**
- A clear visual affordance for selected days (outlined date cell)

The goal is to **layer availability entry naturally onto this UI**, without adding clutter or new tabs, and without confusing session scheduling (DM action) with personal availability (member action).

---

## Problem Statement

In the current Schedule view:
- It is not obvious that **individual users can add availability**
- Clicking a date highlights it, but does not yet communicate “you can act here”
- There is no affordance for:
  - marking availability for the regular session time, or
  - specifying a custom availability window

We need to introduce availability in a way that:
- feels obvious but not noisy
- respects the existing visual hierarchy
- mirrors familiar calendar interactions (Google Calendar–style)
- works for both casual and power users

---

## Goals

- Make it immediately clear that **calendar days are interactive for availability**
- Allow fast, one-click availability for the **regular session time**
- Allow precise availability windows via **click-and-drag time selection**
- Keep the monthly calendar visually clean and uncluttered
- Reuse the existing sidebar and selection patterns where possible

---

## Non-Goals

- This PRD does not redesign the calendar layout
- This PRD does not change how DMs schedule official sessions
- This PRD does not add recurring personal availability rules
- This PRD does not address conflict resolution or optimization

---

## User Story

> As a group member,  
> when I view the Schedule calendar,  
> I want to click a day and quickly indicate when I’m available —  
> either for the usual session time or a custom window —  
> so the group can see when I can attend.

---

## Functional Requirements

---

## FR-1: Availability Instructional Hint (Inline, Contextual)

### Description
Users need a clear cue that availability can be added via the calendar.

### Requirements
- Display a short instructional hint **above the calendar**, below the “Schedule” header:
  > “Click a day to add your availability.”
- The hint should:
  - be subtle (secondary text style)
  - not block interaction
  - remain visible until the user adds availability at least once

### Acceptance Criteria
- New users can visually infer that days are clickable
- No modal, tooltip, or onboarding step is required

---

## FR-2: Day Selection as Entry Point

### Description
Clicking a day in the calendar initiates availability entry for that date.

### Requirements
- Clicking a day:
  - visually selects the day (existing outline behavior)
  - opens an **Availability Panel** (see FR-3)
- The selected day remains highlighted while the panel is open

### Acceptance Criteria
- Clicking any date consistently opens availability UI
- The selected date is clearly indicated both in the grid and panel

---

## FR-3: Availability Panel (Anchored to Calendar Selection)

### Description
Availability entry should appear as a lightweight panel, not a full modal.

### Placement
- Desktop:
  - Panel appears contextually (popover or right-side overlay)
- Mobile:
  - Panel appears as a bottom sheet

### Panel Content (Top to Bottom)
1. Selected date (readable format)
2. Availability mode selector
3. Mode-specific controls
4. Save / Cancel actions

---

## FR-4: Availability Mode Selector

### Description
Users must choose how they want to define availability for the selected day.

### Options
- **Available for regular session time**
- **Specify a time range**

### Requirements
- If a Regular Schedule exists (as shown in sidebar):
  - Default selection = “Available for regular session time”
- If no Regular Schedule exists:
  - Default selection = “Specify a time range”

### Acceptance Criteria
- Mode selection is explicit and reversible
- Copy clearly references the Regular Schedule shown in the sidebar

Example copy:
> “Available for regular session time (Saturday · 20:00 MST)”

---

## FR-5: One-Click Availability for Regular Session Time

### Description
For the most common case, availability should be nearly effortless.

### Requirements
- Selecting “Available for regular session time”:
  - creates an availability entry matching:
    - the team’s regular weekday
    - the regular start time
    - implicit session duration (configurable later)
- Requires only one additional action: **Save**

### Acceptance Criteria
- Availability appears immediately on the calendar
- User does not need to enter times manually

---

## FR-6: Custom Time Range Selection (Time-Series UI)

### Description
Users who choose “Specify a time range” are shown a time-based editor.

### UI Model
- A vertical time grid representing the selected day
- Time labels (e.g., hourly or half-hour increments)
- Empty grid by default

### Interaction Requirements
- User can:
  - click and drag to create a time block
- The created block:
  - visually highlights the selected window
  - displays start and end times inline
- The block includes:
  - draggable **top and bottom handles** to resize
  - draggable body to move the block

### Acceptance Criteria
- Click-and-drag creates a visible time window
- Resizing updates times in real time
- Interaction feels familiar to Google Calendar users

---

## FR-7: Editing Existing Availability

### Description
Users must be able to adjust availability without re-creating it.

### Requirements
- Clicking an existing availability block:
  - reopens the Availability Panel
  - shows the current mode and values
- Users can:
  - switch modes
  - resize or move time blocks
  - delete availability

### Acceptance Criteria
- Edits persist correctly
- No accidental loss of availability data

---

## FR-8: Visual Representation on the Monthly Calendar

### Description
Availability should be visible but not overpower session scheduling.

### Requirements
- Days with **your availability** show a subtle indicator:
  - dot, bar, or soft background accent
- Indicator is distinct from:
  - selected day outline
  - scheduled session markers (future)

### Acceptance Criteria
- Users can scan the month and see which days they’re available
- Visuals remain clean and uncluttered

---

## Data Model (Availability)

Fields:
- `id`
- `teamId`
- `userId`
- `date`
- `startTime`
- `endTime`
- `createdAt`
- `updatedAt`

---

## Acceptance Criteria (Global)

- ✅ Instructional hint is visible and helpful
- ✅ Clicking a day opens availability entry
- ✅ Users can choose regular time or custom range
- ✅ Time range UI supports drag, resize, and move
- ✅ Availability is saved, editable, and visible on calendar
- ✅ Design fits naturally into the existing Schedule UI

---

## Test Plan

### Unit Tests
- Availability creation with regular session time
- Availability creation with custom start/end
- Drag/resize math produces correct times
- Invalid ranges are prevented

### Integration Tests
- Click day → add availability → save → reload persists
- Edit availability → calendar updates correctly
- Multiple days’ availability handled independently

### UX / Interaction Tests
- Drag interactions feel smooth and predictable
- Handles resize accurately at boundaries
- Cancel action leaves no residual state

---

## Accessibility Considerations

- Provide keyboard-accessible alternative for time range entry
- Screen readers announce:
  - selected date
  - availability mode
  - selected time range
- Ensure sufficient contrast for availability indicators

---

## Priority

**High**

This feature is central to participation and directly complements the existing calendar-centric Schedule UI.

---

## Future Enhancements (Out of Scope)

- Multi-day availability blocks
- Recurring personal availability templates
- Conflict visualization
- AI-suggested optimal availability windows

---
