# PRD-024 — Entity Detection Quality Improvements

## Story Status
Completed

## Summary
Fixes and improvements to the entity detection system (PRD-002, PRD-022) discovered during real-world testing with session log content. The current implementation produces false positives (garbage entities), false negatives (missing valid entities), and duplicates that degrade the user experience.

**Test Input**:
```
Misty Vale is the region and Granite Landing is the main city and seat of the barony
of The Misty Vale. It at the headwaters of the Broken Bridge river.

Captain Garner makes his way into camp. Lieutenant Sasha Livingstone is with him and
is a human woman and was on the exhibition when we saved Samwell. There's a dwarven
male (Drogon Stonefist) fully encased in gray steel...

Blacktalon, Breaker, Amir, Skald, all meet up with them. Blacktalon introduces his
senior staff and commanders to the Captain. Baron Chilton isn't aware of any contracts
signed...
```

---

## Issues Identified

### BUG-1: Compound Name Merging Across Sentence Boundaries (Critical)

**Location**: `shared/entity-detection.ts:166-177` (`findProperNouns` function)

**Problem**: The code checks if text *before* the current word ends with punctuation to determine sentence start, but doesn't check if the *current* word itself ends with punctuation before attempting to merge with the next word as a compound name.

**Example**:
- Input: `"we saved Samwell. There's a dwarven male"`
- Word at index: `"Samwell."` (ends with period)
- Next word: `"There's"` → cleaned to `"Theres"` → matches `[A-Z][a-z]+`
- Result: `"Samwell Theres"` (incorrect compound)
- Expected: `"Samwell"` only

**Root Cause**: Line 166-177 looks ahead for compound names without first checking if the current word's original form ends with sentence-terminating punctuation.

---

### BUG-2: Missing Place Indicators (High Priority)

**Location**: `shared/entity-detection.ts:62-67` (`PLACE_INDICATORS` constant)

**Problem**: Common fantasy place terms are missing from the indicator list, causing valid places to be undetected or misclassified.

**Missing indicators**:
- `vale`, `valley` — "Misty Vale" not detected
- `landing`, `harbor`, `port` — "Granite Landing" not detected
- `keep`, `stronghold`, `fortress` — Common castle variants
- `camp` — "the camp" mentioned frequently
- `barony`, `duchy`, `county`, `province` — Political regions

**Files Affected**: Any notes mentioning these common place types

---

### BUG-3: Missing Person Title (High Priority)

**Location**: `shared/entity-detection.ts:54-59` (`PERSON_TITLES` constant)

**Problem**: "Lieutenant" is not in the person titles list, causing military-ranked NPCs to be detected with low confidence instead of high.

**Example**:
- Input: `"Lieutenant Sasha Livingstone is with him"`
- Expected: High-confidence NPC detection
- Actual: Only detects "Sasha Livingstone" as low-confidence proper noun (if at all)

**Missing titles**: `lieutenant`, `sergeant`, `corporal`, `admiral`, `colonel`, `major`

---

### BUG-4: No Deduplication of Contained Entities (Medium Priority)

**Location**: `shared/entity-detection.ts:256-296` (entity grouping logic)

**Problem**: When both a titled entity and its bare name are detected, both appear in results without merging.

**Examples**:
- `"Captain Garner"` (high confidence) AND `"Garner"` (low confidence) both appear
- `"Duke"` AND `"Duke's"` both appear (possessive variant)

**Expected behavior**: Shorter entity should be merged into longer containing entity, keeping the higher confidence.

---

### BUG-5: Comma-Separated List Items Treated as Sentence Starts (Medium Priority)

**Location**: `shared/entity-detection.ts:162` (`isAtSentenceStart` check)

**Problem**: The sentence-start detection only checks for `[.!?]` before the current word. Comma-separated lists of proper nouns are all missed because commas don't count as non-sentence-start indicators.

**Example**:
- Input: `"Blacktalon, Breaker, Amir, Skald, all meet up"`
- Expected: All four detected as entities
- Actual: None detected (all treated as potential sentence starts because only whitespace/commas precede them after initial word)

**Root Cause**: `isAtSentenceStart` logic at line 162 is overly conservative.

---

### BUG-6: Spurious Sentence Fragment Detection (Medium Priority)

**Location**: `shared/entity-detection.ts:150-200` (`findProperNouns` function)

**Problem**: The proper noun detection sometimes captures sentence fragments or partial phrases as entities.

