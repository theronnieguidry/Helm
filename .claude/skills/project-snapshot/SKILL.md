---
name: project-snapshot
description: Generate comprehensive project state document with architecture, features, and verification status
---

# Project Snapshot Skill

You are generating a **comprehensive project state document** for Helm, a full-stack TypeScript group coordination app for tabletop gaming groups and recurring meetups. This document is designed for external AI reviewers (Nova/ChatGPT), contractors, or future maintainers to assess exactly what is implemented today vs what is planned, without ambiguity.

## Core Purpose

This snapshot must reliably capture:
1. **What features are implemented and working** (evidence-based verification)
2. **Architecture and data model** (PostgreSQL via Drizzle ORM, Express API, React frontend)
3. **AI enrichment pipeline status** (classification, relationships, caching)
4. **PRD traceability** (which PRDs are done, in progress, or planned)

## Output Location

**CRITICAL**: The output document MUST be written to the user's Claude plans directory:
```
C:\Users\ronni\.claude\plans\Helm-Project-Snapshot-{YYYY-MM-DD}.md
```

At the end of execution, display the full path to the user.

---

## Status Level Definitions

Use these status levels consistently throughout the document (NEVER use Yes/No):

| Status | Meaning |
|--------|---------|
| ✅ **Verified** | Proven end-to-end by artifact + logs + test pass |
| 🟡 **Configured** | Implementation exists but not validated |
| ⚠️ **Partial** | Only some paths validated |
| 🔴 **Missing** | Not implemented |

---

## Evidence Requirements

For every feature marked ✅ **Verified**, include at least ONE of:
- **File path(s)**: `path/to/file.ts (functionName)`
- **UI screenshot**: filename
- **Log snippet**: copy/paste
- **Test**: test name + passing command

---

## Execution Process

### Parallelization Strategy

Phases can be executed in parallel groups for efficiency:

**Parallel Group A** (independent data gathering -- launch simultaneously):
- Phase 1: Gather Project Metadata (git commands, package.json)
- Phase 2: Gather Test Coverage Data (`npx vitest run`)
- Phase 3: Analyze Codebase Structure (Glob/Read tools)

**Parallel Group B** (depends on Phase 3 results):
- Phase 3.5: Feature Overlap Analysis
- Phase 4: Feature Verification
- Phase 5: AI Enrichment Pipeline Analysis

**Sequential** (depends on all above):
- Phase 6: PRD Traceability Check (needs feature verification results)
- Phase 7: Generate Document (needs all data)

> **Tip**: When making Bash and tool calls, batch independent operations into a single
> message to maximize parallelism. For example, run `git log`, `git status`, and
> `npx vitest run` simultaneously in separate Bash calls or Task agents.

### Phase 1: Gather Project Metadata

Use the following tools to collect metadata. These can run in parallel with Phase 2 and Phase 3.

1. **Version**: Read `package.json` and extract the `version` field.
2. **Last commit**: Run `git log -1 --format="%ci %H"` via Bash.
3. **Current branch**: Run `git branch --show-current` via Bash.
4. **Working tree status**: Run `git status --porcelain` via Bash (limit output to first 20 lines if needed).
5. **Last tag**: Run `git describe --tags --abbrev=0` via Bash (handle "no tags" gracefully).
6. **Recent commit count**: Run `git rev-list --count --since="30 days ago" HEAD` via Bash.

> **Note**: Use the Bash tool for git commands. Use the Read tool for package.json. Do NOT use Unix-specific commands like `head`, `wc`, or pipe operators that may not work cross-platform. Trim output programmatically if needed.

### Phase 2: Gather Test Coverage Data

Run the actual test suite to get authoritative counts. This can run in parallel with Phases 1 and 3.

1. **Run all tests**: Execute `npx vitest run --reporter=verbose` via Bash (timeout: 120 seconds).
   - Parse output for total tests, passed, failed, and skipped counts.
   - Record the exact counts per test file.
   - This is the **single source of truth** for unit and integration test counts.
2. **Check for skipped/flaky tests**: Use the Grep tool to search for `.skip` or `.todo` patterns in all `*.test.ts` and `*.spec.ts` files.
3. **E2E test count**: Use Glob to find `e2e/**/*.spec.ts`, then use Grep to count `test(` occurrences across those files.
4. **List all test files**: Use Glob to find all `**/*.test.ts` and `**/*.spec.ts` files (exclude node_modules).

> **Do NOT** estimate test counts by grepping for `it(` or `test(` patterns. The `npx vitest run --reporter=verbose` output is the authoritative source.

### Phase 3: Analyze Codebase Structure

Use Glob and Read tools to examine:

1. **Frontend Pages**:
   - `client/src/pages/*.tsx` - List all page components
   - `client/src/components/**/*.tsx` - List all components
   - `client/src/hooks/*.ts` - List all custom hooks

2. **Backend API**:
   - `server/routes.ts` - Main API routes (large monolithic file)
   - `server/storage.ts` - Database operations (IStorage interface)
   - `server/ai/*.ts` - AI provider and enrichment services

3. **Shared Logic**:
   - `shared/schema.ts` - Drizzle ORM schema (all tables + enums)
   - `shared/*.ts` - Shared utilities (dice, entity detection, recurrence, etc.)

4. **Database**:
   - `shared/schema.ts` - Read all table definitions and relations
   - `drizzle.config.ts` - Database connection config

5. **Configuration**:
   - `package.json` - Dependencies and scripts
   - `CLAUDE.md` - Project guidance
   - `design_guidelines.md` - Design system specs

6. **AI Integration**:
   - `server/ai/claude-provider.ts` - Claude API integration
   - `server/ai/ai-cache.ts` - Caching layer
   - `server/ai/ai-provider.ts` - Provider abstraction
   - `server/ai/mock-provider.ts` - Test mock provider
   - `server/ai/cache-versions.ts` - Algorithm version tracking
   - `server/jobs/enrichment-worker.ts` - Background enrichment

