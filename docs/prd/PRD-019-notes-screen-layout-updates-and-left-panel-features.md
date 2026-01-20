# PRD-013 — Notes Screen Layout: Left Filter Panel + Inline Session Editor + Hover Preview + Reclassification

## Story Status
Proposed (High Priority UX + Workflow Upgrade)

---

## Summary

Refactor the Notes screen into a **two-panel layout**:

### Left Panel (1/3 width)
- Contains the existing top filters (Sessions, People, Areas, Quests, etc.)
- Filters expand inline to reveal items underneath
- Hovering items shows a preview popup
- Popup includes a reclassification dropdown

### Right Panel (2/3 width)
- A **free-form session notes editor** for **today’s date**
- Auto-saves continuously
- Never creates blank session notes
- Selecting a past session populates the editor with that session’s raw notes
- Clicking any other item loads that item in the editor for viewing/editing

Also:
- Rename **Location → Area** throughout the UI and models.

---

## Problem Statement

The current Notes screen creates friction by:
- placing filters at the top rather than making them a stable navigation region
- requiring a “New Session” button to begin writing session notes
- forcing users into extra clicks during live sessions
- offering minimal visibility into what each item contains without opening it

Note-taking during sessions needs to be:
- immediate
- auto-persistent
- browsable
- correctable (misclassification happens)

---

## Goals

- Make the Notes screen feel like a **live notebook** (always ready to write)
- Improve navigation by moving filters into a permanent left panel
- Enable rapid retrieval of previous session notes
- Provide quick preview of items without context switching
- Allow reclassification from the preview popup
- Support “write first, organize later” workflows

---

## Non-Goals

- This PRD does not implement AI enrichment/classification
- This PRD does not introduce real-time multi-user co-editing (future)
- This PRD does not redesign the underlying data models beyond renaming Location → Area
- This PRD does not change import functionality (covered separately)

---

## User Stories

### US-1: Live Session Note-Taker
As a note-taker, when I open Notes, I want to immediately start typing today’s session notes without creating anything first.

### US-2: Review Prior Sessions
As a user, I want to click a session from the left panel and instantly see its notes in the editor.

### US-3: Quick Reference While Writing
As a user, I want to hover an NPC or Area and preview it without leaving my current note-taking flow.

### US-4: Fix Misclassification
As a user, if something is incorrectly classified (POI vs Area), I want to reclassify it quickly.

---

## Information Architecture

### Left Panel (Navigation / Filters)
Contains filters (collapsible sections), e.g.:
- Sessions
- People
- Areas *(renamed from Location)*
- Quests
- Points of Interest (POIs) *(if applicable)*
- Collections *(if applicable)*

### Right Panel (Editor / Detail)
Primary modes:
- **Today’s Session Editor** (default)
- **Selected Item Editor** (when user clicks session/item on left)

---

## Functional Requirements

---

## FR-1: Left Navigation Panel Contains Filters

### Description
Move existing top filters into a persistent left panel.

### Requirements
- Left panel occupies ~1/3 of the Notes screen width
- Filters appear as stacked sections
- Each filter supports expand/collapse
- Filters include item counts (recommended)

Example:
- Sessions (12)
- People (20)
- Areas (24)
- Quests (30)

### Acceptance Criteria
- Filters no longer appear at the top of the screen
- Left panel remains visible while editing

---

## FR-2: Clicking a Filter Expands Items Inline

### Description
Filters expand to show items beneath them (no new page navigation).

### Requirements
- Clicking a filter header toggles expansion
- Items appear as a vertical list
- Support scrolling within panel if list is long
- Expanded state persists while user remains on Notes screen

### Acceptance Criteria
- Each filter expands/collapses reliably
- Items appear under the correct filter

---

## FR-3: Right Panel Defaults to Today’s Session Notes (Inline Entry)

### Description
The right panel should immediately function as the editor for today’s session.

### Requirements
- On opening Notes screen:
  - show a header: `Today — YYYY-MM-DD`
  - show an empty free-form editor
- There is no “New Session” button required to begin typing
- Editor auto-saves (see FR-4)

### Acceptance Criteria
- User can type immediately without clicking anything
- The UI communicates that this editor is “today’s session”

---

## FR-4: Auto-Save for Today’s Session Notes (No Blank Notes)

### Description
Typing into today’s editor creates/updates the session note automatically.

### Rules
- If the editor content remains blank for a date:
  - no session note is created
- If at least one character is entered:
  - session note is created for today’s date
- Deleting content back to empty:
  - should remove the session note (recommended behavior)
  - OR mark it as empty and hide it (acceptable fallback)

### Auto-Save Behavior
- Debounced save (e.g., 750ms after last input)
- Display a small status:
  - “Saving…”
  - “Saved”

### Acceptance Criteria
- Blank editor does not create “empty session” records
- Entering text persists a session note for today
- Content persists after refresh/reload

---

## FR-5: Clicking Sessions → Clicking a Session Loads Raw Notes into Editor

### Description
The Sessions filter expands into session entries. Selecting one loads it into the right panel.

### Requirements
- Sessions list shows:
  - date title (YYYY-MM-DD)
  - optional suffix (if present)
