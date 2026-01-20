# PRD-014 — AI Enhanced Import Diff Preview (Nuclino): Side-by-Side Baseline vs Haiku Enrichment + Confirm Step

## Story Status
**Complete** (Implemented January 2026)

---

## Background / Context

### Current Import Preview Screen (Today)
The Nuclino Import Preview modal currently includes:
- Summary counts (Total / NPCs / POIs / Quests)
- “Import empty pages” toggle
- “Default visibility” dropdown (Private / Shared)
- “AI Enhance Import” toggle (Beta)
- Primary CTA: **Import {N} Pages**

### Current System Capabilities (Entity Detection & Relationship Linking)
The system already supports a hybrid detection pipeline:

**Pattern-based detection (Real-time / pre-AI)**
- Detects: NPC, Place, Quest
- Deduplication + merging
- Normalization
- Proximity-based relationship suggestions (≤100 / 300 / 600 char thresholds)

**AI enrichment (post-import)**
- Claude Haiku provider
- Adds: Item, Faction (in addition to NPC, Place, Quest)
- Relationship types:
  - QuestHasNPC
  - QuestAtPlace
  - NPCInPlace
  - Related
- Evidence types:
  - Link, Mention, Heuristic
- Confidence thresholds:
  - HIGH: 0.80+ (auto-approvable)
  - REVIEW: 0.65+
  - LOW: 0.50+

### New Business Constraint
A new **AI Features** toggle exists in Settings and is behind a paywall.
AI import enhancement must respect this entitlement.

---

## Problem Statement

The current “AI Enhance Import” toggle is opaque:
- Users don’t see *what they gain* by enabling it
- It’s unclear how AI changes classifications or discovers relationships
- With AI behind a paywall, the product needs to clearly demonstrate value **before** asking the user to commit

---

## Summary (What this PRD adds)

When **AI Enhance Import** is enabled on the Import Preview modal, clicking **Import {N} Pages** should NOT immediately commit the import.

Instead, it should open a new “Diff Preview” step:

### Diff Preview Screen (Side-by-side)
- **Left panel**: what would be imported using baseline pattern recognition only
- **Right panel**: what would be imported using Haiku AI enrichment + relationship extraction

The diff preview demonstrates:
- Improved entity classification
- New entities discovered (Item/Faction)
- Stronger/fewer false positives
- Additional relationship edges discovered with confidence

The user then clicks a final CTA:
✅ **Confirm AI Enhanced Import**

---

## Goals

1. Make AI value visible and measurable before importing.
2. Allow users to compare baseline vs AI-enhanced results in a diff-like view.
3. Ensure AI import enhancement respects:
   - paywall entitlement (AI Features toggle)
   - per-member AI enablement (if applicable)
4. Keep baseline import fast and reliable (AI preview may take longer).
5. Ensure AI preview does not persist data unless confirmed.

---

## Non-Goals

- This PRD does not redesign entity detection patterns or proximity heuristics
- This PRD does not replace the post-import “AI Cleanup” pipeline (it reuses it in preview mode)
- This PRD does not implement AI caching (not currently supported)
- This PRD does not add new relationship types beyond those already defined

---

## User Stories

### US-1: Value Transparency
As a user, I want to preview exactly how AI improves my import so I can decide whether it’s worth enabling.

### US-2: Trust + Control
As a user, I want to confirm AI-enhanced import only after reviewing what AI is changing.

### US-3: Paid Feature Justification
As a paid user, I want AI import assistance to be clearly better than baseline so it feels worth the cost.

---

## UX / Flow Requirements

---

## FR-1: AI Feature Gating (Paywall + Settings)

### Description
AI Enhance Import must only be usable when the user is entitled.

### Requirements
AI Enhance Import toggle states on Import Preview modal:

#### 1) User NOT entitled (no AI Features access)
- Toggle is disabled + locked
- Show helper text:
  - “AI Enhance Import is available with AI Features.”
- Provide CTA button:
  - “Upgrade to AI Features” (opens billing/paywall flow)

#### 2) User entitled but has AI disabled in Settings
- Toggle is disabled (not locked)
- Helper text:
  - “Enable AI Features in Settings to use AI Enhanced Import.”
- CTA:
  - “Go to Settings”

#### 3) User entitled + enabled
- Toggle enabled and functional

#### Dev Environment Override
In `development`, allow AI toggle to be enabled for testers regardless of paywall.

### Acceptance Criteria
- Users cannot accidentally trigger Haiku preview calls without entitlement
- In dev, testers can validate the feature without paywall friction

