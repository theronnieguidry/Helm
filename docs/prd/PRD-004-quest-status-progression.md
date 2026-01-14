# PRD-004: Quest Status Progression

## Status

| Field | Value |
|-------|-------|
| Status | 🟢 Done |
| Priority | P0 (Foundation) |
| Assignee | Claude |
| Started | 2026-01-13 |
| Completed | 2026-01-13 |

## Overview

**Problem**: Quests discovered during gameplay often start as vague hints or rumors. Requiring full quest details at creation time creates friction and causes information loss.

**Solution**: Introduce a quest status progression system with a "lead" state that requires minimal information, allowing quests to be captured immediately and fleshed out later.

## Background

### Current State
Quest notes have the same requirements as other note types: title and optional content. There's no status tracking or workflow for quest progression.

### Design Principle
**Proto-quest support**: Allow incomplete discovery. A quest in "lead" status requires only a title—associations and details can be added later without data loss.

## Requirements

### Functional Requirements

**FR-1: Quest Status Enum**

| Status | Description | Required Fields |
|--------|-------------|-----------------|
| `lead` | Rumor or hint, not yet investigated | Title only |
| `todo` | Accepted but not started | Title, basic description |
| `active` | Currently working on | Title, description, objectives |
| `done` | Completed successfully | All fields, completion notes |
| `abandoned` | Dropped or failed | All fields, reason |

**FR-2: Status Transitions**
```
lead ──▶ todo ──▶ active ──▶ done
  │        │        │
  │        │        └──▶ abandoned
  │        └──────────▶ abandoned
  └────────────────────▶ abandoned
```

**FR-3: Minimal Lead Creation**
- Lead quests require only a title
- All other fields optional at lead stage
- No validation errors for incomplete leads

**FR-4: Deferred Association**
- Quest-to-entity links (characters, places) can be added at any status
- Existing links preserved when status changes
- Backlinks (PRD-005) work regardless of quest status

**FR-5: Status UI**
- Visual badge showing current status
- Status color coding:
  - Lead: Gray (muted)
  - Todo: Blue (pending)
  - Active: Yellow (in progress)
  - Done: Green (success)
  - Abandoned: Red (closed)
- Quick status change dropdown on quest cards

### Acceptance Criteria

- [ ] Quest created with only title defaults to "lead" status
- [ ] Status changes preserve all existing data and links
- [ ] Leads display distinctly from active quests in lists
- [ ] Search includes leads but can filter by status
- [ ] Quest status history tracked (optional: with timestamps)

## User Stories

**US-1**: As a note-taker, I want to capture quest hints immediately with just a name, so that I don't forget rumors mentioned during play.

**US-2**: As a DM, I want to see which quests are active vs. just leads, so that I can track party progress.

**US-3**: As a player, I want to mark quests as abandoned when we decide not to pursue them, so that my quest list stays relevant.

**US-4**: As a reviewer, I want leads to be visually distinct, so that I know which quests need more details.

## Technical Notes

### Schema Changes

```typescript
// Add to shared/schema.ts
export const questStatusEnum = pgEnum('quest_status', [
  'lead', 'todo', 'active', 'done', 'abandoned'
]);

// Add to notes table (nullable, only applies to quest type)
questStatus: questStatusEnum("quest_status").default('lead'),
questCompletedAt: timestamp("quest_completed_at"),
questAbandonedReason: text("quest_abandoned_reason"),
```

### Migration Strategy
- Existing quest notes default to `todo` status (assumed accepted)
- No data migration required for non-quest notes

### API Changes
- `POST /api/teams/:teamId/notes` accepts optional `questStatus`
- `PATCH /api/teams/:teamId/notes/:noteId` accepts `questStatus` for quests
- Add filter parameter: `GET /api/teams/:teamId/notes?questStatus=active`

### UI Components

```typescript
// Quest status badge component
interface QuestStatusBadgeProps {
  status: QuestStatus;
  onChange?: (status: QuestStatus) => void;
  editable?: boolean;
}

// Status filter chips
const statusFilters = ['all', 'lead', 'todo', 'active', 'done', 'abandoned'];
```

### Quest Card Display

```
┌────────────────────────────────────┐
│ 📜 Find the Lost Artifact    [LEAD]│
│ ─────────────────────────────────  │
│ Lord Blackwood mentioned it...     │
│                                    │
│ 📍 Silverwood  👤 Blackwood        │
│                        🕐 2h ago   │
└────────────────────────────────────┘
```

## Test Requirements

### Unit Tests (`shared/quest-status.test.ts`)
- Status enum validation
- Valid status transitions
- Invalid status transitions rejected
- Default status assignment

### Status Transition Tests
| From | To | Valid |
|------|-----|-------|
| `lead` | `todo` | ✅ |
| `lead` | `active` | ❌ (must go through todo) |
| `lead` | `abandoned` | ✅ |
| `todo` | `active` | ✅ |
| `todo` | `done` | ❌ (must go through active) |
| `active` | `done` | ✅ |
| `active` | `abandoned` | ✅ |
| `done` | `active` | ❌ (terminal state) |
| `abandoned` | `todo` | ❌ (terminal state) |

### Integration Tests (`server/quest-status.api.test.ts`)
- Create quest with only title (defaults to `lead`)
- Create quest with explicit status
- Update quest status via PATCH
- Filter quests by status (`?questStatus=active`)
- Existing non-quest notes unaffected by migration
- Status change preserves all linked entities

### Test Scenarios
| Scenario | Expected Result |
|----------|-----------------|
| Create minimal lead quest | Success with `lead` status, null description |
| Transition lead → todo | Success |
| Transition lead → done | Error: invalid transition |
| Query active quests | Returns only `active` status quests |
| Delete quest | Removes quest and status data |

### Migration Tests
- Existing quest notes get `todo` status (not `lead`)
- Non-quest notes have null `questStatus`
- Migration is idempotent

### Coverage Target
- 100% coverage for status transition validation
- All API endpoints have success and error tests

## Implementation

*To be completed upon implementation.*

### Schema Changes
- [ ] Create `questStatusEnum` in schema
- [ ] Add `questStatus` column to notes table
- [ ] Add `questCompletedAt` timestamp column
- [ ] Add `questAbandonedReason` text column

### API Changes
- [ ] Update note creation to accept `questStatus`
- [ ] Update note PATCH to validate status transitions
- [ ] Add status filter to notes GET endpoint

### UI Changes
- [ ] Create QuestStatusBadge component
- [ ] Add status dropdown to quest cards
- [ ] Add status filter chips to notes page
- [ ] Color-code quest cards by status

### Migration
- [ ] Write migration to set existing quests to `todo`
- [ ] Verify migration is idempotent

### Files Modified
*List files here after implementation:*
- `shared/schema.ts`
- `shared/quest-status.ts`
- `server/routes.ts`
- `client/src/components/quest-status-badge.tsx`
- ...

## Dependencies

- **Depends on**: None (can be implemented independently)
- **Enables**: Better quest workflow in PRD-003 (Post-Session Review)

## Open Questions

1. Should status changes be logged with timestamps for history?
2. Should there be XP or completion rewards tied to quest status?
3. Should "done" quests require completion notes or stay optional?
4. Allow custom statuses beyond the five defined?
