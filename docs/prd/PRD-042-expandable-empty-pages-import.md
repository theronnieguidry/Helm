# PRD-042: Expandable Empty Pages Section in Import Preview

## Problem Statement
When importing notes via the Nuclino Import Preview modal, users see that there are X empty pages but cannot see which specific pages are empty. The current UI only provides an all-or-nothing toggle to include/exclude empty pages. Users need granular control to selectively import specific empty pages.

## Requirements

### Functional Requirements
1. Replace the simple "Import empty pages" toggle with an expandable section
2. When collapsed, show the count of selected vs total empty pages (e.g., "3 of 5 selected")
3. When expanded, display a scrollable list of all empty pages with checkboxes
4. Each empty page shows its title (or "Untitled" if blank)
5. Include "Select All" and "Deselect All" buttons for bulk operations
6. Update the import count dynamically based on selections
7. Send the list of excluded empty page IDs to the backend
8. Maintain backward compatibility with existing API

### Non-Functional Requirements
- Hide the section entirely if there are no empty pages
- Use existing UI components (Collapsible, Checkbox, ScrollArea)
- Follow established visual patterns in the codebase

## User Stories

### US-1: View Empty Pages
**As a** user importing notes
**I want to** see which pages are empty
**So that** I can make informed decisions about what to import

### US-2: Selective Import
**As a** user importing notes
**I want to** selectively choose which empty pages to import
**So that** I can keep placeholder pages I need while excluding unwanted ones

### US-3: Bulk Selection
**As a** user with many empty pages
**I want to** quickly select or deselect all empty pages
**So that** I can efficiently manage my import

## Acceptance Criteria

### AC-1: Expandable Section
- [ ] Section is collapsed by default
- [ ] Clicking the section header expands/collapses the content
- [ ] Chevron icon rotates to indicate expanded/collapsed state
- [ ] Section shows "X of Y selected" count when collapsed

### AC-2: Page List
- [ ] All empty pages are listed with checkboxes when expanded
- [ ] Pages show their title (or "Untitled" for blank titles)
- [ ] List is scrollable if there are many empty pages
- [ ] All pages are selected by default

### AC-3: Selection Controls
- [ ] Individual checkboxes toggle page selection
- [ ] "Select All" button selects all empty pages
- [ ] "Deselect All" button deselects all empty pages
- [ ] Selection count updates in real-time

### AC-4: Import Integration
- [ ] "Import X Pages" button count reflects empty page selections
- [ ] Only selected empty pages are imported
- [ ] Backend correctly filters pages based on selection

### AC-5: Edge Cases
- [ ] Section is hidden when there are no empty pages
- [ ] State resets when dialog is closed
- [ ] Selection persists through AI preview states

## Technical Design

### Frontend Changes (nuclino-import-dialog.tsx)

**New State:**
```typescript
const [selectedEmptyPageIds, setSelectedEmptyPageIds] = useState<Set<string>>(new Set());
const [emptyPagesExpanded, setEmptyPagesExpanded] = useState(false);
```

**New Imports:**
```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
```

### Backend Changes (server/routes.ts)

**New Option:**
```typescript
interface ImportOptions {
  excludedEmptyPageIds?: string[];  // New: specific pages to exclude
  importEmptyPages?: boolean;       // Deprecated but still supported
  defaultVisibility?: "private" | "team";
}
```

### API Contract

**Request Body:**
```json
{
  "importPlanId": "string",
  "options": {
    "excludedEmptyPageIds": ["pageId1", "pageId2"],
    "defaultVisibility": "private"
  }
}
```

## Status
Done

## Implementation Notes
- Modified: `client/src/components/nuclino-import-dialog.tsx`
  - Added `selectedEmptyPageIds` (Set) and `emptyPagesExpanded` state
  - Replaced simple Switch toggle with Collapsible section containing checkboxes
  - Added Select All/Deselect All buttons
  - Updated commit mutations to send `excludedEmptyPageIds` array
  - Updated page list filter and import count display
  - Added state reset on dialog close
- Modified: `server/routes.ts`
  - Added support for `excludedEmptyPageIds` option in commit endpoint
  - Maintained backward compatibility with `importEmptyPages` boolean
- Test coverage: `server/import-runs.api.test.ts` - Added 9 tests for empty page filtering logic (PRD-042 section)
