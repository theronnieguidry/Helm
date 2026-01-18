# PRD-011A — Nuclino Import: Attribution, Visibility, and Rollback/Delete Imports

## Story Status
Proposed (Follow-up to PRD-011)

---

## Parent Story
**PRD-011 — Nuclino ZIP Import (MVP)**

This sub-PRD adds missing operational requirements:
- proper attribution to the importing user
- visibility controls for imported notes
- ability to delete/rollback an import run

---

## Summary

When importing notes from Nuclino, Helm must:
1. Attribute imported notes to the user who performed the import
2. Allow the importer to choose whether imported notes are:
   - Private (only visible to them)
   - Team-shared (visible to all team members)
3. Track imports as a first-class “Import Run”
4. Provide an Import Management screen to view and delete prior imports
5. Deleting an import removes all imported notes created by that import run

---

## Goals

- Ensure imported notes are owned/attributed correctly
- Give the user safe control over whether imports are private or shared
- Provide a “panic button” to cleanly remove an import if something goes wrong
- Make imported content auditable and reversible

---

## Non-Goals

- This PRD does not add granular per-note visibility defaults beyond Private/Shared
- This PRD does not implement “merge import runs together”
- This PRD does not implement partial delete of an import run (all-or-nothing)

---

## Functional Requirements

---

## FR-1: Importer Attribution on Imported Notes

### Description
All imported notes must store the identity of the importing user.

### Requirements
When committing an import run:
- Each created note must have:
  - `createdByUserId = importingUserId`
  - `updatedByUserId = importingUserId`
- Each created note must store:
  - `importRunId` (see FR-3)

### Acceptance Criteria
- Imported notes show the importer as the author/creator in the UI
- Audit fields reflect the importing user accurately

---

## FR-2: Default Visibility Selection During Import

### Description
Import flow must allow the user to choose the default visibility for imported notes.

### Requirements
During import preview step, add visibility selection:
- **Private (only me)**
- **Shared with team**

Default selection:
- Private (recommended safety default)

This default is applied to all imported notes unless overridden later.

### Acceptance Criteria
- Imported notes respect the selected default visibility
- Private imports are not visible to other team members
- Shared imports are visible to team members

---

## FR-3: Import Run Tracking

### Description
Each import action must be stored as an Import Run record.

### Requirements
Create `import_runs` record per import commit:
- `id`
- `teamId`
- `sourceSystem` = "NUCLINO"
- `createdByUserId` (importer)
- `createdAt`
- `status` = Completed | Failed
- `options`:
  - `importEmptyPages`
  - `defaultVisibility`
- `stats`:
  - totalPagesDetected
  - notesCreated
  - notesUpdated
  - notesSkipped
  - emptyPagesImported
  - linksResolved
  - warningsCount

Each imported note must store:
- `importRunId`

### Acceptance Criteria
- Every import commit produces a persisted Import Run record
- Imported notes can be traced back to their import run

---

## FR-4: Import Management Screen

### Description
Users must be able to view prior imports and manage them.

### Requirements
Add Settings page section:
**Settings → Imports**

Display list of import runs:
- source (Nuclino)
- imported by (user)
- date/time
- stats summary
- action buttons:
  - View details
  - Delete import

Permissions:
- Importer can delete their own import
- DM role can delete any import in the team

### Acceptance Criteria
- Import runs list is visible and accurate
- Permissions enforced correctly

---

## FR-5: Delete / Rollback Import Run

### Description
Deleting an import run should remove all notes created by that run.

### Requirements
When deleting an import run:
- Delete all notes where:
  - `importRunId = X`
- Also delete associated objects created during import:
  - link records (`note_links`) created for those notes
  - enrichment records if PRD-012 is enabled (optional)
- Notes that were “updated” instead of created should not be deleted:
  - they should remain, but their content may require restore (see FR-6)

### Acceptance Criteria
- Notes created by import are removed from the UI immediately
- Internal links no longer reference deleted notes
- Import run record is either:
  - deleted, OR
  - marked as `Deleted` with tombstone metadata

---

## FR-6 (Optional but Recommended): Restore Updated Notes on Rollback

### Description
If re-import updated existing notes, rollback should restore prior content.

### Requirements
If a note is updated during import, store a snapshot:
- `note_import_snapshots`
  - `noteId`
  - `importRunId`
  - `previousTitle`
  - `previousMarkdown`
  - `previousResolvedMarkdown`
  - `previousNoteType`
  - `previousQuestStatus`
  - `createdAt`

On rollback:
- restore note fields from snapshot

### Acceptance Criteria
- Updated notes return to pre-import state after rollback
- Snapshot storage is limited to import updates only

---

## Data Model Changes

### import_runs
- id
- teamId
- sourceSystem
- createdByUserId
- createdAt
- status
- options (json)
- stats (json)

### notes (add fields)
- importRunId (nullable)
- createdByUserId
- updatedByUserId
- visibility ("Private" | "Team")

### note_import_snapshots (optional)
- noteId
- importRunId
- previous fields...

---

## Acceptance Criteria (Global)

- ✅ Imported notes are attributed to the importer
- ✅ Import preview allows selecting Private vs Shared defaults
- ✅ All imports create an Import Run record
- ✅ Settings → Imports displays history
- ✅ Importer/DM can delete an import run
- ✅ Delete removes all notes created by that import
- ✅ Optional: rollback restores updated notes if snapshots enabled

---

## Test Plan

### Unit Tests
- Imported notes receive correct `createdByUserId`
- Visibility default is applied correctly
- Import run stats computed correctly
- Deletion removes only notes created by importRunId
- Snapshot creation occurs only for updated notes (if enabled)

### Integration Tests
- Import with Private visibility:
  - other user cannot see notes
- Import with Team visibility:
  - other user can see notes
- Delete import:
  - created notes removed
  - import run removed/marked deleted
- Rollback restores updated notes (if enabled)

---

## Priority

High — operational safety + correct attribution is required for real-world use.

---

## Implementation Notes

- Always store `importRunId` for traceability
- Default imported notes to Private to avoid accidental team-wide dump
- Rollback snapshots are strongly recommended because upserts are otherwise irreversible

---
