# Product Requirements Documents

This folder contains PRDs for Helm features. Each PRD follows a consistent structure and includes acceptance criteria.

## Notes System Innovation

These PRDs implement the "session-first, structure-later" note-taking system designed for live gameplay capture.

| PRD | Feature | Status | Priority | Dependencies |
|-----|---------|--------|----------|--------------|
| [PRD-001](PRD-001-session-logs.md) | Session Logs | 🔴 To Do | P0 | None |
| [PRD-002](PRD-002-entity-detection.md) | Entity Detection | 🔴 To Do | P1 | PRD-001 |
| [PRD-003](PRD-003-post-session-review.md) | Post-Session Review Mode | 🔴 To Do | P1 | PRD-001, PRD-002 |
| [PRD-004](PRD-004-quest-status-progression.md) | Quest Status Progression | 🔴 To Do | P0 | None |
| [PRD-005](PRD-005-backlinks.md) | Backlinks | 🔴 To Do | P1 | PRD-001 |
| [PRD-006](PRD-006-proximity-suggestions.md) | Proximity Suggestions | 🔴 To Do | P2 | PRD-002 |

### Status Legend
- 🔴 To Do - Not started
- 🟡 In Progress - Implementation underway
- 🟢 Done - Implemented and tested

## Implementation Order

Recommended sequence based on dependencies:

1. **Phase 1**: PRD-001 (Session Logs) + PRD-004 (Quest Status)
2. **Phase 2**: PRD-002 (Entity Detection) + PRD-005 (Backlinks)
3. **Phase 3**: PRD-003 (Post-Session Review) + PRD-006 (Proximity Suggestions)
