# PRD-032: Settings Screen Auto-Save (Remove Save Buttons)

## Status
**Completed**

## Problem Statement
The Settings screen has two manual save buttons ("Save Changes" for team settings, "Save Character" for character info) that require explicit user action. The AI Features toggle already auto-saves. This inconsistency creates a poor UX where users may forget to save changes.

## Goal
Remove the need for both save buttons by implementing auto-save for all settings fields.

## Findings

### Current Save Mechanisms

| Category | Fields | Current Behavior |
|----------|--------|------------------|
| **AI Features** | Enable AI toggle | Auto-saves immediately |
| **Character Info** | Name, Type1, Type2, Description | Requires "Save Character" button |
| **Team Settings** | Name, Dice Mode, Recurrence, Day/Days, Time, Timezone, Duration, Threshold | Requires "Save Changes" button |

### Key Files
- `client/src/pages/settings.tsx` - Settings page component (main file to modify)
- `client/src/hooks/use-autosave.ts` - Existing auto-save hook to reuse
- `server/routes.ts` - API endpoints (no changes needed - already supports PATCH)

## Implementation Notes

### Approach: Use Existing `useAutosave` Hook

The project has a robust `useAutosave` hook at `client/src/hooks/use-autosave.ts` that provides:
- Debounced saves (configurable, using 500ms)
- Max wait time between saves
- Status tracking: `idle | pending | saving | saved | error`
- Deep comparison for data changes
- Pending save queue during active saves

### Changes Made

1. **Team settings auto-save**: Replace `updateTeamMutation` with `useAutosave` hook
2. **Character info auto-save**: Replace `updateCharacterMutation` with `useAutosave` hook
3. **Remove buttons**: Delete "Save Changes" and "Save Character" buttons from UI
4. **Visual feedback**: Show save status indicator

## Acceptance Criteria
- [x] "Save Changes" button removed from UI
- [x] "Save Character" button removed from UI
- [x] All team setting fields auto-save
- [x] All character fields auto-save
- [x] Visual feedback shows save status
- [x] Error handling maintains local state on failure
- [x] Tests pass (474 unit/integration tests passing)
