# PRD-044: Fix Nuclino Import Commit Error

## Problem Statement

The Nuclino import feature fails at the commit step with the error:
```
ReferenceError: importEmptyPages is not defined
```

When users complete the import wizard and click "Confirm", the import fails with "Failed to commit import" message.

## Root Cause

In `server/routes.ts`, the `/api/teams/:teamId/imports/nuclino/commit` endpoint has a scoping bug:

1. **Line 1031-1041**: The code handles two formats for empty page exclusion:
   - New format (PRD-042): Uses `options.excludedEmptyPageIds` array
   - Legacy format: Uses `options.importEmptyPages` boolean

2. **Line 1037**: The `importEmptyPages` variable is declared with `const` inside the `else` block, making it block-scoped

3. **Line 1069-1072**: The code attempts to use `importEmptyPages` when creating the import run record, but this variable is not accessible outside the `else` block

```typescript
// Line 1031-1041 - importEmptyPages only defined in else branch
if (options?.excludedEmptyPageIds && Array.isArray(options.excludedEmptyPageIds)) {
  excludedEmptyPageIds = new Set(options.excludedEmptyPageIds);
} else {
  const importEmptyPages = options?.importEmptyPages !== false;  // Block-scoped!
  excludedEmptyPageIds = importEmptyPages
    ? new Set()
    : new Set(plan.pages.filter(p => p.isEmpty).map(p => p.sourcePageId));
}

// Line 1069-1072 - Reference to undefined variable
options: {
  importEmptyPages,  // ReferenceError!
  defaultVisibility,
},
```

## Solution

Move the `importEmptyPages` variable declaration outside the if-else block so it's accessible when creating the import run record. The variable should be computed in both branches:
- New format: Derive from whether `excludedEmptyPageIds` is empty
- Legacy format: Use the existing logic

## Acceptance Criteria

1. Users can successfully complete the Nuclino import flow
2. Import run records correctly store the `importEmptyPages` option
3. Both new (excludedEmptyPageIds) and legacy (importEmptyPages) option formats work

## Files to Modify

- `server/routes.ts` - Fix variable scoping in `/api/teams/:teamId/imports/nuclino/commit` endpoint

## Status
Done

## Implementation Notes
- Modified: `server/routes.ts` (lines 1030-1045)
- Fix: Moved `importEmptyPages` variable declaration outside the if-else block so it's accessible when creating the import run record
- In new format (excludedEmptyPageIds), derive `importEmptyPages` as `true` if no pages are excluded
- In legacy format, use existing logic (`options?.importEmptyPages !== false`)
- Test coverage: Existing API tests pass (40 tests)
