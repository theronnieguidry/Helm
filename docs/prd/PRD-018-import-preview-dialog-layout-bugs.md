# PRD-018 — Import Preview Dialog Layout Bugs

## Story Status
Proposed

## Summary
The Nuclino Import Preview dialog has layout and overflow issues that cause content to be cut off or display incorrectly. These issues were discovered during testing with the "Vagaries of Fate PF2e.zip" dataset and verified using Playwright automated testing.

**Affected Component**: `client/src/components/nuclino-import-dialog.tsx`

**Evidence**: Screenshots captured via Playwright at `e2e/screenshots/05-import-preview-BROKEN.png` and `e2e/screenshots/06-import-preview-dialog-BROKEN.png`

---

## Issues Identified

### BUG-1: Summary Cards Horizontal Overflow (High Priority)

**Location**: `nuclino-import-dialog.tsx:341`

**Problem**: The 4-column summary card grid overflows the dialog width, causing the rightmost card (Quests) to be clipped/cut off.

**Code**:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
```

**Visual Impact**:
- The "Quests" summary card is cut off
- Only "2" and partial "Qu..." text is visible
- Users cannot see the full quest count

**Root Cause**: The dialog uses `sm:max-w-md` (448px max-width) but the `sm:grid-cols-4` breakpoint applies at 640px viewport width (not dialog width). When viewport >= 640px but dialog is only 448px wide, the 4-column grid doesn't fit.

---

### BUG-2: Metadata Line Truncated (Medium Priority)

**Location**: `nuclino-import-dialog.tsx:374-381`

**Problem**: The collections/notes/empty pages metadata line is cut off when it exceeds the dialog width.

**Code**:
```tsx
<div className="flex items-center gap-2 text-sm text-muted-foreground">
  <FolderOpen className="h-4 w-4" />
  <span>{summary.collections} collections</span>
  <span className="mx-2">·</span>
  <span>{summary.notes} uncategorized notes</span>
  <span className="mx-2">·</span>
  <span>{summary.emptyPages} empty pages</span>
</div>
```

**Visual Impact**:
- Text "13 empty pages" is partially visible or cut off
- No text wrapping or responsive behavior

---

### BUG-3: Visibility Dropdown Text Truncated (Medium Priority)

**Location**: `nuclino-import-dialog.tsx:410-431`

**Problem**: The visibility selector dropdown shows "Private (only" with the rest cut off.

**Visual Impact**:
- "Private (only me)" displays as "Private (only"
- Icon + text layout doesn't fit in the available width

---

### BUG-4: AI Enhance Toggle Visual Glitch (Low Priority)

**Location**: `nuclino-import-dialog.tsx:435-457`

**Problem**: There's a visual rendering artifact in the AI Enhance Import section where text appears to bleed through near the toggle switch area.

**Visual Impact**:
- Stray "te" text visible near the toggle
- Possible z-index or overflow issue

---

### BUG-5: Dialog Width Insufficient (Root Cause)

**Location**: `nuclino-import-dialog.tsx:663`

**Problem**: The dialog's max-width constraint is too narrow for the preview content.

**Code**:
```tsx
<DialogContent className="sm:max-w-md">
```

**Root Cause Analysis**:
- `sm:max-w-md` = 448px (28rem) max-width
- The 4-column summary grid requires ~500px+ for comfortable display
- Select dropdowns with icons need ~200px each
- The narrow width forces overflow on multiple elements

---

## Proposed Fix

### Option A: Increase Dialog Width (Recommended)

Change the dialog width from `sm:max-w-md` to `sm:max-w-lg` or `sm:max-w-xl`:

```tsx
// Before
<DialogContent className="sm:max-w-md">

// After
<DialogContent className="sm:max-w-lg">  // 512px (32rem)
// or
<DialogContent className="sm:max-w-xl">  // 576px (36rem)
```

**Pros**: Simple fix, gives all content room to breathe
**Cons**: Larger dialog on mobile may need responsive consideration

### Option B: Responsive Grid Adjustment

Keep dialog width, change summary cards to always use 2 columns:

```tsx
// Before
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

// After
<div className="grid grid-cols-2 gap-2">
```

**Pros**: Works in narrow dialog
**Cons**: Less compact layout, wastes vertical space

### Option C: Combined Approach (Best)

1. Increase dialog width to `sm:max-w-lg`
2. Add overflow handling to metadata line:
   ```tsx
   <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
   ```
3. Fix visibility dropdown width:
   ```tsx
   <SelectTrigger className="w-[140px]">  // Reduced from 180px
   ```

---

## Acceptance Criteria

- [ ] All 4 summary cards (Total, People, Places, Quests) are fully visible
- [ ] Metadata line (collections, uncategorized notes, empty pages) is fully readable
- [ ] Visibility dropdown shows full text "Private (only me)" or "Shared with team"
- [ ] AI Enhance Import section has no visual artifacts
- [ ] Dialog works correctly on viewport widths from 640px to 1920px
- [ ] No horizontal scrollbar appears within the dialog

---

## Testing

### Manual Testing
1. Navigate to Notes > Import
2. Upload "Vagaries of Fate PF2e.zip"
3. Verify Import Preview dialog displays all content correctly
4. Test at viewport widths: 768px, 1024px, 1280px, 1920px

### Automated Testing
Playwright test exists at `e2e/import-preview.spec.ts` that can capture screenshots for regression testing.

---

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/components/nuclino-import-dialog.tsx` | Dialog width, grid layout, overflow handling |

---

## Screenshots

Reference screenshots captured during bug discovery:

- `e2e/screenshots/05-import-preview-BROKEN.png` - Full page showing clipped dialog
- `e2e/screenshots/06-import-preview-dialog-BROKEN.png` - Dialog-only capture showing overflow issues
