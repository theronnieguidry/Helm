/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotesPage from './notes';
import { format } from 'date-fns';

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// Mock ResizablePanelGroup to avoid jsdom issues with resize observers
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="resizable-panel-group">{children}</div>
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="resizable-panel">{children}</div>
  ),
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}));

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  useSearch: () => '',
}));

// Mock toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock auth hook
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@test.com' },
  }),
}));

// Mock queryClient module
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  queryClient: new QueryClient(),
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

// Mock entity detection hook (uses Web Worker which isn't available in jsdom)
vi.mock('@/hooks/use-entity-detection', () => ({
  useEntityDetection: () => ({
    entities: [],
    isLoading: false,
    error: null,
  }),
}));

// Mock suggestion persistence hook
vi.mock('@/hooks/use-suggestion-persistence', () => ({
  useSuggestionPersistence: () => ({
    dismissed: new Set(),
    reclassified: new Map(),
    created: new Set(),
    dismissEntity: vi.fn(),
    reclassifyEntity: vi.fn(),
    markCreated: vi.fn(),
    isDismissed: () => false,
    getReclassifiedType: () => undefined,
    isCreated: () => false,
    clearSession: vi.fn(),
  }),
}));

const mockTeam = {
  id: 'team-1',
  name: 'Test Team',
  teamType: 'dnd' as const,
  diceMode: 'polyhedral' as const,
  ownerId: 'user-1',
  inviteCode: 'ABC123',
  createdAt: new Date(),
  recurrenceFrequency: null,
  dayOfWeek: null,
  daysOfMonth: null,
  startTime: null,
  endTime: null,
  timezone: null,
  availabilityStartDate: null,
  availabilityEndDate: null,
  recurrenceAnchorDate: null,
  minAttendanceThreshold: null,
  defaultSessionDurationMinutes: null,
};

