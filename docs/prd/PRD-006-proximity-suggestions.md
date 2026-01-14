# PRD-006: Proximity Suggestions

## Status

| Field | Value |
|-------|-------|
| Status | 🟢 Done |
| Priority | P2 |
| Assignee | Claude |
| Started | 2026-01-13 |
| Completed | 2026-01-13 |

## Overview

**Problem**: When creating entities from session logs, users must manually determine relationships (which NPCs are associated with which locations, which quests involve which characters). This is tedious and error-prone.

**Solution**: Automatically suggest entity associations based on mention proximity in session log text. Entities mentioned close together are likely related.

## Background

### Current State
The schema supports `linkedNoteIds` for note relationships, but users must manually establish all connections. No automated relationship suggestions exist.

### Design Principle
**Suggest, don't assume**: Proximity-based suggestions are recommendations only. Users accept or reject each suggestion, and rejected suggestions are remembered per session.

## Requirements

### Functional Requirements

**FR-1: Proximity Window Detection**
- When creating an entity, scan surrounding text (±200 characters or same paragraph)
- Identify other entities (existing or suggested) within the proximity window
- Rank suggestions by distance (closer = stronger suggestion)

**FR-2: Suggestion Types**

| Creating | Suggests Linking To |
|----------|---------------------|
| Person | Nearby Places, nearby Quests |
| Place | Nearby Persons, nearby Quests |
| Quest | Nearby Persons, nearby Places |

**FR-3: Suggestion UI in Review Mode**
- When user clicks "Create Person" for a suggestion:
  1. Show entity creation form
  2. Below form, show "Suggested Associations" section
  3. Checkbox list of nearby entities
  4. Pre-checked based on proximity confidence

**FR-4: Accept/Reject Memory**
- Rejected suggestions don't reappear for that entity in current session
- Accepted suggestions create bidirectional links
- Memory persists in session state, not database

**FR-5: Confidence Scoring**

| Distance | Confidence | Default State |
|----------|------------|---------------|
| Same sentence | High | Pre-checked |
| Same paragraph | Medium | Unchecked, shown |
| Adjacent paragraph | Low | Hidden unless expanded |

### Acceptance Criteria

- [ ] Proximity suggestions appear within 200ms of entity creation start
- [ ] Suggestions show distance-based confidence indicators
- [ ] Accepted suggestions create `linkedNoteIds` entries
- [ ] Rejected suggestions do not reappear in same review session
- [ ] Suggestions work for all entity type combinations
- [ ] Existing entities appear in suggestions (not just new ones)

## User Stories

**US-1**: As a note-taker creating an NPC entry, I want to see which locations and quests were mentioned nearby, so that I can quickly link related entities.

**US-2**: As a reviewer, I want to accept multiple suggestions at once, so that entity creation is efficient.

**US-3**: As a user, I want to dismiss irrelevant suggestions, so that they don't clutter my workflow.

**US-4**: As a returning user, I want my dismissals remembered during this session, so that I don't see the same bad suggestions repeatedly.

## Technical Notes

### Proximity Detection Algorithm

```typescript
interface ProximitySuggestion {
  entityId: string;           // Existing entity or suggestion ID
  entityType: 'person' | 'place' | 'quest';
  entityName: string;
  distance: number;           // Characters from source
  confidence: 'high' | 'medium' | 'low';
  sourceBlockId: string;
  sourceText: string;         // Context snippet
}

function findProximitySuggestions(
  sourceBlockId: string,
  sourcePosition: number,
  allSuggestions: EntitySuggestion[],
  existingEntities: Note[]
): ProximitySuggestion[] {
  const windowSize = 200; // characters
  const sameParagraphBonus = 50; // reduces effective distance

  // Find all entities within window
  // Score by distance
  // Filter by type relevance
  // Return sorted by confidence
}
```

### Confidence Calculation

```typescript
function calculateConfidence(distance: number, sameParagraph: boolean): Confidence {
  const effectiveDistance = sameParagraph ? distance - 50 : distance;

  if (effectiveDistance < 50) return 'high';
  if (effectiveDistance < 150) return 'medium';
  return 'low';
}
```

### UI Integration with Review Mode

