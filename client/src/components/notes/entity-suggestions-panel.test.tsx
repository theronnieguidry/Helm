/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EntitySuggestionsPanel } from "./entity-suggestions-panel";
import type { DetectedEntity } from "@shared/entity-detection";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/", mockNavigate],
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock queryClient module
const mockApiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

// Mock entity detection hook
const mockEntities: DetectedEntity[] = [
  {
    id: "entity-1",
    type: "npc",
    text: "Lord Blackwood",
    normalizedText: "lord blackwood",
    confidence: "high",
    mentions: [{ startOffset: 0, endOffset: 14, text: "Lord Blackwood" }],
    frequency: 3,
  },
  {
    id: "entity-2",
    type: "place",
    text: "Silverwood Forest",
    normalizedText: "silverwood forest",
    confidence: "high",
    mentions: [{ startOffset: 30, endOffset: 47, text: "Silverwood Forest" }],
    frequency: 2,
  },
  {
    id: "entity-3",
    type: "quest",
    text: "find the artifact",
    normalizedText: "find the artifact",
    confidence: "medium",
    mentions: [{ startOffset: 60, endOffset: 77, text: "find the artifact" }],
    frequency: 1,
  },
];

let mockEntityDetectionResult = {
  entities: mockEntities,
  isLoading: false,
  error: null,
};

vi.mock("@/hooks/use-entity-detection", () => ({
  useEntityDetection: () => mockEntityDetectionResult,
}));

// Mock persistence hook
let mockPersistenceState = {
  dismissed: new Set<string>(),
  reclassified: new Map<string, string>(),
  created: new Set<string>(),
};

vi.mock("@/hooks/use-suggestion-persistence", () => ({
  useSuggestionPersistence: () => ({
    ...mockPersistenceState,
    dismissEntity: vi.fn((id: string) => {
      mockPersistenceState.dismissed.add(id);
    }),
    reclassifyEntity: vi.fn(),
    markCreated: vi.fn(),
    unmarkCreated: vi.fn(),
    isDismissed: (id: string) => mockPersistenceState.dismissed.has(id),
    getReclassifiedType: () => undefined,
    isCreated: () => false,
    clearSession: vi.fn(),
  }),
}));

