# PRD-023: Duplicate Session Entries Race Condition

## Status
**Phase 1 Complete** - Server-side idempotency implemented and tested

## Problem Statement
When creating a new session entry for today, multiple database entries are being created for the same date. This occurs when the user begins typing quickly in an empty "today" session, resulting in duplicate session logs with partial content.

## Evidence from Database

Two session entries were found with the same date (2026-01-18):

| Field | Entry 1 (shorter) | Entry 2 (full) |
|-------|-------------------|----------------|
| id | `37e717b9-...` | `a759ed6f-...` |
| title | "2026-01-18" | "2026-01-18" |
| content | "M" | "Misty Vale is the region..." |
| session_date | 09:11:14.071Z | 09:11:14.418Z |
| created_at | 09:11:14.413Z | 09:11:14.445Z |

**Key observations:**
- Entries created **32ms apart** (`created_at` difference)
- `session_date` timestamps are **347ms apart** (when `new Date().toISOString()` was called client-side)
- The "M" entry appears to be partial content captured mid-typing
- The second entry has the full intended content

## Root Cause Analysis

### Code Flow
The session creation flow in `notes-editor-panel.tsx:197-231`:

1. User types in "today mode" without an existing session
2. Autosave hook detects data change after 750ms debounce
3. `handleAutosave` checks conditions:
   ```typescript
   if (isTodayMode && !todaySession && !hasCreatedToday) {
     if (data.content.trim() && !isCreatingRef.current) {
       isCreatingRef.current = true;
       await createSessionMutation.mutateAsync(data.content);
     }
   }
   ```

### Race Condition Location

The `isCreatingRef` protection fails due to timing issues:

1. **First save starts**: `isCreatingRef.current = true`, API request fires
2. **Autosave queues pending data** (user continued typing)
3. **First save completes**:
   - `onSuccess` sets `hasCreatedToday = true` (React async state update)
   - `finally` block sets `isCreatingRef.current = false`
   - Autosave processes pending data queue immediately
4. **Pending save executes**:
   - `hasCreatedToday` is still `false` (React hasn't re-rendered)
   - `isCreatingRef.current` is `false` (just reset in finally)
   - **Second session is created**

### Contributing Factors

1. **React State Batching**: `setHasCreatedToday(true)` doesn't update immediately
2. **Autosave Pending Queue**: Processes queued saves before React state updates propagate
3. **No Server-Side Idempotency**: API creates session without checking for existing one
4. **No Database Constraint**: No unique constraint on `(teamId, noteType, DATE(sessionDate))`

## Affected Files

- `client/src/components/notes/notes-editor-panel.tsx` - Session creation logic
- `client/src/hooks/use-autosave.ts` - Autosave pending queue processing
- `server/routes.ts` - POST /api/teams/:teamId/notes endpoint
- `server/storage.ts` - `createNote` and `findSessionByDate` methods
- `shared/schema.ts` - Notes table definition

## Proposed Solution

### Option A: Server-Side Idempotency (Recommended)
Add check in the create note endpoint to return existing session if one exists for today.

**Pros:** Definitive fix, handles all client-side race conditions
**Cons:** Changes API semantics slightly (POST may return existing resource)

### Option B: Database Unique Constraint
Add partial unique index on `(team_id, DATE(session_date))` where `note_type = 'session_log'`.

**Pros:** Guarantees data integrity at database level
**Cons:** Requires migration, returns error (not existing resource)

### Option C: Client-Side Lock Improvement
Replace `isCreatingRef` with a more robust mechanism that persists through React state updates.

**Pros:** Fixes client without server changes
**Cons:** Still vulnerable to multi-tab scenarios

### Recommended Approach: A + B Combined

1. **Server-side idempotency** for graceful handling
2. **Database constraint** as safety net

## Implementation Plan

### Phase 1: Server-Side Fix

1. Modify `POST /api/teams/:teamId/notes` in `server/routes.ts`:
   ```typescript
   // For session_log type, check if one already exists for today
   if (noteType === "session_log" && sessionDate) {
     const existing = await storage.findSessionByDate(teamId, new Date(sessionDate));
     if (existing) {
       // Return existing session instead of creating duplicate
       return res.status(200).json(existing);
     }
   }
   ```

2. Add test case in `server/api.test.ts` for idempotent session creation

### Phase 2: Database Constraint (Optional Safety Net)

1. Add migration for partial unique index:
   ```sql
   CREATE UNIQUE INDEX notes_unique_session_per_day
   ON notes (team_id, DATE(session_date))
   WHERE note_type = 'session_log';
   ```

### Phase 3: Data Cleanup

1. Query and remove duplicate session entries:
   ```sql
   -- Find duplicates (keep the one with most content)
   DELETE FROM notes n1
   WHERE n1.note_type = 'session_log'
   AND EXISTS (
     SELECT 1 FROM notes n2
     WHERE n2.team_id = n1.team_id
     AND n2.note_type = 'session_log'
     AND DATE(n2.session_date) = DATE(n1.session_date)
     AND LENGTH(n2.content) > LENGTH(n1.content)
   );
   ```

## Acceptance Criteria

1. Creating a session for today only creates one database entry
2. Rapid typing in an empty session does not create duplicates
3. Existing sessions are updated, not duplicated
4. Multi-tab usage does not create duplicates
5. Tests cover the idempotency behavior

## Test Plan

1. **Unit test**: Create session, then attempt to create again for same date - should return existing
2. **Integration test**: Rapid autosave calls should not create duplicates
3. **Manual test**: Type quickly in empty session, verify single entry created

## Priority

**Medium-High** - Data integrity issue affecting user experience, but data is recoverable

## Dependencies

None - this is a standalone bug fix

## Implementation Notes

### Phase 1 Completed (2026-01-18)

**Changes made:**

1. **`server/routes.ts`** (line 375-382): Added idempotency check before creating session_log notes
   ```typescript
   if (noteType === "session_log" && sessionDate) {
     const existing = await storage.findSessionByDate(teamId, new Date(sessionDate));
     if (existing) {
       return res.status(200).json(existing);
     }
   }
   ```

2. **`server/test/test-routes.ts`** (line 282-289): Added same idempotency check for test routes

3. **`server/session-logs.api.test.ts`**: Added 4 new test cases:
   - `should return existing session instead of creating duplicate for same date`
   - `should handle rapid concurrent creation attempts without duplicates`
   - `should create separate sessions for different dates`
   - `should allow creating multiple notes of other types on same date`

**Test Results:** All 439 tests pass

### Remaining Work (Optional)

- **Phase 2**: Database unique constraint (safety net)
- **Phase 3**: Manual cleanup of existing duplicate entries in production database

## Notes

The current workaround is to manually delete duplicate entries from the database. The UI only shows one session per day due to the `findSessionByDate` query using `LIMIT 1`, so users may not notice duplicates exist unless they query the database directly.
