# PRD-047 — Session AI Cleanup: Make "Link Existing Entity" Create Backlinks + Visible Evidence

GitHub issue: #1

## Summary
In the Session Notes AI Cleanup panel, clicking **Link** on an existing entity creates a
persistent backlink (session note → entity note) with evidence snippets, shows an inline
"Linked" state with the snippet, and offers **Undo**.

## Functional Requirements
- **FR-1** Link creates a backlink record with `textSnippet` (bounded ±200-char evidence
  window), offsets, `evidenceType: "Mention"`, and HIGH confidence (0.8) for
  user-confirmed links.
- **FR-2** The panel shows a "Linked" state immediately with the evidence snippet
  truncated to ~120 chars inline; the row stays visible and non-actionable.
- **FR-3** Undo removes the backlink and reverts the row to actionable.
- **FR-4** API: `POST /api/teams/:teamId/notes/:noteId/backlinks` and
  `DELETE /api/teams/:teamId/backlinks/:backlinkId` with auth + team membership checks;
  delete allowed for creator, source-note author, or DM.
- **FR-5** De-duplication: repeat links with the same evidence upsert into one record via
  canonicalized `sourceBlockId` hashing.

## Status
Done

## Implementation Notes
- Modified: `client/src/components/notes/entity-suggestion-card.tsx` (Linked state +
  inline snippet + Undo button, `truncateSnippet` at 120 chars),
  `client/src/components/notes/entity-suggestions-panel.tsx` (captures created backlink
  id/snippet, `handleUndoLink`, ±200-char `extractEvidenceSnippet` for all backlinks),
  `client/src/hooks/use-suggestion-persistence.ts` (`unmarkCreated` for undo).
- Server endpoints, dedupe upsert, and delete authorization already existed
  (`server/routes.ts`); endpoint paths are team-scoped variants of the PRD's paths
  (functionally equivalent).
- Deviation: dedupe key includes the evidence-block hash, so the same (session, entity)
  pair with *different* snippets produces grouped, bounded rows (per FR-5's "allow
  multiple if offsets differ" option).
- Tests: `client/src/components/notes/entity-suggestions-panel.test.tsx`
  ("link existing entity (PRD-047)" — link + snippet + undo flows),
  `server/cleanup-suggestions.api.test.ts` (backlink upsert idempotency, delete
  authorization branches: creator OK, DM OK, other member 403).
