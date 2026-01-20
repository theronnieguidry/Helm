# PRD-027 — AI Features Paywall

## Story Status
Open

## Summary
Implement a paid tier toggle for AI-powered features. When the app goes live, AI features will be behind a subscription paywall to offset API costs and provide premium value.

---

## AI Features Inventory

### Current AI Features

| Feature | Location | Description | API Cost |
|---------|----------|-------------|----------|
| **Import Enrichment** | PRD-016 | AI classifies imported notes (NPC, Place, Quest, etc.) | ~$0.001/note |
| **Relationship Extraction** | PRD-016 | AI detects relationships between notes | ~$0.001/batch |
| **Entity Extraction** | PRD-026 | AI extracts entities from session logs | ~$0.001/extraction |

### Future AI Features (Planned)

| Feature | Description | Est. Cost |
|---------|-------------|-----------|
| **Session Summary** | Auto-generate session recap from notes | ~$0.005/session |
| **NPC Generator** | AI-generated NPCs based on campaign context | ~$0.002/npc |
| **Quest Hooks** | Suggest quest hooks based on session events | ~$0.002/suggestion |
| **World Building** | Generate lore, locations, factions | ~$0.005/generation |
| **Combat Narrator** | Dramatic descriptions of combat events | ~$0.001/description |

---

## Implementation

### Database Schema Changes

Add `aiEnabled` field to teams table:

```typescript
// In shared/schema.ts - teams table
aiEnabled: boolean("ai_enabled").default(false).notNull(),
aiEnabledAt: timestamp("ai_enabled_at"),
aiDisabledAt: timestamp("ai_disabled_at"),
```

### Settings UI Changes

Add AI Features section to team settings:

```
┌─────────────────────────────────────────────────────────┐
│ AI Features                                    [Toggle] │
├─────────────────────────────────────────────────────────┤
│ Enable AI-powered features for your team:               │
│                                                         │
│ ✓ Smart Entity Detection                                │
│   AI extracts characters, locations, and quests from    │
│   your session notes automatically.                     │
│                                                         │
│ ✓ Import Enrichment                                     │
│   AI classifies and connects your imported notes.       │
│                                                         │
│ ✓ Relationship Discovery                                │
│   AI finds connections between your campaign notes.     │
│                                                         │
│ Coming Soon:                                            │
│ • Session Summaries                                     │
│ • NPC Generator                                         │
│ • Quest Hooks                                           │
│                                                         │
│ ⓘ AI features require a subscription ($X/month)        │
└─────────────────────────────────────────────────────────┘
```

### API Endpoint Changes

Update AI endpoints to check `aiEnabled`:

```typescript
// Before calling AI provider
const team = await storage.getTeam(teamId);
if (!team.aiEnabled) {
  return res.status(403).json({
    message: "AI features require a subscription",
    code: "AI_SUBSCRIPTION_REQUIRED"
  });
}
```

### Affected Endpoints

| Endpoint | Action |
|----------|--------|
| `POST /api/teams/:teamId/imports/:importId/enrich` | Check aiEnabled |
| `POST /api/teams/:teamId/extract-entities` | Check aiEnabled |

---

## Pricing Considerations

### Cost Structure
- Haiku model: ~$0.25/1M input tokens, $1.25/1M output tokens
- Average session extraction: ~$0.001
- Average import enrichment (100 notes): ~$0.10-0.20

### Pricing Tiers (Suggested)

| Tier | Price | AI Calls/Month | Target User |
|------|-------|----------------|-------------|
| Free | $0 | 0 | Casual users, pattern-only |
| Pro | $5/mo | 500 | Regular DMs |
| Team | $10/mo | 2000 | Active gaming groups |

---

## Migration Path

1. **Phase 1**: Add `aiEnabled` column (default false)
2. **Phase 2**: Add UI toggle in settings (admin only)
3. **Phase 3**: Add paywall check to AI endpoints
4. **Phase 4**: Integrate with payment provider (Stripe)

---

## Acceptance Criteria

- [ ] `aiEnabled` field added to teams schema
- [ ] Settings UI shows AI features toggle (DM only)
- [ ] AI endpoints return 403 when `aiEnabled` is false
- [ ] Toggle shows list of AI features included
- [ ] Future features marked as "Coming Soon"

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `aiEnabled`, `aiEnabledAt` fields to teams |
| `server/routes.ts` | Add aiEnabled check to AI endpoints |
| `client/src/pages/settings.tsx` | Add AI Features toggle section |

---

## Future Enhancements

1. **Usage Tracking**: Track AI calls per team for billing
2. **Stripe Integration**: Payment processing for subscriptions
3. **Usage Dashboard**: Show AI usage stats in settings
4. **Per-Team API Keys**: Allow teams to use their own API key (bypass subscription)
