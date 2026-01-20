# PRD-022: Real-Time Entity Suggestions in Notes Editor

## Status

| Field | Value |
|-------|-------|
| Status | Proposed |
| Priority | P1 |
| Assignee | TBD |
| Started | - |
| Completed | - |

## Overview

**Problem**: Entity detection and proximity suggestions currently only appear in the Session Review page, requiring users to leave their note-taking context to organize information. During tabletop sessions, there are natural pauses (combat resolution, player discussions, bathroom breaks) where the note-taker could quickly review and act on suggestions without disrupting their flow.

**Solution**: Surface entity suggestions directly beneath the notes editor in real-time, allowing users to accept, dismiss, or reclassify detected entities and see emerging relationships—all without leaving the editing context.

## Background

### Current State
- Entity detection (`shared/entity-detection.ts`) is fully implemented
- Proximity suggestions (`shared/proximity-suggestions.ts`) are fully implemented
- Web Worker and React hook exist but are only wired to Session Review page
- Notes editor has no awareness of detected entities
- Users must navigate to a separate page to see suggestions

### User Insight
Note-takers don't type continuously during sessions. There are natural lulls—dice rolling, rules lookups, player banter—where reviewing suggestions feels natural rather than disruptive. The current "capture now, organize later" model loses this opportunity.

### Design Principle
Suggestions should be **visible but non-intrusive**. They appear below the editor, outside the typing area, and require explicit action to affect the note. The editor remains the primary focus.

## Requirements

### Functional Requirements

**FR-1: Suggestions Panel**
- Display detected entities in a collapsible panel below the editor textarea
- Panel shows when entities are detected, collapses when empty
- Does not affect editor height or scroll position while typing
- Grouped by type: People, Areas, Quests, Points of Interest

**FR-2: Real-Time Detection**
- Use existing `useEntityDetection` hook with Web Worker
- Debounce detection (750ms after typing stops)
- Show loading indicator during detection
- Update suggestions without interrupting typing

**FR-3: Entity Cards**
- Each detected entity shows:
  - Name/text detected
  - Suggested type with icon
  - Confidence indicator (high/medium/low)
  - Mention count (frequency)
  - Quick actions: Accept, Dismiss, Reclassify

**FR-4: Reclassification**
- Dropdown to change suggested type before creating
- Options: Person (NPC/Character), Area, Quest, POI, Note
- Reclassification updates the card immediately
- Original suggestion preserved if user changes mind

**FR-5: Proximity Associations**
- When an entity is selected/focused, show related entities detected nearby
- Display as "Also mentioned with: [Entity A], [Entity B]"
- Confidence based on text proximity (same sentence > same paragraph)
- Associations become `linkedNoteIds` when entity is created

**FR-6: Accept Action**
- Creates new note with detected text as title
- Pre-fills type from suggestion (or reclassified type)
- Automatically links to related entities (from proximity)
- Creates backlink to current session note
- Removes from suggestions list
- Shows brief confirmation toast

**FR-7: Dismiss Action**
- Removes entity from suggestions for this session
- Dismissed entities don't reappear until next session
- Dismissals are session-scoped (not persisted)

**FR-8: Link to Existing**
- If detected entity matches an existing note (fuzzy match), show "Link" instead of "Accept"
- Linking creates backlink without creating duplicate note
- Match indicator shows which existing note it matches

**FR-9: Session Persistence**
- Suggestions state persists across browser refresh within the same day's session
- Store in localStorage keyed by `{teamId}:{sessionDate}`
- Persisted state includes: dismissed IDs, reclassifications, created entity IDs
- State clears automatically when session date changes (new day = fresh start)
- Allows user to close browser during breaks without losing progress

**FR-10: Review All Button**
- "Review All" button displayed in suggestions panel header
- Also accessible from left panel session list (icon button on each session row)
- Opens full Session Review page for that session
- Provides deeper review workflow for users who want more detailed analysis
- Badge shows count of unprocessed suggestions

**FR-11: Bulk Accept**
- "Accept All High-Confidence" button when 2+ high-confidence suggestions exist
- Creates all high-confidence entities in a single action
- Automatically applies proximity associations between bulk-created entities
- Shows confirmation dialog listing entities to be created
- Creates backlinks for all entities to source session
- Toast notification summarizes: "Created 5 entities with 3 relationships"

### Non-Functional Requirements

**NFR-1: Performance**
- Typing latency unaffected (<50ms)
- Suggestions update within 1 second of typing stop
- Panel renders without layout shift

**NFR-2: Accessibility**
- Panel is keyboard navigable
- Screen reader announces new suggestions
- Focus management doesn't trap user in panel

## User Stories