- Clicking a session:
  - loads its raw markdown/text into the editor
  - editor becomes “Session View Mode”
  - preserves autosave behavior for edits

### Acceptance Criteria
- Clicking a session always loads its corresponding note content
- Editing then autosaves to that session note

---

## FR-6: Clicking Any Item Loads that Item in the Editor

### Description
The editor must act as a unified “viewer/editor” for any selected entity.

### Requirements
- Clicking a Person/Area/Quest item:
  - populates right editor with that entity’s page content
  - header shows item type + title
  - edits autosave similarly

### Acceptance Criteria
- Clicking items reliably loads the correct content
- Switching between items updates editor context correctly

---

## FR-7: Hover Preview Popup for Items in Left Panel

### Description
Hovering items provides a quick preview without changing the editor state.

### Requirements
- Hovering any item shows a small popup that contains:
  - title
  - type badge (Person/Area/Quest/etc.)
  - preview snippet (first ~200–400 characters)
  - last edited timestamp (optional)

Behavior:
- Hover does not change selection
- Popup disappears on mouse out (with a small delay)

### Acceptance Criteria
- Hovering an item shows a preview popup
- Preview reflects latest saved content
- Hover does not interrupt typing in editor

---

## FR-8: Reclassification Dropdown in Preview Popup

### Description
If an item is incorrectly classified, users can change its type quickly.

### Requirements
Within the hover popup, include:
- dropdown: `Reclassify as...`
- options include all note types (except Sessions):
  - Person
  - Area
  - Quest
  - POI
  - Note
  - Collection (if supported)

Rules:
- Selecting a new type updates the item classification immediately
- Item should move into its new filter category list

### Acceptance Criteria
- Reclassification updates the note type correctly
- Item appears under the new filter after change
- No data loss occurs during reclassification

---

## FR-9: Rename “Location” to “Area”

### Description
Update terminology across UI and models.

### Requirements
- Replace UI labels:
  - “Location” → “Area”
- Replace internal enum/type (if applicable):
  - `Location` → `Area`
- Migration logic for existing notes:
  - convert old type to new type seamlessly

### Acceptance Criteria
- No “Location” labels remain visible in the Notes UI
- Existing data remains accessible and correctly categorized

---

## Data Model Requirements

### Notes / Entities (Existing + Extended)
- `id`
- `teamId`
- `title`
- `noteType`:
  - Session
  - Person
  - Area
  - Quest
  - POI
  - Note
  - Collection
- `contentMarkdown`
- `createdAt`
- `updatedAt`

### Session Note Unique Constraint
Session note should be uniquely identified by:
- `teamId + sessionDate` (plus optional suffix in title)

---

## Acceptance Criteria (Global)

- ✅ Left panel contains all filters previously shown at top
- ✅ Filters expand to reveal items
- ✅ Right panel defaults to today’s session editor
- ✅ Auto-save works and does not create empty sessions
- ✅ Clicking sessions/items loads into editor correctly
- ✅ Hover preview works for all items
- ✅ Preview supports reclassification via dropdown
- ✅ “Location” renamed to “Area” everywhere

---

## Test Plan

### Unit Tests

#### Left Panel / Filters
- Expanding a filter shows items
- Collapsing hides items
- Item count matches returned list count

#### Auto-Save Behavior
- Blank input does not create session note
- First character creates session note for today
- Debounced save triggers persist
- Deleting back to empty removes/hides session note

#### Editor Selection
- Selecting a session loads correct content
- Selecting a Person/Area/Quest loads correct content
- Switching selection saves current draft before switching (recommended)

#### Hover Preview
- Hover shows popup with snippet
- Hover out hides popup
- Popup content matches saved note content

#### Reclassification
- Changing type updates noteType field
- Item appears under new category list

#### Rename Location → Area
- Type mappings convert correctly
- No UI string contains “Location”

---

### Integration Tests

#### E2E: Live session entry
1. Open Notes screen
2. Type into today editor
3. Verify record created with today date
4. Refresh page
5. Content persists

#### E2E: No blank sessions
1. Open Notes screen
2. Do not type anything
3. Navigate away and back
4. No session exists for today

#### E2E: Load prior session
1. Expand Sessions in left panel
2. Select a prior session date
3. Verify editor loads correct raw content
4. Edit content → autosave
5. Reopen session → updated content present

#### E2E: Hover preview & reclassification
1. Expand People
2. Hover item → preview popup shown
3. Reclassify item to Area
4. Verify it moves from People to Areas
5. Verify editor still loads the same content

---

## UX Notes

- The editor should feel like a “workspace,” not a modal flow.
- Left panel should stay stable while the user types.
- Preview should be helpful but not disruptive.
- Reclassification should feel safe and reversible (optional Undo snackbar recommended).

---

## Priority

High — This materially improves the “I’m taking notes live during a session” experience.

---

## Implementation Notes

- Keep a local “draft buffer” for editor content to avoid jitter on autosave
- Debounce saves to avoid excessive writes
- Use optimistic UI updates for reclassification + list movement
- Ensure selection changes do not drop unsaved edits

---
