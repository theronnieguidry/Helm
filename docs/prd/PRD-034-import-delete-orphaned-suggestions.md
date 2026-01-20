# PRD-034 — Import Delete Orphans Suggestion-Created Entities

## Story Status
Completed

## Summary
When deleting an import from the Settings page, entities created via the Suggestions panel (while typing notes into a session) are not cleaned up. This leaves orphaned data in the database.

---

## Bug Description

### Observed Behavior
1. User imports notes via Nuclino import
2. User opens a session log from the import
3. User types content that triggers entity suggestions
4. User accepts suggestions, creating new entity notes and backlinks
5. User deletes the import from Settings page
6. **Bug:** The suggestion-created entities and backlinks remain in the database

### Expected Behavior
When an import is deleted, all related data should be cleaned up, including:
- Notes created by the import (currently works)
- Notes updated by the import (currently works - restored from snapshots)
- Entities created via Suggestions panel while working with imported content

### Root Cause
The Suggestions panel creates entities with `importRunId = NULL`. There is no tracking mechanism to link suggestion-created entities back to the import that originated the session content.

---

## Implementation

### Solution
Propagate `importRunId` from the session log to entities created from its suggestions. When the import is deleted, these entities will cascade-delete along with imported notes.

### Changes Required

1. **`client/src/components/notes/notes-editor-panel.tsx`**
   - Pass full `sessionNote` object instead of just `sessionNoteId` to `EntitySuggestionsPanel`

2. **`client/src/components/notes/entity-suggestions-panel.tsx`**
   - Update interface to accept `sessionNote?: Note | null`
   - Extract `importRunId` from session note
   - Pass `importRunId` when creating notes via mutation

3. **`server/routes.ts`**
   - Accept optional `importRunId` in POST `/api/teams/:teamId/notes` endpoint
   - Pass through to `storage.createNote()`

### Design Decisions

- **No schema change for backlinks**: Backlinks cascade-delete when their notes are deleted via existing logic in `storage.ts`
- **No migration for existing orphans**: They can be manually deleted; a migration would be error-prone
- **Rely on existing cascade logic**: `deleteNotesByImportRun()` already handles backlink cleanup

---

## Testing

### New Tests
- Suggestion-created notes with `importRunId` are deleted when import is deleted
- Manual notes without `importRunId` are NOT affected when import is deleted
- Backlinks cascade correctly when notes are deleted

### Manual Verification
1. Import notes via Nuclino dialog
2. Open an imported session, trigger entity suggestions
3. Accept suggestions to create entities
4. Verify new entities have `importRunId` set in database
5. Delete the import from Settings
6. Verify all suggestion-created entities are removed
7. Verify manually-created entities are untouched

---

## Acceptance Criteria

- [x] Entities created from Suggestions panel inherit `importRunId` from session log
- [x] Deleting import removes suggestion-created entities with matching `importRunId`
- [x] Manually-created entities (no `importRunId`) are not affected by import deletion
- [x] Backlinks are cleaned up when their source/target notes are deleted
- [x] All existing tests continue to pass
- [x] New tests added for cascade delete functionality
