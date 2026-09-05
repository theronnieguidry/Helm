# Note-Taking Done-ness Report

**Purpose**: the complete, verified gap list between the note-taking PRDs' intent
(per `NOTE_TAKING_ROADMAP.md`) and what the codebase actually does — so the owner can pick
what gets built to call note-taking *done*. No gap-fixing code has been written for anything
in this report (per instruction: audit + report first). The two pre-approved quick items —
issue #5 branding and the PRD-023 DB constraint — are already handled (branding fixed on PR #6;
the DB constraint turned out to already exist at `shared/schema.ts:227-232`).

**Method**: 36 agents (~1.9M tokens of investigation). Ten auditors, one per PRD cluster,
each requiring file:line evidence and treating "component exists but is never rendered" as a
gap. A senior product agent walked the end-to-end DM journey in code against the roadmap's
intent. A senior design agent vetted every note-taking component against `design_guidelines.md`.
Then every critical/major claim was adversarially verified — 15 by dedicated skeptic agents,
10 by direct main-session spot-checks after the skeptics hit a rate limit. **All 25
critical/major claims were confirmed real; zero were refuted.** Minor/polish findings
(68) were not individually re-verified but carry the same evidence standard.

**Scoreboard**: 93 findings — 3 critical, 22 major, 53 minor, 15 polish.
Branch: `claude/note-taking-completion-49gfvg` (PR #6, commit `de406b5`). Date: 2026-07-05.

> **UPDATE (2026-07-06): all P0, P1, AND P2 items below are IMPLEMENTED** with tests on
> PR #6 (721 tests passing). P0/P1 resolved all 3 criticals plus F0, F2, F3, F9, F13,
> F17, F18, F42, F43, F47, F48, F55, F56, F69, F70, F81, F85, F27, F86, F87.
> The P2 pass resolved F19, F20, F21 (review-mode + session-review test files now exist),
> F29, F32, F33, F34, F37 (client-side filter), F38, F49, F50, F51, F66, plus the
> prod/test route unification for the notes API surface (shared handlers in
> server/notes-handlers.ts).
>
> **P2-2 decision (block substrate)**: resolved as the OFFSET-BASED model — backlink
> clicks scroll to and select the exact mention via stored offsets, backlinks re-index
> or are removed on content edits (server/backlink-reindex.ts), and PRD-001/004/005
> carry amendments documenting the decision. The block-based editor was NOT built (F1
> formally superseded, F11 moot).
> **P2-1 decision (quest transitions)**: status badges/filter/hover shipped; the strict
> FR-2 transition state machine was deliberately NOT enforced (fights capture-first) —
> F31 closed as won't-fix per the PRD-004 amendment.
>
> Still open by choice: P3 hygiene items, the design-review recommendations (§6),
> and unbundled majors F57 (diff-preview filters), F58 (enrichment undo UI +
> noteType revert), F59 (Item/Faction types — recommend descoping in PRD-030).

---

## 1. Executive summary

The core capture experience genuinely delivers the roadmap thesis: open Notes, type into the
always-ready Today editor, autosave with visible status, no blank sessions, no structural
decisions demanded at capture time. Entity pages, backlinks, quest promotion, and the Nuclino
import machinery are real, reachable products — not just passing tests (626/626 green).

But walking the actual DM journey exposes **four clusters that block calling it done**, none
of which require architectural change:

1. **Privacy is client-side theater.** The production notes-list API ships every private note
   to every team member; only the browser hides them. The test suite passes because the test
   harness route filters correctly while the production route doesn't — the exact prod/test
   divergence failure mode PRD-021 documented.
2. **The structure-later loop's contract is broken at runtime.** Suggestion dismiss/reclassify
   state is keyed to entity IDs that are regenerated on every keystroke's detection re-run, so
   dismissed suggestions resurrect ~750ms later while the DM is typing. The persistence layer
   passes its unit tests (hand-fixed IDs) but is functionally inert in real use.
3. **Quest capture from natural prose is dead end-to-end.** Both the live detection patterns
   and the cleanup quest patterns are capitalized-only, so PRD-002's own acceptance examples
   ("asked us to find the artifact", "We need to defeat the dragon") produce nothing — and the
   Haiku path that could catch them is unreachable for saved sessions.
4. **AI trust violations.** The relationship cache silently persists *direction-inverted*
   graph edges for any note over ~100 chars; the post-import AI review dialog is fully built
   but mounted nowhere (the import dialog literally tells users to go review suggestions on a
   page that has no review UI); pending unreviewed AI edges render on entity pages
   indistinguishable from confirmed facts; and the "AI Cleanup" button never calls AI in the
   normal saved-session case yet toasts "AI Cleanup Complete."

Fix the five P0s and six P1s below (§3) and this is an honest, owner-reviewable "done."

## 2. Done-ness verdict by pillar (senior product review)

| Pillar | Verdict | One-line reason |
|---|---|---|
| Live capture (session-first, zero-friction) | **DONE with caveats** | Core promise holds; but sessions can't be back-dated or re-titled, delete-to-empty leaves a ghost session, and switching notes mid-debounce drops typed text |
| Structure-later review loop | **NOT DONE** | Detection engine excellent (real web worker, 47 tests), but dismissals resurrect on every keystroke and natural-prose quests are never detected |
| Knowledge graph: entity pages, backlinks, quests | **DONE with caveats** | Strongest pillar; but accepted relationships don't appear on already-open entity pages (stale cache), backlink clicks don't scroll/highlight the mention, and quest status is invisible outside the editor |
| Nuclino import | **DONE with caveats** | Best-engineered subsystem; but imported wikis display raw `.md?n` link syntax (resolved links computed, never rendered) and "Private" visibility is client-side only |
| AI assist quality & trust | **NOT DONE** | Cache direction-inversion corrupts the graph; enrichment review UI unreachable; "AI Cleanup" mislabeled; paywall CTA lands on a 404 |
| Privacy & data-integrity guarantees | **NOT DONE** | Private notes readable by all members via API; needs-review exposes and allows mutation of other users' private notes |

## 3. The pick-list (prioritized recommendations)

Choose what to build. P0 = blocks "done." P1 = expected from PRD intent; you'd hit these in
your first minutes of dogfooding. Effort: S < half day, M = 1–2 days, L = multi-day.

### P0 — blocks calling note-taking done

| # | Recommendation | Effort | Fixes findings |
|---|---|---|---|
| P0-1 | **Apply the privacy filter to production `GET /notes` and needs-review.** Reuse the existing `canViewNote` (already applied at `routes.ts:788`) on the list route and the needs-review endpoint. Also stops members from approving/rejecting classifications on other users' private notes. | S | F0, F48, F81, F9 |
| P0-2 | **Key suggestion persistence by stable identity (type + normalizedText), not regenerated entity IDs.** One function change in `entity-detection.ts:101-103` (the PRD-049 cleanup suggestions already do deterministic IDs correctly) + re-point the persistence hook. Unblocks Session Review persistence too. | S | F17, F18, F27 |
| P0-3 | **Fix the AI cache relationship direction inversion.** `setRelationship` stores a 100-char truncation, `getRelationship` hashes full content — hashes can never match, so cached directional edges (QuestHasNPC etc.) persist reversed. Store matching truncations or an explicit direction flag; add the end-to-end cache test that would have caught it. | S | F69, F74 |
| P0-4 | **Close the AI enrichment review dead end.** Mount the fully-built `EnrichmentReviewDialog` in Import Management (endpoints exist), and badge or filter pending/rejected AI edges on entity pages so they're not indistinguishable from confirmed facts. | M | F55, F64, F89, F58 |
| P0-5 | **Make quest detection catch natural prose.** Add the case-insensitive action-verb patterns from PRD-002's own FR-2 table ("need to", "asked us to", "must defeat") to both `QUEST_PATTERNS` and the PRD-049 `QUEST_ACTION_PATTERNS`, with tests from the PRD's table. | S | F13 (compounded by F70) |

### P1 — should land before your review pass

| # | Recommendation | Effort | Fixes findings |
|---|---|---|---|
| P1-1 | **Editable session date + editable session title.** Both server paths already work; the UI just never renders a date field and hides the title input for session logs. Back-dating yesterday's game is THE canonical DM workflow. | S | F2, F3 |
| P1-2 | **Invalidate note-detail queries after relationship accept / link / undo.** With `staleTime: Infinity`, an already-viewed entity page never shows the relationship you just accepted — the Accept button looks broken. | S | F85, F87 |
| P1-3 | **Truth-in-labeling for AI Cleanup.** Saved sessions post to the deterministic-heuristics endpoint but the button says "AI Cleanup" and toasts "AI Cleanup Complete." Either wire `extract-entities` (Haiku) into the saved-session path and merge, or split into "Suggestions" (always available — they're deterministic and shouldn't be behind the AI gate at all, per roadmap principle 9) and a real gated "AI Cleanup." | M | F70, F86, F75 |
| P1-4 | **Fix the paywall CTA 404 and the `/notes/:id` deep-link no-op.** Paywall navigates to `/teams/:id/settings` (no such route → 404); `/notes/:id` renders NotesPage but the param is never read, so deep links silently show the default view. | S | F56, part of F47 |
| P1-5 | **Render resolved markdown links for imported notes.** `contentMarkdownResolved` is computed and stored but never displayed — imported pages show raw `[text](page.md?n)` syntax in a plain textarea. Minimum viable: read-mode markdown renderer for imported notes with links routed through the fixed `/notes/:id`. The single largest gap between "import works" and "import is a product." | L | F47 |
| P1-6 | **Capture-integrity pair: flush the pending draft when switching notes, and remove/hide a session deleted to empty.** Losing even one sentence of live session notes is the worst failure this product can have. | S | F43, F42, F44 |

### P2 — valuable, not blocking

| # | Recommendation | Effort |
|---|---|---|
| P2-1 | Quest status in lists: badge on quest rows (the `QUEST_STATUS_COLORS` map is currently dead code), status filter, lead-vs-active distinction. Transition-graph enforcement (F31) deliberately *not* bundled — a strict state machine arguably fights capture-first and deserves your explicit call. | M |
| P2-2 | **Decide the block-substrate question** (the "big architectural gap" flagged when you chose audit-first): production notes never have `contentBlocks`, so per-block backlink deep-linking and snippet re-indexing are unbuildable as specced. Either invest in a block-based editor (L) or formally amend PRD-001/005 to the offset-based model the PRD-047 data already supports and implement scroll-to-offset highlighting (M). | L or M |
| P2-3 | Unify prod and test route implementations (shared handlers). The privacy leak is the *third* documented instance of the prod/test divergence family (PRD-021, PRD-023, now this). Makes the bug class structurally impossible. | M |
| P2-4 | Import-run truthfulness: set `failed` status on error (today a mid-run crash shows as a phantom success), fix empty-page stats under partial selection, add the missing "View details" action (endpoint exists, UI never calls it). | M |
| P2-5 | Session Review page polish: reviewed-flag + visual distinction (PRD-003 FR-5), fix the "Review Complete" state that can never display when matches exist, create backlinks for selection-created entities (currently silently orphaned), add the PRD-mandated test files. | M |

### P3 — hygiene

Accessibility + doc sweep: aria-labels on icon-only buttons, aria-live for suggestion arrival,
delete dead `mentioned-in-section.tsx` (after porting its blockId-aware navigation signature),
extract the thrice-duplicated type-color maps, update stale PRD statuses (PRD-018/019 still say
"Proposed" despite shipped code), drop dead `teams.aiEnabled` columns, amend PRD-001 to document
the deliberate drift to shared team sessions. (S overall)

## 4. Confirmed critical findings (3)

**F0 · PRD-001 · Privacy: production `GET /notes` returns other users' private notes.**
`server/routes.ts:716-727` sends `storage.getNotes(teamId)` verbatim; `storage.getNotes`
(`server/storage.ts:325-331`) has no privacy predicate; hiding happens only in the browser
(`client/src/pages/notes.tsx:94-99`). The test harness route filters correctly
(`test-routes.ts:289-291`), so the privacy acceptance test passes against code that doesn't
run in production. Fix should use `canViewNote` (routes.ts:163) so DM visibility semantics stay
consistent. *(Effort S)*

**F17 · PRD-022 · Suggestion persistence is keyed to IDs regenerated every detection run.**
`generateEntityId` uses `Date.now()+Math.random()` (`shared/entity-detection.ts:101-103`);
the localStorage hook stores those raw IDs; detection re-runs 750ms after every keystroke.
Dismissed suggestions reappear mid-game; reclassifications reset; accepted entities resurface.
Unit tests pass only because they use hand-fixed IDs. *(Effort M — includes migrating stored state)*

**F55 · PRD-016 · The post-import AI review UI exists but is mounted nowhere.**
`EnrichmentReviewDialog` (`client/src/components/enrichment-review-dialog.tsx`) is imported by
zero files; all backend endpoints exist (`routes.ts:2472, 2527, 2611, 2710`). The import dialog
tells users to "Check the Import Management page to review AI suggestions" — a page with only a
delete button. Pending relationships/classifications are stuck forever while rendering on
entity pages as if confirmed. *(Effort S to mount; M with the pending-edge badging from P0-4)*

## 5. Confirmed major findings (22)

Grouped; every one verified. Finding numbers match the pick-list references above.

### Capture & sessions
- **F1 (PRD-001, L)** — `contentBlocks` is schema/API-only; the editor sends plain text, so every
  real session has `contentBlocks: null` and per-block traceability is vacuous in production.
  A captured production log confirms it empirically. → P2-2 decision.
- **F2 (PRD-008, M)** — No UI anywhere to view or edit `sessionDate`; back-dating impossible.
  Server PATCH already supports it. → P1-1.
- **F3 (PRD-008, S)** — Title input is hidden for `session_log` notes
  (`notes-editor-panel.tsx:320`); autosave already sends title, only the input is missing. → P1-1.

### Detection & review loop
- **F13 (PRD-002, S)** — `QUEST_PATTERNS` are case-sensitive capitalized-only; PRD-002's own
  acceptance-table inputs produce no quest suggestions. → P0-5.
- **F18 (PRD-003, S)** — Session Review page keeps dismissed/linked state in plain `useState`;
  refresh resets all progress. The purpose-built persistence hook exists and is unused there. → P0-2.
- **F19 (PRD-003, M)** — No "mark session reviewed" flag, action, or visual distinction anywhere;
  only a transient in-page message. → P2-5.
- **F20 (PRD-003, S)** — Create-from-text-selection deliberately nulls `selectedEntity`
  (`session-review.tsx:395`), so the backlink step is skipped — selection-created entities are
  silently orphaned from their session. → P2-5.
- **F21 (PRD-003, M)** — None of the PRD-mandated review-mode test files exist despite Done status. → P2-5.

### Knowledge graph
- **F31 (PRD-004, M)** — Quest status transition graph enforced nowhere; a lead can jump straight
  to done (client dropdown unrestricted, PATCH persists anything). Deliberately left for your
  call — strict enforcement may fight capture-first. → P2-1 note.
- **F32 (PRD-004, M)** — No status badge/filter on quest lists; `QUEST_STATUS_COLORS` is dead code;
  status visible only inside the editor detail view. → P2-1.
- **F33 (PRD-005, M)** — Backlink click opens the note but ignores `sourceBlockId`: no scroll, no
  highlight (`note-detail-sections.tsx:166`). On long sessions the user hunts manually. → P2-2.
- **F34 (PRD-005, M)** — Backlinks are not re-indexed on content edit and not removed on block
  deletion; snippets go stale, violating "backlinks always reflect current state." → P2-2.

### Import
- **F47 (PRD-015, M)** — Resolved links (`contentMarkdownResolved`) never rendered; imported pages
  show raw Nuclino syntax in a textarea; `/notes/:id` route param never read. → P1-4/P1-5.
- **F48 (PRD-015A, S)** — Private *imports* readable by all members via the same list-API hole as F0. → P0-1.
- **F49 (PRD-015A, S)** — Import Management has no "View details"; the details endpoint
  (`routes.ts:2316-2348`) has zero UI callers. → P2-4.

### AI import & preview
- **F56 (PRD-031, S)** — Paywall CTA navigates to `/teams/:id/settings`; router only has `/settings`;
  lands on NotFound. The paywall's entire conversion path is broken. → P1-4.
- **F57 (PRD-030, S)** — The diff-preview "Changes" filters (All/Changed/Low-confidence/AI-discovered)
  don't exist — no filter state or buttons in the 427-line component, though the PRD's own footer
  claims they shipped. → pick if desired (not in P0/P1; fold into P2-4 or skip).
- **F58 (PRD-016, M)** — Enrichment-batch undo is API-only, unreachable from UI, and doesn't revert
  noteType changes applied at approval (no snapshot). → P0-4 follow-up.
- **F59 (PRD-030, L)** — Item/Faction entity types promised by the diff-preview PRD don't exist
  anywhere in the system (types, provider, UI). Recommend explicitly descoping in the PRD rather
  than building. → your call; suggest documenting as descoped.

### AI infrastructure
- **F69 (PRD-043, S)** — Cache relationship direction inversion (detail in §1 item 4; verified in
  `ai-cache.ts:292-332` vs `:46-56`). Silent graph corruption on every cache hit for real notes. → P0-3.
- **F70 (PRD-026, M)** — "AI Cleanup" on any saved session posts to the deterministic
  cleanup-suggestions endpoint (`entity-suggestions-panel.tsx:142-156` branches on
  `sessionNoteId`); Haiku is reachable only in unsaved today-mode. Mislabeled AI. → P1-3.

### Finish-line re-vet (PR #6 work)
- **F85 (PRD-049, S)** — Backlink/relationship mutations never invalidate note-detail queries;
  with `staleTime: Infinity` an already-open entity page never shows newly accepted
  relationships. (My own gap from the PR #6 implementation — confirmed.) → P1-2.

## 6. Design review (senior designer)

**Verdict**: foundations are good — coherent badge/icon language on core surfaces, informative
empty states everywhere, a well-executed autosave indicator, and detection genuinely respects
zero-typing-latency. Three systemic problems undermine it:

1. **Surface drift.** Color maps, type defaults, action verbs, and confidence displays are
   copy-pasted per file and have diverged:
   - NPC suggestion cards are **green** while NPC means **orange** everywhere else (and green
     also means Character *and* high-confidence — three meanings for one hue).
   - The same detected "place" becomes an **Area** if accepted from the editor panel but a
     **POI** if accepted from the Review All page.
   - Three surfaces use three verb pairs (Accept/Dismiss · Create/Dismiss · Approve/Reject) and
     four different confidence encodings, one of which (Needs Review's 0.5-threshold dot)
     contradicts the canonical 0.80/0.65 buckets.
   - *Highest-leverage single fix*: one shared type-color/label/confidence-badge module consumed
     by all three surfaces.
2. **The suggestions panel outgrew its design.** Four sections (entities, existing, relationships,
   quests) with identical flat headers stack unbounded below the textarea — after AI Cleanup this
   can add 1500+px, with relationship/quest sections invisible below the fold and the header count
   excluding half the content. Recommend: per-section collapse + counts, max-height with internal
   scroll, header renamed "Suggestions" with a true total.
3. **No responsive or dark-mode discipline.** The split view has no mobile fallback
   (min-w-250px left panel makes phones unusable; hover-only previews unreachable on touch;
   the `use-mobile` hook exists and is unused); suggestion grids use viewport breakpoints inside
   a width-variable panel; `text-green-600`/`text-amber-600` badges have zero `dark:` variants
   against the guidelines' dark palette.

Accessibility: icon-only dismiss/delete/back buttons lack aria-labels (the team clearly knows
the pattern — `note-detail-sections.tsx` does it right); confidence dots are color-only and
keyboard-invisible; the suggestion card is a clickable div containing buttons (nested-interactive);
no aria-live announces suggestion arrival.

Full design findings (4 major, 8 minor, 6 polish) with per-component recommendations are in the
audit data; the major four are: mobile fallback for the split view (M), suggestions-panel
hierarchy (M), place→POI vs place→Area divergence (S), and the NPC color flip (S).

## 7. Minor findings (53) — one-liners

Worth batching opportunistically; none blocks done-ness. Grouped by theme:

**Spec deviations with workarounds**: F4 no dedicated sessions endpoint · F5 session rows lack
visibility indicator · F8 session logs created team-visible not private (deliberate drift —
amend PRD) · F10 Sessions/Notes still distinct types vs unified model · F12 autosave timings
750ms/10s vs spec 2s/15s · F16 single-mention proper-noun confidence deviates · F25 suggestions
grouped New/Existing not by entity type · F39 proximity tiers use character thresholds not
sentence/paragraph · F52 unresolved links rewritten to `#unresolved` instead of left intact ·
F54 collections not imported as distinct type · F63 AI-detected quests don't default to Open ·
F76 uses claude-3-haiku-20240307 not the spec'd 3.5-haiku.

**Correctness edges**: F6 unique index can't deploy until prod duplicate cleanup runs (no script
checked in) · F7 idempotency non-atomic — true race returns 500 · F9 idempotent POST can return
another author's private session · F22 bulk accept doesn't link bulk-created entities to each
other · F27 persistence key uses today's date even when editing older sessions · F35 rejected
proximity associations not remembered · F36 review-flow links one-directional · F38
default-to-lead only enforced in MemoryStorage, not production storage · F50 partial empty-page
selection records wrong stats · F51 import runs never marked failed · F53 upsert has no DB
unique constraint · F61 "enriching" state still shows an indeterminate bar · F62 three-state
entitlement gating not implemented · F65 aiEnhanced/aiModel not persisted on import_runs ·
F66 AI preview cache expiry mid-review has no recovery · F72 enrichment worker never gets PC
names (splits the cache from the preview path) · F73 cache stats omit hit rate · F75 AI
item/faction coerced to NPC with fabricated offsets · F82 needs-review right-panel sync fails
silently for notes not in the visible list · F88 accepted/dismissed relationship-suggestion
statuses are in-memory only · F90 Undo + inline snippet lost after reload · F91 Review All
page's Link doesn't follow PRD-047 semantics (no evidence window, no Undo).

**Missing UI affordances**: F23 no Review icon on session rows · F26 review page lacks grouping
+ source-text highlight on focus · F37 no server-side status filter · F40 entity search ignores
backlink content · F42 delete-to-empty leaves ghost session (also P1-6) · F43 draft dropped on
switch (also P1-6) · F60 relationship diff omits evidence-type badges/counts · F86 deterministic
suggestions gated behind AI toggle (also P1-3).

**Test debt**: F11, F14, F15, F21, F44, F71, F74, F78, F79, F80 — endpoints and flows the PRDs
claim are covered but have zero tests (classifications PATCH, POI reclassify, aiEnabled 403
gating, extractEntities, cache end-to-end, hover preview, block utilities, EntityDetector
interface). Largely a consequence of the prod/test route split (P2-3).

**Privacy adjacents**: F81 needs-review exposes private-note titles + AI explanations to all
members and lets them mutate those classifications (bundled into P0-1).

## 8. Polish findings (15)

F24 Review All lacks count badge · F28 stale-key cleanup semantics · F29 Review Complete
unreachable with matches · F30 no SR announcement for new suggestions · F41 dead
mentioned-in-section.tsx · F45 residual "Location" strings · F46/F68 PRD statuses never updated ·
F67 diff summary omits some category cards · F77 no cache prune cron · F83 badge map duplicated
3× · F84 dead teams.aiEnabled columns · F92 icon-only X buttons unnamed · plus the two design
polish items (amber triple-duty, duplicate "Notes" headings).

## 9. What's verified working (so the review can start from trust)

- **Capture**: today-mode with lazy creation, four-state autosave, newest-first sessions,
  duplicate-race closed (idempotency in both routes + DB partial unique index), no blank sessions.
- **Detection**: real Web Worker off the main thread; all 7 PRD-024 + 3 PRD-025 quality fixes
  in code with 47 passing tests; genre-tuned vocab.
- **Review surfaces**: session-review page routed and functional (split view, pre-filled create,
  selection popover, proximity pre-checks); editor suggestions panel wired with fuzzy
  link-to-existing, bulk accept + confirm, reclassify incl. POI.
- **Knowledge graph**: entity pages never blank (content seed, references with privacy
  redaction, grouped relationships with buckets and role-gated delete); PRD-047 link/undo flow;
  PRD-049 relationship + quest promotion with full provenance; PRD-050 link evidence at 0.90
  with canonical direction and line snippets.
- **Import**: validation, classification priority order, attribution, private-by-default
  choice, rollback with snapshots + suggestion-orphan cleanup, granular empty-page selection,
  real progress feedback, genuine dry-run AI diff with entitlement enforcement, paywall stub
  with the real Hobgoblin example.
- **AI infra**: JSON repair across all three parsers (48 tests), prompt/validator vocab aligned,
  caching wired into both worker and preview paths incl. negative caching, CLI admin tool,
  per-member gating end-to-end, needs-review panel fully actionable.

## 10. Corrections to NOTE_TAKING_ROADMAP.md

- §9 said PRD-023's Phase-2 DB constraint may not have landed — **it did**
  (`shared/schema.ts:227-232`). But note new F6: it can't be applied to a prod DB that still
  contains duplicates, and no cleanup script is checked in.
- §5 asserted PRD-047–050 shipped clean; the re-vet found real caveats (F85 stale-cache,
  F86 AI-gating of deterministic suggestions, F88/F90 reload-state loss, F91 Review-All parity).

---

*Next step: pick from §3 (e.g. "do P0 + P1", or list items). Anything selected gets implemented
with tests on PR #6.*