7. **Authentication**:
   - `server/replit_integrations/auth/` - All auth files (index, replitAuth, devAuth, routes, storage)

### Phase 3.5: Feature Overlap Analysis

Identify overlapping or duplicate user-facing features by examining:

1. **Page vs Component Mapping**:
   - List every page in `client/src/pages/`
   - List every major component in `client/src/components/`
   - For each, note: data source (API endpoint), state management (TanStack Query key), and navigation path

2. **API Endpoint Analysis**:
   - Scan `server/routes.ts` for all registered endpoints
   - Cross-reference against frontend API calls
   - Flag any endpoints not called by any frontend code (dead endpoints)

3. **Store/Query Consumer Analysis**:
   - For each TanStack Query key, grep for usage across all components
   - Flag queries that are defined but never consumed in UI

4. **Shared Code Pattern Detection**:
   - Search for identical utility functions duplicated across files
   - Flag functions that appear in 2+ files with identical signatures

5. **Data Flow Completeness**:
   - For each feature, trace: UI action -> API call -> storage method -> database table
   - Document where the chain breaks (if anywhere)

**Output**: Populate the Feature Overlap section of the snapshot document with findings.

### Phase 4: Feature Verification

For each feature, check for evidence of implementation:

| Feature | Check Method | Evidence Type |
|---------|--------------|---------------|
| Authentication | Replit Auth middleware, dev bypass | File + Tests |
| Team Management | Teams CRUD, invites, roles | File + Tests |
| Notes System | Note types, CRUD, quest status | File + Tests |
| Session Logs | Content blocks, session dates | File + Tests |
| Backlinks | Cross-note references | File + Tests |
| Scheduling | Recurrence, availability, overrides | File + Tests |
| Dice Roller | Polyhedral, d10 pool modes | File + Tests |
| Import/Export | Nuclino ZIP import, rollback | File + Tests |
| AI Enrichment | Classification, relationships, caching | File + Tests |
| AI Paywall | Team/member-level toggles | File |
| Post-Session Review | Entity detection, quick create | File |
| AI Import Diff Preview | Baseline vs AI side-by-side | File + Tests |
| AI Paywall Stub | Upsell dialog for non-AI users | File + Tests |
| Low-Confidence Review | Needs-review panel + actions | File + Tests |
| Import Progress | Real-time progress tracking | File + Tests |

### Phase 5: AI Enrichment Pipeline Analysis

Examine the AI enrichment flow:

1. **Pipeline Stages**:
   - `server/ai/claude-provider.ts` - Claude API calls
   - `server/jobs/enrichment-worker.ts` - Background processing
   - Check for stage transitions (import -> classify -> relate -> cache)

2. **Entity Classification**:
   - `shared/entity-detection.ts` - Pattern-based detection
   - AI-powered classification via Claude
   - Confidence scoring (0.0-1.0)

3. **Relationship Detection**:
   - Types: QuestHasNPC, QuestAtPlace, NPCInPlace, Related, None
   - Evidence types: Link, Mention, Heuristic, Analyzed

4. **Caching Layer**:
   - `server/ai/ai-cache.ts` - Persistent DB cache with content hashing
   - `server/ai/cache-versions.ts` - Algorithm version tracking
   - `shared/schema.ts` - `ai_cache_entries` table for persistent cache
   - Algorithm versioning (`ai_algorithm_versions` table)

5. **AI Paywall**:
   - Team-level: `teams.aiEnabled` flag
   - Member-level: `team_members.aiEnabled` flag

### Phase 6: PRD Traceability Check

Scan all PRD files dynamically rather than relying on any hardcoded list:

1. Use Glob to list all `docs/prd/PRD-*.md` files
2. For each PRD, read its Status section (search for `## Status`)
3. **Stale status detection**: When a PRD's status field says "Proposed" or is blank,
   cross-check for implementation evidence:
   - Search `server/routes.ts` for endpoints related to the PRD's feature
   - Search `shared/schema.ts` for tables/columns related to the PRD
   - Search `server/*.test.ts` and `shared/*.test.ts` for related test files
   - If evidence of implementation exists, mark the PRD as "Done" in the snapshot
     and add the note: "(PRD status field is stale -- implementation evidence found)"
4. **(Optional, supplementary only)** Read `docs/PROJECT_TRACKER.md` -- note: this file
   only covers PRDs 001-006 and is outdated. The primary source is scanning all PRD
   files directly.
5. Count tests per feature area by examining test file names and contents

### Phase 7: Generate Document

Create the document using the template below, filling in actual values discovered during analysis.

---

## Document Template

