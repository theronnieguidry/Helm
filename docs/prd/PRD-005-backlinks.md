# PRD-005: Backlinks

## Status

| Field | Value |
|-------|-------|
| Status | 🟢 Done |
| Priority | P1 |
| Assignee | Claude |
| Started | 2026-01-13 |
| Completed | 2026-01-13 |

## Overview

**Problem**: When entities (characters, places, quests) are mentioned across multiple session logs, there's no way to see all references from the entity's page. Information becomes scattered and hard to track.

**Solution**: Auto-generated backlinks that show every Session Log mention of an entity, with click-to-navigate to the exact source location.

## Background

### Current State
The schema supports `linkedNoteIds` for manual note-to-note relationships, but there's no automatic tracking of where entities are mentioned in session logs.

### Design Principle
**Backlinks always reflect current state**: When a session log is edited, backlinks update automatically. No stale references.

## Requirements

### Functional Requirements

**FR-1: Automatic Backlink Generation**
- When an entity is created from a Session Log block, record the source reference
- Backlinks stored bidirectionally:
  - Entity → list of mentioning blocks
  - Block → list of referenced entities

**FR-2: Backlink Display on Entity Pages**
- "Mentioned In" section on entity detail view
- Chronological list of Session Log references
- Each reference shows:
  - Session date
  - Surrounding context (snippet)
  - Click to navigate to exact block

**FR-3: Navigation**
- Click backlink → opens Session Log at referenced block
- Block scrolls into view and highlights briefly
- Back button returns to entity page

**FR-4: Real-Time Updates**
- Backlinks update when:
  - Entity is linked to new block (via review mode)
  - Block text changes (re-index references)
  - Entity is deleted (remove backlinks)
  - Block is deleted (remove backlink)

**FR-5: Search Integration**
- Entity search includes backlink content
- Searching "Blackwood" finds entities AND session mentions

### Acceptance Criteria

- [ ] Backlinks display within 500ms of entity page load
- [ ] Clicking backlink navigates to exact source block
- [ ] Backlinks update when source content changes
- [ ] Deleted blocks remove their backlinks
- [ ] Search matches entity names in session log content
- [ ] Backlinks work for all entity types (Person, Place, Quest)

## User Stories

**US-1**: As a DM viewing an NPC, I want to see every session where they appeared, so that I can review their story arc.

**US-2**: As a player, I want to click on a mention to see the full context, so that I can remember what happened.

**US-3**: As a note-taker, I want backlinks to update automatically when I edit session logs, so that references stay accurate.

## Technical Notes

### Data Model

```typescript
// New table for backlinks
export const backlinks = pgTable("backlinks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceNoteId: varchar("source_note_id").notNull(),  // Session Log
  sourceBlockId: varchar("source_block_id").notNull(), // Block within log
  targetNoteId: varchar("target_note_id").notNull(),   // Entity (Person/Place/Quest)
  textSnippet: text("text_snippet"),                   // Context preview
  createdAt: timestamp("created_at").defaultNow(),
});

// Indexes for efficient queries
// - By targetNoteId (show backlinks on entity page)
// - By sourceNoteId (update backlinks when session edited)
```

### API Endpoints

```typescript
// Get backlinks for an entity
GET /api/teams/:teamId/notes/:noteId/backlinks
// Response: { backlinks: Backlink[] }

// Backlinks created automatically via:
// - PRD-003 Post-Session Review entity creation
// - Manual entity linking in session editor
```

### UI Component

```
┌────────────────────────────────────────────────┐
│ 👤 Lord Blackwood                              │
│ NPC • Created Jan 15                           │
├────────────────────────────────────────────────┤
│ [Description content...]                       │
│                                                │
│ ───────────────────────────────────────────── │
│ 📎 Mentioned In (4)                            │
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ 📅 Session Jan 15                         │  │
│ │ "...met Lord Blackwood at the tavern.     │  │
│ │  He asked us to find the artifact..."     │  │
│ │                              [View →]     │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ 📅 Session Jan 22                         │  │
│ │ "...returned to Lord Blackwood with       │  │
│ │  news of our failure..."                  │  │
│ │                              [View →]     │  │
│ └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

### Navigation Implementation

```typescript
// URL structure for deep linking to blocks
/teams/:teamId/notes/:sessionLogId?block=:blockId

// On load, if block param present:
useEffect(() => {
  if (blockId) {
    const element = document.getElementById(`block-${blockId}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.classList.add('highlight-flash');
  }
}, [blockId]);
```

### Indexing Strategy

For performance with large session histories:
- Index backlinks table by `targetNoteId`
- Cache backlink counts per entity
- Lazy-load full backlink list on entity page scroll

## Test Requirements

### Unit Tests (`shared/backlinks.test.ts`)
- Text snippet extraction (context around mention)
- Snippet truncation for long content
- Backlink sorting (chronological)

### Integration Tests (`server/backlinks.api.test.ts`)
- `GET /api/teams/:teamId/notes/:noteId/backlinks` returns mentions
- Backlink created when entity linked to block
- Backlink removed when source block deleted
- Backlink removed when entity deleted
- Backlink updated when block text changes
- Backlinks respect team boundaries

### Test Scenarios
| Scenario | Expected Result |
|----------|-----------------|
| Create entity from session block | Backlink automatically created |
| Delete session log | All backlinks from that log removed |
| Delete entity | All backlinks to that entity removed |
| Edit session log block | Backlink snippet updated |
| Query entity with 5 mentions | Returns 5 backlinks, chronological |
| Non-member queries backlinks | 403 Forbidden |

### Navigation Tests (`client/src/pages/__tests__/backlinks.test.tsx`)
- Click backlink navigates to session log
- Block scrolls into view
- Block highlights briefly (animation)
- Back button returns to entity page

### Performance Tests
- Backlinks load in < 500ms for entity with 50+ mentions
- Backlink queries use indexes (explain plan)

### Data Integrity Tests
- Orphan backlinks cleaned up (source deleted)
- Circular references handled (entity mentions itself)
- Duplicate backlinks prevented (same block, same entity)

### Coverage Target
- All CRUD operations for backlinks table tested
- Cascade delete behavior verified

## Implementation

*To be completed upon implementation.*

### Schema Changes
- [ ] Create `backlinks` table
- [ ] Add indexes for `targetNoteId` and `sourceNoteId`
- [ ] Set up cascade delete triggers

### API Changes
- [ ] Add `GET /api/teams/:teamId/notes/:noteId/backlinks` endpoint
- [ ] Create backlink on entity-block linking
- [ ] Delete backlinks on note/block deletion
- [ ] Update snippet on block content change

### UI Changes
- [ ] Add "Mentioned In" section to entity detail view
- [ ] Create backlink card component
- [ ] Implement click-to-navigate with block highlighting
- [ ] Add highlight animation CSS

### Files Modified
*List files here after implementation:*
- `shared/schema.ts`
- `server/routes.ts`
- `server/storage.ts`
- `client/src/components/backlink-list.tsx`
- `client/src/pages/note-detail.tsx`
- ...

### Performance Notes
*Document indexing strategy and caching decisions.*

## Dependencies

- **Depends on**: PRD-001 (Session Logs) - block-based content with stable IDs
- **Enables**: Rich entity relationship discovery

## Open Questions

1. Should backlinks include mentions from regular notes, or only session logs?
2. Should we show a "mentioned in X sessions" summary on entity cards in lists?
3. How to handle backlinks when entities are merged?
4. Should there be a graph visualization of entity relationships via backlinks?
