/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotesPage from './notes';
import { format } from 'date-fns';

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

const mockTeam = {
  id: 'team-1',
  name: 'Test Team',
  teamType: 'dnd' as const,
  diceMode: 'polyhedral' as const,
  ownerId: 'user-1',
  inviteCode: 'ABC123',
  createdAt: new Date(),
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
    noteType: 'location',
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

describe('NotesPage - Unified Sessions View (PRD-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockResolvedValue({
      json: () => Promise.resolve({ id: 'new-note-id' }),
    });
  });

  describe('FR-1: Unified View (No Tabs)', () => {
    it('should NOT display Notes/Session Logs tabs', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Tabs should not exist
      expect(screen.queryByTestId('tab-notes')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tab-sessions')).not.toBeInTheDocument();
    });

    it('should display all notes together (session logs and entity notes)', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      // All notes should be visible
      expect(screen.getByText('2024-01-15 — The Beginning')).toBeInTheDocument();
      expect(screen.getByText('Tavern of the Rusty Blade')).toBeInTheDocument();
      expect(screen.getByText('Find the Missing Artifact')).toBeInTheDocument();
    });

    it('should display page title as "Sessions"', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument();
    });

    it('should show "New Session" button', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByTestId('button-create-note')).toHaveTextContent('New Session');
    });
  });

  describe('FR-3: Default Title to Current Date', () => {
    it('should prefill title with current date when creating new session', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Click create button
      await user.click(screen.getByTestId('button-create-note'));

      // Check title is prefilled with today's date
      const titleInput = screen.getByTestId('input-note-title');
      const expectedDate = format(new Date(), 'yyyy-MM-dd');
      expect(titleInput).toHaveValue(expectedDate);
    });

    it('should allow editing the prefilled title', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      await user.click(screen.getByTestId('button-create-note'));

      const titleInput = screen.getByTestId('input-note-title');
      await user.clear(titleInput);
      await user.type(titleInput, '2024-01-20 — The Heist');

      expect(titleInput).toHaveValue('2024-01-20 — The Heist');
    });
  });

  describe('FR-4: Editable Session Date Field', () => {
    it('should display session date field in create dialog', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      await user.click(screen.getByTestId('button-create-note'));

      const dateInput = screen.getByTestId('input-session-date');
      expect(dateInput).toBeInTheDocument();
      expect(dateInput).toHaveAttribute('type', 'date');
    });

    it('should prefill session date with current date', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      await user.click(screen.getByTestId('button-create-note'));

      const dateInput = screen.getByTestId('input-session-date');
      const expectedDate = format(new Date(), 'yyyy-MM-dd');
      expect(dateInput).toHaveValue(expectedDate);
    });

    it('should allow changing session date independently of title', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      await user.click(screen.getByTestId('button-create-note'));

      const dateInput = screen.getByTestId('input-session-date');
      const titleInput = screen.getByTestId('input-note-title');

      // Get initial values
      const initialTitle = (titleInput as HTMLInputElement).value;

      // Change the date
      await user.clear(dateInput);
      await user.type(dateInput, '2024-06-15');

      // Title should remain unchanged
      expect(titleInput).toHaveValue(initialTitle);
      expect(dateInput).toHaveValue('2024-06-15');
    });

    it('should allow changing title independently of session date', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      await user.click(screen.getByTestId('button-create-note'));

      const dateInput = screen.getByTestId('input-session-date');
      const titleInput = screen.getByTestId('input-note-title');

      // Get initial date
      const initialDate = (dateInput as HTMLInputElement).value;

      // Change the title
      await user.clear(titleInput);
      await user.type(titleInput, 'Custom Title');

      // Date should remain unchanged
      expect(dateInput).toHaveValue(initialDate);
      expect(titleInput).toHaveValue('Custom Title');
    });
  });

  describe('FR-5: Session List Display', () => {
    it('should display session date on each note card', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Session log should show its session date (format may vary by locale)
      const sessionCard = screen.getByTestId('note-card-note-1');
      // Look for a date badge with calendar icon
      const sessionDateBadge = within(sessionCard).getAllByRole('generic').find(
        el => el.textContent?.includes('2024') || el.textContent?.includes('15')
      );
      expect(sessionDateBadge).toBeTruthy();

      // Location note (no session date) should show created date
      const locationCard = screen.getByTestId('note-card-note-2');
      const locationDateBadge = within(locationCard).getAllByRole('generic').find(
        el => el.textContent?.includes('2024') || el.textContent?.includes('10')
      );
      expect(locationDateBadge).toBeTruthy();
    });

    it('should display note type badge on each card', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      const sessionCard = screen.getByTestId('note-card-note-1');
      expect(within(sessionCard).getByText('Session')).toBeInTheDocument();

      const locationCard = screen.getByTestId('note-card-note-2');
      expect(within(locationCard).getByText('Location')).toBeInTheDocument();
    });

    it('should sort notes by session date descending', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      const cards = screen.getAllByTestId(/^note-card-/);

      // First card should be the most recent (session log from Jan 15)
      expect(within(cards[0]).getByText('2024-01-15 — The Beginning')).toBeInTheDocument();
    });
  });

  describe('FR-2: Unified Creation Flow', () => {
    it('should default to session_log type when creating', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      await user.click(screen.getByTestId('button-create-note'));

      // Type selector should show Session as default
      const typeSelect = screen.getByTestId('select-note-type');
      expect(within(typeSelect).getByText('Session')).toBeInTheDocument();
    });

    it('should have a note type selector available', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      await user.click(screen.getByTestId('button-create-note'));

      // Type selector should be present and show current selection
      const typeSelect = screen.getByTestId('select-note-type');
      expect(typeSelect).toBeInTheDocument();
      // Default should be Session
      expect(within(typeSelect).getByText('Session')).toBeInTheDocument();
    });

    it('should submit session with correct data', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      await user.click(screen.getByTestId('button-create-note'));

      // Fill in content
      const contentInput = screen.getByTestId('textarea-note-content');
      await user.type(contentInput, 'Test session content');

      // Submit
      await user.click(screen.getByTestId('button-save-note'));

      // Verify API was called with session_log type and sessionDate
      expect(mockApiRequest).toHaveBeenCalledWith(
        'POST',
        '/api/teams/team-1/notes',
        expect.objectContaining({
          noteType: 'session_log',
          sessionDate: expect.any(String),
        })
      );
    });
  });

  describe('Type Filtering', () => {
    it('should show all type filters including Session', () => {
      renderWithProviders(<NotesPage team={mockTeam} />);

      expect(screen.getByTestId('filter-all')).toBeInTheDocument();
      expect(screen.getByTestId('filter-session_log')).toBeInTheDocument();
      expect(screen.getByTestId('filter-location')).toBeInTheDocument();
      expect(screen.getByTestId('filter-quest')).toBeInTheDocument();
    });

    it('should filter by note type when filter is selected', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage team={mockTeam} />);

      // Click location filter
      await user.click(screen.getByTestId('filter-location'));

      // Only location notes should be visible
      expect(screen.queryByText('2024-01-15 — The Beginning')).not.toBeInTheDocument();
      expect(screen.getByText('Tavern of the Rusty Blade')).toBeInTheDocument();
      expect(screen.queryByText('Find the Missing Artifact')).not.toBeInTheDocument();
    });
  });
});
