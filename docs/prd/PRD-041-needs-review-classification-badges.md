# PRD-041: Needs Review Classification Badges

## Summary

Replace plain text classification labels in the Needs Review panel with styled badges that match the existing entity type color scheme used throughout the notes system.

## Background

The Needs Review panel on the `/notes` page displays AI-classified entities with low confidence that need human review. Currently, the classification type (NPC, Area, Quest, etc.) is shown as plain text. However, the codebase already has a well-established badge system with colors and icons for each entity type used in `notes-editor-panel.tsx` and `notes-item-preview.tsx`.

Using these existing badges in the Needs Review panel would:
- Provide better visual distinction between classification types
- Create consistency with the rest of the notes UI
- Make scanning the review queue faster and more intuitive

## Current State

In `client/src/components/notes/notes-left-panel.tsx` (lines 262-280), the classification type is displayed as:
```tsx
<span className="text-xs text-muted-foreground">
  {item.inferredType}
</span>
```

## Proposed Change

Replace plain text labels with styled badges matching the existing color scheme:

| Entity Type | Icon | Colors |
|---|---|---|
| Area | MapPin | `bg-blue-500/10 text-blue-500` |
| Character | User | `bg-green-500/10 text-green-500` |
| NPC | Users | `bg-orange-500/10 text-orange-500` |
| Quest | ScrollText | `bg-red-500/10 text-red-500` |
| SessionLog | BookOpen | `bg-amber-500/10 text-amber-500` |
| Note | FileText | `bg-gray-500/10 text-gray-500` |

## Requirements

### Functional Requirements
1. Each classification type in the Needs Review panel displays as a colored badge with icon
2. Badge styling matches the existing pattern in `notes-editor-panel.tsx`
3. Badge includes both icon and text label

### Visual Requirements
1. Badge has rounded corners (`rounded-full` or `rounded-md`)
2. Badge uses 10% opacity background with matching text color
3. Icon is appropriately sized (e.g., `h-3 w-3`)
4. Badge is compact to fit within the review item layout

### Technical Requirements
1. Reuse or extract the existing type-to-style mapping from `notes-editor-panel.tsx`
2. Keep the badge rendering logic DRY - consider creating a shared component or utility

## Acceptance Criteria

- [ ] All 6 classification types display with appropriate colored badges
- [ ] Each badge includes the correct icon for its type
- [ ] Badge styling is consistent with badges used elsewhere in the notes UI
- [ ] Visual appearance is balanced within the review item layout
- [ ] No regressions in Needs Review functionality (approve/reject/reclassify still work)

## Files to Modify

1. `client/src/components/notes/notes-left-panel.tsx` - Update Needs Review item rendering

### Optional Refactoring
Consider extracting a shared `NoteTypeBadge` component that can be used by:
- `notes-left-panel.tsx` (Needs Review)
- `notes-editor-panel.tsx` (Editor header)
- `notes-item-preview.tsx` (Note list items)

## Status

Done

## Implementation Notes

- Modified: `client/src/components/notes/notes-left-panel.tsx`
- Added mapping constants for inferredType → NoteType conversion
- Added `NOTE_TYPE_COLORS`, `NOTE_TYPE_ICONS`, and `INFERRED_TYPE_LABELS` constants
- Replaced plain text `<span>` with styled `<Badge>` component including icon
- Badge styling matches existing pattern in `notes-editor-panel.tsx`
- All existing needs-review API tests pass (7/7)
