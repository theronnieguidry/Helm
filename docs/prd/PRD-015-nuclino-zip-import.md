# PRD-011 — Nuclino ZIP Import (MVP)

## Story Status
Proposed

## Summary
Enable importing notes from a Nuclino export ZIP (`.zip`) into Helm. Imported notes should preserve:
- note titles + markdown content
- internal links between pages
- basic categorization when the export contains “index/list” pages (e.g., Notable People, Places, To do, Done)

This PRD uses the real dataset:
**Vagaries of Fate PF2e.zip** (105 markdown files) as a canonical import test fixture.

---

## Goals
1. Users can upload a Nuclino ZIP export and import it into a chosen Team/Campaign group.
2. Preserve all note text as Markdown.
3. Preserve internal navigation:
   - Nuclino links become Helm internal links to the imported notes.
4. Auto-classify the most obvious structures:
   - “People” pages
   - “Places” pages
   - “Quest” pages (To do / Done)
   - “Collections / Index pages” (pages that are mostly lists of links)
5. Support safe re-import (idempotent upsert).

---

## Non-Goals
- No OneNote/Evernote imports (future PRDs)
- No semantic enrichment / AI-driven classification (covered in PRD-012)
- No attachment/media import (not present in this dataset)
- No “merging duplicates across different sources” beyond Nuclino ID logic

---

## Terminology
- **Nuclino Page**: a single exported `.md` file.
- **Source Page ID**: the 8-char hex suffix in the filename. Example:
  `Kettle 03183b35.md` → sourcePageId = `03183b35`
- **Collection Page**: a page that is primarily a bulleted list of internal links.
- **Quest Status**:
  - Open = From “To do” collections
  - Done = From “Done” collections

---

## Dataset Observations (Acceptance Baseline)
From the uploaded export:
- Total `.md` pages: **105**
- Empty pages: **13**
- Collection pages (link hubs): **16**
- Pages linked from “Notable People” collection: **20**
- Pages linked from “Places” collection: **24**
- Quests:
  - Open (“To do”): **10**
  - Done (“Done”): **20**
- Remaining uncategorized notes: **30**

---

## User Stories
### US-1: Import Notes
As a user, I want to import my Nuclino notes into Helm so I can use them inside my campaign/team.

### US-2: Preserve Links
As a user, I want links inside imported notes to continue working so I can navigate between NPCs, places, and session notes.

### US-3: Maintain Structure
As a user, I want Nuclino’s “index” pages like *Notable People* and *Places* to come over cleanly as Collections.

---

## Functional Requirements

### FR-1: Import Entry Point
Add an Import flow accessible from the Notes area:
- Button: **Import Notes**
- Provider selection: **Nuclino (ZIP export)**

**Acceptance Criteria**
- Import flow is visible to all team members
- Imported notes are scoped to the currently selected Team/Campaign group

---

### FR-2: Upload ZIP + Validate Contents
Accept ZIP upload and validate:
- ZIP must contain at least 1 `.md` file
- Ignore non-md files safely

**Behavior**
- If ZIP has no `.md` files → show error
- If ZIP contains `.md` files → proceed to parsing

**Acceptance Criteria**
- System rejects invalid archives with clear user-facing error text
- System accepts the provided dataset ZIP

---

### FR-3: Parse Nuclino Export Format
Each `.md` file becomes a Nuclino Page object:
- `sourcePageId` (from filename suffix)
- `title` (from filename prefix; cleaned)
- `markdown` content (raw)
- `lastModifiedAt` (from ZIP entry timestamp if available)
- `isEmpty` if content is blank

**Title Cleaning Rules**
- Remove trailing ` {sourcePageId}.md`
- Convert exporter-safe replacements:
  - `" _ "` (space underscore space) → `" / "` (session segment separators)
  - `"repair_craft"` style underscore → `"repair/craft"` (only when a link text indicates it)
- Decode HTML entities in content (e.g., `&#x20;` → space)

**Acceptance Criteria**
- `Kettle 03183b35.md` imports with title `Kettle`
- Pages with content beginning `&#x20;` do not show the encoded entity after import

---

### FR-4: Parse and Resolve Internal Links
Nuclino export links look like:
`[Link Text](<Some Page abc12345.md?n>)`

Importer must:
1. Detect all internal links referencing `.md` files in the ZIP
2. Resolve target filename → corresponding imported note
3. Convert links into Helm internal link format

**Example Conversion**
Nuclino:
`[Check in on the Detanis](<Check in on the Detanis da93523d.md?n>)`