---

## FR-2: Import Preview CTA Behavior Change (AI On)

### Description
When AI Enhance Import is ON, the primary CTA becomes a “continue to diff” action.

### Requirements
- If AI Enhance Import = OFF:
  - Clicking **Import {N} Pages** commits baseline import immediately (current behavior)
- If AI Enhance Import = ON:
  - Clicking **Import {N} Pages** transitions to Diff Preview step instead of committing

### Acceptance Criteria
- AI-on path always goes through Diff Preview
- AI-off path imports immediately as before

---

## FR-3: Diff Preview Screen Layout

### Description
The next step is a diff-like comparison screen.

### Layout
Two column view with equal height:

#### Left Column: “Baseline Import”
- Derived from:
  - Nuclino index/list-page mapping
  - shared/entity-detection.ts patterns
  - proximity-suggestions.ts relationship candidates (optional for baseline)
- Shows counts and classifications *without AI*

#### Right Column: “AI Enhanced Import (Haiku)”
- Derived from:
  - baseline results plus Haiku enrichment
- Shows improved counts, confidence, relationships

### Acceptance Criteria
- Side-by-side layout is responsive
- Both columns are readable and scrollable without breaking the wizard

---

## FR-4: Summary Cards in Diff Preview (Top Section)

### Description
Show measurable improvements as summary cards.

### Baseline (Left) Summary Cards
- Total pages
- NPCs
- Places/Areas
- Quests
- General Notes
- Empty Pages

### AI (Right) Summary Cards
- Total pages
- NPCs
- Places/Areas
- Quests
- Items (AI-only)
- Factions (AI-only)
- Relationships found (total)
- HIGH confidence relationships count

### Acceptance Criteria
- Summary cards match the computed results in each column
- AI-only categories are clearly labeled as AI-derived

---

## FR-5: “Changes” List (Diff Detail Section)

### Description
Diff view should show what changes AI makes at the note level.

### Requirements
Provide a list/table of imported pages with:
- Page title
- Baseline type badge
- AI type badge (with confidence)
- A “Changed” indicator when the types differ

Recommended filters:
- All
- Changed only
- Low confidence only (AI confidence < 0.65)
- AI discovered only (Items/Factions)

### Acceptance Criteria
- Users can quickly see how AI changes classifications
- “Changed only” yields only notes that differ from baseline

---

## FR-6: Relationship Diff View

### Description
Show relationship extraction value clearly.

### Requirements
In the Diff Preview, include a Relationships section that shows:

#### Baseline Relationships (Left)
- Proximity-based suggested edges (optional)
- Count by confidence bucket (High/Med/Low)
- Top relationship examples (up to 10)

#### AI Relationships (Right)
- Relationship count by type:
  - QuestHasNPC
  - QuestAtPlace
  - NPCInPlace
  - Related
- Confidence distribution:
  - HIGH (0.80+)
  - REVIEW (0.65–0.79)
  - LOW (0.50–0.64)
- Top examples (up to 10), each showing:
  - Entity A → Entity B
  - relationship type
  - evidence type (Link/Mention/Heuristic)
  - confidence score (2 decimals)
  - snippet preview (truncated)

### Acceptance Criteria
- AI relationships are clearly more structured than baseline proximity suggestions
- Evidence types are visible so users can judge trust

---

## FR-7: Confirm AI Enhanced Import (Final CTA)

### Description
After reviewing diff, user confirms.

### Requirements
Bottom sticky action bar:
- Back
- Cancel
- ✅ Confirm AI Enhanced Import

On confirm:
- Commit import as usual
- Apply AI-enhanced classifications to notes
- Persist AI relationships in DB
- Create an import run record with:
  - aiEnhanced = true
  - haikuModelVersion
  - totals

### Acceptance Criteria
- Confirm persists AI-enhanced results, not baseline
- Cancel returns to preview step without saving anything
- Back returns to Import Preview screen preserving toggles

---

## FR-8: No Data Persistence Until Confirm

### Description
Diff preview must not write to the database until user confirms.

### Requirements
Implement “dry run” mode for AI extraction:
- `/api/teams/:teamId/extract-entities?dryRun=true`
OR
- `/api/imports/nuclino/ai-preview` that returns enrichment results without persisting

Persist only on Confirm.

### Acceptance Criteria
- Closing modal mid-diff creates no new notes or relationships
- Confirm is the only write action

---

## FR-9: Progress + Resilience During AI Preview

