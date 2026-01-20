# PRD-040: AI Classification Optimizations (Analysis)

## Status

Done

## Overview

Analysis of the AI classification system from Haiku's perspective, identifying potential optimizations to improve accuracy and reduce "needs review" items.

---

## Current Flow Analysis

### What Haiku Receives (Per Batch of 10 Notes)

```
System Prompt: Category definitions + confidence guidelines
User Prompt: Array of {id, title, content (max 2000 chars), currentType, linkedTitles}
```

### What Haiku Must Do

1. Read each note's title + content
2. Determine category (Character/NPC/Area/Quest/SessionLog/Note)
3. Assign confidence (0.0-1.0)
4. Write explanation
5. Extract entity names
6. Output valid JSON

---

## Identified Issues & Optimizations

### Issue 1: Title Patterns Are Underutilized

**Current**: The prompt doesn't emphasize using title patterns as classification signals.

**Evidence from import file**:
- "The Fountain District" → clearly Area (title pattern: "The [Noun] [PlaceType]")
- "Kettle", "Deadeye", "Simon" → likely NPCs (single name)
- "Visit the Irori Temple" → clearly Quest (verb + location)
- "Find out The Leadership of The Loyalists" → Quest (starts with "Find")

**Optimization**: Add title heuristics to system prompt:
```
Title patterns that strongly indicate type:
- "The [X] District/Square/Inn/Temple/Cathedral" → Area (0.90+)
- Single capitalized name (e.g., "Kettle", "Simon") → NPC (0.85+)
- Starts with verb: "Find/Visit/Talk to/Meet with/Check" → Quest (0.85+)
- Contains "Session" or date format → SessionLog (0.90+)
```

**Impact**: High - reduces ambiguity for 30-40% of notes

---

### Issue 2: No Campaign Context

**Current**: Haiku doesn't know who the player characters are.

**Problem**: Can't distinguish "Character" (PC) from "NPC" without knowing who the players are.

**Evidence**: The import has notes about "Beeby", "Fizzle", "Legion" who appear to be PCs based on context ("Beeby isn't sure how he feels..."), but Haiku has no way to know this.

**Optimization**: Allow users to specify PC names during import:
```typescript
interface ImportOptions {
  playerCharacterNames?: string[]; // e.g., ["Beeby", "Fizzle", "Legion", "Isaac"]
}
```

Then add to system prompt:
```
The player characters in this campaign are: Beeby, Fizzle, Legion, Isaac
- If a note is primarily about one of these characters, classify as "Character"
- Other named individuals should be classified as "NPC"
```

**Impact**: Medium - improves PC vs NPC distinction

---

### Issue 3: Index/TOC Notes Cause Confusion

**Current**: Notes that are just lists of links (like "The Misty Vale" which contains only links to Scene, Places, To do, Done) are hard to classify.

**Evidence**:
```markdown
- [Scene](<Scene ea296676.md?n>)
- [Places](<Places 3ffb6cee.md?n>)
- [To do](<To do 3fc7cab8.md?n>)
- [Done](<Done dee9fbda.md?n>)
```

**Optimization**: Pre-detect index notes and handle specially:
```typescript
function isIndexNote(content: string): boolean {
  const lines = content.trim().split('\n').filter(l => l.trim());
  const linkLines = lines.filter(l => /^\s*-?\s*\[/.test(l));
  return linkLines.length > 0 && linkLines.length >= lines.length * 0.8;
}
```

If mostly links → classify as "Note" with high confidence (0.85) and explanation "Index/navigation note containing links to other notes"

**Impact**: Low-Medium - reduces noise for ~5-10% of notes

---

### Issue 4: linkedTitles Not Leveraged

**Current**: We pass `linkedTitles` but don't tell Haiku how to use them.

**Insight**: The links reveal a lot:
- Note linking to many places → likely a SessionLog or Quest
- Note linking to NPCs → likely a SessionLog or Quest involving those NPCs
- Note with no links and short content → likely an entity definition (NPC/Area)

**Optimization**: Add to system prompt:
```
Use internal links as classification signals:
- Many links to places/NPCs → likely SessionLog (narrative) or Quest (objectives)
- Few/no links + descriptive content → likely entity definition (NPC/Area)
- Links only to other structural notes (Scene, Places, Done) → likely index Note
```

**Impact**: Medium - helps with session logs especially

---

### Issue 5: Content Length Signals

**Current**: We truncate at 2000 chars but don't use length as a signal.

**Insight**:
- Very long notes (>1500 chars) → often SessionLogs (detailed narratives)
- Very short notes (<100 chars) → often entity stubs or index notes
- Medium notes (200-800 chars) → often entity definitions (NPC/Area descriptions)

