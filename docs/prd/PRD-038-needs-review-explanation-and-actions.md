# PRD-038: Needs Review Panel - AI Explanation Display and Action UI

## Problem

After completing a Nuclino import with AI enrichment, users see a "Needs Review" panel listing low-confidence items. However:

1. **Missing context**: The backend returns an `explanation` field with AI reasoning, but this is **never displayed** to the user
2. **No actions available**: Users cannot approve, reject, or reclassify items directly from the panel

## Solution

Add expandable list items in the Needs Review panel that reveal:
1. The AI explanation text explaining why the item was classified and flagged
2. Action buttons: Approve, Reject, and a Reclassify dropdown

## Technical Approach

### Backend Changes

Extend the PATCH `/api/teams/:teamId/classifications/:classificationId` endpoint to accept an optional `overrideType` parameter. When provided with an approval, use this type instead of the original `inferredType`.

### Frontend Changes

1. **NotesLeftPanel Component**: Modify needs-review item rendering to be expandable:
   - Click to expand/collapse (instead of navigating)
   - When expanded, show AI explanation text
   - Action buttons: Approve, Reject, Reclassify dropdown
   - "View Note" link for navigation

2. **Notes Page**: Add mutation hooks for approve/reject/reclassify actions that invalidate the needs-review query on success.

## Files to Modify

- `server/routes.ts` - Extend PATCH classification endpoint
- `client/src/components/notes/notes-left-panel.tsx` - Expandable UI with actions
- `client/src/pages/notes.tsx` - Mutation hooks and callbacks

## Acceptance Criteria

1. [x] Clicking a needs-review item expands it (doesn't navigate away)
2. [x] Expanded item shows AI explanation text
3. [x] Approve button marks classification as approved and removes from list
4. [x] Reject button marks classification as rejected and removes from list
5. [x] Reclassify dropdown allows changing the type before approving
6. [x] "View Note" link navigates to the note in the editor
7. [x] Count badge updates after each action
8. [x] Loading/disabled states during API calls
9. [x] Needs Review list is scrollable when items exceed viewport height

## Status

Done

## Implementation Notes

### Files Modified

- `server/routes.ts` (lines 1589-1599, 1654): Extended PATCH classification endpoint to accept optional `overrideType` parameter for reclassification
- `client/src/components/notes/notes-left-panel.tsx`: Added expandable review items with AI explanation display and action buttons (Approve, Reject, Reclassify dropdown, View Note link)
- `client/src/pages/notes.tsx`: Added `updateClassification` mutation hook and handler functions for approve/reject/reclassify actions

### Technical Decisions

- Used single mutation for all three actions (approve, reject, reclassify) with different parameters to simplify state management
- Reclassify dropdown filters out the current inferred type to avoid confusion
- Added `isReviewActionPending` prop to disable all action buttons during API calls
- Expanded items show the AI explanation in a styled muted box for clear visual distinction
- Moved Needs Review section inside ScrollArea to fix scrolling bug (items were cut off when list exceeded viewport)

### Test Coverage

- Existing tests in `server/needs-review.api.test.ts` (7 tests) and `server/enrichment.api.test.ts` (30 tests) all pass
- Backend endpoint already had good test coverage; new `overrideType` parameter validates against allowed types
