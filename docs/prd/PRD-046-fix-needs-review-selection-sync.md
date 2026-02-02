# PRD-046: Fix Needs Review Selection Not Syncing with Right Panel

## Problem Statement

When clicking on an item in the "Needs Review" section of the Notes left panel, the item expands to show its details but the right panel continues to display a previously viewed note. This creates confusion because the user sees one item selected/expanded on the left, but different content on the right.

**Steps to reproduce:**
1. Navigate to Notes page with items in "Needs Review"
2. Click "View Note" on item A - right panel shows A's content
3. Click on item B in the "Needs Review" list (without clicking "View Note")
4. Item B expands, but right panel still shows item A

## Root Cause

In `client/src/components/notes/notes-left-panel.tsx`, clicking a "Needs Review" item only toggles the `expandedReviewId` state to expand/collapse the item details:

```typescript
// Line 295 - Only toggles expansion, doesn't select the note
onClick={() => setExpandedReviewId(isExpanded ? null : item.classificationId)}
```

This differs from regular notes in the accordion sections which call `onSelectNote(note)` on click, immediately updating the right panel.

The "View Note" button is the only way to update the right panel from "Needs Review", but users expect clicking an item to show its content (consistent with regular note behavior).

## Solution

When a "Needs Review" item is clicked and expanded, also call `onSelectNote(note)` to show the note in the right panel. This syncs the expanded state with the viewed content.

```typescript
onClick={() => {
  const newExpanded = isExpanded ? null : item.classificationId;
  setExpandedReviewId(newExpanded);
  // When expanding (not collapsing), also select the note for viewing
  if (newExpanded && note) {
    onSelectNote(note);
  }
}}
```

## Acceptance Criteria

1. Clicking a "Needs Review" item expands it AND shows its note in the right panel
2. Clicking a different "Needs Review" item collapses the previous, expands the new, and updates the right panel
3. Collapsing an item (clicking it again) does not change the right panel
4. "View Note" button continues to work as before

## Files to Modify

- `client/src/components/notes/notes-left-panel.tsx` - Update click handler for "Needs Review" items

## Status
Done

## Implementation Notes
- Modified: `client/src/components/notes/notes-left-panel.tsx` (line 295)
- Fix: Added `onSelectNote(note)` call when expanding a "Needs Review" item
- Only selects note when expanding (not collapsing) and when note exists
- Test coverage: Manual testing - click behavior now matches user expectations
