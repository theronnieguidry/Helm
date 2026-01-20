# PRD-039: AI Classification Type Mismatch Bug Fix

## Problem

AI classification was failing for many notes with "Failed to parse AI response" explanation. Investigation revealed a **critical type mismatch** between the user prompt and system prompt:

**User prompt (line 126)** instructed Claude to use:
```
"inferredType": "Person" | "Place" | "Quest" | "SessionLog" | "Note"
```

**System prompt (line 67-75)** defined:
```
- Character: A player character (PC)
- NPC: A non-player character
- Area: A location, city, building...
- Quest: A task, mission...
- SessionLog: A record or summary
- Note: General reference material
```

**Validation (line 171)** expected:
```typescript
const validTypes = ["Character", "NPC", "Area", "Quest", "SessionLog", "Note"];
```

When Claude followed the user prompt and returned `"Person"` or `"Place"`, validation failed:
- Type defaulted to `"Note"`
- Confidence defaulted to `0.5`
- Explanation set to `"Failed to parse AI response"`

## Root Cause Analysis

Using `scripts/simulate-classification.ts`, the import file was analyzed:
- 105 total notes extracted
- 13 empty notes (correctly get "Not analyzed by AI (empty page)")
- 92 notes with content sent to AI in batches of 10

The mismatch caused inconsistent results:
- Some batches where Claude happened to use "Character/NPC/Area" → success
- Batches where Claude used "Person/Place" → validation failure → all notes in batch get error

## Solution

Changed the user prompt (line 126) to match the system prompt and validation:

```diff
- "inferredType": "Person" | "Place" | "Quest" | "SessionLog" | "Note",
+ "inferredType": "Character" | "NPC" | "Area" | "Quest" | "SessionLog" | "Note",
```

## Files Modified

- `server/ai/claude-provider.ts` (line 126): Fixed type enum in user prompt

## Acceptance Criteria

1. [x] User prompt types match system prompt types
2. [x] User prompt types match validation types
3. [x] Existing tests pass (48 tests in claude-provider.test.ts)

## Status

Done

## Implementation Notes

### Files Modified
- `server/ai/claude-provider.ts` (line 126): Changed `"Person" | "Place"` to `"Character" | "NPC" | "Area"`

### Technical Decisions
- Simple fix: align the prompt with existing validation rather than changing validation
- No new tests needed - existing tests cover the parsing logic
- Users should re-run imports to get corrected classifications

### Test Coverage
- `server/ai/claude-provider.test.ts` (48 tests) all pass