Helm result:
`[Check in on the Detanis](/notes/{noteId})`

**Acceptance Criteria**
- 100% of resolvable links become working Helm links
- If a link target is missing (future exports), importer leaves text intact and warns in import summary

---

### FR-5: Detect Collections and Categorize Notes
Collections are pages that are primarily a list of internal links.
In the dataset, these include:
- index.md
- Notable People
- Places
- To do
- Done
- Skathen (hub linking to Places/Done/To do)

Importer must:
- import these as `noteType = Collection`
- import their link structure as child references

**Basic Categorization Rules**
If a page is linked from:
- “Notable People” collection → `noteType = Person`
- “Places” collection → `noteType = Place`
- “To do” collection → `noteType = Quest`, `questStatus = Open`
- “Done” collection → `noteType = Quest`, `questStatus = Done`
Else:
- `noteType = Note`

**Acceptance Criteria**
- The import summary for the provided ZIP matches the baseline counts within ±2 (to account for duplicate collections)
- Quest status is set correctly based on To do / Done lists

---

### FR-6: Import Preview + Summary
Before committing the import, show:
- Total pages detected
- Empty pages count
- Categorized counts (People, Places, Quests Open/Done, Collections, Notes)
- Toggle: **Import empty pages** (default ON)

**Acceptance Criteria**
- User can import with empty pages included or excluded
- Summary numbers match expectations for the dataset

---

### FR-7: Commit Import (Upsert)
On Import confirm:
- create notes in Helm
- store `sourceSystem = "NUCLINO"`
- store `sourcePageId` for idempotency
- store original markdown in `contentMarkdown`
- store resolved content in `contentMarkdownResolved`

**Idempotency Rule**
Unique key:
`(teamId, sourceSystem, sourcePageId)`

Behavior:
- if exists → update content + title + type
- if not → create

**Acceptance Criteria**
- Importing the same ZIP twice does not create duplicates
- Re-import updates existing notes

---

## Data Model (Minimum Needed)
### notes
- id
- teamId
- title
- contentMarkdown
- contentMarkdownResolved
- noteType: `Collection | Person | Place | Quest | Note`
- questStatus: `Open | Done | null`
- sourceSystem: `"NUCLINO"`
- sourcePageId: string
- createdAt, updatedAt

### note_links (optional but recommended)
- id
- fromNoteId
- toNoteId
- linkText
- createdAt

---

## API Requirements
### POST /api/imports/nuclino/parse
Input:
- teamId
- zipFile
Returns:
- parsed summary
- preview categories
- importPlan (list of pages + inferred types)

### POST /api/imports/nuclino/commit
Input:
- teamId
- importPlanId
- options: { importEmptyPages: boolean }
Returns:
- import results (counts, created/updated)

---

## Acceptance Criteria (End-to-End)
1. User uploads ZIP → preview shown with breakdown
2. User commits import → notes created/updated
3. Collections render correctly as navigable hubs
4. Clicking an internal link navigates to the imported target note
5. Re-import does not duplicate notes

---

## Test Plan

### Unit Tests
**Parsing**
- Parses filename into (title, sourcePageId)
- Handles titles with parentheses, apostrophes, quotes
- Decodes HTML entities (&#x20;, &amp;, etc.)
- Detects empty pages

**Link resolution**
- Extracts Nuclino internal links with `<...md?n>` format
- Resolves link target by filename
- Converts to Helm URL format
- Leaves unresolved links untouched + adds warning

**Categorization**
- Detects “collection pages” (mostly lists of internal links)
- Applies correct category mapping based on which collection links reference a page
- Assigns questStatus from To do/Done

**Idempotency**
- Upsert behavior keyed by (teamId, sourceSystem, sourcePageId)

---

### Integration Tests
**Import Preview Flow**
- Upload dataset ZIP → returns expected summary counts
- Toggle exclude empty pages → empty pages omitted from commit

**Commit Import**
- Commit creates notes
- Notes contain resolved internal links
- Collections render as link lists
- Clicking links navigates correctly

**Re-import**
- Commit twice results in:
  - created count == first run
  - updated count > 0
  - duplicates count == 0

---

## Implementation Notes
- Treat Nuclino export markdown as “trusted-ish” but sanitize for safe rendering (no script tags)
- Keep both raw + resolved markdown to support future “re-resolve links” operations
- This importer should be written in a provider-agnostic way to support later connectors (OneNote, Evernote, etc.)

---
