# PRD-025 — Entity Detection Follow-up Bugs

## Story Status
Completed

## Summary
Follow-up fixes to the entity detection system after PRD-024. Real-world testing revealed additional issues with sentence-start handling and title reference deduplication.

**Related PRDs:** PRD-024 (Entity Detection Quality Improvements)

---

## Issues Identified

### BUG-1: Sentence-Start Blindness (High Priority)

**Location**: `shared/entity-detection.ts` - `findProperNouns()` function

**Problem**: Entities appearing only at the start of sentences are never detected because the `isAtSentenceStart` check skips them entirely.

**Example**:
```
Blacktalon, Breaker, Amir, Skald, all meet up with them. Blacktalon introduces
his senior staff and commanders to the Captain.
```
- "Blacktalon" appears twice, both times at sentence start
- Never detected despite being a clear proper noun entity
- Same issue affects "Chuckwagon" and other sentence-initial names

**Root Cause**: Line 235 skips words where `isAtSentenceStart` is true, with no fallback for repeated occurrences.

---

### BUG-2: Title-Only References Not Deduplicated (Medium Priority)

**Location**: `shared/entity-detection.ts` - `PERSON_PATTERNS` and deduplication logic

**Problem**: When a titled entity like "Captain Garner" is detected, subsequent references to just "Captain" create a separate entity instead of being merged.

**Example**:
```
Captain Garner makes his way into camp... The captain accepts the contract.
```
- "Captain Garner" detected (high confidence)
- "Captain" detected separately (from PERSON_PATTERNS matching title-only)
- Should be: Only "Captain Garner" with increased frequency

**Root Cause**:
1. `PERSON_PATTERNS` regex matches `Captain` followed by nothing after it in some contexts
2. Deduplication only handles suffix matches ("Garner" → "Captain Garner"), not prefix matches ("Captain" → "Captain Garner")

---

### BUG-3: Article-Prefixed Title References (Medium Priority)

**Location**: `shared/entity-detection.ts` - Pattern matching

**Problem**: "the Duke", "the Baron", "the Captain" are not recognized as references to previously identified titled entities.

**Example**:
```
Baron Chilton isn't aware of any contracts signed. The contract has been
signed in support of the Baron.
```
- "Baron Chilton" detected correctly
- "the Baron" creates separate "Baron" entity
- Should recognize "the Baron" as a reference to "Baron Chilton"

**Root Cause**: No pattern or post-processing handles article+title as a back-reference.

---

## Implementation

### Fix 1: Track Sentence-Start Entities for Later Inclusion

**Approach**: Instead of skipping sentence-start words entirely, track them separately. If they appear again mid-sentence, include them. If they only appear at sentence start but match a known pattern (like all-caps or consistent capitalization), consider including them.

**Alternative Approach (Simpler)**: Do a two-pass detection:
1. First pass: Detect all entities normally (skipping sentence starts)
2. Second pass: For each skipped sentence-start word, check if it matches any detected entity's name or appears multiple times

**Code Change**:
```typescript
// Track sentence-start words that might be entities
const sentenceStartCandidates: Map<string, number> = new Map();

// In the loop, when isAtSentenceStart is true:
if (isAtSentenceStart) {
  const normalized = cleanWord.toLowerCase();
  sentenceStartCandidates.set(normalized, (sentenceStartCandidates.get(normalized) || 0) + 1);
  continue; // Skip for now
}

// After the main loop, check candidates:
for (const [candidate, count] of sentenceStartCandidates) {
  // Include if appears multiple times at sentence start
  if (count >= 2) {
    // Add as low-confidence entity
  }
  // Or if matches a detected entity's last name
  const matchingEntity = matches.find(m =>
    m.text.toLowerCase().endsWith(candidate)
  );
  if (matchingEntity) {
    // Add mentions to existing entity
  }
}
```

---

### Fix 2: Extend Deduplication to Handle Prefix Matches

**Approach**: Modify `deduplicateContainedEntities()` to also merge when shorter entity is a word-prefix of longer entity.

