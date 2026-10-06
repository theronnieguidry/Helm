# PRD-049 — Session AI Cleanup: Persist Relationships + Quest Promotion From Actionable Text

GitHub issue: #3

## Summary
The AI Cleanup panel surfaces a **Relationship Suggestions** section (entity pair, type,
evidence, confidence bucket, snippet, Accept/Dismiss) and a **Quest Promotion** section
generated from actionable text ("Find/Defeat/Retrieve …"). Accepting persists rows in
`noteRelationships`; promoting creates a seeded Quest note auto-linked to its NPC giver
and Area with a session backlink.

## Functional Requirements
- **FR-1** Relationship Suggestions section below New/Existing Entities with
  A → B, relationship type, evidence type, confidence score + bucket, snippet, and
  Accept/Dismiss actions. Sourced from proximity heuristics
  (`shared/proximity-suggestions.ts`) via `buildCleanupSuggestions`.
- **FR-2** Accept persists to `noteRelationships` (from/to note ids, type, evidence,
  confidence, snippet, creator); survives refresh and appears on entity pages (PRD-048).
- **FR-3** Quest Promotion: proposed title + snippet + suggested NPC/Area; actions are
  Create new Quest (seeded content, QuestHasNPC/QuestAtPlace relationships, session
  backlink), Link existing quest, or Dismiss.
- **FR-4** Linking/accepting entities refreshes relationship suggestions without a page
  reload (suggestions re-fetch after link/accept/promote actions).
- **FR-5** Confidence buckets: HIGH ≥ 0.80, REVIEW 0.65–0.79, LOW < 0.65; LOW suggestions
  are visually de-emphasized.

## Status
Done

## Implementation Notes
- Added: `client/src/components/notes/relationship-suggestions-section.tsx`,
  `client/src/components/notes/quest-promotion-section.tsx`.
- Modified: `client/src/components/notes/entity-suggestions-panel.tsx` (stores the full
  cleanup response, accept/dismiss relationship handlers, quest create/link/dismiss
  handlers, suggestion refresh after actions), `shared/cleanup-suggestions.ts`
  (exported `confidenceBucket`).
- Suggestion generation, deterministic ids, quest pattern detection, and the
  `GET/POST /api/teams/:teamId/session-logs/:noteId/cleanup-suggestions`,
  `POST/DELETE /api/teams/:teamId/relationships` endpoints already existed on this
  branch; this PRD completes the missing UI and persistence flows.
- Accept is disabled (with explanation) for suggestions whose entities are not yet
  linked to notes (`requiresResolution`); linking the entities and refreshing enables it.
- Tests: `shared/cleanup-suggestions.test.ts` (bucket thresholds, relationship type
  inference incl. swap, suggestion pairs, quest detection + nearest NPC/Area, existing
  quest matching, determinism), `client/src/components/notes/cleanup-sections.test.tsx`
  (both sections: rendering, callbacks, disabled/accepted/dismissed states),
  `server/cleanup-suggestions.api.test.ts` (relationship provenance + idempotency,
  delete role gating, quest-promotion end-to-end flow verified on quest detail).
