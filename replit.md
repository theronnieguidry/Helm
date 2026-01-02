# Quest Keeper - Gaming Coordination & Organization App

## Overview
A tabletop RPG gaming coordination app that helps Dungeon Masters and players manage teams, schedule recurring game sessions, create collaborative campaign notes, roll dice, and invite members. Supports multiple game systems including Pathfinder 2e, D&D, Vampire: The Masquerade, and Werewolf.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TanStack Query, Wouter routing, Shadcn UI components
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect)
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
│   │   ├── dashboard.tsx      # Main dashboard for team
│   │   ├── team-wizard.tsx    # 5-step team creation wizard
│   │   ├── notes.tsx          # Notes management (CRUD)
│   │   ├── dice.tsx           # Dice roller (polyhedral/d10 pool)
│   │   ├── schedule.tsx       # Calendar and session scheduling
│   │   ├── members.tsx        # Member management and invites
│   │   ├── settings.tsx       # Team settings (DM only)
│   │   └── join-team.tsx      # Join team via invite code
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

### Team Management
- Create teams for different game systems (Pathfinder 2e, D&D, Vampire, Werewolf, Other)
- Invite members via 6-character invite codes (7-day expiry)
- DM and Player roles with appropriate permissions

### Scheduling
- Set recurring schedules (weekly, biweekly, monthly)
- Calendar view with session markers
- Availability tracking (Available/Maybe/Busy)
- Attendance threshold tracking

### Notes System
- Create notes with types: Location, Character, NPC, POI, Quest
- Private or shared visibility
- Full-text search and type filtering

### Dice Roller
- Polyhedral mode: d4, d6, d8, d10, d12, d20, d100 with modifiers
- d10 Pool mode: Configurable pool size and difficulty threshold
- Roll history (personal and shared with team)

## API Endpoints
All endpoints require authentication except landing page.

### Teams
- `GET /api/teams` - Get user's teams
- `POST /api/teams` - Create team
- `PATCH /api/teams/:id` - Update team (DM only)
- `DELETE /api/teams/:id` - Delete team (DM only)

### Members
- `GET /api/teams/:teamId/members` - Get team members
- `DELETE /api/teams/:teamId/members/:memberId` - Remove member (DM only)

### Invites
- `GET /api/teams/:teamId/invites` - Get active invites
- `POST /api/teams/:teamId/invites` - Create invite (DM only)
- `POST /api/invites/:code/join` - Join team via invite code

### Notes
- `GET /api/teams/:teamId/notes` - Get team notes
- `POST /api/teams/:teamId/notes` - Create note
- `PATCH /api/teams/:teamId/notes/:noteId` - Update note
- `DELETE /api/teams/:teamId/notes/:noteId` - Delete note

### Sessions
- `GET /api/teams/:teamId/sessions` - Get game sessions
- `POST /api/teams/:teamId/sessions` - Create session (DM only)
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

## Development
- Run `npm run dev` to start development server
- Run `npm run db:push` to sync database schema
- App runs on port 5000
