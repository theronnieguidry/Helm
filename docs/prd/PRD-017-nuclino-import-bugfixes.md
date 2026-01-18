# PRD-017 — Nuclino Import Pipeline Bugfixes

## Story Status
Completed

## Summary
Fixes and improvements to the Nuclino import pipeline (PRD-015) and AI enrichment system (PRD-016) discovered during end-to-end testing with the "Vagaries of Fate PF2e.zip" dataset (105 markdown files).

---

## Issues Identified

### BUG-1: Title Underscore Conversion Incomplete (High Priority)

**Location**: `shared/nuclino-parser.ts:113-117`

**Problem**: The `cleanTitle()` function only converts ` _ ` (space-underscore-space) to `/`, but Nuclino exports also encode standalone slashes as underscores without spaces.

**Example**:
- Filename: `Beeby wants to repair_craft gear 3fe6a5fc.md`
- Link text in Nuclino: `repair/craft gear`
- Before fix: Title imported as `repair_craft gear` (mismatch)
- After fix: Title imported as `repair/craft gear` (correct)

**Files Affected**: 3-5 notes in the test dataset

**Root Cause**: Nuclino encodes `/` characters in filenames as `_` (without surrounding spaces) to create valid filenames, while multi-part titles like "Session 1 / Part A" are encoded as "Session 1 _ Part A" (with spaces).

---

### BUG-2: Session Log Detection Missing (Medium Priority)

**Location**: `shared/nuclino-parser.ts`

**Problem**: The parser only detects four collection types for classification:
- `notable_people` → person
- `places` → place
- `todo` → quest (active)
- `done` → quest (done)

Session logs (like "Journey with Samwell", "Scene 1", "We find the body") were classified as generic "note" unless they happened to be in a quest collection.

**Files Affected**: ~15-20% of the test dataset (session narratives not in To do/Done collections)

**Root Cause**: No title-based heuristic for detecting session log content.

---

### BUG-3: Leading Whitespace in Content (Low Priority)

**Location**: `shared/nuclino-parser.ts:191-199`

**Problem**: Files starting with HTML entities like `&#x20;` (space) retained leading whitespace after decoding.

**Example**:
- File content: `&#x20;Dwarf. Disheveled...`
- Before fix: Content starts with ` Dwarf.` (leading space)
- After fix: Content starts with `Dwarf.` (trimmed)

**Files Affected**: ~5 notes in the test dataset

---

### BUG-4: AI Rate Limiting Insufficient (Medium Priority)

**Location**: `server/ai/claude-provider.ts:18-19`

**Problem**: With 105 files requiring ~22 API calls (11 batches for classification + 11 for relationships), the 50ms delay between batches was insufficient for sustained API usage.

**Risk**: Potential rate limit errors during large imports with AI enrichment enabled.

---

## Additional Issues Documented (Not Fixed)

### ISSUE-5: AI Content Truncation (Accepted Limitation)

**Location**: `server/ai/claude-provider.ts:95-97`

Long notes (up to 32KB) are truncated to 2000 characters for classification. This is a cost/performance tradeoff and is documented as expected behavior.

### ISSUE-6: Already-Classified Notes Skipped by AI (Design Decision)

**Location**: `server/jobs/enrichment-worker.ts:206-214`

Notes classified by collection membership (person, place, quest) are skipped by AI enrichment unless `overrideExisting` is enabled. This is intentional—collection-based classification takes priority over AI inference.

### ISSUE-7: Collection Pages Typed as "collection" (Design Decision)

Collection hub pages like "Notable People" are typed as `collection`, which isn't a standard display type. This is acceptable as these pages serve as navigation aids rather than content.

### ISSUE-8: Cross-Import Relationships Not Detected (Future Enhancement)

Relationship extraction only considers notes within the same import run. Cross-import relationships would require a separate relationship discovery pass.

---

## Implementation

### Fix 1: Underscore Conversion

**File**: `shared/nuclino-parser.ts`

**Before**:
```typescript
export function cleanTitle(title: string): string {
  return title
    .replace(/ _ /g, " / ")
    .trim();
}
```

**After**:
```typescript
export function cleanTitle(title: string): string {
  return title
    .replace(/ _ /g, " / ")  // Multi-part session titles like "A _ B _ C"
    .replace(/_/g, "/")       // Escaped slashes in filenames
    .trim();
}
```

**Order matters**: ` _ ` is replaced first (preserving spaces), then remaining `_` are converted.

