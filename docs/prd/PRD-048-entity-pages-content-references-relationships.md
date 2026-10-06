# PRD-048 — Entity Pages: Show Content + Session References + Relationships

GitHub issue: #2

## Summary
Entity pages (NPC/Area/Quest/POI/…) are never blank: they always show an editable
Content section, a "Referenced in Sessions" section (backlinks with snippets, session
date, author), and a "Relationships" section (grouped by type with evidence + confidence
buckets and role-gated deletion). New entities created from session AI Cleanup are seeded
with a "First seen" snippet.

## Functional Requirements
- **FR-1** Entity detail view shows 3 sections with informative empty states:
  Content (editable, instructional placeholder), Referenced in Sessions, Relationships.
- **FR-2** Session references come from backlinks (`toNoteId = entity`), ordered by most
  recent session date, showing session title, snippet, date, and author.
- **FR-3** Relationships are grouped by type (QuestHasNPC/QuestAtPlace/NPCInPlace/Related)
  with evidence type + HIGH/REVIEW/LOW confidence bucket; DM or creator can delete.
- **FR-4** Entities created from session AI Cleanup seed content with
  `## First seen\n- Session <date>: "<snippet>"` (only when content would be empty).
- **FR-5** Clicking a session reference navigates to that session note in the editor,
  preserving team context.

## Status
Done

## Implementation Notes
- Added: `client/src/components/notes/note-detail-sections.tsx` (references +
  relationships sections, empty states, delete relationship, navigation).
- Modified: `client/src/components/notes/notes-editor-panel.tsx` (renders detail sections
  for non-session notes; entity placeholder text), `client/src/pages/notes.tsx` (passes
  member role), `server/routes.ts` + `server/test/test-routes.ts` detail endpoint
  (adds `sourceNoteSessionDate`, `createdByName`, session-recency sort),
  `shared/cleanup-suggestions.ts` (`buildFirstSeenSeed`),
  `client/src/components/notes/entity-suggestions-panel.tsx` (seeds new entity content
  on Accept / bulk accept / quest promotion).
- Detail data comes from the existing `GET /api/teams/:teamId/notes/:noteId` endpoint
  (PRD's `/detail` equivalent), feature-flagged by `ENABLE_ENTITY_DETAIL_ENDPOINT`
  (default on). Confidence buckets are computed client-side with the shared
  `confidenceBucket` helper.
- Tests: `client/src/components/notes/note-detail-sections.test.tsx` (empty states,
  reference rendering + navigation, grouping/bucket labels, delete gating for
  creator/DM/other), `server/cleanup-suggestions.api.test.ts` (session-date ordering +
  author names, private-note redaction, quest detail integration),
  `shared/cleanup-suggestions.test.ts` (`buildFirstSeenSeed`).
