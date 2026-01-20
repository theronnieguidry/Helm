# PRD-029 — Bug: AI Features Toggle Not Working in Settings

## Story Status
Completed

## Summary
The AI Features toggle in Settings was not working because the backend PATCH endpoint for team members didn't accept the `aiEnabled` field.

**Related PRDs:**
- PRD-028 (AI Features for All Members)

---

## Bug Description

### Steps to Reproduce
1. Go to Settings page
2. Find "AI Features" card
3. Click the toggle switch
4. Nothing happens — toggle doesn't change

### Expected Behavior
- Toggle should switch on/off
- Toast notification should appear
- Member's `aiEnabled` should be updated in database

### Actual Behavior
- Toggle doesn't respond to clicks
- No visible change

---

## Root Cause

The PATCH endpoint at `/api/teams/:teamId/members/:memberId` only extracted character-related fields from the request body:

```typescript
// Before (broken)
const { characterName, characterType1, characterType2, characterDescription } = req.body;
```

The `aiEnabled` and `aiEnabledAt` fields sent by the frontend were ignored.

---

## Fix

Updated the endpoint to also extract and pass AI-related fields:

```typescript
// After (fixed)
const { characterName, characterType1, characterType2, characterDescription, aiEnabled, aiEnabledAt } = req.body;

// Build update object with only provided fields
const updateData = {};
if (aiEnabled !== undefined) updateData.aiEnabled = aiEnabled;
if (aiEnabledAt !== undefined) updateData.aiEnabledAt = aiEnabledAt ? new Date(aiEnabledAt) : null;
// ... character fields too

const updated = await storage.updateTeamMember(memberId, updateData);
```

---

## Files Modified

| File | Changes |
|------|---------|
| `server/routes.ts` | Updated PATCH `/api/teams/:teamId/members/:memberId` to accept `aiEnabled` and `aiEnabledAt` |

---

## Acceptance Criteria

- [x] AI toggle responds to clicks
- [x] Toggle state persists after page refresh
- [x] Toast notification appears on toggle
- [x] AI Cleanup button appears in Notes after enabling
- [x] Tests pass (463/463)