### Description
Haiku preview can take time and must have progress feedback.

### Requirements
When generating AI preview:
- show loading state:
  - progress bar (pages processed / total)
  - “Analyzing with Haiku…”
- allow Cancel
- if AI preview fails:
  - show error message
  - allow fallback option:
    - “Import without AI”

### Acceptance Criteria
- Users can cancel long AI jobs safely
- Failure does not block importing baseline content

---

## Data / API Requirements

---

## Backend: New or Extended Endpoints

### 1) POST /api/imports/nuclino/parse  (existing)
Returns:
- parsed pages
- baseline inferred types
- baseline relationship suggestions (optional)

### 2) POST /api/imports/nuclino/ai-preview  (**new**)
Input:
- teamId
- importPlanId
- options:
  - runEntityClassification: true
  - runRelationshipExtraction: true
Returns (dry-run, non-persistent):
- aiClassifications: [{sourcePageId, inferredType, confidence, extractedEntities[]}]
- aiRelationships: [{from, to, type, confidence, evidenceType, snippet}]
- totals summary

### 3) POST /api/imports/nuclino/commit  (existing, extended)
Input:
- importPlanId
- options:
  - defaultVisibility
  - importEmptyPages
  - aiEnhanced: boolean
  - aiPreviewRunId (optional)
Behavior:
- if aiEnhanced:
  - persist AI classifications + relationships alongside notes
- else baseline only

---

## Database Requirements (Additions)

### import_runs (already planned in PRD-011A)
Add fields:
- `aiEnhanced` boolean
- `aiProvider` enum ("ClaudeHaiku")
- `aiModel` string
- `aiCostEstimateUsd` number (optional)
- `aiStats` json:
  - classificationsHighConfidence
  - classificationsReview
  - relationshipsHighConfidence
  - relationshipsReview
  - relationshipsLow

### noteClassifications / noteRelationships (existing)
- persist only after confirm

---

## Rules / Logic Requirements

---

## R-1: AI Confidence Drives Review Flags (Preview)
- HIGH (>=0.80): auto-approvable
- REVIEW (>=0.65): shown as “needs review”
- LOW (>=0.50): shown as “low confidence”

In diff preview:
- show a badge on each classification and relationship accordingly

---

## R-2: “AI Confirms Baseline” Confidence Boost
If baseline detects NPC/Place/Quest and AI agrees:
- classification is marked as “Confirmed”
- confidence shown as AI confidence
- baseline result considered stable

---

## R-3: Type Mapping Between Systems
Baseline “Place” maps to Helm schema “Area” (renamed)
AI “Character/NPC” maps to NPC
AI “SessionLog” maps to Session (only if it matches session structure)
AI “Note” remains Note
AI “Item” and “Faction” are stored as:
- `noteType = Note` with subtype tags (if schema not yet extended)
OR
- `noteType = Item / Faction` if schema supports it

**Recommended now (safe):**
- Persist Item/Faction as tags/subtypes (no schema explosion)
- Show them in preview as AI-only categories

---

## Acceptance Criteria (Global)

- ✅ AI Enhance Import is properly gated by paid AI Features toggle
- ✅ Clicking Import with AI ON opens diff preview instead of importing
- ✅ Diff preview shows baseline vs AI results side-by-side
- ✅ Users can see exactly what entities changed classification
- ✅ Relationships diff is visible with confidence + evidence snippets
- ✅ No database writes occur until final confirmation
- ✅ Confirm AI Enhanced Import persists AI classifications + relationships
- ✅ AI preview has progress + cancel + fallback to baseline

---

## Test Plan

---

## Unit Tests

### Entitlement / Gating
- AI toggle disabled when user not entitled
- AI toggle disabled when user entitled but AI off in settings
- AI toggle enabled in dev override mode

### Diff Calculation
- Identifies “changed” items when baselineType != aiType
- Filters work:
  - Changed only
  - Low confidence only
  - AI-only (Item/Faction)

### Confidence Bucketing
- HIGH/REVIEW/LOW thresholds applied correctly
- Labels shown correctly

### Type Mapping
- Place -> Area mapping correct
- Item/Faction stored as subtype/tag when schema lacks noteType support

---

## Integration Tests

### AI Off Path (Regression)
1. Open import preview
2. AI toggle OFF
3. Click Import
4. Notes committed immediately (no diff step)
5. Counts match baseline

### AI On Path (Wizard Flow)
1. AI toggle ON
2. Click Import
3. Diff preview screen loads
4. Verify columns show different summaries
5. Click Back → returns to preview with options preserved
6. Click Confirm AI Enhanced Import → commits import with AI-enhanced results persisted

