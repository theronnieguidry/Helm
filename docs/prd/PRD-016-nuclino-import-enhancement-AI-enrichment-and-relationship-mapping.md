# PRD-012 — Nuclino Import Enhancement: AI Enrichment + Relationship Mapping

## Story Status
Proposed (Follow-up to PRD-011)

## Summary
After importing Nuclino notes, Helm should optionally enrich the imported dataset by:
- detecting People/Places/Quests that weren’t included in Nuclino index pages
- extracting relationships (quest ↔ NPC, quest ↔ place, NPC ↔ place)
- flagging partial/uncertain matches for human review

This makes the imported dataset immediately useful for:
- city-based browsing
- NPC cards
- quest trackers (open/done)
- linking session notes to relevant entities

---

## Why This Matters (based on your dataset)
Your Nuclino export is a skilled “power user” structure (index pages, hub pages, etc.)
…but it still contains important notes that are not categorized via lists.

Example: Notes like `Dr Greene` are not linked under “Notable People” but likely *should be*.

This PRD closes that gap by making import smarter.

---

## Goals
1. AI-assisted identification of:
   - People / NPC notes
   - Place notes
   - Quest notes (if not already from To do / Done)
   - Session notes vs reference notes
2. Relationship extraction:
   - Quest associated with NPCs
   - Quest associated with Places
   - NPC associated with Places
3. Add review UI so user can approve/deny inferred structure.
4. All enrichment is optional and can be turned off.

---

## Non-Goals
- No automatic rewriting/summarization of your notes
- No forced conversion to Helm’s “session note date-title” format
- No cross-team deduplication

---

## Functional Requirements

### FR-1: Enrichment Toggle During Import
During PRD-011 preview screen, add toggle:
✅ **AI Enhance Import (recommended)**

Text:
“Helm can detect NPCs, places, quests, and relationships from your notes to improve organization.”

**Acceptance Criteria**
- Toggle defaults ON in dev, OFF in prod unless user opts in (cost control)
- Toggle selection is remembered per user preference

---

### FR-2: AI Classification of Uncategorized Notes
For notes that remain `noteType = Note` after PRD-011 categorization, run classification:

Output per note:
- inferredType: Person | Place | Quest | SessionLog | Note
- confidence score 0–1
- explanation (short)
- extractedEntities: list of names

**Acceptance Criteria**
- Notes already typed as Person/Place/Quest are not reclassified unless user enables “override classifications”
- Low confidence (<0.65) results are marked “Needs review”

---

### FR-3: Relationship Extraction
For any note, extract relationships:
- quest ↔ npc
- quest ↔ place
- npc ↔ place

**Relationship Sources**
1. Explicit internal links (strong signal)
2. Plain-text named mentions (weak signal)
3. Keyword cues:
   - “met”, “talk to”, “quest”, “task”, “go to”, “at the tavern”, etc.

Store relationships with:
- relationshipType
- evidence:
  - snippet
  - link-based or mention-based
- confidence

**Acceptance Criteria**
- Relationships derived from internal links are treated as high confidence
- Mention-based relationships require user approval unless confidence is high

---

### FR-4: Quest Normalization and Status Integrity
Rules:
- If quest imported from To do list → status = Open (locked unless edited)
- If quest imported from Done list → status = Done (locked unless edited)
- If AI detects a quest not in lists → status defaults Open

**Acceptance Criteria**
- AI cannot incorrectly flip Done → Open unless user approves

---

### FR-5: Review & Approve Changes UI
After import commit, show “Import Results” screen with tabs:
- **Classifications**
- **Relationships**
- **Warnings**

User actions:
- approve all high-confidence changes
- review low-confidence suggestions
- accept/reject per row

**Acceptance Criteria**
- User can complete review in <2 minutes for this dataset (bulk approve UX)
- User can undo an accepted enrichment batch

---

## Data Model Additions

### note_entities (optional)
- id
- noteId
- entityType: Person | Place | Quest
- entityName
- confidence
- createdAt

### note_relationships
- id
- fromNoteId
- toNoteId
- relationshipType: `QuestHasNPC | QuestAtPlace | NPCInPlace | Related`
- confidence
- evidenceSnippet
- evidenceType: `Link | Mention | Heuristic`
- approvedByUser: boolean
- createdAt

### import_enrichment_runs
- id
- importRunId
- status: Pending | Running | Complete | Failed
- totals: { classified, relationshipsFound, userReviewRequired }
- createdAt

---

## Acceptance Criteria (End-to-End)
1. User imports Nuclino ZIP (PRD-011)
2. User enables AI enhancement
3. Helm:
   - classifies additional People/Places/Quests
   - adds relationships
4. User reviews and approves
5. Imported notes are now browsable by:
   - People
   - Places
   - Quests (Open/Done)
   - Session logs

---

## Test Plan

### Unit Tests
**Classification**
- Produces stable output schema for any note
- Flags low confidence properly
- Never reclassifies locked quest statuses from To do/Done unless explicitly enabled

**Relationship extraction**
- Creates relationship objects with evidence snippets
- Link-based relationships are higher confidence than mention-based
- Does not create duplicate edges

**Review mechanics**
- Approving updates DB flags
- Rejecting leaves notes unchanged
- Undo restores previous relationship state

---

### Integration Tests
**Full dataset enrichment**
- Run enrichment on `Vagaries of Fate PF2e.zip`
- Produces:
  - additional people/place suggestions beyond list pages
  - relationship edges between quests and places/NPCs
- User approval flow updates UI navigation categories

**Performance**
- Dataset of ~105 notes completes enrichment within acceptable bounds (dev)
- Safe fallback when AI provider is rate-limited (graceful degradation + retry)

---

## Implementation Notes
- Use a strict prompt with JSON-only output to avoid parsing failures
- Treat internal links as “ground truth edges”
- Mentions without links should be suggestions, not automatic facts
- Keep enrichment as a separate pipeline step so PRD-011 import can remain fast and reliable

---
