# PRD-012 — Upcoming Sessions Should Span Multiple Months

## Story Status
Implemented

---

## Parent Story
**PRD-010A — Upcoming Sessions: Partial Availability, Session Duration, Eligibility**

This PRD fixes a bug where upcoming sessions were effectively limited to the current calendar month due to a mismatch between how session candidates and user availability were fetched.

---

## Summary

The Upcoming Sessions panel should display the next 5 eligible sessions regardless of which month they fall in. A bug was causing sessions beyond the current calendar month to not appear because the `userAvailability` query only fetched data for the current month, preventing eligibility calculation for future months.

---

## Problem

**Root cause:**
- Session candidates were correctly fetched for 2 months ahead
- User availability was only fetched for the current calendar month
- Eligibility calculation requires availability data
- Sessions in future months couldn't have eligibility calculated → they didn't appear

**Example:**
- Today is January 17th
- Weekly sessions are scheduled for Fridays
- Only 2 Fridays remain in January (Jan 24, Jan 31)
- User sets availability for Feb 7, Feb 14, Feb 21
- Before fix: Only Jan 24 and Jan 31 would appear (if eligible)
- After fix: All 5 upcoming Fridays can appear if eligible

---

## Goals

- Display the next 5 eligible sessions spanning into future months
- Maintain consistency between session candidates and availability data fetching
- No changes to the 5-session limit or eligibility calculation logic

---

## Non-Goals

- This PRD does not change the 5-session display limit
- This PRD does not change eligibility calculation rules
- This PRD does not add infinite scrolling or "load more" functionality

---

## Functional Requirements

### FR-1: Expand User Availability Query Date Range

**Description:**
The user availability query should fetch data for the same date range as session candidates (2 months ahead from today).

**Before:**
```typescript
const monthStart = startOfMonth(currentMonth);
const monthEnd = endOfMonth(currentMonth);

const { data: userAvailability } = useQuery({
  queryFn: () => fetch(`/user-availability?startDate=${monthStart}&endDate=${monthEnd}`)
});
```

**After:**
```typescript
const candidatesStartDate = new Date();
const candidatesEndDate = addMonths(candidatesStartDate, 2);

const { data: userAvailability } = useQuery({
  queryFn: () => fetch(`/user-availability?startDate=${candidatesStartDate}&endDate=${candidatesEndDate}`)
});
```

**Acceptance Criteria:**
- User availability data is fetched for 2 months ahead
- Eligibility can be calculated for sessions in future months
- Upcoming Sessions panel shows next 5 eligible sessions regardless of month

---

## Data Model Changes

None. This fix only changes the client-side query parameters.

---

## Files Modified

| File | Change |
|------|--------|
| `client/src/pages/schedule.tsx` | Changed userAvailability query to use `candidatesStartDate` and `candidatesEndDate` instead of `monthStart` and `monthEnd` |

---

## Implementation Details

**Line changed:** `client/src/pages/schedule.tsx` (lines 229-240)

The `userAvailability` query now uses the same date range variables as the session candidates query:
- `candidatesStartDate` = today
- `candidatesEndDate` = 2 months from today

This ensures availability data is available for all session candidates, allowing proper eligibility calculation across months.

---

## Verification

1. **Manual testing:**
   - Set availability for dates in the next month
   - Verify sessions from next month appear in "Upcoming Sessions" panel
   - Verify the 5-session limit still applies across months

2. **Automated tests:**
   - All 297 existing tests pass

---

## Acceptance Criteria (Global)

- [x] Upcoming sessions panel shows next 5 sessions spanning multiple months
- [x] Eligibility calculation works for sessions in future months
- [x] Calendar still displays correctly (uses separate `monthStart`/`monthEnd` for day rendering)
- [x] All existing tests pass (297/297)

---

## Test Plan

### Regression Tests
- Existing tests verify no regressions in:
  - Session candidate generation
  - User availability API
  - Eligibility calculation

### Manual Testing
1. Navigate to Schedule page near end of month
2. Set availability for dates in next month
3. Verify those sessions appear in Upcoming Sessions panel

---

## Priority

**High** — This was a bug preventing core functionality from working correctly.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-17 | Initial implementation |