**US-1**: As a note-taker, I want to see detected names and places below my editor while I type, so I can quickly create entities during natural pauses without leaving my notes.

**US-2**: As a note-taker, I want to reclassify a suggestion (e.g., "The Rusty Anchor" from Person to Area), so the system learns from my corrections and creates the right entity type.

**US-3**: As a note-taker, I want to see which entities were mentioned together, so I can understand relationships forming in my notes (e.g., "Captain Ardyn" associated with "The Docks").

**US-4**: As a note-taker, I want to dismiss false positives quickly, so the suggestions panel stays relevant and uncluttered.

**US-5**: As a note-taker, I want to link detected entities to existing notes, so I don't create duplicates when a character reappears.

**US-6**: As a note-taker, I want my dismissed suggestions and reclassifications to persist if I refresh the browser, so I don't lose progress during a long session.

**US-7**: As a note-taker, I want to quickly open the full Session Review page from any session, so I can do a deeper review when I have more time after the game.

**US-8**: As a note-taker, I want to bulk-accept all high-confidence suggestions at once, so I can quickly create multiple obvious entities without repetitive clicking.

## Technical Notes

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Notes Editor Panel                                      │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │  Textarea (existing)                               │  │
│  │  - Autosave with status indicator                  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Entity Suggestions Panel (NEW)                    │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │  │
│  │  │ Lord Vance  │ │ The Docks   │ │ Find the... │  │  │
│  │  │ 👤 Person   │ │ 📍 Area     │ │ 📋 Quest    │  │  │
│  │  │ ×3 mentions │ │ ×2 mentions │ │ ×1 mention  │  │  │
│  │  │ [Accept]    │ │ [Accept]    │ │ [Accept]    │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘  │  │
│  │                                                    │  │
│  │  Associations: Lord Vance ↔ The Docks (high)      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Component Structure

```typescript
// New components
client/src/components/notes/entity-suggestions-panel.tsx
client/src/components/notes/entity-suggestion-card.tsx
client/src/components/notes/proximity-associations.tsx

// Modified components
client/src/components/notes/notes-editor-panel.tsx  // Add suggestions panel
```

### Integration with Existing Code

```typescript
// notes-editor-panel.tsx changes
import { useEntityDetection } from '@/hooks/use-entity-detection';
import { getProximitySuggestions } from '@shared/proximity-suggestions';
import { EntitySuggestionsPanel } from './entity-suggestions-panel';

function NotesEditorPanel({ ... }) {
  // Only run detection for session_log notes
  const { suggestions, isLoading } = useEntityDetection(
    noteType === 'session_log' ? content : '',
    { debounceMs: 750, minConfidence: 'low' }
  );

  const associations = useMemo(() =>
    getProximitySuggestions(suggestions, content),
    [suggestions, content]
  );

  return (
    <div>
      <textarea ... />
      <SaveStatusIndicator ... />

      {noteType === 'session_log' && (
        <EntitySuggestionsPanel
          suggestions={suggestions}
          associations={associations}
          isLoading={isLoading}
          existingNotes={existingNotes}
          onAccept={handleCreateEntity}
          onDismiss={handleDismiss}
          onLink={handleLinkExisting}
        />
      )}
    </div>
  );
}
```

### Entity Suggestion Card

```typescript
interface EntitySuggestionCardProps {
  suggestion: EntitySuggestion;
  associations: ProximitySuggestion[];
  matchingNote?: Note;  // If matches existing
  onAccept: (type: NoteType) => void;
  onDismiss: () => void;
  onLink: (noteId: string) => void;
  onReclassify: (newType: NoteType) => void;
}
```

### State Management

```typescript
// Persisted to localStorage, keyed by `suggestions:{teamId}:{sessionDate}`
interface SuggestionsState {
  sessionDate: string;           // ISO date string (YYYY-MM-DD)
  dismissed: string[];           // Suggestion IDs dismissed this session
  reclassified: Record<string, NoteType>;  // Manual type overrides
  created: string[];             // Entity IDs created from suggestions
  lastUpdated: string;           // ISO timestamp for staleness check
}

// localStorage key format
const STORAGE_KEY = `suggestions:${teamId}:${format(new Date(), 'yyyy-MM-dd')}`;

// Auto-cleanup: Remove keys older than current date on app load
function cleanupStaleSuggestionState(teamId: string) {
  const today = format(new Date(), 'yyyy-MM-dd');
  Object.keys(localStorage)
    .filter(key => key.startsWith(`suggestions:${teamId}:`) && !key.endsWith(today))
    .forEach(key => localStorage.removeItem(key));
}
```

## UI/UX Specifications

### Suggestions Panel

