# PRD — Unified Session-Based Notes (Remove Notes vs Session Logs Tabs)

## Story Status
Proposed (High Priority UX Simplification)

---

## Summary

The current Notes experience separates **Notes** and **Session Logs** into two tabs. In practice, these represent the **same conceptual object**: a time-based record of a session or meeting.

This separation introduces unnecessary cognitive overhead, duplicates functionality, and complicates future collaboration features (multiple contributors per session).

This PRD proposes:
- Removing the Notes / Session Logs tab distinction
- Unifying all note-taking around a **single Session-based model**
- Defaulting new note titles to the **current date**, with an optional user-provided suffix
- Prefilling (but allowing editing of) the session date

---

## Problem Statement

Users do not meaningfully distinguish between:
- “Notes”
- “Session Logs”

Both are:
- chronological
- session-scoped
- edited similarly
- later structured into People, Places, and Quests

Maintaining separate tabs:
- creates decision fatigue (“Which one should I use?”)
- fragments content
- complicates collaboration and retrieval
- does not reflect how sessions actually occur

---

## Goals

- Make **sessions the single organizing primitive** for note-taking
- Eliminate redundant UI and mental models
- Encourage consistent naming and chronological organization
- Prepare the system for **multi-user collaborative sessions**

---

## Non-Goals

- This PRD does not change:
  - entity models (Person, Place, Quest)
  - passive entity detection
  - post-session review flow
- This PRD does not add real-time collaboration (future work)

---

## User Story

> As a note-taker,  
> when I create a new note for a session,  
> I want it to already feel like “this session’s notes,”  
> so I don’t have to decide what kind of note I’m creating.

---

## Proposed Changes

---

## FR-1: Remove Notes vs Session Logs Tabs

### Description
The Notes area should no longer present separate tabs for “Notes” and “Session Logs”.

### Requirements
- Replace tabs with a single **Sessions** view
- All previously created Notes and Session Logs are displayed together
- Sort by session date (descending by default)

### Acceptance Criteria
- There is no UI distinction between Notes and Session Logs
- Existing data remains accessible without migration loss
- Users do not need to choose a “note type” on creation

---

## FR-2: Unified Session Creation Flow

### Description
Creating a note always creates a **Session-based entry** using the Session Log editor.

### Requirements
- “Create Note” → opens Session Log editor
- Editor supports the same rich text / block-based input as before
- No separate “note editor” exists

### Acceptance Criteria
- All new notes use the Session Log editor
- There is exactly one creation path for session notes

---

## FR-3: Default Title = Current Date (Editable)

### Description
When creating a new session note, the Title field should be automatically populated with the current date.

### Format
- Default title format:
  - `YYYY-MM-DD`
- Optional suffix allowed:
  - `YYYY-MM-DD — Session 14`
  - `YYYY-MM-DD — Dockside Investigation`

### Requirements
- Title field is prefilled with today’s date
- User may:
  - edit the date
  - append additional descriptive text
- Title is never locked

### Acceptance Criteria
- Creating a new note auto-fills the title with the current date
- User can edit any part of the title
- Saving persists the edited title exactly as entered

---

## FR-4: Prefilled Session Date Field (Editable)

### Description
The session date should be explicitly stored and visible, not inferred only from the title.

### Requirements
- Session Date field:
  - defaults to today’s date
  - is editable by the user
- Session Date is stored separately from the title
- Sorting and grouping use Session Date, not title parsing

### Acceptance Criteria
- User can change the session date without changing the title
- Sessions sort correctly even if the title is customized
- Session Date persists independently

---

## FR-5: Session List Display

### Description
Sessions should display clearly and consistently in the list view.

### Display Requirements
Each session item shows:
- Title
- Session Date
- Visibility (private / team-shared indicator)
- Last edited timestamp (optional)

### Acceptance Criteria
- Sessions are easy to scan chronologically
- Date-based naming makes list immediately readable

---

## FR-6: Collaboration Readiness (Forward-Compatible)

### Description
This model should support future multi-user contributions.

### Requirements
- Session object must support:
  - multiple authors/editors
  - attribution per block or change (future)
- No assumptions that a “note” has a single owner

### Acceptance Criteria
- Data model does not block future collaborative editing
- No logic depends on “note owner = single author”

---

## Data Model Adjustments

### Session (Unified)
Fields:
- `id`
- `teamId`
- `title`
- `sessionDate`
- `content`
- `visibility`
- `createdBy`
- `createdAt`
- `updatedAt`

Deprecate:
- Separate Note vs SessionLog types (map both to Session)

---

## Migration Considerations

- Existing Notes:
  - Map to Session
  - Use created date as sessionDate if missing
- Existing Session Logs:
  - No change required
- UI labels updated only; data loss is unacceptable

---

## Acceptance Criteria (Global)

- ✅ There is only one way to create session-based notes
- ✅ New notes default to today’s date as the title
- ✅ Date is editable but prefilled
- ✅ No Notes vs Session Logs tabs exist
- ✅ Existing data remains intact and visible
- ✅ UX feels simpler, faster, and more obvious

---

## Test Plan

### Unit Tests
- Session creation defaults title to today’s date
- Session date defaults correctly
- Editing title does not affect session date
- Editing session date does not affect title

### Integration Tests
- Create session → edit title → save → reload persists correctly
- Create session → edit date → list sorting updates correctly
- Existing Notes appear in unified session list

### Regression Tests
- Permissions still enforced correctly
- Post-session review still functions as before

---

## UX Success Metrics

- Reduced hesitation during note creation
- Fewer abandoned note drafts
- Faster time-to-first-keystroke when creating a session
- No user confusion about “which type of note to create”

---

## Priority

**High**  
This change simplifies the mental model of the entire Notes system and directly supports future collaboration.

---

## Future Enhancements (Out of Scope)

- Live multi-user session editing
- Session templates
- Automatic session summaries
- Voice-to-text capture

---
