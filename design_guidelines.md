# Gaming Coordination & Organization App - Design Guidelines

## Design Approach: Material Design System

**Rationale**: This productivity-focused coordination tool requires consistent, learnable patterns for complex features (scheduling, notes, dice rolling, team management). Material Design provides robust component patterns for data-dense interfaces while supporting the interactive moments (dice rolls, sound broadcasting) that enhance the gaming experience.

## Typography System

**Font Family**: Roboto (via Google Fonts CDN)
- **Display/Headers**: Roboto Medium (500)
  - Team names: text-2xl to text-3xl
  - Section headers: text-xl
  - Card titles: text-lg
- **Body Text**: Roboto Regular (400)
  - Primary content: text-base
  - Secondary/metadata: text-sm
  - Captions: text-xs
- **Interactive Elements**: Roboto Medium (500) for buttons and tabs

## Layout & Spacing System

**Tailwind Spacing Units**: 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Card spacing: gap-4 to gap-6
- Section margins: mb-8 to mb-12
- Tight groupings: gap-2
- Container max-width: max-w-7xl for dashboards, max-w-2xl for wizards/forms

**Grid Patterns**:
- Dashboard modules: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Note cards: grid-cols-1 md:grid-cols-2
- Wizard steps: Single column max-w-lg centered

## Core Components

### Navigation
- **Top App Bar**: Fixed header with team switcher dropdown (if multiple teams), settings icon
- **Bottom Navigation** (mobile): Dashboard, Schedule, Notes, Dice (conditional), More
- **Sidebar** (desktop): Persistent left rail with same navigation, team context always visible

### Setup Wizard
- **Progress Indicator**: Stepper component (5 steps) at top
- **Card Container**: Elevated surface (shadow-md) with max-w-lg centering
- **Form Fields**: Material-style filled inputs with floating labels
- **Action Buttons**: Primary CTA (Next/Create) prominent at bottom-right, Secondary (Back) at bottom-left

### Dashboard
- **Module Cards**: Elevated cards (shadow-sm) with header, content area, and optional action footer
  - Schedule Summary Card: Next 3 sessions, attendance indicators, quick availability toggle
  - Notes Overview Card: Recent notes grid (4-6 items) with type badges
  - Quick Actions Card: Create note, roll dice, manage team (DM only)
- **Team Switcher**: Chip-style selector if multiple teams, displays current team name and type icon

### Scheduling Interface
- **Calendar View**: Month grid with session markers
- **Session Details Panel**: Slide-in drawer showing attendees, availability status, override controls (DM)
- **Availability Toggle**: Simple chip-based selector (Available/Busy/Maybe) per session
- **Threshold Indicator**: Progress bar showing attendance vs minimum

### Notes System
- **Note Cards**: Compact card with type icon, title, preview text, visibility badge (private/shared)
- **Note Type Filters**: Horizontal scrolling chip filters (Locations, Characters, NPCs, POIs, Quests)
- **Detail View**: Full-screen with markdown editor, relationship links as chips
- **Create FAB**: Floating action button (bottom-right) for quick note creation

### Dice Roller
- **Polyhedral Mode**: 
  - Dice selector: Segmented button group (d4-d20-d100)
  - Modifier input: Inline text field with +/- controls
  - Roll button: Large, prominent with dice icon
  - Results display: Card showing individual rolls, modifiers, total
  - History: Collapsible list of recent rolls
- **d10 Pool Mode**:
  - Pool size: Number input with stepper
  - Success counter: Prominent result display
  - Visual dice representation on roll

### Invites Management
- **Invite Card**: Contains link with one-tap copy button, code with one-tap copy button, expiration countdown
- **Member List**: Avatar grid with role badges, remove option (DM only)

### Media Tools
- **Sound Broadcasting** (DM only):
  - Library browser: Grid of sound cards with play preview
  - Active broadcast indicator: Floating pill showing current sound, stop button
- **Image Generation**:
  - Prompt input: Multi-line text area
  - Generate button: Below prompt
  - Results gallery: Grid of generated images with save/attach options

## Images

**Team Dashboard**:
- Optional team banner image at top (upload by DM, 16:9 aspect ratio, subtle overlay for text readability)

**Note Detail Views**:
- Attached images display in 2-column grid (md:grid-cols-2) within note content
- Generated character/location images as focal point at top of detail view

**Sound Library**:
- Thumbnail images for sound categories (ambient, combat, tavern, etc.)

## Interaction Patterns

- **Dice Roll Animation**: Brief (300ms) 3D rotation on roll, settle to result
- **Card Interactions**: Subtle elevation increase (shadow-md to shadow-lg) on hover
- **Form Validation**: Inline error messages below fields, shake animation on submit failure
- **Loading States**: Skeleton screens for data-heavy views, spinners for actions
- **Toasts**: Bottom-center snackbar for confirmations (session created, note saved, invite copied)

## Accessibility
- ARIA labels on all interactive elements
- Keyboard navigation for all forms and lists
- Focus indicators on interactive elements
- Screen reader announcements for dice rolls and notifications