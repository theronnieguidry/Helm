# PRD-035: AI Import Progress Feedback

## Problem Statement

During AI-enhanced note imports, the progress UI shows a spinning wheel and a progress bar that never actually fills. Users cannot tell if the operation is progressing or stuck, leading to uncertainty about whether the import is working.

## Current Behavior

1. Progress bar component receives `value={undefined}`, displaying only a spinning animation
2. Generic static text like "Creating notes and resolving links..." provides no specific feedback
3. Backend processes all items in a single batch before returning
4. No intermediate progress is tracked or exposed

## Desired Behavior

1. Progress bar fills proportionally as items are processed
2. Dynamic text beneath the bar shows what's currently being processed (e.g., "Classifying page 3 of 12...")
3. Users can see the operation is actively progressing

## Affected States

The import dialog has several loading states that need improvement:

| State | Current Text | Needs Progress |
|-------|-------------|----------------|
| `ai-diff-loading` | "Analyzing your notes with AI..." | Yes |
| `importing` | "Creating notes and resolving links..." | Yes |
| `enriching` | "AI enrichment is running..." | Yes |

## Technical Approach

### Option A: Polling-Based Progress (Recommended)

Add a progress tracking mechanism with polling:

1. **Backend Changes**
   - Store progress in memory (Map keyed by operation ID)
   - Update progress after each item/batch is processed
   - Add `GET /api/teams/:teamId/imports/progress/:operationId` endpoint

2. **Frontend Changes**
   - Poll progress endpoint every 500-1000ms during operations
   - Update progress bar value and status text from response
   - Stop polling when operation completes

3. **Progress Data Structure**
   ```typescript
   interface ImportProgress {
     operationId: string;
     phase: 'classifying' | 'relationships' | 'creating' | 'linking';
     current: number;
     total: number;
     currentItem?: string;  // e.g., page title being processed
     startedAt: number;
   }
   ```

### Option B: Server-Sent Events (Alternative)

Use SSE for real-time streaming:
- More complex to implement
- Better real-time feedback
- Requires connection management

## Implementation Details

### Files to Modify

**Frontend:**
- `client/src/components/nuclino-import-dialog.tsx` - Add polling, update progress display

**Backend:**
- `server/routes.ts` - Add progress endpoint, update existing endpoints to track progress
- `server/ai/claude-provider.ts` - Report progress during batch classification

### Progress Messages by Phase

| Phase | Message Format |
|-------|---------------|
| Classification | "Classifying page {current} of {total}: {title}..." |
| Relationships | "Analyzing relationships ({current} of {total})..." |
| Creating Notes | "Creating note {current} of {total}: {title}..." |
| Resolving Links | "Resolving links for {title}..." |

### UI Updates

1. Replace `<Progress value={undefined} />` with `<Progress value={progressPercent} />`
2. Add status text element below progress bar
3. Optionally show elapsed time

## Acceptance Criteria

1. [x] Progress bar fills from 0% to 100% during AI import operations
2. [x] Text beneath progress bar updates to show current processing step
3. [x] Progress updates occur at least every 2 seconds during long operations
4. [x] All three loading states (ai-diff-loading, importing, enriching) show real progress
5. [x] Progress completes at 100% when operation finishes

## Testing Requirements

1. Integration test: Progress endpoint returns expected structure
2. Unit test: Progress calculation is accurate
3. Manual test: Verify smooth progress updates during real import

## Out of Scope

- Cancel operation functionality
- Pause/resume functionality
- Detailed error recovery with progress preservation

## Status

Done

## Implementation Notes

### Files Modified
- `server/routes.ts` - Added in-memory progress store, progress endpoint, and progress tracking in AI preview and commit endpoints
- `server/ai/ai-provider.ts` - Added `ProgressCallback` type to interface
- `server/ai/claude-provider.ts` - Added progress callbacks to `classifyNotes()` and `extractRelationships()` methods
- `client/src/components/nuclino-import-dialog.tsx` - Added progress polling with useQuery, updated UI to show real progress
- `shared/ai-preview-types.ts` - Added optional `operationId` field to `AIPreviewResponse`

### Technical Decisions
- Used polling-based progress (Option A) instead of SSE for simplicity
- Client generates operation ID and sends to server to enable polling before response returns
- Progress updates every 500ms during operations
- Progress stored in memory with 10-minute TTL and automatic cleanup

### Test Coverage
- `server/import-progress.api.test.ts` - 6 tests covering progress data structure, percentage calculation, and phase labels
- All 532 existing tests continue to pass
