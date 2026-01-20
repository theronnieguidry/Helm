# PRD-026 — Haiku-Based Entity Extraction

## Story Status
Completed

## Summary
Prototype and evaluate Claude Haiku (claude-3-5-haiku-20241022) for entity extraction from session log content. This complements the existing pattern-based detection (PRD-002, PRD-024, PRD-025) with AI-powered entity recognition.

**Related PRDs:**
- PRD-002 (Entity Detection in Session Logs)
- PRD-024 (Entity Detection Quality Improvements)
- PRD-025 (Entity Detection Follow-up Bugs)
- PRD-016 (AI Enrichment System)

---

## Motivation

### Current Pattern-Based Limitations

The pattern-based entity detection (PRD-024, PRD-025) has inherent limitations:

1. **Context-Blind**: Can't understand narrative context (e.g., "Captain" referring to a ship, not a person)
2. **New Patterns**: Adding every TTRPG naming convention requires code changes
3. **Relationship Inference**: Cannot infer relationships like "son of" or "located in"
4. **Disambiguation**: Can't distinguish "Iron" the blacksmith from "Iron" the material

### Haiku Advantages

- **Contextual Understanding**: Understands narrative and can disambiguate based on context
- **Flexible Entity Recognition**: Recognizes entity patterns without explicit rules
- **Relationship Extraction**: Can identify relationships between entities
- **No Pattern Maintenance**: Works with any naming convention

---

## Architecture

### Deployment Model

**Server-side endpoint** using the existing `ANTHROPIC_API_KEY` environment variable.

**Future Extensibility**: Design for per-team API keys:
- Add `aiApiKey` field to teams table (encrypted)
- Provider factory accepts optional key override
- UI in settings to configure team's API key

### Interface Extension

Extend the existing `AIProvider` interface with entity extraction capability:

```typescript
// New method in AIProvider interface
extractEntities(content: string, existingNotes?: NoteReference[]): Promise<EntityExtractionResult>;

// Types
interface NoteReference {
  id: string;
  title: string;
  noteType: string;
}

interface ExtractedEntity {
  name: string;
  type: "npc" | "place" | "quest" | "item" | "faction";
  confidence: number;
  mentions: number;
  context?: string;
  matchedNoteId?: string;
}

interface EntityRelationship {
  entity1: string;
  entity2: string;
  relationship: string;
  confidence: number;
}

interface EntityExtractionResult {
  entities: ExtractedEntity[];
  relationships: EntityRelationship[];
}
```

---

## Implementation

### System Prompt Design

```
You are analyzing TTRPG (tabletop roleplaying game) session notes to extract entities and relationships.

## Entity Types
- NPC: Named characters, deities, historical figures (not player characters)
- Place: Locations, regions, buildings, geographic features
- Quest: Missions, tasks, objectives, storylines
- Item: Named artifacts, weapons, magical items
- Faction: Organizations, groups, guilds, kingdoms

## Guidelines
1. **Titled References**: "the Captain", "the Baron" likely refer to previously named titled entities
2. **Possessives**: "Duke's son" = the Duke entity exists
3. **Context Matters**: "Iron" could be a blacksmith name or material - use context
4. **Relationship Types**: "son of", "member of", "located in", "rules", "works for"
5. **Confidence**: 0.9+ = explicit names, 0.7-0.9 = strong context, 0.5-0.7 = inferred

## Existing Notes (for matching)
{existingNotes}

## Output Format
Return valid JSON only:
{
  "entities": [
    {
      "name": "Captain Garner",
      "type": "npc",
      "confidence": 0.95,
      "mentions": 3,
      "context": "Military commander meeting with the party",
      "matchedNoteId": "note-123" // if matches existing note
    }
  ],
  "relationships": [
    {
      "entity1": "Captain Garner",
      "entity2": "Iron Keep",
      "relationship": "stationed at",
      "confidence": 0.8
    }
  ]
}
```

### API Endpoint

```
POST /api/teams/:teamId/extract-entities
Authorization: Required (team member)
Content-Type: application/json

Request Body:
{
  "content": "Session log text content..."
}

Response:
{
  "entities": [...],
  "relationships": [...]
}
```

---

## Integration Strategy

### Hybrid Approach (Recommended)

Run pattern detection and Haiku in parallel, merge results:

1. **Instant Feedback**: Pattern detection runs immediately on client
2. **AI Enhancement**: Haiku call happens server-side, results merged
3. **Confidence Upgrade**: AI can boost confidence of pattern-detected entities
4. **New Discoveries**: AI can find entities patterns missed