- **Position**: Below editor textarea, above any action buttons
- **Default state**: Collapsed if no suggestions, expanded with fade-in when populated
- **Max height**: 200px with scroll for overflow
- **Collapse toggle**: Chevron button to manually hide/show

### Entity Cards

- **Layout**: Horizontal scroll or flex wrap
- **Card size**: Compact (≈120px wide, ≈80px tall)
- **Hover state**: Elevate, show full associations list
- **Selected state**: Blue border, associations panel expands below

### Reclassification Dropdown

- **Trigger**: Click on type badge (e.g., "👤 Person")
- **Options**: Person, Area, Quest, POI, Note
- **Behavior**: Immediate update, no confirmation needed

### Associations Display

- **Location**: Below the card row when any card is focused
- **Format**: "Mentioned together: [Entity] ↔ [Entity] (confidence)"
- **Interaction**: Click association to pre-select both for creation

## Acceptance Criteria

### Core Suggestions Panel
- [ ] Suggestions panel appears below editor for session_log notes
- [ ] Detected entities display within 1 second of typing stop
- [ ] Each suggestion shows name, type, confidence, and frequency
- [ ] Reclassify dropdown changes suggested type before creation
- [ ] Accept creates note with correct type and linked associations
- [ ] Dismiss removes suggestion for remainder of session
- [ ] Link option appears when matching existing note found
- [ ] Proximity associations shown for focused entity
- [ ] Typing latency remains under 50ms with panel active
- [ ] Panel collapses gracefully when no suggestions
- [ ] Keyboard navigation works for all actions

### Session Persistence
- [ ] Dismissed suggestions remain dismissed after browser refresh
- [ ] Reclassified types persist after browser refresh
- [ ] Created entity tracking persists after browser refresh
- [ ] State automatically clears when date changes (new session day)
- [ ] Old localStorage keys cleaned up on app load

### Review All Button
- [ ] "Review All" button visible in suggestions panel header
- [ ] Review icon button appears on each session row in left panel
- [ ] Clicking opens Session Review page for that session
- [ ] Badge shows count of unprocessed suggestions

### Bulk Accept
- [ ] "Accept All High-Confidence" button appears when 2+ high-confidence suggestions
- [ ] Confirmation dialog shows list of entities to be created
- [ ] All high-confidence entities created in single action
- [ ] Proximity associations applied between bulk-created entities
- [ ] Toast summarizes results (e.g., "Created 5 entities with 3 relationships")

## Test Requirements

### Unit Tests (`client/src/components/notes/entity-suggestions-panel.test.tsx`)

- Renders suggestions grouped by type
- Handles empty suggestions state
- Reclassification updates card type
- Dismiss removes card from display
- Accept triggers creation callback with correct data
- Link triggers link callback for existing matches
- Bulk accept button appears only with 2+ high-confidence suggestions
- Bulk accept creates all high-confidence entities
- Review All button navigates to session review page

### Unit Tests (`client/src/hooks/use-suggestion-persistence.test.ts`)

- Loads persisted state from localStorage on mount
- Saves state to localStorage on changes
- Clears state when session date changes
- Cleans up stale keys from previous days
- Handles missing/corrupted localStorage gracefully

### Integration Tests

- Entity detection runs when typing in session_log editor
- Suggestions update after debounce period
- Created entities appear in notes list
- Backlinks created from accepted suggestions
- Associations stored as linkedNoteIds
- State persists after simulated page refresh
- Bulk accept creates multiple entities with relationships

### E2E Tests

- Type content with names → suggestions appear
- Reclassify and accept → correct note type created
- Dismiss suggestion → doesn't reappear while editing
- Link to existing → no duplicate created, backlink added
- Refresh page → dismissed suggestions still dismissed
- Bulk accept → multiple entities created, toast shows summary
- Review All button → navigates to session review page

## Dependencies

- **Uses**: PRD-002 (Entity Detection), PRD-006 (Proximity Suggestions)
- **Uses**: Existing Web Worker and `useEntityDetection` hook
- **Modifies**: PRD-019 (Notes Editor layout)

## Open Questions

1. Should dismissed suggestions sync across devices for the same user? (Currently localStorage is device-local)

## Decisions Made

1. **Session Persistence**: Yes - suggestions state persists in localStorage within the same day's session (FR-9)
2. **Review All Button**: Yes - accessible from both suggestions panel and session list in left panel (FR-10)
3. **Bulk Accept**: Yes - "Accept All High-Confidence" button for 2+ high-confidence suggestions (FR-11)

## Future Enhancements

- AI-powered relationship inference (beyond proximity)
- Custom entity type definitions per team
- Suggestion learning from user corrections
- Voice-activated accept/dismiss during hands-free play