```markdown
# Helm - Project State Snapshot

## Environment Metadata

| Field | Value |
|-------|-------|
| **Generated** | {YYYY-MM-DD HH:MM} |
| **Version** | {version from package.json} |
| **Build Type** | dev / prod |
| **Server URL** | localhost:5000 (dev) / {hosted URL} (prod) |
| **Database** | PostgreSQL (local: helm_local / {prod connection}) |
| **Branch** | {current git branch} |
| **Last Commit** | {SHA} ({date}) |
| **Repository** | {repo URL or "private"} |
| **Maintainer** | Ronnie Guidry |

---

## Known Gaps / TODO Summary

| Priority | Issue | Owner |
|----------|-------|-------|
| P0 | {Critical blocker} | {team} |
| P1 | {Important gap} | {team} |
| P2 | {Nice to have} | {team} |

---

## Quick Verdict (Reviewer Summary)

| Question | Status | Evidence |
|----------|--------|----------|
| Can a user create a team and invite members? | ✅/🟡/⚠️/🔴 | {file/test} |
| Can they manage collaborative notes? | ✅/🟡/⚠️/🔴 | {file/test} |
| Can they schedule recurring sessions? | ✅/🟡/⚠️/🔴 | {file/test} |
| Does the dice roller work for all game types? | ✅/🟡/⚠️/🔴 | {file/test} |
| Can they import from Nuclino? | ✅/🟡/⚠️/🔴 | {file/test} |
| Does AI enrichment classify and link notes? | ✅/🟡/⚠️/🔴 | {file/test} |
| Is authentication working? | ✅/🟡/⚠️/🔴 | {file/test} |
| Do all tests pass? | ✅/🟡/⚠️/🔴 | {test output} |

---

## 1. Architecture Overview

### Project Structure

<!-- AGENT: Verify this tree against actual files using Glob before writing.
     Run: Glob("client/src/pages/*.tsx"), Glob("server/**/*.ts"), Glob("shared/*.ts"),
     Glob("client/src/hooks/*.ts"), Glob("client/src/components/**/*.tsx")
     Update the tree to match actual files found. Add any new files, remove any that no longer exist. -->

```
client/src/               # React frontend (Vite, TanStack Query, Wouter, shadcn/ui)
├── pages/                # Route-level page components
│   ├── dashboard.tsx
│   ├── notes.tsx
│   ├── schedule.tsx
│   ├── dice.tsx
│   ├── members.tsx
│   ├── settings.tsx
│   ├── session-review.tsx
│   ├── team-wizard.tsx
│   ├── landing.tsx
│   ├── join-team.tsx
│   ├── profile-settings.tsx
│   └── not-found.tsx
├── components/           # Reusable UI components
│   ├── ui/               # shadcn/ui primitives (~50 files)
│   ├── notes/            # Note-specific components
│   │   ├── notes-left-panel.tsx
│   │   ├── notes-editor-panel.tsx
│   │   ├── notes-item-preview.tsx
│   │   ├── entity-suggestion-card.tsx
│   │   ├── entity-suggestions-panel.tsx
│   │   └── proximity-associations.tsx
│   ├── ai-import-diff-preview.tsx
│   ├── ai-paywall-stub-dialog.tsx
│   ├── nuclino-import-dialog.tsx
│   ├── enrichment-review-dialog.tsx
│   ├── import-management.tsx
│   ├── availability-panel.tsx
│   ├── team-availability-list.tsx
│   ├── session-status-control.tsx
│   ├── mentioned-in-section.tsx
│   ├── selectable-content.tsx
│   ├── app-sidebar.tsx
│   ├── theme-provider.tsx
│   ├── theme-toggle.tsx
│   └── timezone-select.tsx
├── hooks/                # Custom React hooks
│   ├── use-auth.ts
│   ├── use-toast.ts
│   ├── use-mobile.tsx
│   ├── use-autosave.ts
│   ├── use-entity-detection.ts
│   └── use-suggestion-persistence.ts
├── lib/                  # Utilities
│   ├── queryClient.ts
│   ├── auth-utils.ts
│   └── utils.ts
└── workers/              # Web workers
    └── entity-detector.worker.ts

server/                   # Express backend
├── routes.ts             # Monolithic API routes file (~2600 lines, ~52 endpoints)
├── storage.ts            # DatabaseStorage (IStorage interface, 88+ methods)
├── index.ts              # Server entry point
├── ai/                   # AI provider + enrichment
│   ├── ai-provider.ts    # Provider abstraction interface
│   ├── claude-provider.ts # Anthropic Claude Haiku integration
│   ├── mock-provider.ts  # Mock provider for tests
│   ├── ai-cache.ts       # Content-hash caching layer
│   └── cache-versions.ts # Algorithm version tracking
├── jobs/                 # Background workers
│   └── enrichment-worker.ts
├── replit_integrations/  # Replit platform integrations
│   └── auth/             # Authentication (5 files)
│       ├── index.ts
│       ├── replitAuth.ts
│       ├── devAuth.ts
│       ├── routes.ts
│       └── storage.ts
└── test/                 # Test helpers

