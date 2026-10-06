# PRD-052: OneNote Import (Word Export Path)

## Story Status
`Implemented`

## Problem

One group member keeps their campaign notes in Microsoft OneNote — and is
among the likeliest adopters of Helm. Their history has to come with them, or
the app starts from zero for exactly the person most ready to use it.

OneNote has no clean data export: the native formats (.one/.onepkg) are
proprietary binaries, and the Microsoft Graph API path requires Azure app
registration + OAuth — far past MVP weight. The pragmatic path is the one
every OneNote desktop install already has: **File → Export → Word Document
(.docx)**, per page or per section.

## Functional Requirements

- **FR-1**: The import dialog offers a source picker: Nuclino (existing) or
  OneNote. OneNote accepts a single `.docx` or a `.zip` containing several,
  with in-dialog guidance on how to export from OneNote desktop.
- **FR-2**: Each `.docx` converts to Markdown (mammoth → HTML → turndown with
  GFM tables), preserving headings, emphasis, lists, and table content.
- **FR-3**: A SECTION export (one .docx containing several pages, each titled
  by a top-level heading) splits into one Helm note per page. A page export
  stays one note, titled by its heading or, failing that, its filename.
- **FR-4**: Converted pages flow through the **existing** import pipeline
  unchanged — preview with classification, empty-page selection, optional AI
  enrichment, attribution, snapshots, and rollback — recorded with
  `sourceSystem: "ONENOTE"`.
- **FR-5**: Source page ids are deterministic (8-hex hash of the title), so
  re-importing an updated export **updates** the same notes rather than
  duplicating them. Same-titled pages within one upload get disambiguated
  ids.
- **FR-6**: Unreadable files produce warnings in the parse response; they
  never fail the batch.

## Acceptance Criteria (Global)
- [x] A OneNote user can bring pages in with zero account/API setup
- [x] Section exports split correctly into individual notes
- [x] Re-import updates instead of duplicates
- [x] The full preview/enrich/rollback pipeline applies

## Implementation Notes

- Files: `server/onenote-import.ts` (conversion + splitting + id synthesis),
  `server/routes.ts` (`POST /api/teams/:teamId/imports/onenote/parse`; plan
  cache and commit parameterized by `sourceSystem`),
  `client/src/components/nuclino-import-dialog.tsx` (source picker).
- Key decision: converted pages are synthesized in Nuclino entry shape
  (`"<Title> <8hex>.md"`), so `processNuclinoExport` and the commit endpoint
  run untouched — one pipeline, N sources.
- Deps: `mammoth`, `turndown`, `turndown-plugin-gfm`.
- Deferred: Graph API live sync; PDF fallback for OneNote-for-Mac/UWP users
  (those apps can't export .docx); OneNote-internal page links (exported
  .docx links are dead URLs — imported as plain text).
- Tests: `server/onenote-import.test.ts` (12) — builds real minimal .docx
  fixtures in memory; covers conversion fidelity, splitting, stable ids,
  warnings, and an end-to-end pass through the Nuclino pipeline.