---

### Fix 2: Session Log Detection

**File**: `shared/nuclino-parser.ts`

**Added patterns**:
```typescript
const SESSION_LOG_PATTERNS = [
  /^session\s*\d*/i,           // "Session 1", "Session"
  /^scene\s*\d*/i,             // "Scene 1", "Scene" (but not "Scene Setting")
  /^journey\s/i,               // "Journey with..."
  /^we\s+(find|save|meet|go|head|travel)/i, // "We find...", "We save..."
  /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/,  // Contains dates like "5/12/24"
];
```

**Added function**:
```typescript
export function isSessionLogTitle(title: string): boolean {
  // Exclude titles that contain "setting" (like "Scene Setting")
  if (/setting/i.test(title)) {
    return false;
  }
  return SESSION_LOG_PATTERNS.some(p => p.test(title));
}
```

**Updated classification** (before final `return { noteType: "note" }`):
```typescript
// Check for session log patterns in title
if (isSessionLogTitle(page.title)) {
  return { noteType: "session_log" };
}
```

**Priority order** (highest to lowest):
1. Collection page → `collection`
2. In Notable People collection → `person`
3. In Places collection → `place`
4. In Done collection → `quest` (done)
5. In To do collection → `quest` (active)
6. Title matches session log pattern → `session_log`
7. Default → `note`

---

### Fix 3: Whitespace Trimming

**File**: `shared/nuclino-parser.ts`

**Before**:
```typescript
return {
  content: decoded,
  links,
};
```

**After**:
```typescript
return {
  content: decoded.trim(), // Trim leading/trailing whitespace from HTML entities
  links,
};
```

---

### Fix 4: Rate Limit Delay

**File**: `server/ai/claude-provider.ts`

**Before**:
```typescript
const RATE_LIMIT_DELAY_MS = 50;
```

**After**:
```typescript
const RATE_LIMIT_DELAY_MS = 150; // Increased from 50ms to avoid rate limiting
```

---

## Testing

### New Tests Added

**File**: `shared/nuclino-parser.test.ts`

```typescript
// cleanTitle tests
it("converts underscore to slash (escaped slashes)")
it("handles both patterns together")

// isSessionLogTitle tests
it("detects Session titles")
it("detects Scene titles")
it("excludes Scene Setting titles")
it("detects Journey titles")
it("detects 'We' action titles")
it("detects date-formatted titles")
it("returns false for non-session titles")

// classifyNuclinoPage tests
it("classifies session log pages by title pattern")
it("classifies 'We' action pages as session logs")
it("does not classify 'Scene Setting' as session log")

// parseNuclinoContent tests
it("trims leading and trailing whitespace")
```

### Updated Tests

- `parseNuclinoContent > decodes entities and extracts links` — updated expected output to reflect trimmed content

### Test Results

All **56 tests pass** after implementation.

---

## Verification with Real Dataset

Tested with "Vagaries of Fate PF2e.zip" (105 files):

| Metric | Result |
|--------|--------|
| Total pages | 105 |
| Empty pages | 13 |
| Collections | 11 |
| People | 20 |
| Places | 22 |
| Quests (open) | 9 |
| Quests (done) | 20 |
| Session logs | 5 (Scene pages not in collections) |
| Notes | 23 |

**Specific validations**:
- `Beeby wants to repair_craft gear` → title is `Beeby wants to repair/craft gear` ✓
- `Kettle` content starts with `Dwarf.` (no leading space) ✓
- `Beeby Scene Setting` classified as `note` (not session_log) ✓
- `Scene` pages classified as `session_log` ✓
- Quest collection membership takes priority over session log pattern ✓

---

## Files Modified

| File | Changes |
|------|---------|
| `shared/nuclino-parser.ts` | Fixes 1, 2, 3 |
| `shared/nuclino-parser.test.ts` | New and updated tests |
| `server/ai/claude-provider.ts` | Fix 4 |

---

## Acceptance Criteria

- [x] `cleanTitle("repair_craft")` returns `"repair/craft"`
- [x] `cleanTitle("A _ B_C")` returns `"A / B/C"`
- [x] `isSessionLogTitle("Session 1")` returns `true`
- [x] `isSessionLogTitle("Scene Setting")` returns `false`
- [x] Pages with session log titles (not in collections) are classified as `session_log`
- [x] Content with leading HTML entity whitespace is trimmed
- [x] All existing tests continue to pass
- [x] Real dataset imports with expected classifications
