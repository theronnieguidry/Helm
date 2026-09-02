# Note-Taking MVP Audit (post-P0/P1/P2)

**Question answered**: after the three implementation waves on PR #6 (P0+P1+P2 of
`NOTE_TAKING_GAP_REPORT.md`), what was *missed* on the way to an MVP a real gaming group
can use? **Date**: 2026-09-02, at commit `7910ba6` (710 tests green, verified in a fresh
container).

**Method**: three fresh skeptical auditors over the implemented work — a server-side fix
re-vet, an MVP product-bar pass that walked new journeys (multi-member game night, search,
first-run, failure modes, scale, export), and a client-side fix re-vet. The client auditor
was lost to a container restart mid-run; its primary targets were independently covered by
the other two plus direct spot-checks in the main session (noted in §6). Every
MVP-blocking claim below was verified against the actual code with file:line evidence.

**Numbering**: findings here are `M#` (this audit). `F#` = the original gap report,
`D#` = its design section, `N#`/`S#` = the product/server auditors' internal numbering,
mapped into M-numbers below.

---

## 1. Verdict

**Not MVP for a group yet — but solid MVP for a single player, and roughly a week of
well-scoped work from group-ready. Nothing requires architectural change.**

The three waves fixed what was findable by *feature audit* — privacy filtering, suggestion
stability, cache correctness, unreachable UIs — and the solo capture experience genuinely
delivers the roadmap thesis. What every previous audit missed is that **nobody ever walked
the product as a group of people on game night**. The one-session-per-team-per-day model
(DB unique index + idempotent create + author-only edit authorization) makes a two-member
team's first shared session either a silent 403 for the second member or mutual content
destruction — and there is no way for anyone to mark a note private from the UI, so the
server-side privacy enforcement built in P0-1 protects a flag nobody can set.

## 2. MVP-BLOCKING — the missed improvements (9)

### The game-night cluster (the big miss)

**M1 · A second member cannot take notes — every keystroke silently 403s.**
`notes.tsx:114-125` resolves "today's session" across ALL authors (no `authorId`
predicate); `shared/schema.ts:231-233` enforces one session log per team per day;
`notes-handlers.ts:107-116` idempotently returns the *existing* session; so member B's
Today editor pre-fills with member A's note, and B's autosave PATCH hits the
author-or-DM guard (`notes-handlers.ts:160-162`) → 403, surfaced only as 12px grey
"Failed to save". B loses everything they type, all night. 100% reproducible for any
two-person team. *(N1)*

**M2 · When the second writer IS allowed (DM + player), they clobber each other.**
Full-content PATCH every 750ms from both clients, `staleTime: Infinity`, no refetch —
last write wins in both directions, silently. PRD-008 non-goal'd real-time collab but
never guarded against destructive concurrency in the shared-session model it created.
*(N2)*

**M3 · No way to make anything private.** `notes-editor-panel.tsx:225` hardcodes
`isPrivate: false`; grep shows zero client-side writes of `isPrivate` anywhere. The
DM's "the innkeeper is the lich" note is team-visible the instant it autosaves. All the
P0-1 server enforcement guards a flag with no UI. *(N4; supersedes F5/F8's milder framing)*

→ **These three are one product decision + one small implementation**: make Today resolve
and create *the current user's* session (scope the unique index to
`(teamId, authorId, DATE(sessionDate))`, add the `authorId` predicate client-side, show
author on session rows/header — also fixes M13), and add a Private/Team toggle writing
the already-allow-listed `isPrivate` field.

### The trust-in-your-words cluster

**M4 · The first sentence of every session gets truncated.** When the lazy create POST
resolves, the editor sync effect (`notes-editor-panel.tsx:142-192`) runs
`setDraftContent(activeNote.content)` unconditionally on the `null → id` transition; the
P1-6 flush guard doesn't fire because `prevNoteRef.current` is null. Everything typed
during the POST round-trip vanishes, and the next autosave persists the truncation. Hits
at the highest-stakes moment in the product. *(N3)*

