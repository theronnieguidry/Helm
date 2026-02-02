# PRD-045: Reclassify Missing POI Option

## Problem

In the Needs Review panel on the Notes screen, the "Reclassify" dropdown is missing "Point of Interest" (POI) as an option. Users who import notes and want to manually reclassify them as POIs cannot do so - they can only choose from: Character, NPC, Area, Quest, Session Log, or Note.

This is inconsistent because:
1. POI is a valid note type in `NOTE_TYPES` (`shared/schema.ts:145`)
2. Users can manually create POI notes in the UI
3. Users expect to be able to reclassify imported notes as POIs

## Root Cause

The reclassify dropdown in `notes-left-panel.tsx` hardcodes only the 6 `INFERRED_ENTITY_TYPES` (what the AI can classify), but POI exists as a 7th user-facing note type that the AI maps to "Area" internally.

**Current code in `notes-left-panel.tsx:277-284`:**
```typescript
const reclassifyOptions = [
  { value: "Character", label: "Character" },
  { value: "NPC", label: "NPC" },
  { value: "Area", label: "Area" },
  { value: "Quest", label: "Quest" },
  { value: "SessionLog", label: "Session Log" },
  { value: "Note", label: "Note" },
].filter((opt) => opt.value !== item.inferredType);
```

**Backend validation in `routes.ts:1908`:**
```typescript
const validTypes = ["Character", "NPC", "Area", "Quest", "SessionLog", "Note"];
```

**Type mapping in `routes.ts:1958-1965` (missing POI):**
```typescript
const noteTypeMap: Record<string, string> = {
  Character: "character",
  NPC: "npc",
  Area: "area",
  Quest: "quest",
  SessionLog: "session_log",
  Note: "note",
};
```

## Solution

Add POI as a manual reclassify option (distinct from AI inference types):

1. Add `{ value: "POI", label: "Point of Interest" }` to the reclassify dropdown
2. Add `"POI"` to the backend validation array
3. Add `POI: "poi"` to the type mapping

**Note:** This does NOT change `INFERRED_ENTITY_TYPES` because the AI correctly treats POIs as a subtype of Areas. This only adds POI as a manual override option.

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/notes/notes-left-panel.tsx` | Add POI option to reclassifyOptions array |
| `server/routes.ts` | Add "POI" to validTypes array and noteTypeMap |

## Acceptance Criteria

1. [x] POI appears in the Reclassify dropdown for Needs Review items
2. [x] Selecting POI successfully reclassifies the note as type "poi"
3. [x] Backend accepts "POI" as a valid override type
4. [x] Existing reclassify functionality for other types still works

## Status

Done

## Implementation Notes

### Files Modified
- `client/src/components/notes/notes-left-panel.tsx` (line 281): Added `{ value: "POI", label: "Point of Interest" }` to reclassifyOptions array
- `server/routes.ts` (line 1909): Added "POI" to validTypes array
- `server/routes.ts` (lines 1963, 2016): Added `POI: "poi"` to both noteTypeMap instances

### Technical Decisions
- POI was added as a manual reclassify option only, not to `INFERRED_ENTITY_TYPES`
- The AI enrichment system correctly treats POIs as Areas for classification purposes
- Both noteTypeMap instances updated for consistency (single reclassify and bulk approve)

### Test Coverage
- All 575 existing tests pass (no new tests required - existing API tests cover reclassify flow)
