# PRD-020 — Settings Character Field Input Focus Loss

## Story Status
Completed

## Summary
Text input fields in the Settings page's "My Character" section lose focus after typing a single character, requiring users to click back into the field to continue typing. This affects all four character fields: Character Name, Type 1, Type 2, and Description.

---

## Bug Report

**Reported by**: User
**Severity**: High (blocks normal usage)
**Affected Page**: Settings → My Character section

### Steps to Reproduce
1. Navigate to Settings page (as DM or member)
2. Click into the "Character Name" input field
3. Type a single character (e.g., "A")
4. Observe: Input loses focus, cursor disappears
5. Try to type another character - nothing happens
6. Must click back into the field to continue typing

### Expected Behavior
User should be able to type continuously without losing focus.

### Actual Behavior
Focus is lost after every keystroke, making text entry extremely tedious.

---

## Root Cause Analysis

**Location**: `client/src/pages/settings.tsx:176-250`

**Problem**: The `CharacterCard` component is defined as an inline arrow function inside the `SettingsPage` component body.

```typescript
// Lines 176-250 - PROBLEMATIC PATTERN
const CharacterCard = () => (
  <Card>
    {/* ... inputs that reference characterData state ... */}
  </Card>
);
```

### Why This Causes Focus Loss

This is a well-documented React anti-pattern:

1. **On every re-render** of `SettingsPage`, a new `CharacterCard` function reference is created
2. **React uses component identity** (function reference) to determine if a component should update or remount
3. **When input value changes** → `setCharacterData()` called → parent re-renders
4. **New function = new component type** from React's perspective
5. **React unmounts the OLD component** (including the focused input) and **mounts the NEW one**
6. Input appears to lose focus because it was literally destroyed and recreated

### Affected Inputs

| Field | Line | State Update |
|-------|------|--------------|
| Character Name | 197 | `setCharacterData({ ...characterData, characterName: e.target.value })` |
| Character Type 1 | 209 | `setCharacterData({ ...characterData, characterType1: e.target.value })` |
| Character Type 2 | 222 | `setCharacterData({ ...characterData, characterType2: e.target.value })` |
| Character Description | 234 | `setCharacterData({ ...characterData, characterDescription: e.target.value })` |

### Component Usage Points

The `CharacterCard` is rendered in two places:
- **Line 264**: Non-DM member view
- **Line 496**: DM view

Both suffer from the same issue.

---

## Implementation

### Fix: Extract Component to Module Scope

Moved `CharacterCard` outside the `SettingsPage` function and pass required data as props.

**New Interfaces** (lines 53-70):

```typescript
// Character data type for the character form
interface CharacterData {
  characterName: string;
  characterType1: string;
  characterType2: string;
  characterDescription: string;
}

// Props for the extracted CharacterCard component
interface CharacterCardProps {
  characterData: CharacterData;
  setCharacterData: React.Dispatch<React.SetStateAction<CharacterData>>;
  isDM: boolean;
  terminology: typeof GAME_TERMINOLOGY[TeamType];
  hasCharacterChanged: boolean;
  onSave: () => void;
  isSaving: boolean;
}
```

**Extracted Component** (lines 72-156, at module scope before `SettingsPage`):

```typescript
function CharacterCard({
  characterData,
  setCharacterData,
  isDM,
  terminology,
  hasCharacterChanged,
  onSave,
  isSaving,
}: CharacterCardProps) {
  return (
    <Card>
      {/* ... full implementation with all input fields ... */}
    </Card>
  );
}
```

**Updated Usage** (lines 293-303 and 535-545):

```tsx
{isTabletopGroup && (
  <CharacterCard
    characterData={characterData}
    setCharacterData={setCharacterData}
    isDM={isDM}
    terminology={terminology}
    hasCharacterChanged={hasCharacterChanged ?? false}
    onSave={() => updateCharacterMutation.mutate(characterData)}
    isSaving={updateCharacterMutation.isPending}
  />
)}
```

---

## Files Modified

| File | Changes |
|------|---------|
| `client/src/pages/settings.tsx` | Extract `CharacterCard` to module scope, add props interface |

---

## Testing

### Manual Testing
1. Start dev server: `npm run dev`
2. Navigate to Settings page (as DM or member)
3. Click into Character Name field
4. Type "Test Character" rapidly without pausing
5. **Expected**: All characters appear, field maintains focus throughout
6. Repeat for Type 1, Type 2, and Description fields
7. Verify Save Character button enables when changes are made

### Type Check
```bash
npm run check
```

---

## Acceptance Criteria

- [x] User can type continuously in Character Name field without losing focus
- [x] User can type continuously in Character Type 1 field without losing focus
- [x] User can type continuously in Character Type 2 field without losing focus
- [x] User can type continuously in Character Description field without losing focus
- [x] Save Character button correctly enables when form data changes
- [x] Both DM and member views work correctly
- [x] No new TypeScript errors introduced (pre-existing errors in other files unrelated to this fix)
