# PRD-037: Low-Confidence Warning Tooltips and Needs Review Section

## Problem

In the AI Import Preview dialog, warning triangles (AlertTriangle icons) indicate low-confidence AI classifications, but:
1. There is no tooltip or explanation - users don't know what the warning means
2. Users aren't informed they can review and correct these after import
3. After import, there is no centralized way to find and review low-confidence items

## Solution

### Feature 1: Tooltips on Warning Triangles
Add tooltips to the low-confidence warning indicators in the AI Import Preview dialog that explain:
- What low confidence means (AI is less than 65% sure about this classification)
- That users can review and correct these after import in the Notes screen

### Feature 2: "Needs Review" Section in Notes Left Panel
Add a collapsible section in the Notes screen left panel that:
- Shows a count of items with pending low-confidence classifications
- Lists items with their title, inferred type, and confidence indicator
- Allows clicking to navigate directly to the note for review
- Only appears when there are items needing review

## Acceptance Criteria

### Feature 1: Tooltips
1. Hovering over a warning triangle in the Classifications tab shows a tooltip
2. Hovering over a warning triangle in the Relationships tab shows a tooltip
3. Tooltip text explains low confidence (< 65%) and mentions post-import review

### Feature 2: Needs Review Section
1. A "Needs Review" section appears in the Notes left panel when low-confidence items exist
2. The section shows a count badge with the number of items
3. Each item displays the note title, inferred type, and confidence indicator
4. Clicking an item navigates to that note in the editor
5. The section is hidden when no items need review
6. Approving/rejecting a classification removes it from the list

## Technical Approach

### Feature 1
- Import Tooltip components from shadcn/ui
- Wrap AlertTriangle icons at lines 375 and 409 with tooltip

### Feature 2
- Add storage method `getPendingLowConfidenceClassifications(teamId)`
- Add API endpoint `GET /api/teams/:teamId/notes/needs-review`
- Add useQuery in notes.tsx to fetch needs-review data
- Add collapsible "Needs Review" section in NotesLeftPanel

## Files to Modify

- `client/src/components/ai-import-diff-preview.tsx` - Add tooltips
- `server/storage.ts` - Add storage method
- `server/test/memory-storage.ts` - Add test implementation
- `server/routes.ts` - Add API endpoint
- `client/src/pages/notes.tsx` - Add data fetching
- `client/src/components/notes/notes-left-panel.tsx` - Add UI section

## New Files

- `server/needs-review.api.test.ts` - API tests

## Status

Done

## Implementation Notes

### Files Modified
- `client/src/components/ai-import-diff-preview.tsx` - Added tooltip imports and wrapped AlertTriangle icons at lines 381-393 (classifications) and 427-439 (relationships) with TooltipProvider/Tooltip
- `server/storage.ts` - Added `getPendingLowConfidenceClassifications` method to IStorage interface and DatabaseStorage implementation with join on notes table
- `server/test/memory-storage.ts` - Added MemoryStorage implementation
- `server/routes.ts` - Added `GET /api/teams/:teamId/notes/needs-review` endpoint
- `server/test/test-routes.ts` - Added test route implementation
- `client/src/pages/notes.tsx` - Added useQuery for needs-review data
- `client/src/components/notes/notes-left-panel.tsx` - Added collapsible "Needs Review" section with amber styling

### New Files
- `server/needs-review.api.test.ts` - 7 API tests covering all acceptance criteria

### Technical Decisions
- Confidence threshold set at 0.65 (matching existing LOW_CONFIDENCE threshold)
- Results sorted by confidence ascending (lowest confidence items shown first)
- Section only renders when there are items to review
- Confidence indicator uses yellow dot (>= 0.5) or gray dot (< 0.5)

### Test Coverage
- 7 tests in `server/needs-review.api.test.ts`:
  - Empty state
  - Low-confidence pending items returned
  - High-confidence items excluded
  - Approved items excluded
  - Sorted by confidence ascending
  - Non-member access rejected
  - Team isolation verified
