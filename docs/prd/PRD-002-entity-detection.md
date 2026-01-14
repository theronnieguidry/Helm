# PRD-002: Entity Detection

## Status

| Field | Value |
|-------|-------|
| Status | 🟢 Done |
| Priority | P1 |
| Assignee | Claude |
| Started | 2026-01-13 |
| Completed | 2026-01-13 |

## Overview

**Problem**: Manually creating entities (characters, locations, quests) during or after gameplay is tedious and error-prone. Important details get lost when note-takers forget to create structured entries.

**Solution**: Implement passive background scanning of Session Log content to detect potential entities and present them as suggestions for later review.

## Background

### Current State
Users must manually create notes for each entity, requiring them to remember names, select types, and enter details. This creates friction and information loss.

### Design Principle
Detection identifies candidates only—no automatic entity creation. Users maintain full control during post-session review.

## Requirements

### Functional Requirements

**FR-1: Background Scanning**
- Scan Session Log content as user types
- Processing runs asynchronously without blocking input
- Re-scan on content changes with debounce

**FR-2: Pattern Detection**

| Pattern | Entity Type | Examples |
|---------|-------------|----------|
| Capitalized multi-word names | Person | "Lord Blackwood", "Sister Mary" |
| Capitalized single names (context-aware) | Person | "Gandalf", "Kira" |
| Location indicators | Place | "the Silverwood Forest", "Castle Draven" |
| Quest verbs | Quest | "need to find", "asked us to", "must defeat" |

**FR-3: Suggestion Storage**
- Store detected candidates with:
  - Suggested type (Person/Place/Quest)
  - Source block ID and position
  - Frequency count across session
  - Confidence score (high/medium/low)
- Suggestions are session-scoped, not persisted across sessions

**FR-4: Zero Latency Impact**
- Detection runs in web worker or background process
- Main thread typing latency must remain unaffected
- Detection can be delayed up to 500ms after typing stops

### Acceptance Criteria

- [ ] Typing latency shows zero degradation from background processing
- [ ] Capitalized proper nouns detected with >90% recall
- [ ] Location patterns detected when preceded by articles ("the", "a")
- [ ] Quest patterns detected from action verb phrases
- [ ] Suggestions update within 1 second of typing stop
- [ ] Duplicate detections consolidated with frequency counts

## User Stories

**US-1**: As a note-taker, I want the system to notice when I mention names and places, so that I don't have to remember to create entries for them later.

**US-2**: As a reviewer, I want to see how many times each entity was mentioned, so that I can prioritize important characters and locations.

**US-3**: As a user, I want detection to happen invisibly without slowing my typing, so that the feature doesn't interrupt my note-taking.

## Technical Notes

### Detection Pipeline

```typescript
interface EntitySuggestion {
  id: string;
  text: string;              // Detected text
  suggestedType: 'person' | 'place' | 'quest';
  confidence: 'high' | 'medium' | 'low';
  mentions: Array<{
    blockId: string;
    startOffset: number;
    endOffset: number;
  }>;
  frequency: number;
  dismissed: boolean;        // User rejected this suggestion
}
```

### Pattern Matchers

```typescript
// Person detection
const personPatterns = [
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,  // Multi-word names
  /\b(?:Lord|Lady|King|Queen|Sir|Dame|Captain|Doctor|Professor)\s+[A-Z][a-z]+/g,
];

// Place detection
const placePatterns = [
  /\b(?:the|a)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Forest|Castle|Tower|Village|City|Mountains?|River|Lake|Inn|Tavern))?/gi,
];

// Quest detection
const questPatterns = [
  /(?:need to|must|have to|asked (?:us|me) to|quest(?:ed)? to|tasked with)\s+[^.!?]+/gi,
];
```

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Session Log    │────▶│  Web Worker      │────▶│  Suggestions    │
│  Editor         │     │  (Detection)     │     │  Store          │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                                                 │
        │ (no blocking)                                   │
        ▼                                                 ▼
┌─────────────────┐                             ┌─────────────────┐
│  Main Thread    │                             │  Review Mode    │
│  (typing)       │                             │  (PRD-003)      │
└─────────────────┘                             └─────────────────┘
```

### Extensibility
Design extraction pipeline as a replaceable module for future AI/LLM upgrades. Interface:

```typescript
interface EntityDetector {
  detect(content: string): Promise<EntitySuggestion[]>;
}
```

## Test Requirements

### Unit Tests (`shared/entity-detection.test.ts`)
- Person pattern detection (multi-word names, titles)
- Place pattern detection (article + proper noun)
- Quest pattern detection (action verb phrases)
- Confidence scoring algorithm
- Frequency counting across mentions
- Duplicate detection and consolidation

### Pattern Detection Tests
| Input | Expected Detection |
|-------|-------------------|
| `"Lord Blackwood entered"` | Person: "Lord Blackwood" (high) |
| `"the Silverwood Forest"` | Place: "Silverwood Forest" (high) |
| `"asked us to find the artifact"` | Quest: "find the artifact" (medium) |
| `"The party rested"` | No detection (common noun) |
| `"Kira said hello"` | Person: "Kira" (medium, single name) |
| `"We need to defeat the dragon"` | Quest: "defeat the dragon" (high) |

### Integration Tests (`server/entity-detection.api.test.ts`)
- Detection runs without blocking main thread (timing test)
- Suggestions stored per session, not persisted
- Re-detection on content change
- Detection disabled for non-session-log notes

### Performance Tests
- Typing latency with detection active < 50ms (benchmark)
- Detection completes within 500ms of typing stop
- Memory usage stable with large session logs

### Coverage Target
- 90%+ coverage for pattern matchers (critical logic)
- All pattern types have positive and negative test cases

## Implementation

*To be completed upon implementation.*

### Core Components
- [ ] Create `EntityDetector` interface in shared/
- [ ] Implement pattern matchers (Person, Place, Quest)
- [ ] Implement confidence scoring
- [ ] Implement frequency counting

### Client-Side
- [ ] Set up Web Worker for background processing
- [ ] Create suggestion store (session-scoped state)
- [ ] Integrate with session log editor

### Files Modified
*List files here after implementation:*
- `shared/entity-detection.ts`
- `shared/entity-detection.test.ts`
- `client/src/workers/entity-detector.worker.ts`
- `client/src/hooks/use-entity-suggestions.ts`
- ...

### Performance Optimizations
*Document any optimizations applied.*

## Dependencies

- **Depends on**: PRD-001 (Session Logs) - block-based content structure
- **Enables**: PRD-003 (Post-Session Review), PRD-006 (Proximity Suggestions)

## Open Questions

1. Should detection run on existing plain-text notes or only new session logs?
2. Should we support custom patterns (user-defined entity markers)?
3. How to handle ambiguous cases (e.g., "The Party" - group or location)?
