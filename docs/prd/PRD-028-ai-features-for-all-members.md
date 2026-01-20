# PRD-028 — AI Features for All Team Members (Per-Member Toggle)

## Story Status
Completed

## Summary
AI features are a per-member choice. Each player (including DMs) can independently decide whether to enable AI-powered features for their own note-taking.

**Related PRDs:**
- PRD-026 (Haiku-Based Entity Extraction)
- PRD-027 (AI Features Paywall)

---

## Design

### Principle
Every user controls their own AI subscription. There is no team-wide toggle — each member makes their own choice.

### Implementation
- `aiEnabled` field on `team_members` table (per-member)
- All members see the same AI Features toggle in Settings
- Backend checks `member.aiEnabled` only
- AI Cleanup button shows only when `memberAiEnabled` is true

---

## Schema

```typescript
// shared/schema.ts - teamMembers table
// PRD-028: Per-member AI features toggle
aiEnabled: boolean("ai_enabled").default(false).notNull(),
aiEnabledAt: timestamp("ai_enabled_at"),
```

---

## User Experience

1. Go to Settings
2. See "AI Features" card with toggle
3. Enable AI for yourself
4. Return to Notes → see AI Cleanup button

Same experience for all members (players and DMs alike).

---

## Files Modified

| File | Changes |
|------|---------|
| `shared/schema.ts` | Added `aiEnabled`, `aiEnabledAt` to teamMembers table |
| `server/storage.ts` | Updated `updateTeamMember` interface to include AI fields |
| `server/test/memory-storage.ts` | Added AI fields to createTeamMember and updateTeamMember |
| `server/routes.ts` | AI endpoints check `member.aiEnabled` only |
| `client/src/pages/notes.tsx` | Added members query, pass `memberAiEnabled` to editor |
| `client/src/components/notes/notes-editor-panel.tsx` | Accept and pass `memberAiEnabled` prop |
| `client/src/components/notes/entity-suggestions-panel.tsx` | Use `memberAiEnabled` for AI button visibility |
| `client/src/pages/settings.tsx` | AI toggle for all members (same UI for everyone) |

---

## Acceptance Criteria

- [x] `aiEnabled` field exists on team_members table
- [x] All members see AI toggle in Settings (same UI)
- [x] Toggle updates the member's own aiEnabled status
- [x] AI Cleanup button appears based on `memberAiEnabled`
- [x] Backend validates member's aiEnabled for AI endpoints
- [x] Tests pass (463/463)