### Non-Persistence Until Confirm
1. Start AI diff preview
2. Close modal / cancel
3. Verify:
   - no notes created
   - no relationships created
   - no classifications created

### AI Failure Fallback
1. Simulate Haiku provider failure
2. Diff preview shows error state
3. Click “Import without AI”
4. Baseline import commits successfully

### Relationships Persist After Confirm
1. Confirm AI enhanced import
2. Verify noteRelationships table populated
3. Verify high-confidence edges marked auto-approvable

---

## UX Notes

- The diff view must feel like a “why AI matters” moment:
  - highlight changed classifications count
  - highlight relationship extraction count
  - show confidence visually without overwhelming the user
- Avoid heavy per-page diffs of markdown; focus on:
  - type changes
  - relationship discovery
  - confidence quality

---

## Implementation Notes

- Implement AI preview as a “dry-run enrichment run” that mirrors enrichment-worker.ts behavior
- Use existing batching/rate limiting (150ms between batches)
- Return structured JSON only (no free text) for deterministic UI
- Ensure UI remains responsive during preview generation (poll status or websocket updates)

---

## Telemetry / Success Metrics (Recommended)

Track:
- % of imports where AI toggle is enabled
- % of AI diff previews confirmed vs abandoned
- Average “Changed classifications” count per import
- Relationship edges created per import
- Time spent on diff preview screen
- Fallback to baseline rate (AI failures or user choice)

---

## Open Questions (Intentionally None Required)
This PRD is complete given current architecture and goals.
Any "Item/Faction as first-class note types" can be a future PRD once the UI is ready to support them.

---

## Implementation Notes (Added Post-Completion)

### Files Created
- `shared/ai-preview-types.ts` - Type definitions for AI preview feature (BaselineClassification, AIClassification, AIRelationship, AIPreviewResponse, confidence utilities)
- `client/src/components/ai-import-diff-preview.tsx` - Side-by-side comparison UI component with summary cards, classifications list, relationships tab, and filters
- `server/ai-preview.api.test.ts` - Backend unit tests for type mapping and confidence utilities
- `e2e/ai-import-diff-preview.spec.ts` - Playwright E2E tests for diff preview flow

### Files Modified
- `server/routes.ts` - Added `POST /api/teams/:teamId/imports/nuclino/ai-preview` endpoint, enhanced commit endpoint with `useAIClassifications` and `aiPreviewId` support
- `client/src/components/nuclino-import-dialog.tsx` - Added `ai-diff-loading` and `ai-diff-preview` dialog states, AI preview mutation, wider dialog for diff view

### Key Implementation Details
- **Server-side caching**: AI preview results cached with 5-minute TTL (keyed by previewId) to prevent redundant AI calls between preview and commit
- **Dry-run mode**: No data persisted until user confirms - classifications and relationships stored as "pending" status
- **Type mapping**: Bidirectional mapping between `NoteType` (baseline) and `InferredEntityType` (AI) via `mapNoteTypeToInferredType()` and `mapInferredTypeToNoteType()`
- **Confidence thresholds**: HIGH (≥0.80), MEDIUM (≥0.65), LOW (≥0.50) with color-coded badges
- **Fallback option**: "Import without AI" button available if AI preview fails
- **Responsive layout**: Dialog widens to `sm:max-w-4xl` when showing diff preview

### Test Coverage
- 11 unit tests for type mapping, confidence bucketing, and diff calculation
- 8 Playwright E2E test cases (24 total across 3 browsers) covering:
  - Diff preview display with two columns
  - AI classifications and relationships tabs
  - Filter functionality (All / Changed / Low confidence)
  - Confirm, Cancel, and Back navigation
  - Fallback on AI error
- All 416 existing tests continue to pass

### API Endpoints

**POST /api/teams/:teamId/imports/nuclino/ai-preview**
- Input: `{ importPlanId: string }`
- Returns: `AIPreviewResponse` with baseline and AI classifications, relationships, and diff stats
- Requires: `member.aiEnabled === true`
- Error codes: `AI_SUBSCRIPTION_REQUIRED` (403), `AI_NOT_CONFIGURED` (503)

**POST /api/teams/:teamId/imports/nuclino/commit** (enhanced)
- New input fields: `useAIClassifications: boolean`, `aiPreviewId: string`
- When AI enabled: Creates enrichment run, stores classifications as "pending", creates relationships

---
