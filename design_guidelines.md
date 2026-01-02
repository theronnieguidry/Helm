# Gaming Coordination & Organization App - Design Guidelines

## Design Approach: Material Design System
Material Design provides robust patterns for this productivity-focused coordination tool, supporting complex features (scheduling, notes, dice rolling, team management) with consistent, learnable interfaces while enabling interactive gaming moments.

## Color System

**Light Mode**:
- Background: Gray-50 (surface), White (elevated cards)
- Text: Gray-900 (primary), Gray-600 (secondary)
- Accent: Purple-600 (primary actions), Purple-700 (hover)
- Success: Green-600, Warning: Amber-600, Error: Red-600
- Borders: Gray-200

**Dark Mode**:
- Background: Gray-900 (surface), Gray-800 (elevated cards)
- Text: Gray-50 (primary), Gray-400 (secondary)
- Accent: Purple-500 (primary actions), Purple-400 (hover)
- Success: Green-500, Warning: Amber-500, Error: Red-500
- Borders: Gray-700

**Application**: Accent purple for CTAs, active states, dice roll highlights, session markers, and DM-exclusive features. Use semantic colors for availability status (green/amber/red) and validation states.

## Typography
**Roboto** (Google Fonts): Medium (500) for headers/buttons, Regular (400) for body
- Team names: text-2xl to text-3xl
- Section headers: text-xl
- Card titles: text-lg
- Body: text-base
- Metadata: text-sm
- Captions: text-xs

## Layout & Spacing
**Tailwind Units**: 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Card spacing: gap-4 to gap-6  
- Section margins: mb-8 to mb-12
- Container max-widths: max-w-7xl (dashboards), max-w-2xl (forms)

## Core Components

### Setup Wizard
5-step stepper at top with progress indicator. Centered cards (max-w-lg) with shadow-md elevation. Material-style filled inputs with floating labels. Steps include: Team Creation, Member Roles, Scheduling Setup, Feature Selection, Invite Generation. Primary CTA (Next/Create) bottom-right in accent purple, Secondary (Back) bottom-left.

### Navigation
**Desktop**: Persistent left sidebar with team context header (team name, type badge), navigation menu (Dashboard, Schedule, Notes, Dice, Settings), theme toggle at bottom.

**Mobile**: Bottom navigation bar with 5 icons (Dashboard, Schedule, Notes, Dice, More). Top app bar shows team switcher dropdown and settings.

### Dashboard
Hero section with team banner image (16:9, optional upload by DM) displaying team name overlay. Below: 3-column grid (lg:grid-cols-3, md:grid-cols-2) of module cards with shadow-sm elevation:

**Schedule Summary Card**: Next 3 upcoming sessions with date/time, attendance indicators (circular avatars with availability color rings), quick toggle for personal availability.

**Notes Overview Card**: 2x3 grid of recent note cards with type icon badges (Locations, Characters, NPCs, POIs, Quests), preview text, visibility indicator.

**Quick Actions Card**: Large icon buttons for Create Note, Roll Dice, Manage Team (DM only), all using accent purple.

**Team Activity Feed Card**: Recent actions, new notes, schedule changes with timestamps.

### Scheduling Interface
Month calendar grid view with session markers (purple dots for confirmed, outlined for tentative). Click session opens slide-in drawer (right side, 400px width) showing:
- Session details header with edit button (DM only)
- Attendee list with availability chips (Available/green, Busy/red, Maybe/amber)
- Attendance threshold progress bar (purple fill)
- DM override controls to mark session confirmed/cancelled

Below calendar: upcoming sessions list view with quick availability toggles.

### Notes System
Grid view (md:grid-cols-2) of note cards containing type icon (top-left), title (text-lg), preview text (2 lines, text-sm), visibility badge (private/shared), edit/delete icons (top-right). Horizontal chip filters for note types above grid.

Detail view: Full-screen with markdown editor, relationship links as purple chips, attached images in 2-column grid. Generated character/location images display prominently at top. Floating action button (bottom-right, purple) for quick note creation.

### Dice Roller
**Polyhedral Mode**: Segmented button group for dice selection (d4, d6, d8, d10, d12, d20, d100), modifier input with +/- steppers, large purple Roll button. Results card shows individual dice icons with values, modifier breakdown, total in large text (purple accent). Collapsible history below.

**d10 Pool Mode**: Number input for pool size, success threshold selector, prominent success counter display. Visual representation of rolled dice in grid.

### Team Management
Member grid showing avatars with role badges (DM/Player). Invite card with shareable link (one-tap copy button), 6-digit code (large display, one-tap copy), expiration countdown timer. Remove member option for DM with confirmation dialog.

### Media Tools (DM Only)
**Sound Broadcasting**: Grid of sound category cards with thumbnail images (ambient, combat, tavern, travel). Active broadcast shows floating pill indicator with waveform animation, stop button. Preview play button on each card.

**Image Generation**: Multi-line prompt textarea, purple Generate button below. Results in 2-column grid with save/attach to note options.

## Images
Team dashboard banner (16:9 hero), sound category thumbnails, generated character/location images in notes, optional team/player avatars. All hero images have subtle gradient overlays for text readability.

## Interactions
Dice roll: 300ms 3D rotation animation settling to result. Card hover: shadow-sm to shadow-lg elevation change. Loading: skeleton screens for data views, spinners for actions. Toast notifications: bottom-center snackbar for confirmations. Theme transition: 200ms color fade between light/dark modes. All interactive elements have focus indicators and smooth state transitions.

## Accessibility
ARIA labels on all controls, keyboard navigation throughout, focus indicators on interactive elements, screen reader announcements for dice rolls and notifications, sufficient color contrast in both themes (WCAG AA minimum), preference for system theme by default.