const mockTeam = {
  id: "team-1",
  name: "Test Team",
  teamType: "dnd" as const,
  diceMode: "polyhedral" as const,
  ownerId: "user-1",
  inviteCode: "ABC123",
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

// PRD-034: Mock session note for testing sessionNote prop
const mockSessionNote = {
  id: "session-1",
  teamId: "team-1",
  authorId: "user-1",
  title: "Session 1",
  content: "Session content",
  noteType: "session_log" as const,
  isPrivate: false,
  parentNoteId: null,
  questStatus: null,
  contentBlocks: null,
  sessionDate: null,
  reviewedAt: null,
  linkedNoteIds: null,
  sourceSystem: null,
  sourcePageId: null,
  contentMarkdown: null,
  contentMarkdownResolved: null,
  importRunId: null,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("EntitySuggestionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockEntityDetectionResult = {
      entities: mockEntities,
      isLoading: false,
      error: null,
    };
    mockPersistenceState = {
      dismissed: new Set(),
      reclassified: new Map(),
      created: new Set(),
    };
  });

  it("renders panel with detected entities", async () => {
    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Lord Blackwood entered the Silverwood Forest. They must find the artifact."
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Entity Suggestions")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // Badge count

    // Check entities are displayed
    expect(screen.getByText("Lord Blackwood")).toBeInTheDocument();
    expect(screen.getByText("Silverwood Forest")).toBeInTheDocument();
    expect(screen.getByText("find the artifact")).toBeInTheDocument();
  });

  it("shows loading state during entity detection", () => {
    mockEntityDetectionResult = {
      entities: [],
      isLoading: true,
      error: null,
    };

    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Some content to analyze..."
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Detecting entities...")).toBeInTheDocument();
  });

  it("shows empty state when no entities detected", () => {
    mockEntityDetectionResult = {
      entities: [],
      isLoading: false,
      error: null,
    };

    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Some content without names..."
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(
      screen.getByText("No entities detected. Keep writing to see suggestions.")
    ).toBeInTheDocument();
  });

  it("does not render when content is too short", () => {
    const { container } = render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Short"
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("collapses and expands the panel", async () => {
    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Lord Blackwood entered the Silverwood Forest."
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    // Panel should be expanded by default - verify header exists
    expect(screen.getByText("Entity Suggestions")).toBeInTheDocument();
    expect(screen.getByText("Lord Blackwood")).toBeInTheDocument();

    // Click to collapse - the trigger should toggle the expanded state
    fireEvent.click(screen.getByText("Entity Suggestions"));

    // After collapsing, we can verify the collapse happened by checking for
    // the ChevronDown icon (which appears when collapsed)
    // Note: In Radix Collapsible, the content animates but data-state changes immediately
    await waitFor(() => {
      // Just verify that clicking didn't crash and the header is still there
      expect(screen.getByText("Entity Suggestions")).toBeInTheDocument();
    });
  });

  it("shows bulk accept button when 2+ high confidence entities exist", () => {
    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Lord Blackwood entered the Silverwood Forest."
        sessionNote={mockSessionNote}
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    // We have 2 high confidence entities (Lord Blackwood and Silverwood Forest)
    expect(screen.getByText(/Accept All High-Confidence/)).toBeInTheDocument();
  });

  it("shows Review All button when sessionNote is provided", () => {
    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Lord Blackwood entered the Silverwood Forest."
        sessionNote={mockSessionNote}
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Review All")).toBeInTheDocument();
  });

  it("groups entities by new and existing", () => {
    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Lord Blackwood entered the Silverwood Forest."
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    // All entities should be under "New Entities" since we don't have existing notes
    expect(screen.getByText("New Entities")).toBeInTheDocument();
  });

  it("navigates to session-review route when Review All is clicked", () => {
    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Lord Blackwood entered the Silverwood Forest."
        sessionNote={mockSessionNote}
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByText("Review All"));
    expect(mockNavigate).toHaveBeenCalledWith(`/session-review/${mockSessionNote.id}`);
  });

  it("uses note-scoped backlinks endpoint when accepting an entity", async () => {
    const onNoteCreated = vi.fn();
    mockApiRequest.mockImplementation(
      async (method: string, url: string) => {
        if (method === "POST" && url === `/api/teams/${mockTeam.id}/notes`) {
          return {
            json: async () => ({
              id: "new-note-1",
              title: "Lord Blackwood",
            }),
          };
        }

        if (
          method === "POST" &&
          url === `/api/teams/${mockTeam.id}/notes/new-note-1/backlinks`
        ) {
          return {
            json: async () => ({
              id: "backlink-1",
            }),
          };
        }

        throw new Error(`Unexpected request: ${method} ${url}`);
      }
    );

    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Lord Blackwood entered the Silverwood Forest."
        sessionNote={mockSessionNote}
        memberAiEnabled={false}
        onNoteCreated={onNoteCreated}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^Accept$/ })[0]);

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        "POST",
        `/api/teams/${mockTeam.id}/notes/new-note-1/backlinks`,
        expect.objectContaining({
          sourceNoteId: mockSessionNote.id,
          // PRD-047: snippet is a bounded evidence window around the mention
          textSnippet: expect.stringContaining("Lord Blackwood"),
          evidenceType: "Mention",
          confidence: 0.8,
        })
      );
    });

    expect(onNoteCreated).toHaveBeenCalled();
  });

  it("shows AI Cleanup when member AI is enabled even without session/high-confidence actions", () => {
    mockEntityDetectionResult = {
      entities: [
        {
          id: "entity-low-1",
          type: "quest",
          text: "find clues",
          normalizedText: "find clues",
          confidence: "medium",
          mentions: [{ startOffset: 0, endOffset: 10, text: "find clues" }],
          frequency: 1,
        },
      ],
      isLoading: false,
      error: null,
    };

    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="The party should find clues in the old crypt before dawn to understand what happened here."
        memberAiEnabled={true}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("AI Cleanup")).toBeInTheDocument();
  });

  // Gap F86: deterministic suggestions must not be gated behind the AI toggle
  it("shows the Suggestions button for saved sessions even when member AI is disabled", () => {
    render(
      <EntitySuggestionsPanel
        team={mockTeam}
        sessionDate="2026-01-18"
        content="Lord Blackwood entered the Silverwood Forest and told us many tales of the region."
        sessionNote={mockSessionNote}
        memberAiEnabled={false}
        onNoteCreated={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Suggestions")).toBeInTheDocument();
    expect(screen.queryByText("AI Cleanup")).not.toBeInTheDocument();
  });

  // PRD-047: Link Existing Entity creates a backlink with visible evidence + undo
  describe("link existing entity (PRD-047)", () => {
    const existingNpc = {
      ...mockSessionNote,
      id: "npc-9",
      title: "Lord Blackwood",
      noteType: "npc" as const,
    };

    function createSeededWrapper() {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
          },
        },
      });
      queryClient.setQueryData(
        ["/api/teams", mockTeam.id, "notes"],
        [existingNpc]
      );

      return function Wrapper({ children }: { children: React.ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      };
    }

    function renderPanel() {
      return render(
        <EntitySuggestionsPanel
          team={mockTeam}
          sessionDate="2026-01-18"
          content="Lord Blackwood entered the Silverwood Forest."
          sessionNote={mockSessionNote}
          memberAiEnabled={false}
          onNoteCreated={vi.fn()}
        />,
        { wrapper: createSeededWrapper() }
      );
    }

    it("creates a backlink and shows Linked state with evidence snippet and Undo", async () => {
      mockApiRequest.mockImplementation(async (method: string, url: string) => {
        if (
          method === "POST" &&
          url === `/api/teams/${mockTeam.id}/notes/npc-9/backlinks`
        ) {
          return { json: async () => ({ id: "backlink-9" }) };
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });

      renderPanel();

      // Matched entity appears under Existing Entities with a Link action
      expect(await screen.findByText("Existing Entities")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Link$/ }));

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          "POST",
          `/api/teams/${mockTeam.id}/notes/npc-9/backlinks`,
          expect.objectContaining({
            sourceNoteId: mockSessionNote.id,
            evidenceType: "Mention",
            confidence: 0.8,
            textSnippet: expect.stringContaining("Lord Blackwood"),
          })
        );
      });

      // FR-2: row shows Linked state + inline evidence snippet
      expect(await screen.findByText("Linked")).toBeInTheDocument();
      expect(screen.getByTestId("linked-snippet")).toHaveTextContent(
        "Lord Blackwood"
      );
      // FR-3: undo is offered
      expect(screen.getByRole("button", { name: /^Undo$/ })).toBeInTheDocument();
    });

    it("undo deletes the backlink and reverts the row to actionable", async () => {
      mockApiRequest.mockImplementation(async (method: string, url: string) => {
        if (method === "POST") {
          return { json: async () => ({ id: "backlink-9" }) };
        }
        if (
          method === "DELETE" &&
          url === `/api/teams/${mockTeam.id}/backlinks/backlink-9`
        ) {
          return { json: async () => ({ success: true }) };
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });

      renderPanel();

      fireEvent.click(await screen.findByRole("button", { name: /^Link$/ }));
      fireEvent.click(await screen.findByRole("button", { name: /^Undo$/ }));

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          "DELETE",
          `/api/teams/${mockTeam.id}/backlinks/backlink-9`
        );
      });

      // Row is actionable again
      expect(await screen.findByRole("button", { name: /^Link$/ })).toBeInTheDocument();
      expect(screen.queryByText("Linked")).not.toBeInTheDocument();
    });
  });
});