**Examples from test**:
- `"the headwaters of the Broken Bridge river"` — Entire phrase captured
- `"the region and Granite Landing is the main city"` — Sentence fragment
- `"main city"` — Generic phrase detected as Area (contains "city")
- `"Bridge river"` — Partial match

**Root Cause**: Unclear, may be interaction between multiple pattern matches or improper offset tracking.

---

### BUG-7: Possessive Forms Create Duplicates (Low Priority)

**Location**: `shared/entity-detection.ts:100-102` (`normalizeText` function)

**Problem**: `normalizeText()` only lowercases and trims, but doesn't normalize possessive forms.

**Example**:
- `"Duke"` normalized to `"duke"`
- `"Duke's"` normalized to `"duke's"` (different key in map)
- Result: Two separate entities for the same person

---

## Implementation Notes

### Fix 1: Sentence Boundary Check Before Compound Merging

**File**: `shared/entity-detection.ts`

**Change**: In `findProperNouns()`, check if the current word (before cleaning) ends with sentence-terminating punctuation before looking for compound names.

```typescript
// After line 160, before compound name detection:
const endsWithSentencePunctuation = /[.!?]$/.test(word);
if (endsWithSentencePunctuation) {
  // Don't look for compound names across sentence boundaries
  matches.push({
    text: cleanWord,
    type: guessEntityType(cleanWord),
    confidence: "low",
    startOffset,
    endOffset: startOffset + cleanWord.length,
    blockId,
  });
  continue; // Skip compound name detection
}
```

---

### Fix 2: Add Missing Place Indicators

**File**: `shared/entity-detection.ts`

**Add to `PLACE_INDICATORS`**:
```typescript
const PLACE_INDICATORS = [
  // existing...
  "vale", "valley", "landing", "harbor", "port", "keep",
  "stronghold", "fortress", "camp", "barony", "duchy",
  "county", "province", "region", "crossing", "pass",
];
```

---

### Fix 3: Add Missing Person Titles

**File**: `shared/entity-detection.ts`

**Add to `PERSON_TITLES`**:
```typescript
const PERSON_TITLES = [
  // existing...
  "lieutenant", "sergeant", "corporal", "admiral", "colonel", "major",
  "warden", "keeper", "steward", "chancellor", "vizier", "ambassador",
];
```

**Update `PERSON_PATTERNS`** to include new titles in the regex.

---

### Fix 4: Deduplication of Contained Entities

**File**: `shared/entity-detection.ts`

**Add post-processing step** after entity map is built:

```typescript
function deduplicateContainedEntities(entities: DetectedEntity[]): DetectedEntity[] {
  const result: DetectedEntity[] = [];
  const sortedByLength = [...entities].sort((a, b) => b.text.length - a.text.length);

  for (const entity of sortedByLength) {
    // Check if this entity is contained within an already-added entity
    const isContained = result.some(existing =>
      existing.normalizedText.includes(entity.normalizedText) &&
      existing.normalizedText !== entity.normalizedText
    );

    if (!isContained) {
      result.push(entity);
    }
  }

  return result;
}
```

---

### Fix 5: Improve List Item Detection

**File**: `shared/entity-detection.ts`

**Change**: Modify `isAtSentenceStart` to be more permissive for mid-text capitalized words.

```typescript
// Replace line 162 logic with:
const textBefore = words.slice(0, i).join(" ");
const isAtSentenceStart = i === 0 || /[.!?]\s*$/.test(textBefore);
const isAfterComma = i > 0 && /,\s*$/.test(textBefore);

// If after comma, still detect as potential entity (lists like "A, B, C")
if (!isAtSentenceStart || isAfterComma) {
  // proceed with entity detection
}
```

---

### Fix 6: Filter Spurious Detections

**File**: `shared/entity-detection.ts`

**Add validation function**:

```typescript
function isValidEntityText(text: string): boolean {
  // Must have at least one capitalized word
  if (!/[A-Z]/.test(text)) return false;

  // Should not be a sentence fragment (contains articles + verbs)
  if (/\b(is|are|was|were|the|and|of)\s+\w+\s+(is|are|was|were|the|and|of)\b/i.test(text)) {
    return false;
  }

  // Should not exceed reasonable entity length (5 words max)
  if (text.split(/\s+/).length > 5) return false;

  // Should not start with lowercase word
  if (/^[a-z]/.test(text)) return false;

  return true;
}
```

---

### Fix 7: Normalize Possessives

**File**: `shared/entity-detection.ts`

**Update `normalizeText()`**:

