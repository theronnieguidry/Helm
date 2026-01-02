# Helm - Your Group Meetup Companion

## Overview
Helm is a group coordination app that helps people plan, schedule, and connect — whether organizing a tabletop campaign, book club, running group, study session, or any recurring meetup. Features scheduling, collaborative notes, member management, and optional dice rolling for gaming groups.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TanStack Query, Wouter routing, Shadcn UI components
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect) - supports email/password and social login (Google, Apple, GitHub, X)
- **Styling**: Tailwind CSS with Material Design principles, Roboto typography, purple accent colors

## Project Structure
```
├── client/src/
│   ├── components/       # Reusable UI components
│   │   ├── app-sidebar.tsx    # Main navigation sidebar
│   │   ├── theme-provider.tsx # Light/dark mode support
│   │   ├── theme-toggle.tsx   # Theme toggle button
│   │   └── ui/                # Shadcn components
│   ├── pages/
│   │   ├── landing.tsx        # Landing page for logged-out users
│   │   ├── dashboard.tsx      # Main dashboard for group
│   │   ├── team-wizard.tsx    # 5-step group creation wizard
│   │   ├── notes.tsx          # Notes management (CRUD)
│   │   ├── dice.tsx           # Dice roller (polyhedral/d10 pool)
│   │   ├── schedule.tsx       # Calendar and session scheduling
│   │   ├── members.tsx        # Member management and invites
│   │   ├── settings.tsx       # Group settings
│   │   └── join-team.tsx      # Join group via invite code
│   ├── hooks/
│   │   └── use-auth.ts        # Authentication hook
│   └── lib/
│       └── queryClient.ts     # TanStack Query setup
├── server/
│   ├── routes.ts              # All API endpoints
│   ├── storage.ts             # Database operations (DatabaseStorage)
│   ├── db.ts                  # Drizzle database connection
│   └── replit_integrations/   # Auth integration
├── shared/
│   ├── schema.ts              # Drizzle schemas and types
│   └── models/auth.ts         # Auth-related schemas
└── design_guidelines.md       # UI/UX design specifications
```

## Key Features

### Group Management
- Create groups for any purpose (gaming, book clubs, study groups, fitness, etc.)
- Invite members via 6-character invite codes (7-day expiry)
- Admin and member roles with appropriate permissions

### Scheduling
- Set recurring schedules (weekly, biweekly, monthly)
- Calendar view with session markers
- Availability tracking (Available/Maybe/Busy)
- Attendance threshold tracking

### Notes System
- Create notes with types: Location, Character, NPC, POI, Quest
- Private or shared visibility
- Full-text search and type filtering

### Dice Roller (for gaming groups)
- Polyhedral mode: d4, d6, d8, d10, d12, d20, d100 with modifiers
- d10 Pool mode: Configurable pool size and difficulty threshold
- Roll history (personal and shared with group)
- Disabled for non-gaming groups

## API Endpoints
All endpoints require authentication except landing page.

### Groups (Teams)
- `GET /api/teams` - Get user's groups
- `POST /api/teams` - Create group
- `PATCH /api/teams/:id` - Update group (admin only)
- `DELETE /api/teams/:id` - Delete group (admin only)

### Members
- `GET /api/teams/:teamId/members` - Get group members
- `DELETE /api/teams/:teamId/members/:memberId` - Remove member (admin only)

### Invites
- `GET /api/teams/:teamId/invites` - Get active invites
- `POST /api/teams/:teamId/invites` - Create invite (admin only)
- `POST /api/invites/:code/join` - Join group via invite code

### Notes
- `GET /api/teams/:teamId/notes` - Get group notes
- `POST /api/teams/:teamId/notes` - Create note
- `PATCH /api/teams/:teamId/notes/:noteId` - Update note
- `DELETE /api/teams/:teamId/notes/:noteId` - Delete note

### Sessions
- `GET /api/teams/:teamId/sessions` - Get meetup sessions
- `POST /api/teams/:teamId/sessions` - Create session (admin only)
- `GET /api/teams/:teamId/availability` - Get all availability
- `POST /api/teams/:teamId/sessions/:sessionId/availability` - Set availability

### Dice Rolls
- `GET /api/teams/:teamId/dice-rolls` - Get roll history
- `POST /api/teams/:teamId/dice-rolls` - Create roll

## Design Guidelines
- Material Design principles with Roboto typography
- Purple accent color (HSL 262 83% 58%)
- Light and dark mode support
- Consistent spacing and component usage per design_guidelines.md

## Testing
- Run `npx vitest run` to run all tests
- Run `npx vitest` for watch mode
- Run `npx vitest run --coverage` for coverage report

### Test Files
- `shared/dice.test.ts` - Unit tests for dice rolling utilities (65 tests)
- `server/dice.api.test.ts` - Scenario tests for game-specific mechanics (30 tests)

### Game-Specific Rules Tested
- **D&D 5e/Pathfinder 2e**: Attack rolls, damage, saving throws, critical hits/misses
- **World of Darkness (Vampire/Werewolf)**: 
  - Success counting at difficulty threshold
  - 1s cancel successes
  - Botch detection (net successes <= 0 AND ones > 0)
  - Difficulty ranges 1-10 (default 6)

## Development
- Run `npm run dev` to start development server
- Run `npm run db:push` to sync database schema
- App runs on port 5000
