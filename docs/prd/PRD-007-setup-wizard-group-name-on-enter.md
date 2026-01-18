# PRD — Setup Wizard: Submit Group Name on Enter

## Story Status
Proposed (Ready for Development)

---

## Overview

During the Setup Wizard step **“Give your group a name”**, users naturally expect that pressing the **Enter / Return** key will confirm their input and advance the flow.

Currently, progression only occurs via the **Next** button. This creates unnecessary friction, breaks keyboard-first flow, and feels inconsistent with modern form UX expectations.

This PRD defines the required behavior, acceptance criteria, and test coverage to ensure **Enter key submission works reliably and accessibly**.

---

## Problem Statement

Users frequently type a group or campaign name and instinctively press **Enter** to continue. When nothing happens:
- The experience feels broken or laggy
- Users hesitate, retype, or look for what went wrong
- Keyboard-centric users (desktop, power users, accessibility users) are penalized

This is especially noticeable in a **wizard flow**, where momentum matters.

---

## Goals

- Allow users to submit the group name by pressing **Enter**
- Ensure behavior is consistent with clicking **Next**
- Preserve validation and error handling
- Avoid accidental submissions when input is invalid or empty

---

## Non-Goals

- This change does **not** redesign the setup wizard UI
- This change does **not** alter validation rules
- This change does **not** affect other wizard steps (unless explicitly extended later)

---

## User Story

> As a user creating a new group,  
> when I type a group or campaign name and press **Enter**,  
> I want the wizard to accept the name and move to the next step  
> so the setup flow feels fast and natural.

---

## Functional Requirements

### FR-1: Enter Key Submits Group Name

**Description**  
When the text input for “Give your group a name” is focused, pressing **Enter** should trigger the same behavior as clicking the **Next** button.

**Rules**
- Applies to:
  - “Campaign Name” (for non-Other group types)
  - “Group Name” (for Other group types)
- Submission must:
  - Save the input value
  - Advance to the next wizard step

---

### FR-2: Validation Must Still Apply

**Description**  
Enter-based submission must respect all existing validation rules.

**Rules**
- If the input is invalid (e.g., empty, exceeds max length):
  - The wizard must **not** advance
  - Validation feedback must be shown
- Enter must not bypass validation logic

---

### FR-3: Prevent Accidental Double Submission

**Description**  
Pressing Enter multiple times rapidly must not cause duplicate submissions or step skipping.

**Rules**
- Submission handler must be idempotent
- Wizard state must only advance once per valid submission

---

### FR-4: Accessibility & Keyboard Support

**Description**  
The behavior must align with accessibility and keyboard navigation best practices.

**Rules**
- Enter submission must work when:
  - Input is focused via keyboard (Tab navigation)
- Screen readers should announce validation errors if submission fails
- Focus must move correctly to the next step’s first interactive element

---

## Acceptance Criteria

- ✅ When the group name input is focused and **Enter** is pressed:
  - The value is saved
  - The wizard advances to the next step
- ✅ Pressing **Enter** behaves identically to clicking **Next**
- ✅ If the input is invalid:
  - Wizard does not advance
  - Error message is displayed
- ✅ Pressing **Enter** multiple times does not skip steps
- ✅ Keyboard-only users can complete this step without using the mouse

---

## Edge Cases

- Input contains only whitespace → treated as invalid
- IME / composition input (e.g., non-Latin keyboards):
  - Enter must not submit while composition is active
- Mobile virtual keyboards:
  - “Done” / “Next” should trigger the same submission logic if supported by the platform

---

## Technical Notes (Implementation Guidance)

- Attach `onKeyDown` or equivalent handler to the input field
- Detect `Enter` key **only when**:
  - Not in composition mode
  - Input is focused
- Call the same submit handler used by the **Next** button
- Do **not** duplicate submission logic

---

## Test Plan

### Unit Tests
- Pressing Enter with valid input triggers submit handler
- Pressing Enter with invalid input does not advance wizard
- Multiple Enter key events do not advance multiple steps
- Validation errors are surfaced on Enter submission

### Integration Tests
- Wizard flow:
  - Type group name → press Enter → next step renders
- Keyboard-only flow:
  - Tab to input → type → Enter → next step focus is correct
- Regression:
  - Clicking Next still works as before

### Accessibility Tests
- Screen reader announces validation error on Enter
- Focus management is correct after step transition

---

## Success Metrics

- Reduced hesitation or abandonment during setup
- Fewer “nothing happened” user pauses
- Faster wizard completion time on desktop

---

## Priority

**High**  
This is a small change with outsized UX impact, especially for desktop and power users.

---

## Future Extension (Optional)

- Apply Enter-to-submit behavior consistently across other single-input wizard steps
- Support Cmd+Enter / Ctrl+Enter as alternative submit shortcuts (power user enhancement)

---