```typescript
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/'s$/g, '')  // Remove possessive suffix
    .replace(/s'$/g, 's') // Handle plural possessive
    .trim();
}
```

---

## Testing

### New Tests Required

**File**: `shared/entity-detection.test.ts`

```typescript
describe("BUG-1: Sentence boundary compound names", () => {
  it("should not merge names across sentence boundaries", () => {
    const text = "We saved Samwell. There's a dwarven male nearby.";
    const entities = detectEntities(text);

    expect(entities.find(e => e.normalizedText === "samwell theres")).toBeUndefined();
    expect(entities.find(e => e.normalizedText === "samwell")).toBeDefined();
  });
});

describe("BUG-2: Place indicators", () => {
  it("should detect vale as a place indicator", () => {
    const text = "We traveled to the Misty Vale.";
    const entities = detectEntities(text);

    const mistyVale = entities.find(e => e.normalizedText.includes("misty vale"));
    expect(mistyVale?.type).toBe("place");
  });

  it("should detect landing as a place indicator", () => {
    const text = "Granite Landing is the main city.";
    const entities = detectEntities(text);

    const landing = entities.find(e => e.normalizedText.includes("granite landing"));
    expect(landing?.type).toBe("place");
  });
});

describe("BUG-3: Person titles", () => {
  it("should detect Lieutenant as a person title", () => {
    const text = "Lieutenant Sasha Livingstone arrived.";
    const entities = detectEntities(text);

    const lieutenant = entities.find(e => e.normalizedText.includes("lieutenant sasha"));
    expect(lieutenant?.confidence).toBe("high");
    expect(lieutenant?.type).toBe("npc");
  });
});

describe("BUG-4: Deduplication", () => {
  it("should merge 'Garner' into 'Captain Garner'", () => {
    const text = "Captain Garner spoke. Garner then left.";
    const entities = detectEntities(text);

    expect(entities.find(e => e.normalizedText === "garner")).toBeUndefined();
    expect(entities.find(e => e.normalizedText === "captain garner")).toBeDefined();
  });
});

describe("BUG-5: Comma-separated lists", () => {
  it("should detect entities in comma-separated lists", () => {
    const text = "Blacktalon, Breaker, Amir, Skald, all meet up.";
    const entities = detectEntities(text);

    expect(entities.find(e => e.normalizedText === "blacktalon")).toBeDefined();
    expect(entities.find(e => e.normalizedText === "breaker")).toBeDefined();
    expect(entities.find(e => e.normalizedText === "amir")).toBeDefined();
    expect(entities.find(e => e.normalizedText === "skald")).toBeDefined();
  });
});

describe("BUG-6: Spurious fragments", () => {
  it("should not detect sentence fragments as entities", () => {
    const text = "The region and Granite Landing is the main city.";
    const entities = detectEntities(text);

    expect(entities.find(e =>
      e.normalizedText.includes("region and granite")
    )).toBeUndefined();
  });
});

describe("BUG-7: Possessive normalization", () => {
  it("should merge possessive forms with base form", () => {
    const text = "The Duke arrived. The Duke's son followed.";
    const entities = detectEntities(text);

    const dukeEntities = entities.filter(e => e.normalizedText.includes("duke"));
    expect(dukeEntities.length).toBe(1);
  });
});
```

---

## Acceptance Criteria

- [ ] `"Samwell. There's"` does NOT produce `"Samwell Theres"` entity
- [ ] `"Misty Vale"` detected as place with high confidence
- [ ] `"Granite Landing"` detected as place with high confidence
- [ ] `"Lieutenant Sasha Livingstone"` detected as NPC with high confidence
- [ ] `"Captain Garner"` and `"Garner"` merged into single entity
- [ ] `"Blacktalon, Breaker, Amir, Skald"` all detected as entities
- [ ] Sentence fragments like `"the region and Granite Landing is"` NOT detected
- [ ] `"Duke"` and `"Duke's"` merged into single entity
- [ ] All existing entity detection tests continue to pass
- [ ] New test cases added for each bug fix

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/entity-detection.ts` | All 7 fixes |
| `shared/entity-detection.test.ts` | New test cases for each bug |

---

## Priority Order

1. **BUG-1** (Critical) — Compound name sentence boundary
2. **BUG-2** (High) — Missing place indicators
3. **BUG-3** (High) — Missing person titles
4. **BUG-5** (Medium) — Comma-separated lists
5. **BUG-4** (Medium) — Deduplication
6. **BUG-6** (Medium) — Spurious fragments
7. **BUG-7** (Low) — Possessive normalization
