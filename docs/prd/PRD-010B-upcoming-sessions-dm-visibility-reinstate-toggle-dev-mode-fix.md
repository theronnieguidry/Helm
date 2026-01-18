# PRD-010B — Upcoming Sessions: DM Visibility, Reinstate Toggle, and Dev Mode Fix

## Story Status
Proposed (Follow-up to PRD-010A — Bug Fixes + UX Improvements)

---

## Parent Story
**PRD-010A — Upcoming Sessions: Partial Availability, Session Duration, Real-Time Eligibility, and DM Rescheduling**

This PRD addresses gaps in PRD-010A related to:
- Dev mode showing sessions without any availability
- Canceled sessions being completely hidden from DM
- Lack of a clear toggle to reinstate canceled sessions

---

## Summary

The DM needs full visibility and control over session status. Currently:
1. **Dev mode bug**: Sessions appear without any availability being set, making it impossible to test the availability-gated behavior
2. **Hidden canceled sessions**: Once canceled, sessions disappear entirely—even for the DM who needs to reinstate them
3. **One-way cancel**: The cancel button (X) only cancels; there's no way to reinstate a session

This PRD introduces:
- Dev mode gating: sessions only appear when DM has set availability
- Canceled sessions visible to DM/Admin with clear visual distinction
- Switch toggle for DM to flip between Scheduled ↔ Canceled

---

## Goals

- Fix dev mode to require DM availability (not threshold, but at least DM presence)
- Show canceled sessions to DM/Admin users with visual indicator
- Provide a toggle switch for DM to change session status
- Maintain production behavior: canceled sessions hidden from non-DM members

---

## Non-Goals

- This PRD does not change the attendance threshold logic in production
- This PRD does not add new roles (Admin is synonymous with DM for now)
- This PRD does not add notifications

---

## Definitions

### Session Visibility Rules

**For DM/Admin users:**
- See ALL upcoming sessions (both Scheduled and Canceled)
- Canceled sessions appear inline with a "Canceled" badge and muted styling
- Can toggle any session between Scheduled ↔ Canceled

**For Member users:**
- See only Scheduled sessions that meet attendance threshold
- Canceled sessions are completely hidden

### Dev Mode Behavior
- Threshold check is bypassed
- Session appears if DM has set availability for that date
- If DM has no availability set → session does not appear

---

## Functional Requirements

---

## FR-1: Dev Mode Requires DM Availability

### Description
In development environment, sessions should only appear when the DM has set their own availability for that date. This allows the DM to test the feature without needing multiple team members.

### Current Behavior (Bug)
```typescript
if (import.meta.env.DEV) {
  return isFuture && isScheduled; // Shows ALL future sessions
}
```

### Required Behavior
```typescript
if (import.meta.env.DEV) {
  const dmHasAvailability = hasDmAvailabilityForDate(candidate.scheduledAt);
  return isFuture && isScheduled && dmHasAvailability;
}
```

### Acceptance Criteria
- In dev mode, sessions only appear when DM has set availability for that date
- Setting availability for a date immediately shows the session (if scheduled)
- Removing availability hides the session

---

## FR-2: DM Sees Canceled Sessions

### Description
DM/Admin users must see canceled sessions in the Upcoming Sessions panel so they can reinstate them if needed.

### Requirements
- Canceled sessions appear in the same list as scheduled sessions
- Canceled sessions have visual distinction:
  - "Canceled" badge
  - Muted/grayed text
  - Optional: strikethrough on date/time
- Sorted chronologically with scheduled sessions (not separated)

### Acceptance Criteria
- DM sees both scheduled and canceled sessions in upcoming list
- Canceled sessions are visually distinct
- Non-DM members do NOT see canceled sessions

---

## FR-3: Session Status Toggle (Switch)

### Description
Replace the current cancel button (X) with a switch toggle that clearly shows the current state and allows flipping between Scheduled ↔ Canceled.

### Requirements
- Switch toggle visible only to DM/Admin
- Shows current state: ON = Scheduled, OFF = Canceled
- Toggle action:
  - Scheduled → Canceled: Creates/updates override with status "canceled"
  - Canceled → Scheduled: Creates/updates override with status "scheduled"
- State persists via session_overrides table

### UI Specification
```
┌─────────────────────────────────────┐
│ Thu, Jan 23                         │
│ 7:00 PM EST                         │
│                                     │
│ 3 available (2 full, 1 partial)     │
│ ══════════════════ Need 2          │
│                                     │
│ [Scheduled ●───────]  ← Switch ON  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Thu, Jan 30          [Canceled]     │
│ 7:00 PM EST          ← Muted text  │
│                                     │
│ 2 available          Need 2        │
│                                     │
│ [───────● Canceled]  ← Switch OFF  │
└─────────────────────────────────────┘
```

