# Product Requirements Documents

This folder contains PRDs for Helm features. Each PRD follows a consistent structure and includes acceptance criteria.

## Notes System Innovation

These PRDs implement the "session-first, structure-later" note-taking system designed for live gameplay capture.

| PRD | Feature | Status | Priority | Dependencies |
|-----|---------|--------|----------|--------------|
| [PRD-001](PRD-001-session-logs.md) | Session Logs | 🟢 Done | P0 | None |
| [PRD-002](PRD-002-entity-detection.md) | Entity Detection | 🟢 Done | P1 | PRD-001 |
| [PRD-003](PRD-003-post-session-review.md) | Post-Session Review Mode | 🟢 Done | P1 | PRD-001, PRD-002 |
| [PRD-004](PRD-004-quest-status-progression.md) | Quest Status Progression | 🟢 Done | P0 | None |
| [PRD-005](PRD-005-backlinks.md) | Backlinks | 🟢 Done | P1 | PRD-001 |
| [PRD-006](PRD-006-proximity-suggestions.md) | Proximity Suggestions | 🟢 Done | P2 | PRD-002 |

### Note-Taking Completion (Issues #1-#4)

| PRD | Feature | Status |
|-----|---------|--------|
| [PRD-047](PRD-047-session-ai-cleanup-link-existing-entity-backlinks.md) | Link Existing Entity → Backlinks + Evidence | 🟢 Done |
| [PRD-048](PRD-048-entity-pages-content-references-relationships.md) | Entity Pages: Content + References + Relationships | 🟢 Done |
| [PRD-049](PRD-049-session-ai-cleanup-relationships-quest-promotion.md) | Persist Relationships + Quest Promotion | 🟢 Done |
| [PRD-050](PRD-050-nuclino-import-link-normalization-link-evidence.md) | Nuclino Link Normalization + Link Evidence | 🟢 Done |

## Scheduling & Notifications

The availability-driven scheduling system: recurrence candidates, member
availability responses, attendance thresholds, and the reminder engine.
(Previously missing from this tracker — audit finding S15.)

| PRD | Feature | Status |
|-----|---------|--------|
| [PRD-009](PRD-009-session-availability-add-ability-to-create-availability.md) | Member Availability Entry | 🟢 Done |
| [PRD-009A](PRD-009A-session-availability-remove-day-name-from-regular-session-time-label.md) | Regular Session Time Label Fix | 🟢 Done |
| [PRD-010](PRD-010-upcoming-sessions-eligibility-attendance-threshold-and-dm-controls.md) | Eligibility, Threshold, DM Controls | 🟢 Done |
| [PRD-010A](PRD-010A-upcoming-sessions-partial-availability-session-duration-eligibility.md) | Partial Availability + Session Duration | 🟢 Done |
| [PRD-010B](PRD-010B-upcoming-sessions-dm-visibility-reinstate-toggle-dev-mode-fix.md) | DM Visibility + Reinstate Toggle | 🟢 Done (amended by PRD-051) |
| [PRD-011](PRD-011-view-team-availability.md) | View Team Availability | 🟢 Done |
| [PRD-012](PRD-012-upcoming-sessions-span-multiple-months.md) | Multi-Month Upcoming Sessions | 🟢 Done |
| [PRD-013](PRD-013-dm-calendar-session-cancel.md) | Calendar Day Cancel/Reinstate | 🟢 Done |
| [PRD-014](PRD-014-conditional-info-icon.md) | Conditional Availability Info Icon | 🟢 Done |
| [PRD-051](PRD-051-availability-reminders-and-push-notifications.md) | Availability Reminders & Push Notifications | 🟢 Done |

## Group Data Intake

Getting the whole group's existing record into Helm — the adoption
prerequisite: Nuclino (PRD-015 family), OneNote, and Craig session recordings.

| PRD | Feature | Status |
|-----|---------|--------|
| [PRD-052](PRD-052-onenote-import.md) | OneNote Import (Word export path) | 🟢 Done |
| [PRD-053](PRD-053-craig-session-recording-intake.md) | Craig Session Recording Intake | 🟢 Done |

### Status Legend
- 🔴 To Do - Not started
- 🟡 In Progress - Implementation underway
- 🟢 Done - Implemented and tested

## Implementation Order

Recommended sequence based on dependencies:

1. **Phase 1**: PRD-001 (Session Logs) + PRD-004 (Quest Status)
2. **Phase 2**: PRD-002 (Entity Detection) + PRD-005 (Backlinks)
3. **Phase 3**: PRD-003 (Post-Session Review) + PRD-006 (Proximity Suggestions)