**Optimization**: Include content length hint:
```typescript
const notesJson = notes.map((note) => ({
  ...existing,
  contentLength: note.content.length, // Add this
  contentLengthCategory: note.content.length < 100 ? 'stub' :
                         note.content.length < 500 ? 'short' :
                         note.content.length < 1500 ? 'medium' : 'long'
}));
```

**Impact**: Low - minor signal but helps

---

### Issue 6: Batch Independence Loses Context

**Current**: Each batch of 10 notes is processed independently.

**Problem**: If batch 1 identifies "Kettle" as an NPC, batch 2 doesn't know this when it sees "Kettle reveals that..."

**Optimization Options**:

A. **Two-pass classification** (Higher quality, 2x API cost):
   - Pass 1: Quick classification of all notes
   - Pass 2: Re-classify with full context of other notes' types

B. **Include note type summary in each batch** (No extra cost):
   ```
   Previously classified notes in this import:
   - NPCs: Kettle, Deadeye, Simon, ...
   - Areas: The Fountain District, ...
   - Quests: Visit the Irori Temple, ...
   ```

**Impact**: Medium - improves consistency across batches

---

### Issue 7: Relationship Extraction Could Be Smarter

**Current relationship prompt** provides all note titles but minimal context.

**Optimizations**:

1. **Group notes by type** in the context:
   ```
   NPCs in this campaign: Kettle, Deadeye, Simon, Count Demornay, ...
   Areas: The Fountain District, The Cathedral, ...
   Quests: Visit the Irori Temple, Find the Loyalists, ...
   ```

2. **Provide bidirectional link info**: If Note A links to Note B, and Note B links to Note A, that's a strong relationship signal.

3. **Extract proper nouns from content** before sending to AI, reducing the work Haiku needs to do.

**Impact**: Medium-High for relationship quality

---

## Recommended Implementation Priority

### Phase 1 (Quick Wins - Low Effort, High Impact)
1. ✅ Fix type mismatch bug (PRD-039) - DONE
2. ✅ Add title pattern heuristics to system prompt - DONE
3. ✅ Add linkedTitles usage guidance to prompt - DONE
4. ✅ Include content length category - DONE

### Phase 2 (Medium Effort, Medium Impact)
5. ✅ Pre-detect and handle index notes (code-side, before AI) - DONE
6. ✅ Improve relationship prompt with grouped context - DONE
7. ✅ Batch context accumulation (Option B - no extra API cost) - DONE

### Phase 3 (Higher Effort, Nice to Have)
8. ✅ Allow PC names specification during import - DONE
9. ❌ Two-pass classification - Skipped (user declined due to 2x API cost)

### Additional
10. ✅ Directory structure filtering - DONE (strips tree structure noise)

---

## Metrics to Track

- % of notes needing review (target: <15%, currently ~23%)
- Classification accuracy (manual review of sample)
- Relationship precision (false positive rate)
- API cost per import

---

## Questions for User

1. Would you find value in specifying PC names during import?
2. Is 2x API cost acceptable for two-pass classification?
3. Are there other patterns in your notes that could help classification?

---

## Implementation Notes

### Files Modified
- `server/ai/ai-provider.ts` - Added `ClassificationOptions` interface
- `server/ai/claude-provider.ts` - Batch context accumulation, grouped relationship context, PC names in prompt
- `server/ai/mock-provider.ts` - Updated interface for tests
- `server/routes.ts` - Pre-classify index pages, fetch/pass PC names, accept aiOptions
- `shared/ai-preview-types.ts` - Added `ImportAIOptions` interface
- `shared/nuclino-parser.ts` - Added `stripDirectoryStructure()` for tree structure noise removal
- `client/src/components/nuclino-import-dialog.tsx` - PC names UI (badges, input, detected from team settings)

### Key Technical Decisions
1. **Batch context (Issue 6)**: Implemented Option B - accumulating classified note titles from previous batches and including them in subsequent batch prompts. No extra API cost.
2. **PC names**: Fetched from team member `characterName` fields as starting point, with UI to add additional names for non-Helm users.
3. **Index page detection**: Uses existing `isCollectionPage()` function to pre-classify collection pages as "Note" with 0.85 confidence before sending to AI.
4. **Directory structure**: Added regex-based filtering to strip tree visualization patterns (├──, └──, │) from content.

### Test Coverage
- `shared/nuclino-parser.test.ts` - 6 new tests for `stripDirectoryStructure()` and integration with `parseNuclinoContent()`
- All 544 unit tests pass
