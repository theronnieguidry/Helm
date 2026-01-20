# PRD-036: AI Import Preview Relationships Tab Overflow Fix

## Problem

When viewing the Relationships tab in the AI Import Preview dialog, long relationship descriptions cause horizontal overflow, breaking the modal layout:

1. The modal expands beyond its intended width
2. Stat cards stretch horizontally to accommodate overflow
3. Footer buttons ("Cancel", "Confirm AI Enhanced Import") are pushed off-screen or hidden
4. Only the "Back" button remains visible in the footer

## Solution

Apply text wrapping and overflow handling to the Relationships tab content so that long text wraps within the modal bounds instead of expanding the container.

## Acceptance Criteria

1. Relationship descriptions wrap to multiple lines when they exceed the available width
2. The modal maintains a consistent width regardless of content length
3. All footer buttons remain visible and accessible
4. Stat cards maintain their intended layout (2x2 grid on each side)
5. The Relationships list remains scrollable vertically when content exceeds the visible area

## Technical Approach

- Add `overflow-wrap: break-word` or `word-wrap: break-word` to relationship description text
- Ensure the relationship list container has `overflow-x: hidden` to prevent horizontal scroll
- Apply `max-width: 100%` constraints to text containers within the relationships list
- Consider adding `text-overflow: ellipsis` with a tooltip for extremely long single words if needed

## Files to Modify

- `client/src/components/ai-import-diff-preview.tsx` - Add CSS classes/styles for text wrapping

## Status

Done

## Implementation Notes

Modified: `client/src/components/ai-import-diff-preview.tsx`

CSS fixes applied:
- Added `overflow-x-hidden` to main container (line 94)
- Added `min-w-0` to stat cards grid to prevent expansion (line 116)
- Added `overflow-x-hidden` to relationships ScrollArea (line 251)
- Added `min-w-0` to RelationshipRow flex container (line 413)
- Added `flex-1 min-w-0` to entity title spans to allow proper truncation (lines 414, 420)
- Changed evidence snippet from `truncate` to `break-words` to allow text wrapping (line 443)
