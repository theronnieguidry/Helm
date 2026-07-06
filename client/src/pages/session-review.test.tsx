/**
 * @vitest-environment jsdom
 *
 * Session Review page tests (P2-5 / PRD-003):
 * - F19: Mark as Reviewed button + reviewed state (FR-5)
 * - F29: completion/progress semantics with matched entities
 * - F20: selection-created entities get backlinked to the session (FR-4)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SessionReviewPage from './session-review';
import type { DetectedEntity } from '@shared/entity-detection';

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

// Mock wouter — page reads :noteId and navigates
vi.mock('wouter', () => ({
  useParams: () => ({ noteId: 'session-1' }),
  useLocation: () => ['/', vi.fn()],
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => mockToast(...args),
  }),
}));

// Mock queryClient module
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  queryClient: new QueryClient(),
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

// Mock entity detection hook (Web Worker unavailable in jsdom); tests set
// mockEntities before rendering.
let mockEntities: DetectedEntity[] = [];
vi.mock('@/hooks/use-entity-detection', () => ({
  useEntityDetection: () => ({
    entities: mockEntities,
    isLoading: false,
    error: null,
  }),
}));

// Mock suggestion persistence hook with controllable sets
let mockCreated = new Set<string>();
let mockDismissed = new Set<string>();
const mockMarkCreated = vi.fn();
const mockDismissEntity = vi.fn();
vi.mock('@/hooks/use-suggestion-persistence', () => ({
  useSuggestionPersistence: () => ({
    dismissed: mockDismissed,
    reclassified: new Map(),
    created: mockCreated,
    dismissEntity: (id: string) => mockDismissEntity(id),
    reclassifyEntity: vi.fn(),
    markCreated: (id: string) => mockMarkCreated(id),
    unmarkCreated: vi.fn(),
    isDismissed: (id: string) => mockDismissed.has(id),
    getReclassifiedType: () => undefined,
    isCreated: (id: string) => mockCreated.has(id),
    clearSession: vi.fn(),
  }),
}));

// Mock SelectableContent: real component depends on window.getSelection,
// which jsdom doesn't support meaningfully. The mock renders children plus a
// trigger that simulates the user selecting "Lord Vex" and picking NPC.
vi.mock('@/components/selectable-content', () => ({
  SelectableContent: ({
    children,
    onCreateEntity,
  }: {
    children: React.ReactNode;
    onCreateEntity: (text: string, type: string) => void;
  }) => (
    <div data-testid="selectable-content">
      {children}
      <button onClick={() => onCreateEntity('Lord Vex', 'npc')}>
        simulate-selection
      </button>
    </div>
  ),
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
  aiEnabled: false,
  aiEnabledAt: null,
};

const baseSessionLog = {
  id: 'session-1',
  teamId: 'team-1',
  authorId: 'user-1',
  title: 'Session 5 — Into the Depths',
  content: 'We met Lord Vex at the tavern.',
  contentBlocks: null,
  noteType: 'session_log',
  isPrivate: false,
  sessionDate: '2026-07-01T00:00:00.000Z',
  reviewedAt: null as string | null,
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
};

const existingNotes = [
  {
    id: 'note-gandalf',
    teamId: 'team-1',
    authorId: 'user-1',
    title: 'Gandalf the Grey',
    content: 'A wizard.',
    noteType: 'npc',
    isPrivate: false,
    sessionDate: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
  },
];

function makeEntity(overrides: Partial<DetectedEntity>): DetectedEntity {
  return {
    id: 'entity-1',
    type: 'npc',
    text: 'Captain Renn',
    normalizedText: 'captain renn',
    confidence: 'high',
    frequency: 1,
    mentions: [{ startOffset: 0, endOffset: 12, text: 'Captain Renn' }],
    ...overrides,
  };
}

function renderPage(sessionOverrides: Partial<typeof baseSessionLog> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const sessionLog = { ...baseSessionLog, ...sessionOverrides };
  queryClient.setQueryData(
    ['/api/teams', 'team-1', 'notes', 'session-1'],
    sessionLog
  );
  queryClient.setQueryData(
    ['/api/teams', 'team-1', 'notes'],
    [sessionLog, ...existingNotes]
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <SessionReviewPage team={mockTeam} />
    </QueryClientProvider>
  );
}

describe('SessionReviewPage (P2-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntities = [];
    mockCreated = new Set();
    mockDismissed = new Set();
    mockApiRequest.mockResolvedValue({
      json: () =>
        Promise.resolve({ id: 'new-note-1', title: 'Lord Vex', noteType: 'npc' }),
    });
  });

  // F19 (PRD-003 FR-5): mark session as reviewed
  describe('Mark as Reviewed (F19)', () => {
    it('shows a Mark as Reviewed button that PATCHes reviewedAt = now', async () => {
      const user = userEvent.setup();
      renderPage();

      const button = screen.getByRole('button', { name: /mark as reviewed/i });
      await user.click(button);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'PATCH',
          '/api/teams/team-1/notes/session-1',
          expect.objectContaining({ reviewedAt: expect.any(String) })
        );
      });
      // Payload is a valid ISO timestamp
      const patchCall = mockApiRequest.mock.calls.find(
        (call) => call[0] === 'PATCH'
      );
      const sent = (patchCall![2] as { reviewedAt: string }).reviewedAt;
      expect(Number.isNaN(new Date(sent).getTime())).toBe(false);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Session marked as reviewed' })
        );
      });
    });

    it('renders the reviewed state with a Reviewed indicator and un-marks via PATCH null', async () => {
      const user = userEvent.setup();
      renderPage({ reviewedAt: '2026-07-05T10:00:00.000Z' });

      // Indicator near the session title
      expect(screen.getByText(/Reviewed Jul 5, 2026/)).toBeInTheDocument();

      // Button is in the reviewed state; no "Mark as Reviewed" anymore
      expect(
        screen.queryByRole('button', { name: /mark as reviewed/i })
      ).not.toBeInTheDocument();
      const reviewedButton = screen.getByRole('button', { name: /reviewed ✓/i });

      await user.click(reviewedButton);

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'PATCH',
          '/api/teams/team-1/notes/session-1',
          { reviewedAt: null }
        );
      });
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Review mark removed' })
        );
      });
    });
  });

  // F29: completion/progress semantics
  describe('Review completion logic (F29)', () => {
    it('counts an unlinked matched entity as remaining, not processed', () => {
      // "Gandalf the Grey" matches the existing npc note
      mockEntities = [
        makeEntity({
          id: 'entity-match',
          text: 'Gandalf the Grey',
          normalizedText: 'gandalf the grey',
        }),
      ];
      renderPage();

      expect(screen.getByText('0 / 1 processed')).toBeInTheDocument();
      expect(screen.getByText('1 remaining')).toBeInTheDocument();
      expect(screen.queryByText('Review Complete')).not.toBeInTheDocument();
      // The matched entity offers a Link action
      expect(screen.getByRole('button', { name: /link/i })).toBeInTheDocument();
    });

    it('shows Review Complete once a matched entity has been linked', () => {
      mockEntities = [
        makeEntity({
          id: 'entity-match',
          text: 'Gandalf the Grey',
          normalizedText: 'gandalf the grey',
        }),
      ];
      mockCreated = new Set(['entity-match']);
      renderPage();

      expect(screen.getByText('1 / 1 processed')).toBeInTheDocument();
      expect(screen.getByText('0 remaining')).toBeInTheDocument();
      expect(screen.getByText('1 linked')).toBeInTheDocument();
      expect(screen.getByText('Review Complete')).toBeInTheDocument();
    });

    it('shows Review Complete when all new entities are dismissed (no matches)', () => {
      mockEntities = [makeEntity({ id: 'entity-new', text: 'Captain Renn' })];
      mockDismissed = new Set(['entity-new']);
      renderPage();

      expect(screen.getByText('1 / 1 processed')).toBeInTheDocument();
      expect(screen.getByText('1 dismissed')).toBeInTheDocument();
      expect(screen.getByText('Review Complete')).toBeInTheDocument();
    });

    it('mixes new and matched entities honestly in the progress math', () => {
      mockEntities = [
        makeEntity({ id: 'entity-new', text: 'Captain Renn' }),
        makeEntity({
          id: 'entity-match',
          text: 'Gandalf the Grey',
          normalizedText: 'gandalf the grey',
        }),
      ];
      // New entity dismissed; matched entity not yet linked
      mockDismissed = new Set(['entity-new']);
      renderPage();

      expect(screen.getByText('1 / 2 processed')).toBeInTheDocument();
      expect(screen.getByText('1 remaining')).toBeInTheDocument();
      expect(screen.queryByText('Review Complete')).not.toBeInTheDocument();
    });
  });

  // F20 (PRD-003 FR-4): selection-created entities link back to the session
  describe('Create from selection backlink (F20)', () => {
    it('creates a backlink to the session after creating a note from a text selection', async () => {
      const user = userEvent.setup();
      renderPage();

      // Simulate selecting "Lord Vex" in the content and choosing NPC
      await user.click(
        screen.getByRole('button', { name: 'simulate-selection' })
      );

      // Dialog opens pre-filled with the selection
      const titleInput = (await screen.findByLabelText('Title')) as HTMLInputElement;
      expect(titleInput.value).toBe('Lord Vex');

      await user.click(screen.getByRole('button', { name: /create & link/i }));

      // Note is created...
      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'POST',
          '/api/teams/team-1/notes',
          expect.objectContaining({ title: 'Lord Vex', noteType: 'npc' })
        );
      });

      // ...and backlinked to the session with the selection's snippet and
      // offsets ("Lord Vex" starts at index 7 in the session content)
      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'POST',
          '/api/teams/team-1/notes/new-note-1/backlinks',
          expect.objectContaining({
            sourceNoteId: 'session-1',
            textSnippet: 'Lord Vex',
            evidenceType: 'Mention',
            confidence: 0.8,
            startOffset: 7,
            endOffset: 15,
          })
        );
      });
    });

    it('finds offsets inside content blocks when the session uses blocks', async () => {
      const user = userEvent.setup();
      renderPage({
        content: null as unknown as string,
        contentBlocks: [
          { id: 'block-1', content: 'A quiet morning.' },
          { id: 'block-2', content: 'Then Lord Vex appeared.' },
        ] as unknown as null,
      });

      await user.click(
        screen.getByRole('button', { name: 'simulate-selection' })
      );
      await screen.findByLabelText('Title');
      await user.click(screen.getByRole('button', { name: /create & link/i }));

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'POST',
          '/api/teams/team-1/notes/new-note-1/backlinks',
          expect.objectContaining({
            sourceNoteId: 'session-1',
            textSnippet: 'Lord Vex',
            sourceBlockId: 'block-2',
            startOffset: 5,
            endOffset: 13,
          })
        );
      });
    });
  });
});
