# PRD-021: Session Note Creation Fails with "Failed to save" Error

**Status: Done**

## Problem Statement

When users attempt to create a new session note by typing in the "Today" text entry field on the Notes screen, the UI displays a "Failed to save" error message above the editor. The note content is not persisted to the database.

## Root Cause Analysis

The production server route for creating notes (`POST /api/teams/:teamId/notes`) has a date serialization bug.

### The Bug

**Production route** (`server/routes.ts:374-378`) spreads `req.body` directly into `storage.createNote()`:
```typescript
const note = await storage.createNote({
  teamId,
  authorId: userId,
  ...req.body,  // sessionDate is passed as an ISO string
});
```

**Test route** (`server/test/test-routes.ts:291`) correctly converts the date:
```typescript
sessionDate: sessionDate ? new Date(sessionDate) : undefined,
```

### Why This Causes Failure

1. Client sends `sessionDate` as an ISO string (e.g., `"2026-01-18T12:00:00.000Z"`)
2. Production route passes this string directly to Drizzle ORM
3. Drizzle expects a `Date` object for the `timestamp` column
4. PostgreSQL rejects the string, causing the database insert to fail
5. The catch block returns a 500 error with message "Failed to create note"
6. The autosave hook catches this error and sets status to "error"
7. The `SaveStatusIndicator` component displays "Failed to save"

### Evidence

- The memory storage explicitly handles this conversion (`server/test/memory-storage.ts:347`):
  ```typescript
  sessionDate: note.sessionDate ? new Date(note.sessionDate) : null,
  ```
- Tests pass because they use `test-routes.ts` which has the correct conversion
- Production fails because `routes.ts` lacks this conversion

## Files Affected

| File | Issue |
|------|-------|
| `server/routes.ts:374-378` | Missing date conversion for `sessionDate` in POST `/api/teams/:teamId/notes` |
| `server/routes.ts:407` | Missing date conversion for `sessionDate` in PATCH `/api/teams/:teamId/notes/:noteId` |

## Fix

Update the create and update note routes in `server/routes.ts` to properly deserialize date fields from the request body before passing to storage.

### Option A: Explicit field destructuring (Recommended)
Match the pattern used in test-routes.ts:
```typescript
const { title, content, noteType, isPrivate, questStatus, contentBlocks, sessionDate, linkedNoteIds } = req.body;

const note = await storage.createNote({
  teamId,
  authorId: userId,
  title,
  content,
  noteType,
  isPrivate,
  questStatus,
  contentBlocks,
  sessionDate: sessionDate ? new Date(sessionDate) : undefined,
  linkedNoteIds,
});
```

### Option B: Transform before spread
```typescript
const noteData = {
  ...req.body,
  sessionDate: req.body.sessionDate ? new Date(req.body.sessionDate) : undefined,
};

const note = await storage.createNote({
  teamId,
  authorId: userId,
  ...noteData,
});
```

## Acceptance Criteria

1. Creating a new session note via the "Today" editor saves successfully
2. The save status indicator shows "Saved" instead of "Failed to save"
3. The created note appears in the notes list
4. Existing note update functionality continues to work
5. All existing tests pass

## Testing Plan

### Manual Testing
1. Navigate to Notes screen
2. Click "Today" button
3. Type content in the text field
4. Verify "Saved" appears after debounce delay
5. Refresh page and confirm note persists

### Integration Test
Add test case in `server/session-logs.api.test.ts`:
```typescript
it("should create a session note with sessionDate via POST", async () => {
  const today = new Date();
  const res = await request(app)
    .post(`/api/teams/${teamId}/notes`)
    .send({
      title: "Test Session",
      noteType: "session_log",
      sessionDate: today.toISOString(),
      content: "Test content",
    })
    .expect(200);

  expect(res.body.sessionDate).toBeDefined();
  expect(new Date(res.body.sessionDate).toDateString()).toBe(today.toDateString());
});
```

## Priority

**High** - This bug blocks the core note-taking workflow for session logs.

## Related PRDs

- PRD-019: Notes Screen Layout Updates (introduced the Today editor feature)