shared/                   # Client + server shared code
├── schema.ts             # Drizzle ORM schema (17 tables)
├── dice.ts               # Dice logic (polyhedral + d10 pool)
├── entity-detection.ts   # Pattern-based entity detection
├── proximity-suggestions.ts # Relationship suggestions
├── recurrence.ts         # Session scheduling
└── nuclino-parser.ts     # ZIP import parsing
```

### Key Patterns
- **Storage Interface**: All DB ops through `DatabaseStorage` (implements `IStorage`). Tests use `MemoryStorage`.
- **Path Aliases**: `@/*` -> client/src/, `@shared/*` -> shared/
- **Auth**: Replit Auth (OpenID Connect) with `isAuthenticated` middleware. Role-based: Admin ("dm") vs Member.
- **State Management**: TanStack Query with infinite staleTime. Team selection in localStorage.
- **Design System**: Material Design with teal accent (HSL 175 55% 38%), Roboto, light/dark mode.

**Evidence**: `CLAUDE.md`, `design_guidelines.md`

---

## 2. Feature Truth Table

<!-- AGENT: This table is a reference template. Verify each feature by checking
     if the listed files exist and contain the expected functionality. Add any
     features you discover during codebase analysis that are not in this table.
     Fill test counts from `npx vitest run --reporter=verbose` output. -->

| Feature | Status | Files | Tests | Evidence |
|---------|--------|-------|-------|----------|
| **Authentication** | | | | |
| Replit Auth (OpenID Connect) | ✅/🟡/⚠️/🔴 | `server/replit_integrations/auth/` | {count} | |
| Dev bypass mode | ✅/🟡/⚠️/🔴 | `server/replit_integrations/auth/devAuth.ts` | {count} | |
| Role-based access (dm/member) | ✅/🟡/⚠️/🔴 | `server/routes.ts` | {count} | |
| **Team Management** | | | | |
| Create team + setup wizard | ✅/🟡/⚠️/🔴 | `client/src/pages/team-wizard.tsx` | {count} | |
| Invite members (6-char code) | ✅/🟡/⚠️/🔴 | `shared/schema.ts (invites)` | {count} | |
| Character profiles per member | ✅/🟡/⚠️/🔴 | `shared/schema.ts (teamMembers)` | {count} | |
| Game-type terminology | ✅/🟡/⚠️/🔴 | `shared/schema.ts (GAME_TERMINOLOGY)` | {count} | |
| **Notes System** | | | | |
| 7 note types (area, character, npc, poi, quest, session_log, note) | ✅/🟡/⚠️/🔴 | `shared/schema.ts (NOTE_TYPES)` | {count} | |
| Quest status tracking (lead/todo/active/done/abandoned) | ✅/🟡/⚠️/🔴 | `shared/schema.ts (QUEST_STATUSES)` | {count} | |
| Session logs with content blocks | ✅/🟡/⚠️/🔴 | `shared/schema.ts (ContentBlock)` | {count} | |
| Private/team note visibility | ✅/🟡/⚠️/🔴 | `shared/schema.ts (notes.isPrivate)` | {count} | |
| Parent-child note hierarchy | ✅/🟡/⚠️/🔴 | `shared/schema.ts (notes.parentNoteId)` | {count} | |
| **Backlinks & Relationships** | | | | |
| Cross-note backlinks | ✅/🟡/⚠️/🔴 | `shared/schema.ts (backlinks)` | {count} | |
| AI-detected relationships | ✅/🟡/⚠️/🔴 | `shared/schema.ts (noteRelationships)` | {count} | |
| Proximity suggestions | ✅/🟡/⚠️/🔴 | `shared/proximity-suggestions.ts` | {count} | |
| **Scheduling** | | | | |
| Recurrence (weekly/biweekly/monthly) | ✅/🟡/⚠️/🔴 | `shared/recurrence.ts` | {count} | |
| Player availability | ✅/🟡/⚠️/🔴 | `shared/schema.ts (userAvailability)` | {count} | |
| Session overrides (DM controls) | ✅/🟡/⚠️/🔴 | `shared/schema.ts (sessionOverrides)` | {count} | |
| Session cancel/reschedule | ✅/🟡/⚠️/🔴 | `shared/schema.ts (SESSION_STATUSES)` | {count} | |
| **Dice Roller** | | | | |
| Polyhedral dice (D&D/Pathfinder) | ✅/🟡/⚠️/🔴 | `shared/dice.ts` | {count} | |
| d10 pool (Vampire/Werewolf) | ✅/🟡/⚠️/🔴 | `shared/dice.ts` | {count} | |
| Natural 20/1 critical tracking | ✅/🟡/⚠️/🔴 | `shared/dice.ts` | {count} | |
| Botch detection (d10 pool) | ✅/🟡/⚠️/🔴 | `shared/dice.ts` | {count} | |
| **Import/Export** | | | | |
| Nuclino ZIP import | ✅/🟡/⚠️/🔴 | `shared/nuclino-parser.ts` | {count} | |
| Import rollback (snapshots) | ✅/🟡/⚠️/🔴 | `shared/schema.ts (noteImportSnapshots)` | {count} | |
| Import attribution tracking | ✅/🟡/⚠️/🔴 | `shared/schema.ts (importRuns)` | {count} | |
| Import progress feedback | ✅/🟡/⚠️/🔴 | `server/routes.ts (imports/progress)` | {count} | |
| **AI Features** | | | | |
| Entity classification (Claude) | ✅/🟡/⚠️/🔴 | `server/ai/claude-provider.ts` | {count} | |
| Relationship detection | ✅/🟡/⚠️/🔴 | `shared/schema.ts (noteRelationships)` | {count} | |
| AI result caching | ✅/🟡/⚠️/🔴 | `server/ai/ai-cache.ts` | {count} | |
| Algorithm version tracking | ✅/🟡/⚠️/🔴 | `server/ai/cache-versions.ts` | {count} | |
| AI paywall (team level) | ✅/🟡/⚠️/🔴 | `shared/schema.ts (teams.aiEnabled)` | {count} | |
| AI paywall (member level) | ✅/🟡/⚠️/🔴 | `shared/schema.ts (team_members.aiEnabled)` | {count} | |
| AI import diff preview | ✅/🟡/⚠️/🔴 | `client/src/components/ai-import-diff-preview.tsx` | {count} | |
| AI paywall stub dialog | ✅/🟡/⚠️/🔴 | `client/src/components/ai-paywall-stub-dialog.tsx` | {count} | |
| Low-confidence review (needs-review) | ✅/🟡/⚠️/🔴 | `client/src/components/notes/notes-left-panel.tsx` | {count} | |
| JSON parsing robustness | ✅/🟡/⚠️/🔴 | `server/ai/claude-provider.ts` | {count} | |
| Reclassify with POI option | ✅/🟡/⚠️/🔴 | `server/routes.ts (classifications)` | {count} | |
| **Post-Session Review** | | | | |
| Entity detection from session logs | ✅/🟡/⚠️/🔴 | `shared/entity-detection.ts` | {count} | |
| Split-panel review UI | ✅/🟡/⚠️/🔴 | `client/src/pages/session-review.tsx` | {count} | |
| Quick-create entities from suggestions | ✅/🟡/⚠️/🔴 | `client/src/pages/session-review.tsx` | {count} | |
| **Other** | | | | |
| Dashboard hub | ✅/🟡/⚠️/🔴 | `client/src/pages/dashboard.tsx` | {count} | |
| Settings page | ✅/🟡/⚠️/🔴 | `client/src/pages/settings.tsx` | {count} | |
| Settings auto-save | ✅/🟡/⚠️/🔴 | `client/src/hooks/use-autosave.ts` | {count} | |
| Members page | ✅/🟡/⚠️/🔴 | `client/src/pages/members.tsx` | {count} | |
| Landing page | ✅/🟡/⚠️/🔴 | `client/src/pages/landing.tsx` | {count} | |
| Profile settings | ✅/🟡/⚠️/🔴 | `client/src/pages/profile-settings.tsx` | {count} | |
| Join team flow | ✅/🟡/⚠️/🔴 | `client/src/pages/join-team.tsx` | {count} | |

---

## 3. Game System Support Matrix

| Game Type | Team Type Key | GM Title | Dice Mode | Type 1 | Type 2 | Status |
|-----------|---------------|----------|-----------|--------|--------|--------|
| Dungeons & Dragons | `dnd` | Dungeon Master | Polyhedral | Race | Class | ✅/🟡/⚠️/🔴 |
| Pathfinder 2e | `pathfinder_2e` | Game Master | Polyhedral | Ancestry | Class | ✅/🟡/⚠️/🔴 |
| Vampire: The Masquerade | `vampire` | Storyteller | d10 Pool | Clan | (none) | ✅/🟡/⚠️/🔴 |
| Werewolf: The Apocalypse | `werewolf` | Storyteller | d10 Pool | Tribe | Auspice | ✅/🟡/⚠️/🔴 |
| Other | `other` | Organizer | Disabled | (none) | (none) | ✅/🟡/⚠️/🔴 |

**Evidence**: `shared/schema.ts (GAME_TERMINOLOGY, TEAM_TYPE_DICE_MODE)`

---

## 4. Notes & Knowledge Base

### Note Types
| Type | Key | Purpose | Quest Status? | Session Date? |
|------|-----|---------|---------------|---------------|
| Area | `area` | Locations/regions | No | No |
| Character | `character` | Player characters | No | No |
| NPC | `npc` | Non-player characters | No | No |
| Point of Interest | `poi` | Specific locations | No | No |
| Quest | `quest` | Quest/mission tracking | Yes (5 states) | No |
| Session Log | `session_log` | Game session notes | No | Yes |
| Note | `note` | General notes | No | No |

### Quest Status Flow
```
lead -> todo -> active -> done
                  \-> abandoned
```

### Backlinks System
- **Manual links**: `notes.linkedNoteIds` (JSON array)
- **Detected backlinks**: `backlinks` table (source -> target with text snippet)
- **AI relationships**: `noteRelationships` table (typed: QuestHasNPC, QuestAtPlace, NPCInPlace, Related)

**Evidence**: `shared/schema.ts`, `server/backlinks.api.test.ts`

---

## 5. AI Enrichment Pipeline

### Pipeline Flow
```
1. Import notes (Nuclino ZIP or manual creation)
2. Create enrichment run (linked to import run)
3. For each note (batched, 10 per batch):
   a. Check cache (SHA-256 content hash + algorithm version)
   b. If cache miss: Classify entity type via Claude Haiku with confidence score
   c. Extract entities mentioned
   d. Store result to cache (30-day TTL)
4. For each note pair:
   a. Check relationship cache (order-independent pair hash)
   b. If cache miss: Detect relationships via Claude Haiku
   c. Cache result (including "None" relationships)
5. Store classifications + relationships to DB
6. Present to user for review (approve/reject)
```

### Classification
| Field | Description |
|-------|-------------|
| `inferredType` | Character, NPC, Area, Quest, SessionLog, Note |
| `confidence` | 0.0-1.0 float |
| `explanation` | AI reasoning |
| `extractedEntities` | JSON string array of detected entities |
| `status` | pending -> approved/rejected |

### Relationship Types
| Type | Description |
|------|-------------|
| `QuestHasNPC` | Quest involves an NPC |
| `QuestAtPlace` | Quest occurs at a location |
| `NPCInPlace` | NPC is associated with a location |
| `Related` | General relationship |
| `None` | No relationship detected |

### Evidence Types
`Link` | `Mention` | `Heuristic` | `Analyzed`

### Caching
- **Persistent**: `ai_cache_entries` table with content hashing (SHA-256) and algorithm versioning (30-day TTL)
- **Cache key**: `cacheType + contentHash + algorithmVersion + teamId`
- **In-memory**: Import plans (15min TTL), AI preview results (5min TTL), import progress (10min TTL)

### AI Paywall
| Level | Flag | Default | Effect |
|-------|------|---------|--------|
| Team | `teams.aiEnabled` | `false` | Gates all AI features for the team |
| Member | `team_members.aiEnabled` | `false` | Per-member AI access control |

**Evidence**: `server/ai/`, `shared/schema.ts`, `server/jobs/enrichment-worker.ts`

---

## 6. Scheduling & Availability

### Recurrence Configuration
| Field | Values | Notes |
|-------|--------|-------|
| `recurrenceFrequency` | weekly, biweekly, monthly | Nullable |
| `dayOfWeek` | 0-6 | For weekly/biweekly |
| `daysOfMonth` | number[] | For monthly |
| `startTime` | HH:MM | Session start time |
| `timezone` | IANA timezone | |
| `recurrenceAnchorDate` | timestamp | Biweekly anchor |
| `minAttendanceThreshold` | integer | Default: 2 |
| `defaultSessionDurationMinutes` | integer | Default: 180 (3hr) |

### Session Management
- **Auto-generated**: Computed from recurrence rules
- **Overrides**: DM can cancel/reschedule specific occurrences (`sessionOverrides` table)
- **Availability**: Per-user date + time window (`userAvailability` table)
- **Attendance**: Per-session status (available/busy/maybe)

**Evidence**: `shared/recurrence.ts`, `shared/schema.ts`

---

## 7. Import/Export System

### Nuclino ZIP Import
| Stage | Description | Status |
|-------|-------------|--------|
| Upload | Multer receives ZIP (max 50MB) | ✅/🟡/⚠️/🔴 |
| Parse | Extract markdown pages from ZIP | ✅/🟡/⚠️/🔴 |
| Preview | Show user what will be imported | ✅/🟡/⚠️/🔴 |
| AI Preview | Dry-run AI classification with side-by-side diff (PRD-030) | ✅/🟡/⚠️/🔴 |
| Progress | Real-time progress tracking during AI preview (PRD-035) | ✅/🟡/⚠️/🔴 |
| Import | Create/update notes with attribution | ✅/🟡/⚠️/🔴 |
| AI Enrich | Classify entities + detect relationships | ✅/🟡/⚠️/🔴 |
| Review | User approves/rejects AI suggestions | ✅/🟡/⚠️/🔴 |

### Rollback Support
- `import_runs` table tracks each import operation
- `note_import_snapshots` stores pre-import state for rollback
- Import can be "deleted" (status: `deleted`)

### Import Options
| Option | Type | Description |
|--------|------|-------------|
| `importEmptyPages` | boolean | Include pages with no content |
| `defaultVisibility` | `private` / `team` | Default note visibility |

**Evidence**: `shared/nuclino-parser.ts`, `shared/schema.ts`

---

## 8. Dice Roller Contract

### Polyhedral Mode (D&D / Pathfinder)
```
Input: dice type (d4/d6/d8/d10/d12/d20/d100), count, modifier
Output: individual results[], total (sum + modifier)
Special: Natural 20 = critical hit, Natural 1 = critical failure (d20 only)
```

### d10 Pool Mode (Vampire / Werewolf)
```
Input: pool size, difficulty threshold (default: 6)
Output: individual d10 results[], successes count
Special: 1s cancel successes, botch when net successes <= 0 with ones present
```

### Disabled Mode (Other)
Dice roller not shown for non-gaming groups.

**Evidence**: `shared/dice.ts`, `shared/dice.test.ts` ({count} tests)

---

## 9. API Contracts

### 9.1 Endpoints (from server/routes.ts)

<!-- AGENT: Do NOT use a hardcoded endpoint list. Instead:
1. Use Grep to find all `app.get(`, `app.post(`, `app.put(`, `app.patch(`, `app.delete(`
   patterns in server/routes.ts
2. Also scan server/replit_integrations/auth/routes.ts for auth endpoints
3. Extract the HTTP method and path from each match
4. Group endpoints by resource (Teams, Members, Invites, Notes, Backlinks,
   Imports, AI Enrichment, Sessions, Availability, Dice, User, Session Overrides)
5. List ALL endpoints found -- do not truncate
6. Current count is approximately 52 endpoints in routes.ts
-->

| Method | Path | Description |
|--------|------|-------------|
| {for each endpoint found} | {actual path} | {brief description} |

**Note**: This endpoint list MUST be generated by scanning `server/routes.ts` (~2600 lines) and `server/replit_integrations/auth/routes.ts`. Do NOT use a pre-written list.

---

## 10. Authentication & Authorization

### Auth Modes
| Mode | Used By | Mechanism | Notes |
|------|---------|-----------|-------|
| **Production** | Users | Replit Auth (OpenID Connect) | Passport.js + Express sessions |
| **Development** | Developers | Dev bypass (`DEV_USER_*` env vars) | Skips OIDC flow |

### Role-Based Access
| Role | Key | Permissions |
|------|-----|-------------|
| DM/Admin | `dm` | Full CRUD, team settings, session management, import |
| Member | `member` | Read team, CRUD own notes, availability, dice rolls |

**Evidence**: `server/replit_integrations/auth`, `server/routes.ts`

---

## 11. Database Schema Summary

<!-- AGENT: Use Grep to count `pgTable(` occurrences in shared/schema.ts to determine
     the total table count. As of last check, there are 17 tables. Verify and update.
     Also verify the table list below matches all pgTable definitions found. -->

### Tables ({count from pgTable grep} total)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `teams` | Gaming groups | name, teamType, diceMode, ownerId, recurrence*, aiEnabled |
| `team_members` | Membership + characters | teamId, userId, role, character*, aiEnabled |
| `invites` | Join codes | teamId, code (6-char), expiresAt |
| `notes` | All note types | teamId, noteType, questStatus, sessionDate, contentBlocks, import* |
| `game_sessions` | Scheduled sessions | teamId, scheduledAt, status, isOverride |
| `availability` | Per-session RSVP | sessionId, userId, status |
| `user_availability` | Date-based availability | teamId, userId, date, startTime, endTime |
| `dice_rolls` | Roll history | teamId, userId, diceType, results[], total |
| `backlinks` | Note cross-references | sourceNoteId, targetNoteId, textSnippet |
| `session_overrides` | DM session adjustments | teamId, occurrenceKey, status |
| `import_runs` | Import operations | teamId, sourceSystem, stats, status |
| `note_import_snapshots` | Rollback data | noteId, importRunId, previous* |
| `enrichment_runs` | AI processing runs | importRunId, status, totals |
| `note_classifications` | AI entity classification | noteId, inferredType, confidence, status |
| `note_relationships` | AI relationship detection | fromNoteId, toNoteId, type, confidence |
| `ai_cache_entries` | Persistent AI cache | cacheType, contentHash, result |
| `ai_algorithm_versions` | Cache versioning | operationType, version, isCurrent |

**Evidence**: `shared/schema.ts`

---

## 12. Testing Inventory

### Test Counts

<!-- AGENT: Fill these counts from `npx vitest run --reporter=verbose` output.
     Group by file location: shared/*.test.ts = Shared Unit, server/*.test.ts = Server Integration.
     E2E count comes from Playwright spec files (Glob e2e/*.spec.ts, then Grep for test() calls). -->

| Suite | Files | Count | Location |
|-------|------:|------:|----------|
| Shared Unit | {count} | {count} | `shared/*.test.ts` |
| Server Integration | {count} | {count} | `server/*.test.ts` |
| Server AI | {count} | {count} | `server/ai/*.test.ts` |
| Client Unit | {count} | {count} | `client/src/**/*.test.ts` |
| E2E (Playwright) | {count} | {count} | `e2e/*.spec.ts` |
| **Total** | **{total}** | **{total}** | |

### Test Metadata
- **Last CI Green Commit**: {SHA}
- **Last Local Full Test Run**: {timestamp from vitest output}
- **Pass Rate**: {passed}/{total} ({percentage}%)
- **Failing Files**: {list or "none"}
- **Flaky Tests**: {none / list}

### Test Commands
```bash
# All tests
npx vitest run

# Coverage report
npx vitest run --coverage

# E2E tests (all browsers)
npx playwright test

# E2E (Chromium only)
npx playwright test --project=chromium
```

---

## 13. PRD Traceability

<!-- AGENT: Do NOT use a hardcoded PRD list. Instead:
1. Use Glob to find all `docs/prd/PRD-*.md` files
2. For EACH PRD file found:
   a. Read the first few lines to extract the title
   b. Search for "## Status" and read the next line for status
   c. Search server/routes.ts, shared/schema.ts, and test files for references
      to this PRD number to assess implementation evidence
   d. If status says "Proposed" but implementation evidence exists (routes, tests,
      schema changes), mark as "Done" with note "(PRD status field is stale)"
3. Count associated tests by searching for test files that reference this PRD's
   feature area
4. List ALL PRDs found, not just a subset
-->

| PRD | Title | Status | Key Requirements | Tests | Notes |
|-----|-------|--------|------------------|-------|-------|
| {for each PRD file found} | {title} | ✅/🟡/🔴 | {key requirements} | {count} | {notes} |

**Status Legend:** ✅ Done (verified) | 🟡 In Progress | 🔴 Not Started | ⚠️ Draft only

**Evidence**: Scan all files in `docs/prd/` directory. Cross-reference with implementation in `server/routes.ts`, `shared/schema.ts`, and test files.

---

## 14. Environment Configuration

### Development (.env)
```env
# Database
DATABASE_URL=postgresql://helm_user:helm_pass@localhost:5432/helm_local

# Auth (dev bypass)
DEV_USER_ID=dev-user-1
DEV_USER_NAME=Dev User

# AI (optional - for enrichment features)
ANTHROPIC_API_KEY=sk-ant-...

# Session
SESSION_SECRET=your-session-secret
```

### Production
```env
DATABASE_URL=postgresql://...
SESSION_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
REPL_ID=...
REPLIT_DOMAINS=...
```

> **IMPORTANT**: Production secrets must never appear in docs, commits, screenshots, or logs.

### Docker (Local Dev)
```yaml
# dev/docker-compose.yml
PostgreSQL 16, port 5432, database: helm_local
```

---

## 15. Key Files Reference

<!-- AGENT: Verify this table against actual files using Glob. Add any files
     found that are not listed. Remove any files listed that do not exist. -->

| Category | File | Purpose |
|----------|------|---------|
| **Entry Points** | | |
| Frontend | `client/src/main.tsx` | React app entry |
| Server | `server/index.ts` | Express server entry |
| **Core Logic** | | |
| API Routes | `server/routes.ts` | All API endpoints (~2600 lines) |
| Storage | `server/storage.ts` | Database operations (IStorage) |
| Schema | `shared/schema.ts` | Drizzle ORM schema (17 tables) |
| Dice | `shared/dice.ts` | Polyhedral + d10 pool logic |
| Recurrence | `shared/recurrence.ts` | Session scheduling |
| Entity Detection | `shared/entity-detection.ts` | Pattern-based detection |
| Proximity | `shared/proximity-suggestions.ts` | Relationship suggestions |
| Nuclino Parser | `shared/nuclino-parser.ts` | ZIP import parsing |
| **AI** | | |
| AI Provider | `server/ai/ai-provider.ts` | Provider abstraction |
| Claude Provider | `server/ai/claude-provider.ts` | Anthropic Claude integration |
| Mock Provider | `server/ai/mock-provider.ts` | Test mock for AI provider |
| AI Cache | `server/ai/ai-cache.ts` | Caching layer |
| Cache Versions | `server/ai/cache-versions.ts` | Algorithm version tracking |
| Enrichment Worker | `server/jobs/enrichment-worker.ts` | Background enrichment |
| **Auth** | | |
| Auth Module | `server/replit_integrations/auth/index.ts` | Auth module entry |
| Replit Auth | `server/replit_integrations/auth/replitAuth.ts` | Production OIDC auth |
| Dev Auth | `server/replit_integrations/auth/devAuth.ts` | Development bypass auth |
| Auth Routes | `server/replit_integrations/auth/routes.ts` | Auth API endpoints |
| Auth Storage | `server/replit_integrations/auth/storage.ts` | User session storage |
| **Pages** | | |
| Dashboard | `client/src/pages/dashboard.tsx` | Main hub |
| Schedule | `client/src/pages/schedule.tsx` | Calendar view |
| Notes | `client/src/pages/notes.tsx` | Notes grid |
| Dice | `client/src/pages/dice.tsx` | Dice roller |
| Members | `client/src/pages/members.tsx` | Member management |
| Settings | `client/src/pages/settings.tsx` | Team settings |
| Session Review | `client/src/pages/session-review.tsx` | Post-session review |
| Team Wizard | `client/src/pages/team-wizard.tsx` | Setup wizard |
| Landing | `client/src/pages/landing.tsx` | Public landing page |
| Join Team | `client/src/pages/join-team.tsx` | Invite code join flow |
| Profile Settings | `client/src/pages/profile-settings.tsx` | User profile settings |
| Not Found | `client/src/pages/not-found.tsx` | 404 page |
| **Configuration** | | |
| Design | `design_guidelines.md` | Material Design specs |
| Project Guidance | `CLAUDE.md` | Development instructions |
| Playwright | `playwright.config.ts` | E2E config (3 browsers) |
| Vitest | `vitest.config.ts` | Unit/integration test config |

---

## 16. Feature Overlap & Consolidation Analysis

### 16.1 Feature Inventory

| Feature | Page | Components | Data Source | API Endpoints | Tests |
|---------|------|------------|-------------|---------------|-------|
| Team Setup | team-wizard.tsx | wizard components | POST /api/teams | {list} | {count} |
| Dashboard | dashboard.tsx | various | GET /api/teams/:id | {list} | {count} |
| Notes | notes.tsx | notes/* | GET/POST/PATCH/DELETE /api/notes | {list} | {count} |
| Scheduling | schedule.tsx | calendar | GET/POST /api/sessions | {list} | {count} |
| Dice | dice.tsx | dice components | POST/GET /api/dice | {list} | {count} |
| Members | members.tsx | member components | GET /api/members | {list} | {count} |
| Settings | settings.tsx | settings components | PATCH /api/teams | {list} | {count} |
| Session Review | session-review.tsx | entity panels | POST /api/notes, /api/backlinks | {list} | {count} |
| Import | (dialog) | nuclino-import-dialog | POST /api/import | {list} | {count} |
| AI Enrichment | (dialog) | enrichment-review-dialog | POST /api/enrich | {list} | {count} |

### 16.2 Overlap Pair Analysis

#### Pair A: Entity Detection (shared) vs AI Classification (server)

| Aspect | Entity Detection | AI Classification |
|--------|-----------------|-------------------|
| **Purpose** | Pattern-based detection from text | AI-powered entity type inference |
| **Location** | `shared/entity-detection.ts` | `server/ai/claude-provider.ts` |
| **Runs** | Client-side or server-side | Server-side only |
| **Confidence** | Implicit (pattern match) | Explicit (0.0-1.0) |

**Verdict**: {✅ Complementary (heuristic + AI) / ⚠️ Overlap / 🔴 Redundant}

#### Pair B: Manual Backlinks vs AI Relationships

| Aspect | Manual Backlinks | AI Relationships |
|--------|-----------------|------------------|
| **Purpose** | User-created cross-references | AI-detected connections |
| **Table** | `backlinks` | `noteRelationships` |
| **Created by** | User action | Enrichment pipeline |

**Verdict**: {✅ Complementary / ⚠️ UX confusion}

### 16.3 Integration Gap Matrix

| Gap | Feature | What's Missing | Impact | Priority |
|-----|---------|---------------|--------|----------|
| {description} | {feature} | {what needs wiring} | {user impact} | P0/P1/P2 |

### 16.4 Code Deduplication Targets

| Function / Pattern | Locations | Recommendation |
|-------------------|-----------|----------------|
| {duplicate function} | {file list} | {recommendation} |

---

## 17. Evidence Pack (For Verification)

### Required Examples

**1. Example team creation request:**
```json
{
  "name": "The Crimson Blades",
  "teamType": "dnd",
  "diceMode": "polyhedral"
}
```
**Status:** {Present / Missing}

**2. Example dice roll (polyhedral):**
```json
{
  "diceType": "d20",
  "count": 1,
  "modifier": 5,
  "results": [17],
  "total": 22
}
```
**Status:** {Present / Missing}

**3. Example enrichment classification result:**
```json
{
  "inferredType": "NPC",
  "confidence": 0.85,
  "explanation": "Title and content describe a named character with dialogue",
  "extractedEntities": ["Gandalf", "Rivendell"]
}
```
**Status:** {Present / Missing}

**4. Example import run stats:**
```json
{
  "totalPagesDetected": 42,
  "notesCreated": 38,
  "notesUpdated": 0,
  "notesSkipped": 4,
  "emptyPagesImported": 0,
  "linksResolved": 15,
  "warningsCount": 2
}
```
**Status:** {Present / Missing}

---

## 18. Open Questions

### Product Questions
- What is the deployment target beyond Replit?
- Is there a monetization model planned?
- Should AI features require payment or remain free?

### Technical Questions
- Should `server/routes.ts` be decomposed into route modules?
- WebSocket support: `ws` package installed but not imported anywhere?
- Multi-team support: can users belong to multiple teams simultaneously?

---

## 19. Definition of Done Checklist

The snapshot output is "complete" when:

### Core Requirements
- [ ] Uses ✅ Verified / 🟡 Configured / ⚠️ Partial / 🔴 Missing statuses
- [ ] Includes evidence fields for verified claims
- [ ] All sections present (even if some marked 🔴 Missing)
- [ ] Game system support matrix filled in
- [ ] Note types and quest statuses documented
- [ ] AI enrichment pipeline stages verified

### Feature Coverage
- [ ] Feature truth table has status for every feature
- [ ] PRD traceability table complete with test counts
- [ ] Dice roller modes verified with test evidence
- [ ] Import system stages verified
- [ ] Scheduling/recurrence verified

### Technical Requirements
- [ ] Database schema table count matches actual
- [ ] API endpoints list verified against routes.ts
- [ ] Test counts are actual (not estimated)
- [ ] Environment config examples use safe placeholders only
- [ ] Key files reference verified (files exist)

### Analysis
- [ ] Feature overlap analysis completed
- [ ] Dead endpoints identified (if any)
- [ ] Code deduplication targets listed
- [ ] Known gaps prioritized (P0/P1/P2)
```

---

## Completion

After writing the document:

1. **Display the full file path** to the user:
   ```
   Project snapshot created at:
   C:\Users\ronni\.claude\plans\Helm-Project-Snapshot-{YYYY-MM-DD}.md
   ```

2. **Provide a brief summary**:
   - Version analyzed
   - Feature count (✅ Verified / 🟡 Configured / ⚠️ Partial / 🔴 Missing)
   - Test count
   - Critical gaps identified (P0/P1)
   - PRD completion status

---

## Data Collection (If Missing)

If critical data is unavailable during analysis, request from the developer:

1. A sample database with team + notes + sessions
2. Test command outputs for all test suites
3. Screenshot of the dashboard UI
4. Example enrichment run output
5. Current deployment target (Replit / self-hosted / other)
6. Example Nuclino ZIP file for import testing
7. Any pending PRDs not yet documented

---

## What NOT to Include (Avoid Bloat)

To keep the snapshot lightweight and actionable, avoid:
- Huge copied logs (use snippets only)
- Full database dumps
- Long code blocks beyond example payloads
- Implementation details that belong in code comments
- Speculative features not yet planned
- Feature overlap false positives: Multiple pages accessing the same data (e.g., notes appearing on both dashboard and notes page) are legitimate and should NOT be flagged as overlap. Only flag features where duplicated code performs the same function or where data flow is disconnected.

---

## Notes

- This skill should be invoked periodically (before releases, after major changes)
- The document is designed to be shareable with external AI reviewers
- Evidence-based: only mark features as ✅ Verified if proven by artifact + logs + test
- Do NOT include sensitive values (API keys, passwords, database credentials)
- All sections must be present even if marked 🔴 Missing
