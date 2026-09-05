/**
 * @vitest-environment jsdom
 *
 * PRD-048: entity pages show Referenced in Sessions + Relationships with
 * informative empty states, grouping, confidence buckets, and role-gated
 * relationship deletion.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteDetailSections, type NoteDetailResponse } from "./note-detail-sections";
import type { Note, Team } from "@shared/schema";

const mockApiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockTeam = { id: "team-1", name: "Test Team" } as Team;

const mockNote = {
  id: "npc-1",
  teamId: "team-1",
  title: "Kettle",
  noteType: "npc",
  content: "",
} as Note;

let detailFixture: Partial<NoteDetailResponse>;

function renderSections(props?: Partial<Parameters<typeof NoteDetailSections>[0]>) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => detailFixture,
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <NoteDetailSections
        team={mockTeam}
        note={mockNote}
        userId="user-1"
        isDm={false}
        {...props}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockApiRequest.mockReset();
  detailFixture = {
    ...mockNote,
    referencesIn: [],
    referencesOut: [],
    relationships: [],
  };
});

describe("NoteDetailSections empty states (PRD-048 FR-1)", () => {
  it("renders both sections with informative empty states", async () => {
    renderSections();

    expect(await screen.findByText("Referenced in Sessions")).toBeInTheDocument();
    expect(screen.getByText("Relationships")).toBeInTheDocument();
    expect(
      screen.getByText(/Not referenced in any sessions yet/)
    ).toBeInTheDocument();
    expect(screen.getByText(/No relationships yet/)).toBeInTheDocument();
  });
});

describe("NoteDetailSections session references (PRD-048 FR-2/FR-5)", () => {
  beforeEach(() => {
    detailFixture.referencesIn = [
      {
        id: "backlink-1",
        sourceNoteId: "session-1",
        sourceNoteTitle: "Session 2026-06-20",
        sourceNoteType: "session_log",
        sourceNoteSessionDate: "2026-06-20T00:00:00.000Z",
        createdByName: "Ronnie G",
        textSnippet: "Kettle greeted the party warmly.",
        snippetPreview: "Kettle greeted the party warmly.",
        createdAt: "2026-06-20T01:00:00.000Z",
      },
    ] as NoteDetailResponse["referencesIn"];
  });

  it("shows session title, snippet, and author", async () => {
    renderSections();

    expect(await screen.findByText("Session 2026-06-20")).toBeInTheDocument();
    expect(
      screen.getByText(/"Kettle greeted the party warmly."/)
    ).toBeInTheDocument();
    expect(screen.getByText(/added by Ronnie G/)).toBeInTheDocument();
  });

  it("navigates to the session note when clicked", async () => {
    const onOpenNote = vi.fn();
    renderSections({ onOpenNote });

    fireEvent.click(await screen.findByText("Session 2026-06-20"));
    expect(onOpenNote).toHaveBeenCalledWith("session-1", undefined);
  });

  // P2-2 (PRD-005 FR-3): offsets travel with the navigation for scroll-to-mention
  it("passes mention offsets with the navigation when the backlink has them", async () => {
    detailFixture.referencesIn = [
      {
        ...(detailFixture.referencesIn![0] as object),
        startOffset: 42,
        endOffset: 48,
      },
    ] as NoteDetailResponse["referencesIn"];
    const onOpenNote = vi.fn();
    renderSections({ onOpenNote });

    fireEvent.click(await screen.findByText("Session 2026-06-20"));
    expect(onOpenNote).toHaveBeenCalledWith("session-1", { start: 42, end: 48 });
  });
});

describe("NoteDetailSections relationships (PRD-048 FR-3)", () => {
  beforeEach(() => {
    detailFixture.relationships = [
      {
        id: "rel-1",
        fromNoteId: "quest-1",
        toNoteId: "npc-1",
        relationshipType: "QuestHasNPC",
        evidenceType: "Heuristic",
        evidenceSnippet: "Kettle asked us to find the relic",
        confidence: 0.72,
        createdByUserId: "user-2",
        fromNote: { id: "quest-1", title: "Find the Relic", noteType: "quest" },
        toNote: { id: "npc-1", title: "Kettle", noteType: "npc" },
      },
    ] as NoteDetailResponse["relationships"];
  });

  it("groups by relationship type and shows evidence + confidence bucket", async () => {
    renderSections();

    expect(await screen.findByText("Quest ↔ NPC")).toBeInTheDocument();
    expect(screen.getByText("Find the Relic")).toBeInTheDocument();
    expect(screen.getByText("Heuristic")).toBeInTheDocument();
    // 0.72 buckets as REVIEW -> "Needs review"
    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });

  it("hides the delete action for non-creator non-DM members", async () => {
    renderSections({ userId: "user-1", isDm: false });

    await screen.findByText("Find the Relic");
    expect(
      screen.queryByRole("button", { name: /remove relationship/i })
    ).not.toBeInTheDocument();
  });

  it("lets the creator delete the relationship", async () => {
    mockApiRequest.mockResolvedValue({});
    renderSections({ userId: "user-2", isDm: false });

    fireEvent.click(
      await screen.findByRole("button", { name: /remove relationship/i })
    );

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        "DELETE",
        `/api/teams/${mockTeam.id}/relationships/rel-1`
      );
    });
  });

  // Gap F64/F89 (PRD-016): pending AI edges are badged, rejected ones hidden
  it("badges pending AI-enrichment edges and hides rejected ones", async () => {
    detailFixture.relationships = [
      {
        id: "rel-pending",
        fromNoteId: "quest-1",
        toNoteId: "npc-1",
        relationshipType: "QuestHasNPC",
        evidenceType: "Heuristic",
        evidenceSnippet: null,
        confidence: 0.7,
        createdByUserId: "user-2",
        status: "pending",
        fromNote: { id: "quest-1", title: "Pending Quest", noteType: "quest" },
        toNote: { id: "npc-1", title: "Kettle", noteType: "npc" },
      },
      {
        id: "rel-rejected",
        fromNoteId: "quest-2",
        toNoteId: "npc-1",
        relationshipType: "QuestHasNPC",
        evidenceType: "Heuristic",
        evidenceSnippet: null,
        confidence: 0.7,
        createdByUserId: "user-2",
        status: "rejected",
        fromNote: { id: "quest-2", title: "Rejected Quest", noteType: "quest" },
        toNote: { id: "npc-1", title: "Kettle", noteType: "npc" },
      },
    ] as NoteDetailResponse["relationships"];

    renderSections();

    expect(await screen.findByText("Pending Quest")).toBeInTheDocument();
    expect(screen.getByText("Pending AI review")).toBeInTheDocument();
    expect(screen.queryByText("Rejected Quest")).not.toBeInTheDocument();
  });

  it("lets the DM delete the relationship", async () => {
    mockApiRequest.mockResolvedValue({});
    renderSections({ userId: "user-1", isDm: true });

    expect(
      await screen.findByRole("button", { name: /remove relationship/i })
    ).toBeInTheDocument();
  });
});