```
┌────────────────────────────────────────────────┐
│ Create Person                                  │
├────────────────────────────────────────────────┤
│ Name: [Lord Blackwood_____________]            │
│                                                │
│ Description:                                   │
│ [________________________________]            │
│ [________________________________]            │
│                                                │
│ ─────────────────────────────────────────────  │
│ 💡 Suggested Associations                      │
│                                                │
│ Places:                                        │
│   ☑️ Silverwood Tavern (same sentence) ●●●     │
│   ☐ The Northern Pass (nearby) ●●○            │
│                                                │
│ Quests:                                        │
│   ☑️ "Find the lost artifact" (same para) ●●●  │
│                                                │
│ [Show more suggestions...]                     │
│                                                │
│              [Cancel]  [Create & Link]         │
└────────────────────────────────────────────────┘
```

### Session State Management

```typescript
interface ReviewSessionState {
  // ... other state
  rejectedAssociations: Map<string, Set<string>>; // entityId -> rejected targetIds
}

function shouldShowSuggestion(
  entityId: string,
  targetId: string,
  state: ReviewSessionState
): boolean {
  return !state.rejectedAssociations.get(entityId)?.has(targetId);
}
```

### Extensibility

Design the proximity engine as a replaceable module:

```typescript
interface AssociationSuggester {
  suggest(
    source: EntitySuggestion,
    candidates: (EntitySuggestion | Note)[],
    context: SessionLogContent
  ): Promise<ProximitySuggestion[]>;
}

// Default implementation: distance-based
// Future: LLM-based semantic similarity
```

## Test Requirements

### Unit Tests (`shared/proximity-suggestions.test.ts`)
- Distance calculation between mentions
- Confidence scoring (same sentence > same paragraph > adjacent)
- Suggestion filtering by entity type compatibility
- Rejected suggestion filtering
- Proximity window boundary handling

### Distance Calculation Tests
| Scenario | Distance | Confidence |
|----------|----------|------------|
| Same sentence, 20 chars apart | 20 | High |
| Same paragraph, 100 chars apart | 100 | Medium |
| Adjacent paragraph, 250 chars apart | 250 | Low |
| Different paragraphs, 500+ chars apart | 500+ | Not shown |

### Integration Tests (`server/proximity-suggestions.api.test.ts`)
- Suggestions returned with entity creation form
- Accepted suggestions create `linkedNoteIds` entries
- Rejected suggestions filtered from subsequent requests
- Existing entities included in suggestions
- Suggestions respect team boundaries

### Test Scenarios
| Scenario | Expected Result |
|----------|-----------------|
| Create Person near Place mention | Place suggested with high confidence |
| Create Person, reject Place suggestion | Place not suggested again this session |
| Create Person, accept Place suggestion | Bidirectional link created |
| Create Quest near Person + Place | Both suggested |
| Entity 300+ chars away | Not suggested (outside window) |

### Session State Tests
- Rejected suggestions persist across page navigation
- Rejected suggestions cleared on session end
- Session state isolated per user

### UI Component Tests (`client/src/components/__tests__/proximity-suggestions.test.tsx`)
- Suggestions render in entity creation form
- Checkbox state reflects confidence (pre-checked for high)
- "Show more" expands low-confidence suggestions
- Accept/reject updates UI immediately

### Performance Tests
- Suggestions compute in < 200ms
- Large session logs (1000+ blocks) don't timeout

### Coverage Target
- 90%+ coverage for confidence calculation
- All suggestion type combinations tested

## Implementation

*To be completed upon implementation.*

### Core Algorithm
- [ ] Implement distance calculation
- [ ] Implement confidence scoring
- [ ] Implement proximity window detection
- [ ] Create `AssociationSuggester` interface

### State Management
- [ ] Track rejected suggestions per session
- [ ] Implement session state cleanup
- [ ] Handle accept/reject actions

### UI Integration
- [ ] Add suggestions section to entity creation form
- [ ] Create proximity suggestion checkbox list
- [ ] Implement "Show more" expansion
- [ ] Add confidence indicators

### Files Modified
*List files here after implementation:*
- `shared/proximity-suggestions.ts`
- `shared/proximity-suggestions.test.ts`
- `client/src/components/proximity-suggestions.tsx`
- `client/src/hooks/use-proximity-suggestions.ts`
- ...

### Future Extensibility
*Notes on LLM integration preparation.*

## Dependencies

- **Depends on**: PRD-002 (Entity Detection) - suggestion data structure
- **Enables**: Efficient relationship building during review

## Open Questions

1. Should proximity suggestions also work when editing existing entities?
2. Should there be a "link all high-confidence" batch action?
3. How to visualize suggested vs. confirmed relationships?
4. Should the proximity window be configurable per user?
