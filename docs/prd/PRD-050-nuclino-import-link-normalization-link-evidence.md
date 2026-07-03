# PRD-050 — Nuclino Import: Normalize Internal Links + Use Link Evidence for Relationships

GitHub issue: #4

## Summary
Nuclino internal links (`[Text](<Some Page abcdef12.md?n>)`) are normalized reliably,
resolved deterministically by source page id, and turned into high-confidence
relationship evidence (`evidenceType: "Link"`, confidence 0.90) on commit. The import
preview shows link resolution stats (resolved/unresolved counts + top unresolved
targets).

## Functional Requirements
- **FR-1** Normalization strips `<>` and `?n`, trims, URL-decodes, and extracts the
  8-hex `sourcePageId`; no normalized target contains `<`, `>`, or `?n`.
- **FR-2** `sourcePageId → noteId` map resolves links deterministically; unresolved links
  are tracked as warnings.
- **FR-3** Resolved links create `noteRelationships` rows with `evidenceType: "Link"`,
  confidence 0.90, snippet = the markdown line containing the link (truncated), and
  inferred type (QuestHasNPC/QuestAtPlace/NPCInPlace/Related) with canonical direction.
- **FR-4** Link anchor text never creates duplicate notes; re-import of the same zip is
  stable (existing notes updated by `sourcePageId`).
- **FR-5** Import preview shows total/resolved/unresolved link counts and up to 10
  top unresolved targets.

## Status
Done

## Implementation Notes
- Modified: `shared/nuclino-parser.ts` (`NuclinoLink.lineSnippet` captures the containing
  markdown line truncated to 240 chars; `summarizeNuclinoLinks` now reports
  `resolvedLinks`, `unresolvedLinks`, `topUnresolvedTargets`), `server/routes.ts` commit
  path (confidence 0.90 constant, line snippet as evidence, honors the inferred `swap`
  direction so e.g. an NPC page linking a Quest stores QuestHasNPC from the quest),
  `client/src/components/nuclino-import-dialog.tsx` (resolution stats + unresolved
  targets panel in the preview).
- Deviation: resolved links keep the author's anchor text when rewritten to
  `/notes/:id` (canonical titles are used for the notes themselves; rewriting anchor
  text was judged user-hostile and is not required by the acceptance criteria).
- Behind the existing `ENABLE_NUCLINO_LINK_EVIDENCE` feature flag (default on); when
  off, link evidence is stored as backlinks instead of relationships.
- Tests: `shared/nuclino-parser.test.ts` (line snippet extraction + truncation,
  normalization invariant over adversarial inputs, resolution stats + top-10 cap),
  `shared/cleanup-suggestions.test.ts` (relationship type inference incl. swap cases
  used by the commit path).