### Acceptance Criteria
- Toggle switch replaces the X button
- Toggle is only visible to DM/Admin users
- Toggling updates the session_overrides table
- UI updates immediately (optimistic or after mutation success)

---

## FR-4: Updated Filtering Logic

### Description
The filtering logic for upcoming sessions must be updated to:
1. Support dev mode with DM availability check
2. Include canceled sessions for DM users
3. Exclude canceled sessions for non-DM users

### Pseudocode
```typescript
const upcomingCandidates = candidatesData?.candidates
  ?.filter(c => {
    const isFuture = new Date(c.scheduledAt) > new Date();

    // DM sees all sessions (scheduled AND canceled)
    if (isDM) {
      if (import.meta.env.DEV) {
        // Dev mode: DM must have availability set
        return isFuture && hasDmAvailabilityForDate(c.scheduledAt);
      }
      // Production: show all future sessions regardless of status
      return isFuture;
    }

    // Non-DM members: only scheduled sessions that meet threshold
    const isScheduled = c.status === "scheduled";
    if (!isScheduled) return false;

    const eligible = getEligibleAttendees(c);
    const threshold = team.minAttendanceThreshold || 2;
    return isFuture && eligible.total >= threshold;
  })
  .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
  .slice(0, 5);
```

### Acceptance Criteria
- DM sees up to 5 upcoming sessions including canceled ones
- Members see only scheduled sessions meeting threshold
- Dev mode requires DM availability

---

## Data Model Changes

No schema changes required. Uses existing `session_overrides` table.

---

## UI Components

### New: Session Status Switch

```tsx
// DM-only switch toggle
{isDM && (
  <div className="flex items-center gap-2">
    <Switch
      checked={candidate.status === "scheduled"}
      onCheckedChange={(checked) => {
        updateSessionOverrideMutation.mutate({
          occurrenceKey: candidate.occurrenceKey,
          status: checked ? "scheduled" : "canceled"
        });
      }}
      disabled={updateSessionOverrideMutation.isPending}
    />
    <Label className="text-xs">
      {candidate.status === "scheduled" ? "Scheduled" : "Canceled"}
    </Label>
  </div>
)}
```

### Updated: Session Card Styling

```tsx
<div
  className={cn(
    "w-full p-3 rounded-md transition-all",
    candidate.status === "canceled"
      ? "bg-muted/30 opacity-60"
      : "bg-muted/50 hover-elevate"
  )}
>
  <div className="flex items-center justify-between mb-2">
    <div className="flex-1">
      <p className={cn(
        "font-medium",
        candidate.status === "canceled" && "line-through text-muted-foreground"
      )}>
        {formatDate(candidate.scheduledAt)}
      </p>
      {candidate.status === "canceled" && (
        <Badge variant="outline" className="ml-2 text-red-500 border-red-500/30">
          Canceled
        </Badge>
      )}
    </div>
    {/* Switch toggle here */}
  </div>
</div>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/pages/schedule.tsx` | Update filtering logic, add switch toggle, add canceled styling |

---

## Test Plan

### Manual Testing
1. **Dev mode + DM availability**
   - Set team recurrence to weekly
   - Verify NO sessions appear in Upcoming Sessions
   - Add availability for the next session date
   - Verify session now appears

2. **Cancel and reinstate flow**
   - As DM, toggle a session to Canceled
   - Verify it shows with "Canceled" badge and muted styling
   - Toggle it back to Scheduled
   - Verify it returns to normal styling

3. **Member visibility**
   - Log in as non-DM member
   - Verify canceled sessions are NOT visible
   - Verify only threshold-meeting scheduled sessions appear

### Unit Tests
- `hasDmAvailabilityForDate()` returns correct boolean
- Filtering logic includes canceled for DM, excludes for members

---

## Acceptance Criteria (Global)

- ✅ Dev mode requires DM availability for sessions to appear
- ✅ DM sees canceled sessions inline with visual distinction
- ✅ Switch toggle allows DM to flip between Scheduled ↔ Canceled
- ✅ Non-DM members cannot see canceled sessions
- ✅ Toggle persists via session_overrides

---

## Implementation Steps

1. Add helper function `hasDmAvailabilityForDate(date: Date): boolean`
2. Update filtering logic to:
   - Check DM availability in dev mode
   - Include canceled sessions for DM users
3. Replace X button with Switch toggle component
4. Add conditional styling for canceled sessions
5. Test all scenarios

---

## Priority

**High** — This fixes a testing blocker and improves DM workflow.
