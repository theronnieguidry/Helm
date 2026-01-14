# PRD-001: Session Logs

## Status

| Field | Value |
|-------|-------|
| Status | 🟢 Done |
| Priority | P0 (Foundation) |
| Assignee | Claude |
| Started | 2026-01-13 |
| Completed | 2026-01-13 |

## Overview

**Problem**: During live tabletop sessions, note-takers face cognitive overload when asked to categorize and structure notes in real-time. This interrupts gameplay flow and causes information loss.

**Solution**: Introduce a new "Session Log" note type optimized for chronological, unstructured capture during live play. Structure emerges later through post-session review (see PRD-003).

## Background

### Current State
The existing notes system supports 5 types: `location`, `character`, `npc`, `poi`, `quest`. Each requires structured input (title, type selection, content) which creates friction during fast-paced gameplay.

### Design Principle
**Session-first, structure-later**: During play, the note-taker should never be asked to decide structure. Structure should emerge after, assisted by the system.

## Requirements

### Functional Requirements

**FR-1: Session Log Note Type**
- Add `session_log` to the note type enum
- Session logs are date-anchored (one per session date)
- Default visibility: private to author

**FR-2: Autosave Behavior**
- Content autosaves without user action
- Debounce: 2 second idle minimum
- Hard limit: 15 second maximum between saves
- Visual indicator shows save status (saved/saving/error)

**FR-3: Block-Based Content**
- Content stored as blocks (paragraphs) rather than plain text
- Each block has a unique ID for precise backlink references
- Blocks support entity attachment metadata

**FR-4: Quick Access**
- One-click creation of new session log for current date
- Session logs appear in a dedicated "Sessions" tab separate from structured notes
- Chronological ordering (newest first)

### Acceptance Criteria

- [ ] Session Log edits autosave without triggering entity creation
- [ ] Typing latency remains under 50ms during autosave
- [ ] Session logs load in under 2 seconds
- [ ] Private session logs are never visible to non-authors
- [ ] Block IDs remain stable across edits for backlink integrity

## User Stories

**US-1**: As a note-taker during a session, I want to capture information quickly without choosing categories, so that I don't interrupt the game flow.

**US-2**: As a DM reviewing past sessions, I want to see my session logs in chronological order, so that I can find notes from specific game dates.

**US-3**: As a player, I want my session logs to remain private by default, so that I can record personal observations without sharing them.

## Technical Notes

### Schema Changes

```typescript
// Add to noteTypeEnum in shared/schema.ts
export const noteTypeEnum = pgEnum('note_type', [
  'location', 'character', 'npc', 'poi', 'quest', 'session_log'
]);

// Add to notes table
sessionDate: date("session_date"),  // Optional, for session_log type
contentBlocks: json("content_blocks").$type<ContentBlock[]>(),
```

```typescript
// Block structure
interface ContentBlock {
  id: string;           // UUID for stable references
  content: string;      // Block text
  entityRefs?: string[]; // Linked entity IDs
  createdAt: string;    // ISO timestamp
}
```

### API Changes
- Existing CRUD endpoints work without modification
- Add `GET /api/teams/:teamId/notes/sessions` for session-log-only listing

### UI Components
- New "Sessions" tab in notes page navigation
- Session log editor with autosave indicator
- Date header for each session log

## Test Requirements

### Unit Tests (`shared/session-logs.test.ts`)
- Block ID generation uniqueness
- Content block serialization/deserialization
- Autosave debounce logic (mock timers)
- Block manipulation utilities (insert, delete, merge)

### Integration Tests (`server/session-logs.api.test.ts`)
- `POST /api/teams/:teamId/notes` with `session_log` type
- `GET /api/teams/:teamId/notes/sessions` returns only session logs
- Autosave endpoint handles rapid sequential updates
- Private session logs not visible to other team members
- Session date filtering and ordering

### Test Scenarios
| Scenario | Expected Result |
|----------|-----------------|
| Create session log with minimal fields | Success, defaults to private |
| Create session log with same date | Both coexist (no uniqueness constraint) |
| Update content blocks | Block IDs preserved, timestamps updated |
| Non-member accesses session log | 403 Forbidden |
| Delete session log | Cascades to remove backlinks (PRD-005) |

### Coverage Target
- 80%+ line coverage for shared utilities
- All API endpoints have success and error path tests

## Implementation

*To be completed upon implementation.*

### Schema Changes
- [ ] Add `session_log` to `noteTypeEnum`
- [ ] Add `sessionDate` column to notes table
- [ ] Add `contentBlocks` JSON column to notes table

### API Changes
- [ ] Update `POST /api/teams/:teamId/notes` to handle session_log type
- [ ] Add `GET /api/teams/:teamId/notes/sessions` endpoint

### UI Changes
- [ ] Add "Sessions" tab to notes page
- [ ] Create session log editor component with autosave
- [ ] Add save status indicator

### Files Modified
*List files here after implementation:*
- `shared/schema.ts`
- `server/routes.ts`
- `client/src/pages/notes.tsx`
- ...

### Migration Notes
*Document any migration steps required.*

## Dependencies

- **Depends on**: None (foundational feature)
- **Enables**: PRD-002 (Entity Detection), PRD-003 (Post-Session Review), PRD-005 (Backlinks)

## Open Questions

1. Should session logs support collaborative editing (multiple authors same session)?
2. Should we support merging multiple session logs from the same date?
3. Rich text formatting requirements (bold, italic, headers)?
