# PRD-003: Post-Session Review Mode

## Status

| Field | Value |
|-------|-------|
| Status | 🟢 Done |
| Priority | P1 |
| Assignee | Claude |
| Started | 2026-01-13 |
| Completed | 2026-01-13 |

## Overview

**Problem**: After a gaming session, converting raw session notes into structured entities is tedious. Users must manually read through notes, remember what entities they mentioned, and create each one individually.

**Solution**: A dedicated review screen that presents detected entities alongside session content, enabling efficient one-click entity creation.

## Background

### Current State
Users must manually create notes for each character, location, or quest discovered during play. There's no workflow for bulk processing session notes into structured data.

### Design Principle
**Target**: Convert raw session notes to structured entities in under 5 clicks. The review interface should make structuring feel like a cleanup task, not a creative burden.

## Requirements

### Functional Requirements

**FR-1: Split Panel Interface**
- Left panel: Session Log content with selectable blocks
- Right panel: Detected entity suggestions with actions
- Resizable panels with sensible defaults (60/40 split)

**FR-2: Entity Suggestion Display**
- Group suggestions by type (Persons, Places, Quests)
- Show frequency count for each suggestion
- Show confidence indicator (high/medium/low)
- Highlight corresponding text when suggestion is focused

**FR-3: Quick Actions**

| Action | Behavior |
|--------|----------|
| Create Person | Opens pre-filled Person note form |
| Create Place | Opens pre-filled Place note form |
| Create Quest | Opens pre-filled Quest note form (lead status) |
| Dismiss | Removes suggestion from list (session-scoped) |
| Select Text | Creates entity from arbitrary text selection |

**FR-4: Text Selection Entity Creation**
- User can select any text span in session log
- Selection triggers "Create Entity" popover
- Popover offers Person/Place/Quest type selection
- Created entity links back to source block

**FR-5: Progress Tracking**
- Show completion indicator (X of Y suggestions processed)
- Option to mark session as "reviewed"
- Visual distinction for processed vs. unprocessed sessions

### Acceptance Criteria

- [ ] Post-Session Review loads in under 2 seconds
- [ ] Entity creation pre-fills title from detected text
- [ ] Created entities automatically link to source block
- [ ] Dismissed suggestions do not reappear in same session
- [ ] Text selection works across block boundaries
- [ ] Review progress persists across browser sessions

## User Stories

**US-1**: As a DM after a session, I want to see all the names and places I mentioned, so that I can quickly create entries for important ones.

**US-2**: As a note-taker, I want to create an entity from any text I select, so that I'm not limited to what the system detected.

**US-3**: As a user, I want to dismiss irrelevant suggestions, so that I can focus on what matters.

**US-4**: As a returning user, I want to see which sessions I've already reviewed, so that I don't duplicate work.

## Technical Notes

### UI Components

```
┌─────────────────────────────────────────────────────────────────┐
│  Post-Session Review: Session 2024-01-15                   [X]  │
├─────────────────────────────────┬───────────────────────────────┤
│                                 │  Suggestions (12)             │
│  Session Log                    │                               │
│  ─────────────                  │  ▼ Persons (5)                │
│                                 │    ☐ Lord Blackwood (4x) ●●●  │
│  "We met Lord Blackwood at the  │    ☐ Sister Mary (2x) ●●○     │
│  Silverwood Tavern. He asked us │    ☐ Kira (1x) ●○○            │
│  to find the lost artifact..."  │                               │
│  ─────────────                  │  ▼ Places (4)                 │
│                                 │    ☐ Silverwood Tavern (3x)   │
│  [Selected: Lord Blackwood]     │    ☐ The Northern Pass (1x)   │
│                                 │                               │
│                                 │  ▼ Quests (3)                 │
│                                 │    ☐ "find the lost artifact" │
│                                 │                               │
│                                 │  ─────────────────────────────│
│                                 │  [Create Selected] [Dismiss]  │
└─────────────────────────────────┴───────────────────────────────┘
```

### State Management

```typescript
interface ReviewState {
  sessionLogId: string;
  suggestions: EntitySuggestion[];
  dismissedIds: Set<string>;
  createdIds: Set<string>;
  selectedBlockId: string | null;
  selectedText: { start: number; end: number } | null;
}
```

### Entity Creation Flow

```typescript
async function createEntityFromSuggestion(
  suggestion: EntitySuggestion,
  noteType: NoteType
): Promise<Note> {
  const note = await createNote({
    title: suggestion.text,
    noteType,
    content: '',
    linkedNoteIds: [], // Source block reference added via backlinks
    // For quests, default to 'lead' status (PRD-004)
  });

  // Create backlink from source blocks
  for (const mention of suggestion.mentions) {
    await createBacklink(mention.blockId, note.id);
  }

  return note;
}
```

### Navigation
- Access from: Session Log "Review" button, or Sessions list "Review" action
- Exit to: Notes page or back to Session Log editor

## Test Requirements

### Unit Tests (`shared/review-mode.test.ts`)
- Suggestion grouping by type
- Suggestion sorting by frequency and confidence
- Dismissed suggestion filtering
- Progress calculation (X of Y processed)
- Text selection normalization across blocks

### Integration Tests (`server/review-mode.api.test.ts`)
- Entity creation from suggestion pre-fills title
- Created entities link back to source block
- Backlink creation on entity save
- Dismiss state persists in session
- Multiple entities created from same selection

### UI Component Tests (`client/src/pages/__tests__/review-mode.test.tsx`)
- Split panel renders with correct proportions
- Suggestion click highlights source text
- Text selection triggers entity creation popover
- Dismiss button removes suggestion from list
- Progress indicator updates on action

### Test Scenarios
| Scenario | Expected Result |
|----------|-----------------|
| Create Person from suggestion | Note created with type `character`, backlink added |
| Create Quest from suggestion | Note created with `lead` status (PRD-004) |
| Dismiss suggestion | Removed from list, doesn't reappear |
| Select arbitrary text | Entity creation popover appears |
| Complete all suggestions | Session marked as reviewed |

### End-to-End Flow
1. Create session log with multiple entity mentions
2. Open review mode
3. Create entities from 3 suggestions
4. Dismiss 2 suggestions
5. Verify entities created with backlinks
6. Verify dismissed suggestions not visible
7. Verify progress shows 3/5 processed

### Coverage Target
- All acceptance criteria have corresponding test cases
- Error paths tested (creation failure, network error)

## Implementation

*To be completed upon implementation.*

### UI Components
- [ ] Create split-panel review layout
- [ ] Create suggestion list component with grouping
- [ ] Create entity creation form with pre-fill
- [ ] Create text selection popover
- [ ] Create progress indicator

### State Management
- [ ] Implement review session state
- [ ] Track dismissed suggestions
- [ ] Track created entities
- [ ] Persist review progress

### Integration
- [ ] Connect to entity detection (PRD-002)
- [ ] Connect to backlinks creation (PRD-005)
- [ ] Connect to quest status (PRD-004)

### Files Modified
*List files here after implementation:*
- `client/src/pages/review-mode.tsx`
- `client/src/components/suggestion-list.tsx`
- `client/src/hooks/use-review-session.ts`
- ...

### Design Decisions
*Document key design decisions made during implementation.*

## Dependencies

- **Depends on**: PRD-001 (Session Logs), PRD-002 (Entity Detection)
- **Enables**: Efficient entity creation workflow

## Open Questions

1. Should review mode support batch operations (create all Persons at once)?
2. Should there be keyboard shortcuts for power users?
3. How to handle entity creation failures (name conflicts, validation errors)?