**M5 · Autosave failure has no safety net.** Errors go to `console.error` + a grey
indicator; no toast, no retry affordance, no `beforeunload` guard anywhere in the repo
(grep-verified), no localStorage draft mirror. A wifi drop at the table = an hour of
writing lost on laptop close. *(N5)*

**M6 · Editing an imported note silently has no visible effect.** The shared PATCH
allow-list never touches `contentMarkdownResolved`; the imported-note view renders
`contentMarkdownResolved || content`, and the editor swaps back to view mode on note
switch — so the user's edit "disappears" behind the stale rendered markdown.
(`notes-handlers.ts:166-187` + `imported-note-view.tsx:22` +
`notes-editor-panel.tsx:508-513`.) Fix: when content changes on a `sourceSystem` note,
also update (or null) `contentMarkdownResolved`. *(S1 — a P1-5 seam)*

**M7 · The backlink re-indexer can permanently destroy evidence during normal editing.**
It runs on *every* 750ms autosave, and its delete branch fires during transient states —
cut a paragraph to re-paste it and every backlink whose snippet+title are momentarily
absent is hard-deleted, including user-confirmed Link evidence. Nothing restores them
when the text returns. (`notes-handlers.ts:191-195` → `backlink-reindex.ts:76-78`.)
Fix: soft-orphan (flag stale / null offsets) instead of delete, and/or debounce re-index
to a much longer quiet period. *(S2 — a P2-2 seam)*

### Findability + the phone in everyone's pocket

**M8 · Search hides its own results.** The left-panel search does match content, but
matched categories stay collapsed (only Sessions expands by default), showing just count
badges — searching "Kettle" when Kettle is an NPC looks like "no results". No match
snippet, no global empty state. ~20 lines in `notes-left-panel.tsx`. *(N6)*

**M9 · No mobile fallback.** The always-horizontal resizable split (`min-w-[250px]` left,
`minSize={50}` right) leaves ~100px of editor on a phone, and hover-only previews are
unreachable on touch. Players will open the campaign notebook on phones in week one. The
`use-mobile` hook exists and is unused by any notes surface. *(D1 — elevated from the
open design list)*

## 3. MVP-RELEVANT — should follow soon (not blocking)

**Privacy-leak stragglers of the F81 class** — the P0-1 fix covered the shared handlers,
but four unshared endpoints still leak private-note titles (or worse) to non-authors:
- **M10** Enrichment review GET attaches `noteTitle`/`fromNoteTitle`/`toNoteTitle`
  unfiltered (`routes.ts:2395-2416`). *(S3)*
- **M11** The new P2-4 import-details endpoint lists private imported notes' titles to any
  member — and private is the import default (`routes.ts:2240-2245`). *(S4)*
- **M12** Bulk-approve endpoints skip the visibility/authz guard the single-item PATCH
  has — a member can retype other authors' private notes via `classificationIds`
  (`routes.ts:2529-2551, 2626-2639`). *(S5)*
- Backlinks/outgoing-links GETs lack the subject-note visibility guard the detail
  endpoint has (`routes.ts:981-984, 1165-1168`), and `POST /extract-entities` ships all
  private titles to the AI provider unfiltered (`routes.ts:2710-2721`). *(S6, S7)*