### Merge Algorithm

```typescript
function mergeResults(
  patternEntities: DetectedEntity[],
  aiEntities: ExtractedEntity[]
): MergedEntity[] {
  const merged = new Map<string, MergedEntity>();

  // Add pattern entities first
  for (const entity of patternEntities) {
    merged.set(entity.normalizedText, {
      ...entity,
      aiConfidence: null,
      aiContext: null,
    });
  }

  // Merge or add AI entities
  for (const aiEntity of aiEntities) {
    const normalized = aiEntity.name.toLowerCase();
    const existing = merged.get(normalized);

    if (existing) {
      // Merge: take higher confidence, add AI context
      existing.aiConfidence = aiEntity.confidence;
      existing.aiContext = aiEntity.context;
      if (aiEntity.confidence > existing.confidence) {
        existing.confidence = aiEntity.confidence;
      }
    } else {
      // New entity from AI
      merged.set(normalized, {
        id: generateId(),
        type: mapType(aiEntity.type),
        text: aiEntity.name,
        normalizedText: normalized,
        confidence: aiEntity.confidence,
        aiConfidence: aiEntity.confidence,
        aiContext: aiEntity.context,
        mentions: [{ text: aiEntity.name }],
        frequency: aiEntity.mentions,
      });
    }
  }

  return Array.from(merged.values());
}
```

---

## Cost Analysis

### Haiku Pricing (as of 2024)
- Input: $0.25 / 1M tokens
- Output: $1.25 / 1M tokens

### Estimated Usage Per Session
- Average session log: ~500-2000 tokens
- System prompt + context: ~500 tokens
- Response: ~200-500 tokens
- **Cost per extraction**: ~$0.0003-0.001

### Monthly Estimate (Active Usage)
- 10 sessions/week/team
- 50 teams
- ~2000 extractions/month
- **Monthly cost**: ~$0.60-2.00

---

## Testing Strategy

### Unit Tests
- Mock provider returns expected structure
- Entity merging handles duplicates
- Type mapping is correct

### Integration Tests
- Endpoint requires authentication
- Handles empty content
- Returns valid response structure

### Comparison Testing
- Run same content through patterns vs Haiku
- Document differences in detection
- Measure confidence differences

---

## Files Modified

| File | Changes |
|------|---------|
| `server/ai/ai-provider.ts` | Added `extractEntities()` interface method and types (NoteReference, ExtractedEntity, EntityRelationship, EntityExtractionResult) |
| `server/ai/claude-provider.ts` | Implemented Haiku entity extraction with system/user prompts |
| `server/ai/mock-provider.ts` | Added mock implementation with setMockEntityExtraction, addMockEntity, addMockEntityRelationship |
| `server/routes.ts` | Added POST `/api/teams/:teamId/extract-entities` endpoint |

---

## Acceptance Criteria

- [x] `extractEntities()` method added to AIProvider interface
- [x] ClaudeAIProvider implements Haiku-based extraction
- [x] MockAIProvider has testable mock implementation
- [x] API endpoint `/api/teams/:teamId/extract-entities` works
- [x] Response includes entities array with correct structure
- [x] Response includes relationships array (may be empty)
- [x] Entity types map correctly (npc, place, quest, etc.)
- [x] Tests pass for the new functionality
- [x] Comparison results documented between pattern vs Haiku

---

## Comparison Results

Tested with real session notes (see `scripts/test-entity-extraction.ts`):

| Aspect | Pattern-Based | Haiku AI |
|--------|---------------|----------|
| Entities found | 15 | 15 |
| Relationships | 0 | 7 |
| Context descriptions | No | Yes |
| Latency | Instant | ~2 seconds |
| Cost per call | Free | ~$0.0005 |

### Haiku Advantages
- Found implicit entities ("Duke's son")
- Extracted relationships (Gundren → former owner of → Chuckwagon)
- Rich context descriptions for each entity
- Better type classification (Chuckwagon as place, not NPC)

### Pattern Advantages
- Instant results (no API latency)
- Free (no API costs)
- Works offline
- Caught "Samwell" that Haiku missed

### Recommendation
Use hybrid approach: Pattern results immediately, Haiku enhancement in background

---

## Future Enhancements

1. **Per-Team API Keys**: Teams can use their own Anthropic API key
2. **Caching**: Cache extraction results to avoid redundant API calls
3. **Streaming**: Stream entity results as they're detected
4. **Batch Processing**: Extract entities for multiple sessions in bulk
5. **Client Integration**: Call from real-time entity suggestions panel
