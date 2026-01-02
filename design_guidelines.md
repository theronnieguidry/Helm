# Helm - Group Meetup Companion - Design Guidelines

## Design Approach: Material Design System
Material Design provides robust patterns for this productivity-focused coordination tool, supporting complex features (scheduling, notes, member management) with consistent, learnable interfaces while enabling interactive moments for gaming groups.

## Color System

Based on the Helm app icon featuring teal, cyan, blue, and green tones creating a sense of connection and coordination.

**Light Mode**:
- Background: White (surface), Teal-tinted off-white (cards)
- Text: Dark teal-gray (primary), Muted teal-gray (secondary)
- Primary: Teal (HSL 175 55% 38%) - WCAG AA compliant with white text
- Success: Green-600, Warning: Amber-600, Error: Red-600
- Borders: Light teal-gray

**Dark Mode**:
- Background: Dark blue-gray (surface), Slightly elevated dark cards
- Text: Light teal-white (primary), Muted light teal (secondary)
- Primary: Teal (HSL 175 55% 50%) - WCAG AA compliant with dark text
- Success: Green-500, Warning: Amber-500, Error: Red-500
- Borders: Dark teal-gray

**Chart Colors**: Blue (HSL 205), Teal (HSL 175), Mint (HSL 150), Green (HSL 95), Cyan (HSL 190) - reflecting the icon's gradient palette

**Application**: Teal accent for CTAs, active states, session markers, and admin features. Use semantic colors for availability status (green/amber/red) and validation states.

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
5-step stepper at top with progress indicator. Centered cards (max-w-lg) with shadow-md elevation. Material-style filled inputs with floating labels. Steps include: Group Type, Group Name, Schedule Setup, Review, Invite Generation. Primary CTA (Next/Create) bottom-right in teal accent, Secondary (Back) bottom-left.

### Navigation
**Desktop**: Persistent left sidebar with team context header (team name, type badge), navigation menu (Dashboard, Schedule, Notes, Dice, Settings), theme toggle at bottom.

**Mobile**: Bottom navigation bar with 5 icons (Dashboard, Schedule, Notes, Dice, More). Top app bar shows team switcher dropdown and settings.

### Dashboard
Hero section with group banner image (16:9, optional upload by admin) displaying group name overlay. Below: 3-column grid (lg:grid-cols-3, md:grid-cols-2) of module cards with shadow-sm elevation:

**Schedule Summary Card**: Next 3 upcoming sessions with date/time, attendance indicators (circular avatars with availability color rings), quick toggle for personal availability.

**Notes Overview Card**: 2x3 grid of recent note cards with type icon badges (Locations, Characters, NPCs, POIs, Quests), preview text, visibility indicator.

**Quick Actions Card**: Large icon buttons for Create Note, Roll Dice (gaming groups only), Manage Group (admin only), all using teal accent.

**Group Activity Feed Card**: Recent actions, new notes, schedule changes with timestamps.

### Scheduling Interface
Month calendar grid view with session markers (teal dots for confirmed, outlined for tentative). Click session opens slide-in drawer (right side, 400px width) showing:
- Session details header with edit button (admin only)
- Attendee list with availability chips (Available/green, Busy/red, Maybe/amber)
- Attendance threshold progress bar (teal fill)
- Admin override controls to mark session confirmed/cancelled

Below calendar: upcoming sessions list view with quick availability toggles.

### Notes System
Grid view (md:grid-cols-2) of note cards containing type icon (top-left), title (text-lg), preview text (2 lines, text-sm), visibility badge (private/shared), edit/delete icons (top-right). Horizontal chip filters for note types above grid.

Detail view: Full-screen with markdown editor, relationship links as teal chips, attached images in 2-column grid. Floating action button (bottom-right, teal) for quick note creation.

### Dice Roller (Gaming Groups Only)
**Polyhedral Mode**: Segmented button group for dice selection (d4, d6, d8, d10, d12, d20, d100), modifier input with +/- steppers, large teal Roll button. Results card shows individual dice icons with values, modifier breakdown, total in large text (teal accent). Collapsible history below.

**d10 Pool Mode**: Number input for pool size, success threshold selector, prominent success counter display. Visual representation of rolled dice in grid.

### Member Management
Member grid showing avatars with role badges (Admin/Member). Invite card with 6-character code (large display, one-tap copy), expiration countdown timer. Remove member option for admin with confirmation dialog.

## Images
Team dashboard banner (16:9 hero), sound category thumbnails, generated character/location images in notes, optional team/player avatars. All hero images have subtle gradient overlays for text readability.

## Interactions
Dice roll: 300ms 3D rotation animation settling to result. Card hover: shadow-sm to shadow-lg elevation change. Loading: skeleton screens for data views, spinners for actions. Toast notifications: bottom-center snackbar for confirmations. Theme transition: 200ms color fade between light/dark modes. All interactive elements have focus indicators and smooth state transitions.

## Accessibility
ARIA labels on all controls, keyboard navigation throughout, focus indicators on interactive elements, screen reader announcements for dice rolls and notifications, sufficient color contrast in both themes (WCAG AA minimum), preference for system theme by default.