**Quality/coherence**:
- **M13** No author shown on session rows or the editor header — unreadable in a shared
  model (folds into M1's fix). *(N13)*
- **M14** Multi-mention backlinks collapse onto the first occurrence on re-index
  (`backlink-reindex.ts:49,64` — no cursor across the loop). *(S9)*
- **M15** Entity type decided by pattern-run order: "The High Temple" registers as NPC
  (`PERSON_PATTERNS` bare titles) and its stable ID flips type on edit, losing persisted
  state — key the entity map by type+text or pick type by best match. *(S10)*
- **M16** Prose quest matches can emit whole clauses ("defeat the dragon that guards the
  northern pass before winter") — `isValidEntityName` is never applied to pattern matches. *(S11)*
- **M17** Feature-flag branches of the three still-unshared endpoints (detail,
  cleanup-suggestions ×2) are unreachable from the test harness — the P2-3 seam isn't
  fully closed. *(S8)*
- **M18** Two unexplained twin buttons ("Suggestions" / "AI Cleanup") side by side with
  no copy distinguishing heuristics from Haiku. *(N12)*
- **M19** Editor chrome pops in mid-sentence (Title/Date row appears only after the
  session record is created, shifting the textarea). *(N11)*
- **M20** First-run teaches nothing: six empty accordions, no pointer to
  Suggestions/AI/import. *(N10)*
- **M21** Search is client-side over one unbounded fetch and skips backlink/evidence
  text; session list has no virtualization (fine at dogfood scale, will sag after a
  105-page import + a season). *(N7, N9)*
- **M22** No export of any kind — the import story is a one-way door; becomes a trust
  issue the day the group writes sessions natively. *(N8)*
- From the open design list: suggestions-panel hierarchy + lying header count (D2),
  place→Area vs place→POI divergence (D3), NPC green/orange + "Person" label flip (D4),
  the 0.5-threshold confidence dot contradicting the canonical buckets (D5), missing
  `dark:` variants (D6) — best fixed together as one shared type/label/confidence module.
- **M23** F58 enrichment batch undo remains API-only with no noteType revert (roadmap
  principle 6); whole-run rollback is the only panic button.

## 4. POST-MVP (confirmed fine to defer)

A11y sweep (private 4-person dogfood, no AT users — revisit before any public release);
P3 hygiene (dead component, stale PRD statuses, dead columns); F57 diff-preview filters
(one-time import convenience — but fix the PRD footer that claims they shipped); F59
Item/Faction types (descope in PRD-030); plus lower-risk server nits: post-completion
import 500 with completed status + plan-cache leak, `updatedByUserId` never maintained by
PATCH, cache pair-hash collision for identical-content notes, case-folding offset edge,
slug collisions in entity IDs, and the `İ`-class lowercase length edge in re-index.
Note: the ES2018 lookbehinds in `shared/entity-detection.ts` are a hard parse error on
Safari < 16.4 — irrelevant for the owner's dogfood browsers, worth knowing before wider
distribution.

## 5. Recommended MVP cut (the week of work)

1. **Session ownership decision + per-user Today** (M1+M2+M13, schema index change) — M
2. **Private/Team toggle in the editor** (M3) — S
3. **Capture-trust pair**: fix the first-transition draft clobber; localStorage draft
   mirror + beforeunload + visible retry (M4+M5) — S/M
4. **Imported-note edit fix + re-index soft-orphan** (M6+M7) — S
5. **Search that reveals its matches** (M8) — S
6. **Single-column mobile fallback** (M9) — M

If a seventh slot exists: the shared type/label/confidence module (kills five design
findings and three duplicated maps at once). The M10-M12 privacy stragglers should ride
along with any of the above server work — they are each a few lines with the existing
`filterVisibleNotes`/`canViewNote` helpers.

## 6. What was re-verified as working (so review can start from trust)

Handler unification is complete for all six shared routes with correct route ordering and
no leftover inline copies; the PATCH allow-list drops nothing any production client sends;
quest default-lead doesn't clobber import flows; the detail-endpoint normalization has NOT
re-diverged between routers; the import-run pending→completed/failed lifecycle holds under
post-completion throws; the AI cache direction fix is consistent end-to-end with no stale
metadata references and the version bump makes pre-fix entries unreachable; scroll-to-
mention no-ops safely on imported-view notes; the persistence storage key does not flip on
same-day session creation; the deep-link effect does not fight the Today button. Client
re-vet caveat: one auditor was lost to a container restart; its uncovered corners
(persistence-hook race under rapid key flips, suggestion-section status survival across
refresh) are believed low-risk but were not exhaustively re-proven.