**Code Change**:
```typescript
// Check if shorter is a word-prefix of longer (e.g., "Captain" in "Captain Garner")
const isPrefix = shorterWords.every((word, idx) =>
  longerWords[idx] === word
);

// Check if shorter is a word-suffix of longer (existing logic)
const isSuffix = shorterWords.every((word, idx) =>
  longerWords[longerWords.length - shorterWords.length + idx] === word
);

if (isPrefix || isSuffix) {
  // Merge shorter into longer
}
```

---

### Fix 3: Handle Article+Title References

**Approach**: Add post-processing to recognize "the [Title]" patterns and merge them with full titled entities.

**Code Change**:
```typescript
// After main detection, before deduplication
function mergeArticleTitleReferences(entities: DetectedEntity[]): DetectedEntity[] {
  const titledEntities = entities.filter(e =>
    PERSON_TITLES.some(title => e.normalizedText.startsWith(title + " "))
  );

  const titleOnlyEntities = entities.filter(e =>
    PERSON_TITLES.includes(e.normalizedText) ||
    e.normalizedText.startsWith("the ") && PERSON_TITLES.includes(e.normalizedText.slice(4))
  );

  for (const titleOnly of titleOnlyEntities) {
    const titleWord = titleOnly.normalizedText.replace(/^the /, "");
    const matchingFull = titledEntities.find(e =>
      e.normalizedText.startsWith(titleWord + " ")
    );

    if (matchingFull) {
      matchingFull.mentions.push(...titleOnly.mentions);
      matchingFull.frequency += titleOnly.frequency;
      // Mark titleOnly for removal
    }
  }

  return entities.filter(e => /* not marked for removal */);
}
```

---

## Testing

### Test Cases

```typescript
describe("PRD-025: Sentence-start blindness", () => {
  it("should detect entities that only appear at sentence start", () => {
    const text = "Blacktalon spoke. Blacktalon then left.";
    const entities = detectEntities(text);

    expect(entities.find(e => e.normalizedText === "blacktalon")).toBeDefined();
  });

  it("should detect entities at sentence start if they appear multiple times", () => {
    const text = "Chuckwagon motions to the runners. Chuckwagon knows the camp.";
    const entities = detectEntities(text);

    expect(entities.find(e => e.normalizedText === "chuckwagon")).toBeDefined();
  });
});

describe("PRD-025: Title-only deduplication", () => {
  it("should merge 'Captain' into 'Captain Garner'", () => {
    const text = "Captain Garner arrived. The captain spoke.";
    const entities = detectEntities(text);

    const captainEntities = entities.filter(e =>
      e.normalizedText.includes("captain")
    );
    expect(captainEntities).toHaveLength(1);
    expect(captainEntities[0].normalizedText).toBe("captain garner");
  });
});

describe("PRD-025: Article-prefixed titles", () => {
  it("should merge 'the Baron' into 'Baron Chilton'", () => {
    const text = "Baron Chilton rules. The Baron is fair.";
    const entities = detectEntities(text);

    const baronEntities = entities.filter(e =>
      e.normalizedText.includes("baron")
    );
    expect(baronEntities).toHaveLength(1);
    expect(baronEntities[0].normalizedText).toBe("baron chilton");
  });

  it("should merge 'the Duke' references", () => {
    const text = "Duke Harrington arrived. The Duke's son followed.";
    const entities = detectEntities(text);

    const dukeEntities = entities.filter(e =>
      e.normalizedText.includes("duke")
    );
    expect(dukeEntities).toHaveLength(1);
  });
});
```

---

## Acceptance Criteria

- [x] "Blacktalon" detected when appearing only at sentence starts
- [x] "Chuckwagon" detected when appearing at sentence start
- [x] "Captain" merged into "Captain Garner" (not separate entity)
- [x] "Baron" merged into "Baron Chilton" (not separate entity)
- [x] "the Duke" merged into "Duke" entity (not separate)
- [x] All existing tests continue to pass
- [x] New test cases added for each fix

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/entity-detection.ts` | All 3 fixes |
| `shared/entity-detection.test.ts` | New test cases |
