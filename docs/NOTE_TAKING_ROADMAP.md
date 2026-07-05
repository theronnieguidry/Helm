# Helm Note-Taking Roadmap & Intent Summary

**Purpose of this file**: a single reference synthesizing every story (GitHub issue + PRD doc)
that shapes Helm's note-taking system — what was asked for, what shipped, and the design
philosophy that recurs across all of it. Not itself a PRD; a map of the PRDs. Regenerate/update
this by re-reading `docs/prd/*.md` and the GitHub issue tracker if it drifts out of date.

Generated: 2026-07-05. Source: 55 PRD docs in `docs/prd/`, 5 GitHub issues (theronnieguidry/helm).

---

## 1. The core thesis (read this first)

Every note-taking PRD in this repo, from the very first (PRD-001) to the most recent
(PRD-047–050), restates some version of one idea:

> **Capture must never require structure. Structure is a cleanup task done later, assisted
> by suggestions the user can accept, dismiss, or ignore — never one the system imposes
> automatically.**

This shows up as:
- "Session-first, structure-later" (PRD-001's own words)
- "Proto-quest support: allow incomplete discovery" (PRD-004)
- "Detection identifies candidates only — no automatic entity creation" (PRD-002, PRD-006, PRD-022 — nearly verbatim in three places)
- The editor as a "live notebook... always ready to write," never a modal flow (PRD-019)
- AI as an augmentation layer that must never override deterministic/structural signals
  (Nuclino import PRDs) and must never block core functionality (PRD-027/028/030/031)

If a future feature request seems to conflict with this thesis (e.g., "auto-create an entity
when confidence is high enough"), that's a signal to pause and confirm intent — every PRD to
date has explicitly avoided that pattern.

---

## 2. The note-taking pipeline, as it evolved

```
PRD-001 Session Logs (capture)
   -> PRD-002 Entity Detection (candidates, client-side, zero-latency)
   -> PRD-003 Post-Session Review (bulk structure pass, split panel)
   -> PRD-006 Proximity Suggestions (auto-suggest relationships by text distance)
   -> PRD-005 Backlinks (entity <-> source-block traceability, bidirectional)
   -> PRD-004 Quest Status Progression (lead -> todo -> active -> done/abandoned)
   -> PRD-022 Real-Time Suggestions (collapse review into the live editor itself)
   -> PRD-026 Haiku AI Extraction (hybrid pattern+AI entity/relationship extraction)
   -> PRD-047/048/049 (2026-07: link evidence, entity pages, relationship suggestions,
      quest promotion — the "finish line" work, see §5)
```

In parallel, a **second pipeline** grew around **importing existing external notes (Nuclino)**
into this same system — see §4.

And a **third, supporting pipeline** grew around **AI classification quality/trust/cost** that
both the live editor and the importer depend on — see §6.

---

## 3. Core capture & entity pipeline (PRD-001 to PRD-026, PRD-008, PRD-019, PRD-021, PRD-023)

All of these are **Done** except where noted.

| PRD | What it did | Why it matters going forward |
|---|---|---|
| [001](prd/PRD-001-session-logs.md) | New `session_log` note type, block-based content (`ContentBlock[]` with stable IDs), autosave (2s debounce/15s cap), private-by-default, chronological "Sessions" list | Block IDs are the substrate everything else (backlinks, entity refs) depends on. Don't break stable IDs across edits. |
| [002](prd/PRD-002-entity-detection.md) | Client-side/web-worker pattern detection (Person/Place/Quest), session-scoped ephemeral suggestions, designed behind a replaceable `EntityDetector` interface | The interface abstraction was deliberate — anticipates AI upgrade (delivered PRD-026). Zero typing-latency is a hard constraint. |
| [003](prd/PRD-003-post-session-review.md) | Split-panel review screen, bulk accept/dismiss/create-from-selection, "reviewed" progress tracking | The template for later Cleanup UIs — "cleanup, not creative work" in <5 clicks. |
| [004](prd/PRD-004-quest-status-progression.md) | 5-state quest lifecycle (lead/todo/active/done/abandoned), strict transition graph, escalating required fields | "lead" = title-only capture; don't force full quest details at discovery time. |
| [005](prd/PRD-005-backlinks.md) | `backlinks` table, bidirectional Mentioned-In section, click-to-navigate-and-highlight, auto-updates on edit/delete | "Backlinks always reflect current state — no stale references." Trust/auditability mechanism reused everywhere later (imports, AI cleanup). |
| [006](prd/PRD-006-proximity-suggestions.md) | Distance-based relationship suggestions (±200 chars/paragraph), confidence tiers, `AssociationSuggester` interface | "Suggest, don't assume." Same interface-abstraction pattern as PRD-002; delivered on by PRD-049's relationship suggestions. |
| [008](prd/PRD-008-session-log-date-default-and-remove-notes-vs-session-logs-tabs.md) | Unified all notes under one "Sessions" model, removed Notes-vs-Session-Logs tab split, `sessionDate` as distinct editable field | Explicit non-goals: no entity-model changes, no real-time collab. Scope discipline worth imitating. |
| [019](prd/PRD-019-notes-screen-layout-updates-and-left-panel-features.md) | Left filter panel + always-ready "Today" editor (no "New Session" click needed), hover preview, inline reclassification, Location→Area rename | "No blank session note" rule — a session record only exists once ≥1 char is typed. This exact rule caused the PRD-023 race condition. |
| [021](prd/PRD-021-session-note-save-failure.md) | Bugfix: prod route wasn't converting `sessionDate` string→`Date` before Drizzle insert (test route had the fix, prod didn't) | Recurring lesson: keep `server/routes.ts` and `server/test/test-routes.ts` logic in sync — test-route correctness ≠ prod-route correctness. |
| [022](prd/PRD-022-realtime-entity-suggestions-in-editor.md) | Moved suggestions into the live editor itself (collapsible panel below), localStorage session-scoped persistence, "Accept All High-Confidence" | Insight: note-takers have natural lulls (dice rolls, rules lookups) — that downtime is a review opportunity, not a distraction to protect against. |
| [023](prd/PRD-023-duplicate-session-entries-race-condition.md) | Fixed race condition creating duplicate session rows on rapid typing (client ref reset before React state re-render) | Phase 1 (server-side idempotency) done; DB unique index + prod cleanup query were optional phases — check if those ever landed if duplicates resurface. |
| [024](prd/PRD-024-entity-detection-quality-improvements.md) | 7 pattern-matching bugs fixed against real fantasy-TTRPG text (compound-name merging across sentences, vocab expansion, dedup, comma-lists, spurious fragments) | Detection is explicitly tuned for **fantasy TTRPG genre**, not general NER — if supporting other genres/systems, vocab lists need review. |
| [025](prd/PRD-025-entity-detection-followup-bugs.md) | Second round: sentence-start blindness, prefix-match dedup, article+title back-references ("the Duke") | Detection hardening was iterative (002→024→025), not one-shot — expect more edge cases if genre/content variety grows. |
| [026](prd/PRD-026-haiku-entity-extraction.md) | Prototyped Claude Haiku entity/relationship extraction; explicit recommendation for **hybrid** (pattern + AI merge), not AI replacing patterns | "AI augments, doesn't replace, deterministic logic." Patterns caught entities Haiku missed (e.g. "Samwell") — don't drop the pattern engine. |

---

## 4. Nuclino import pipeline (PRD-015, 015A, 016, 017, 018, 030, 031, 034, 035, 036, 042, 044, 050)

Arc: **mechanical MVP → safe/reversible → AI-enhanced/reviewable → hardened via real usage.**
All Done except where noted.

| PRD | What it did | Why it matters going forward |
|---|---|---|
| [015](prd/PRD-015-nuclino-zip-import.md) | Baseline ZIP importer: parse .md → notes, resolve internal links, collection-based classification (Person/Place/Quest/Note), idempotent upsert by `(teamId, sourceSystem, sourcePageId)` | Explicit non-goals: no AI/semantic enrichment, no cross-source dedup — deliberately deferred, not forgotten. Designed provider-agnostic for future connectors (OneNote, Evernote). |
| [015A](prd/PRD-015A-nuclino-import-attribution-visibility-and-rollback-imports.md) | Attribution (`createdByUserId`/`importRunId`), Private/Team visibility choice (default Private), `import_runs` table, Settings→Imports view/delete (rollback), `note_import_snapshots` | Rollback is called a "panic button" — imports must always be reversible. Any new import-adjacent feature (e.g. suggestion-created entities, PRD-034) must respect this cascade-delete contract. |
| [016](prd/PRD-016-nuclino-import-enhancement-AI-enrichment-and-relationship-mapping.md) | Optional AI classification + relationship extraction on import, review/approve UI, "internal links = ground truth, mentions = suggestions" | Quest Done→Open lock can't be overridden by AI without explicit approval. Kept as a separate pipeline step so baseline import stays fast/reliable regardless of AI. |
| [017](prd/PRD-017-nuclino-import-bugfixes.md) | 4 fixes found via real 105-file dataset testing (title cleaning, session-log detection, whitespace trim, AI rate-limit delay) + 4 documented accepted limitations | Classification priority order: Collection > Person > Place > Quest-Done > Quest-Todo > session-log-title > Note. Structural signals always outrank AI. |
| [018](prd/PRD-018-import-preview-dialog-layout-bugs.md) | Fixed dialog overflow (4-col summary grid, metadata line, visibility dropdown) via Playwright screenshot evidence | Root cause: `sm:max-w-md` too narrow once visibility selector + AI toggle were added. Watch for this class of bug again as preview dialogs grow. |
| [030](prd/PRD-030-ai-import-diff-preview-upon-notes-import.md) | Side-by-side Baseline-vs-AI diff preview before commit, entitlement gating, confidence buckets (HIGH≥0.80/REVIEW≥0.65/LOW≥0.50), dry-run `/ai-preview` with 5-min cache, no writes until Confirm | The HIGH/REVIEW/LOW threshold vocabulary defined here becomes the standard used everywhere downstream (PRD-037, PRD-049). "No writes until confirm" is a hard rule reiterated across the import stack. |
| [031](prd/PRD-031-ai-import-paywall-stub.md) | Paywall dialog using one real verified before/after example (not fabricated marketing copy) | Baseline import must always remain available regardless of AI entitlement — never block core functionality for monetization. |
| [034](prd/PRD-034-import-delete-orphaned-suggestions.md) | Propagated `importRunId` into entities created via the live Suggestions panel so rollback cleans them up too | Any future "creates a note as a side effect of session editing" feature must also propagate `importRunId` or it'll leak orphans on rollback. |
| [035](prd/PRD-035-ai-import-progress-feedback.md) | Real progress bar + phase text ("Classifying page 3 of 12...") via polling, in-memory progress store with TTL | Polling chosen over SSE deliberately for simplicity — don't over-engineer this if extending. |
| [036](prd/PRD-036-ai-import-preview-relationships-overflow.md) | Fixed relationship-tab text overflow pushing footer buttons off-screen | Same root-cause family as PRD-018 — AI-generated text is less predictable/longer than the UI was designed for; keep defensive `break-words`/`overflow-x-hidden` habits. |
| [042](prd/PRD-042-expandable-empty-pages-import.md) | Replaced blunt all-or-nothing empty-pages toggle with per-page checklist (`excludedEmptyPageIds`), backward-compatible with legacy boolean | Granular, reversible control over what gets imported — matches PRD-015A's safety-by-default philosophy. |
| [044](prd/PRD-044-fix-nuclino-import-commit-error.md) | Hotfix for `importEmptyPages` scoping bug introduced by PRD-042 | The commit endpoint is a recurring fragile point when new options get bolted on — test both new and legacy code paths together. |
| [050](prd/PRD-050-nuclino-import-link-normalization-link-evidence.md) | **(Just completed, see §5)** Link normalization, `evidenceType: "Link"` relationships at 0.90 confidence, resolution stats in preview | Closes the loop: explicit author-authored links are the *strongest* possible relationship evidence in the whole system. |

**Running acceptance fixture**: nearly every import PRD (015/016/017/018/030/031) references
the same real 105-file dataset (`Vagaries of Fate PF2e.zip`) with exact counts — if extending
the importer, prefer testing against a real messy export over synthetic fixtures.

---

## 5. The 2026-07 "finish line" work: PRD-047 to PRD-050

These four were the **open GitHub issues** (#1–#4) that prompted the "get note-taking across
the finish line" request. **All four are now Done, tests passing, PR #6 open** (draft, closes
#1–#4 on merge). Full detail in `docs/prd/PRD-047...050-*.md`; summary:

- **PRD-047** (issue #1) — "Link Existing Entity" in AI Cleanup now creates a backlink with
  visible evidence: inline snippet (~120 chars) + "Linked" state + **Undo**. Evidence window
  is ±200 chars around the mention, not just the entity name.
- **PRD-048** (issue #2) — Entity pages are never blank: always render Content (editable,
  placeholder when empty), **Referenced in Sessions** (session title/snippet/date/author,
  sorted by recency, click-to-navigate), and **Relationships** (grouped by type, confidence
  bucket badges, DM/creator-gated delete). New entities auto-seed a `## First seen` snippet.
- **PRD-049** (issue #3) — AI Cleanup gained a **Relationship Suggestions** section
  (Accept persists to `noteRelationships`, Dismiss hides, disabled+explained when entities
  aren't yet resolved) and a **Quest Promotion** flow (Create Quest seeds content + auto-links
  QuestHasNPC/QuestAtPlace + session backlink, or Link existing quest).
- **PRD-050** (issue #4) — Nuclino link evidence corrected: snippet is now the full markdown
  line (not just anchor text), confidence fixed to spec's 0.90 (was 0.92), relationship
  direction now honors the inferred `swap` (e.g. an NPC page linking a Quest correctly stores
  the edge *from* the quest).

**Deviations from the letter of the specs** (judgment calls made during implementation, worth
knowing if revisited):
- Backlink/relationship API paths are team-scoped (`/api/teams/:teamId/...`) rather than the
  PRDs' literal global paths (`/api/notes/:id/...`) — functionally equivalent, consistent with
  the rest of the app's routing convention.
- PRD-047's dedup key includes the evidence-block hash, so the same (session, entity) pair
  with *different* snippets produces grouped, bounded rows rather than one row per pair
  regardless of evidence — this matches the PRD's own suggested alternative option.
  don't rewrite the target page's anchor text to canonical title on Nuclino link resolution
  (kept the author's original anchor text) — judged more respectful of authorial voice,
  consistent with PRD-016's explicit non-goal of "rewriting user content."

---

## 6. AI classification quality/trust/cost pipeline (PRD-027–029, 033, 037–041, 043, 045–046)

This is the **supporting infrastructure** the live editor (§3) and importer (§4) both lean on
for entity/relationship typing. All Done.

**The monetization pivot**: PRD-027 originally designed a team-wide, subscription-gated AI
paywall with pricing tiers. PRD-028 immediately reversed this to a free, per-member opt-in
toggle instead ("every user controls their own AI subscription") — a deliberate move away from
monetization-first gating toward maximizing adoption. PRD-029 then fixed the toggle's initial
breakage (backend PATCH endpoint silently dropped the new field).

**The "Needs Review" panel** — a durable, evolving UI surface (not a one-time import warning):
- PRD-037 introduced it (0.65 confidence threshold, count badge, click-to-navigate)
- PRD-038 added inline Approve/Reject/Reclassify + surfaced the AI's own explanation text
- PRD-041 added consistent colored type badges
- PRD-045 fixed a missing "Point of Interest" reclassify option (AI-inferrable types are
  deliberately narrower than human-assignable types — POI is human-only)
- PRD-046 fixed item-click not syncing the right-hand detail panel

**Recurring bug family to watch for**: enum/type-vocabulary drift across layers that are just
string literals duplicated in multiple files (PRD-029's PATCH field whitelist, PRD-039's
prompt-vocabulary mismatch, PRD-045's dropdown/backend/mapping-table gaps). If a "type" or
"field" concept exists in more than one file (prompt text, validation array, mapping table,
frontend enum), expect this bug class to recur — a single source of truth would prevent it.

**Cost & robustness infrastructure**:
- PRD-033 — three rounds of hardening `extractJsonFromResponse`/`repairJson` against
  malformed Claude JSON output (preambles, trailing commas, unescaped quotes, literal
  newlines). Treat "the model won't always emit valid JSON" as permanent, not a one-off fix.
- PRD-040 — analytical PRD reducing needs-review rate via cheap heuristics (title patterns,
  PC-name context, code-side index-note detection) rather than a costlier two-pass AI call —
  explicitly rejected doubling API cost.
- PRD-043 — persistent DB-backed AI result cache (content-hash + algorithm-version keyed,
  team-scoped, 30-day TTL, CLI-only admin tool for app-store security reasons). Iterated twice
  post-launch to fix a caching gap between the enrichment worker and the AI-preview endpoint,
  and to add negative-caching for "no relationship found" results.

---

## 7. Explicitly out of scope for note-taking (exists, but is a different subsystem)

These PRDs are real and mostly Done, but govern **scheduling/availability/calendar**, not
note-taking — don't conflate them when reasoning about "the notes system":

PRD-007 (setup wizard), PRD-009/009A (availability creation/labels), PRD-010/010A/010B
(upcoming-sessions eligibility/DM controls), PRD-011 (view team availability), PRD-012
(multi-month upcoming sessions), PRD-013 (DM calendar cancel), PRD-014 (conditional info icon).

Also out of scope: **PRD-020/032** (settings-screen bug fix + auto-save — general app
polish, not note-specific), and **GitHub issue #5** ("Replace remaining Quest Keeper
branding with Helm" — stale branding cleanup in `client/index.html` and
`client/src/pages/join-team.tsx`, still open, not note-taking).

---

## 8. Design principles worth reusing verbatim (cheat sheet)

When building the *next* note-taking feature, these are the load-bearing principles that
recur across 3+ independent PRDs — treat deviations from them as a deliberate, flagged choice:

1. **Suggest, don't assume.** No feature should auto-create or auto-link an entity/relationship
   without an explicit user action. (PRD-002, 006, 016, 022, 049)
2. **Session-first, structure-later.** Never require a structural decision at the moment of
   capture. (PRD-001, 004, 008, 019)
3. **Evidence/traceability everywhere.** Every entity, relationship, and backlink should be
   traceable to the exact source text (snippet + offsets) that justified it. (PRD-005, 006,
   016, 030, 047, 048, 049, 050)
4. **Three-tier confidence vocabulary**: HIGH (≥0.80, auto-approvable) / REVIEW (0.65–0.79,
   "needs review") / LOW (0.50–0.64, de-emphasized). Established in PRD-006/030/037, reused
   through PRD-049. Use these exact thresholds unless a PRD explicitly changes them.
5. **Deterministic/structural signals outrank probabilistic AI signals.** Explicit links,
   collection membership, and user confirmations are "ground truth"; AI output is always a
   suggestion subject to review and never silently overrides them. (PRD-016, 017, 030)
6. **No database writes until explicit confirmation** for anything AI-assisted or bulk
   (diff previews, import commits). Reversibility (rollback/undo) is a first-class
   requirement, not an afterthought. (PRD-015A, 030, 031, 047's Undo)
7. **Zero perceptible typing-latency.** Background/debounced/web-worker processing only;
   live-play capture is sacrosanct. (PRD-001, 002, 022)
8. **Session-scoped, non-persisted dismissal state.** Rejecting a suggestion shouldn't be a
   permanent DB write — scope it to the session/localStorage so it doesn't nag but also
   doesn't require a schema migration to "undo" a dismissal. (PRD-002, 003, 006, 022)
9. **Never let AI/paywall gating block core functionality.** Baseline capture and baseline
   import must always work regardless of AI entitlement state. (PRD-027–031)
10. **Test against real, messy content — not synthetic fixtures.** The entity-detection
    genre-tuning (PRD-024/025) and the recurring `Vagaries of Fate PF2e.zip` import fixture
    both reflect this. Prefer it when adding new detection/classification logic.

---

## 9. Open threads / things to verify if picking this back up

- **PRD-023's optional phases**: a DB-level partial unique index on
  `(team_id, DATE(session_date))` for session logs, and a one-time production duplicate-row
  cleanup query, were marked optional/Phase 2-3 — confirm whether these ever landed, since
  they're the "defense in depth" half of the fix (server-side idempotency, Phase 1, is done).
- **GitHub issue #5** (Quest Keeper branding) is still open and unrelated to note-taking —
  quick two-file fix if picked up next.
- **PR #6** (closes issues #1–#4 / PRD-047–050) is open as a draft; being watched via an
  hourly self-check-in until merged or closed.
- This file was synthesized from PRD docs only; it does not re-verify current code state
  against every claim above (that level of audit was done specifically for PRD-047–050 in
  PR #6, not for the earlier PRDs assumed Done in this pass).
