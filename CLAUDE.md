# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Helm is a full-stack TypeScript group coordination app for tabletop gaming groups (D&D, Pathfinder, Vampire, Werewolf) and recurring meetups (book clubs, study groups). Features include scheduling, collaborative notes, member management, and game-specific dice rolling.

## Commands

```bash
npm run dev              # Start development server (port 5000)
npm run build            # Build client (Vite) + server (esbuild) → dist/
npm start                # Run production server
npm run check            # TypeScript type check
npm run db:push          # Sync database schema with Drizzle

npx vitest run           # Run all tests
npx vitest               # Watch mode
npx vitest run shared/dice.test.ts   # Run single test file
npx vitest run --coverage            # Coverage report
```

## Architecture

### Project Structure
- **client/src/** - React frontend (Vite, TanStack Query, Wouter routing, Shadcn UI)
- **server/** - Express backend with PostgreSQL via Drizzle ORM
- **shared/** - Code shared between client and server (schemas, dice logic)

### Key Patterns

**Storage Interface**: All database operations go through `DatabaseStorage` class (implements `IStorage`). Tests use `MemoryStorage` for isolation.

**Path Aliases**:
- `@/*` → client/src/
- `@shared/*` → shared/

**Authentication**: Replit Auth (OpenID Connect) with `isAuthenticated` middleware guard. Role-based access: Admin ("dm") vs Member.

**State Management**: TanStack Query with infinite staleTime. Team selection persisted in localStorage.

### Build Output
- `dist/index.cjs` - Production server bundle
- `dist/public/` - Static client files

## Testing

**All PRD implementations must include tests.** This is a requirement, not optional.

### Test Commands
```bash
npx vitest run                    # Run all tests (required before PRs)
npx vitest run --coverage         # Coverage report
npx vitest run path/to/file.test.ts  # Run single test file
```

### Test Structure
- **Unit tests** (`*.test.ts` in `shared/`): Pure logic, no I/O
- **Integration tests** (`*.test.ts` in `server/`): API endpoints with `createTestApp()` helper
- Tests use `MemoryStorage` for isolation (no real database)

### Coverage Targets
- New shared utilities: 80%+ line coverage
- New API endpoints: All success and error paths tested
- Complex business logic: Edge cases and boundary conditions

### Existing Test Files
- `shared/dice.test.ts` - Unit tests for dice utilities (65+ tests)
- `server/api.test.ts` - API integration tests (80+ tests)
- `server/dice.api.test.ts` - Game-specific dice scenario tests

### PRD Completion Checklist
A PRD is not complete until:
1. All acceptance criteria have corresponding tests
2. Tests pass (`npx vitest run`)
3. No regressions in existing tests
4. PRD status section updated to "Done"
5. PRD implementation notes section updated with relevant details

## PRD Structure

All PRDs in `docs/prd/` must include the following sections:

### Required Sections
1. **Status**: Track implementation progress
   - `To Do` - Not started
   - `In Progress` - Currently being implemented
   - `Done` - Implementation complete with tests passing

2. **Implementation Notes**: Updated after completion with:
   - Files modified
   - Key technical decisions
   - Any deviations from the original spec
   - Test coverage notes

### Example PRD Footer
```markdown
## Status
Done

## Implementation Notes
- Modified: `server/routes.ts`, `client/src/components/foo.tsx`
- Added polling mechanism instead of SSE for simplicity
- Test coverage: `server/foo.api.test.ts` (6 tests)
```

### Test Coverage is Mandatory
**Test coverage cannot be skipped.** Every PRD implementation must include:
- Unit tests for new shared utilities
- Integration tests for new API endpoints
- Tests that verify all acceptance criteria

## Game Systems

The dice roller supports different modes:
- **Polyhedral** (D&D/Pathfinder): Sum dice + modifier, track natural 20s/1s for criticals
- **d10 Pool** (Vampire/Werewolf): Count successes at difficulty threshold, 1s cancel successes, botch when net successes ≤ 0 with ones present

## Design System

Material Design with teal accent (HSL 175 55% 38%), Roboto typography, light/dark mode support. See `design_guidelines.md` for full specs.