const mockNotes = [
  {
    id: 'note-1',
    teamId: 'team-1',
    authorId: 'user-1',
    title: '2024-01-15 — The Beginning',
    content: 'Our adventure begins...',
    noteType: 'session_log',
    isPrivate: false,
    sessionDate: '2024-01-15T00:00:00.000Z',
    createdAt: '2024-01-15T12:00:00.000Z',
    updatedAt: '2024-01-15T12:00:00.000Z',
  },
  {
    id: 'note-2',
    teamId: 'team-1',
    authorId: 'user-1',
    title: 'Tavern of the Rusty Blade',
    content: 'A seedy establishment...',
    noteType: 'area',
    isPrivate: false,
    sessionDate: null,
    createdAt: '2024-01-10T12:00:00.000Z',
    updatedAt: '2024-01-10T12:00:00.000Z',
  },
  {
    id: 'note-3',
    teamId: 'team-1',
    authorId: 'user-1',
    title: 'Find the Missing Artifact',
    content: 'The artifact was stolen...',
    noteType: 'quest',
    isPrivate: false,
    questStatus: 'active',
    sessionDate: null,
    createdAt: '2024-01-12T12:00:00.000Z',
    updatedAt: '2024-01-12T12:00:00.000Z',
  },
  {
    id: 'note-4',
    teamId: 'team-1',
    authorId: 'user-1',
    title: 'Gandalf the Grey',
    content: 'A mysterious wizard...',
    noteType: 'npc',
    isPrivate: false,
    sessionDate: null,
    createdAt: '2024-01-08T12:00:00.000Z',
    updatedAt: '2024-01-08T12:00:00.000Z',
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  // Mock the notes query
  queryClient.setQueryData(['/api/teams', 'team-1', 'notes'], mockNotes);

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('NotesPage - Two-Panel Layout (PRD-019)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockResolvedValue({
      json: () => Promise.resolve({ id: 'new-note-id' }),
    });
  });

  describe('Layout Structure', () => {
    it('should render two-panel layout with resizable panels', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByTestId('resizable-panel-group')).toBeInTheDocument();
      expect(screen.getAllByTestId('resizable-panel')).toHaveLength(2);
    });

    it('should display page header with "Notes" title', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Header shows "Notes" (changed from "Sessions" per PRD-019)
      expect(screen.getByRole('heading', { name: 'Notes', level: 1 })).toBeInTheDocument();
    });

    it('should display Import button in header', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
    });
  });

  describe('Left Panel - Filter Categories', () => {
    it('should display accordion sections for each category', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Check for accordion category headers
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('People')).toBeInTheDocument();
      expect(screen.getByText('Areas')).toBeInTheDocument();
      expect(screen.getByText('Quests')).toBeInTheDocument();
    });

    it('should display item counts in accordion headers', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Sessions has 1 item
      const sessionsSection = screen.getByText('Sessions').closest('button');
      expect(within(sessionsSection!).getByText('1')).toBeInTheDocument();

      // Areas has 1 item
      const areasSection = screen.getByText('Areas').closest('button');
      expect(within(areasSection!).getByText('1')).toBeInTheDocument();

      // Quests has 1 item
      const questsSection = screen.getByText('Quests').closest('button');
      expect(within(questsSection!).getByText('1')).toBeInTheDocument();

      // People has 1 item (NPC)
      const peopleSection = screen.getByText('People').closest('button');
      expect(within(peopleSection!).getByText('1')).toBeInTheDocument();
    });

    it('should display search input', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByPlaceholderText('Search notes...')).toBeInTheDocument();
    });

    it('should filter notes when searching', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      const searchInput = screen.getByPlaceholderText('Search notes...');
      await user.type(searchInput, 'Tavern');

      // After searching, only matching items should appear
      // The "Areas" section should still show 1 (the Tavern)
      // Other sections should show 0
      await waitFor(() => {
        const sessionsSection = screen.getByText('Sessions').closest('button');
        expect(within(sessionsSection!).getByText('0')).toBeInTheDocument();
      });
    });
  });

  describe('Left Panel - Today Button', () => {
    it('should display Today button with current date', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      expect(screen.getByRole('button', { name: new RegExp(`Today.*${todayStr}`) })).toBeInTheDocument();
    });

    it('should highlight Today button when in today mode (default)', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayButton = screen.getByRole('button', { name: new RegExp(`Today.*${todayStr}`) });

      // The button should have the secondary variant when active
      expect(todayButton).toHaveClass('bg-primary/10');
    });
  });

  describe('Left Panel - Note Items', () => {
    it('should display session notes in Sessions accordion', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Sessions accordion is open by default
      expect(screen.getByText('2024-01-15 — The Beginning')).toBeInTheDocument();
    });

    it('should display area notes in Areas accordion when expanded', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Click to expand Areas accordion
      await user.click(screen.getByText('Areas'));

      expect(screen.getByText('Tavern of the Rusty Blade')).toBeInTheDocument();
    });

    it('should display quest notes in Quests accordion when expanded', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Click to expand Quests accordion
      await user.click(screen.getByText('Quests'));

      expect(screen.getByText('Find the Missing Artifact')).toBeInTheDocument();
    });
  });

  describe('Right Panel - Editor', () => {
    it('should display "Today" header in default mode', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      expect(screen.getByRole('heading', { name: new RegExp(`Today.*${todayStr}`) })).toBeInTheDocument();
    });

    it('should display content textarea for session notes', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByLabelText('Session Notes')).toBeInTheDocument();
    });

    it('should display placeholder text in empty editor', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByPlaceholderText('Start typing your session notes...')).toBeInTheDocument();
    });
  });

  describe('Note Selection', () => {
    it('should load selected note in editor when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Expand Areas accordion and click on the area note
      await user.click(screen.getByText('Areas'));
      await user.click(screen.getByText('Tavern of the Rusty Blade'));

      // Editor should show the note's type badge and title
      await waitFor(() => {
        expect(screen.getByText('Area')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Tavern of the Rusty Blade' })).toBeInTheDocument();
    });

    it('should return to today mode when Today button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Select a different note first
      await user.click(screen.getByText('Areas'));
      await user.click(screen.getByText('Tavern of the Rusty Blade'));

      // Click Today button to return
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      await user.click(screen.getByRole('button', { name: new RegExp(`Today.*${todayStr}`) }));

      // Should show Today header again
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: new RegExp(`Today.*${todayStr}`) })).toBeInTheDocument();
      });
    });
  });

  describe('Session Creation', () => {
    it('should create session when typing content in today mode', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      const contentInput = screen.getByLabelText('Session Notes');
      await user.type(contentInput, 'Test session content');

      // Wait for autosave debounce (750ms)
      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'POST',
          '/api/teams/team-1/notes',
          expect.objectContaining({
            noteType: 'session_log',
            content: expect.stringContaining('Test session content'),
          })
        );
      }, { timeout: 2000 });
    });
  });

  describe('Note Type Display', () => {
    it('should use "Area" label instead of "Location"', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Select the area note
      await user.click(screen.getByText('Areas'));
      await user.click(screen.getByText('Tavern of the Rusty Blade'));

      // Should display "Area" badge, not "Location"
      await waitFor(() => {
        expect(screen.getByText('Area')).toBeInTheDocument();
      });
      expect(screen.queryByText('Location')).not.toBeInTheDocument();
    });

    it('should display "Areas" category in left panel, not "Locations"', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByText('Areas')).toBeInTheDocument();
      expect(screen.queryByText('Locations')).not.toBeInTheDocument();
    });
  });

  describe('Delete Functionality', () => {
    it('should show delete button when note is selected', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Select a note
      await user.click(screen.getByText('Areas'));
      await user.click(screen.getByText('Tavern of the Rusty Blade'));

      // Wait for the note to be loaded in editor
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Tavern of the Rusty Blade' })).toBeInTheDocument();
      });

      // Delete button should be visible (trash icon)
      const deleteButton = screen.getByRole('button', { name: '' }); // Icon button has no accessible name
      expect(deleteButton).toBeInTheDocument();
    });
  });
});
