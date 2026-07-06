/**
 * @vitest-environment jsdom
 *
 * P0-4 (F55): Import Management mounts the EnrichmentReviewDialog so users
 * can review pending AI enrichment suggestions. The "AI suggestions" action
 * uses POST /enrich for discovery: a 400 response returns the existing run's
 * id (review path); an OK response means a new enrichment run was started.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportManagement } from "./import-management";

const mockInvalidateQueries = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
  apiRequest: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

// jsdom polyfills for Radix primitives used by the dialog
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverMock;
Element.prototype.scrollIntoView = vi.fn();
(Element.prototype as any).hasPointerCapture = vi.fn();
(Element.prototype as any).setPointerCapture = vi.fn();
(Element.prototype as any).releasePointerCapture = vi.fn();

const completedImport = {
  id: "imp-1",
  teamId: "team-1",
  sourceSystem: "NUCLINO",
  createdByUserId: "user-1",
  status: "completed",
  options: { importEmptyPages: false, defaultVisibility: "team" },
  stats: {
    totalPagesDetected: 3,
    notesCreated: 3,
    notesUpdated: 0,
    notesSkipped: 0,
    emptyPagesImported: 0,
    linksResolved: 1,
    warningsCount: 0,
  },
  createdAt: "2026-06-01T12:00:00.000Z",
  importerName: "Ronnie G",
};

const failedImport = {
  ...completedImport,
  id: "imp-2",
  status: "failed",
};

const completedEnrichment = {
  id: "enr-1",
  status: "completed",
  totals: {
    notesProcessed: 3,
    classificationsCreated: 1,
    relationshipsFound: 0,
    highConfidenceCount: 1,
    lowConfidenceCount: 0,
    userReviewRequired: 0,
  },
  classifications: [
    {
      id: "cls-1",
      noteId: "note-1",
      noteTitle: "Kettle",
      inferredType: "Person",
      confidence: 0.9,
      explanation: "Named character with dialogue",
      status: "pending",
    },
  ],
  relationships: [],
};

let importsFixture: unknown[];
let enrichPostResponse: { body: unknown; status: number };
let enrichmentFixture: unknown;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || "GET";

  if (url === "/api/teams/team-1/imports" && method === "GET") {
    return jsonResponse(importsFixture);
  }
  if (/\/imports\/[^/]+\/enrich$/.test(url) && method === "POST") {
    return jsonResponse(enrichPostResponse.body, enrichPostResponse.status);
  }
  if (url.includes("/enrichments/") && method === "GET") {
    return jsonResponse(enrichmentFixture);
  }
  throw new Error(`Unexpected fetch: ${method} ${url}`);
});
(globalThis as any).fetch = fetchMock;

function renderImportManagement() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ImportManagement teamId="team-1" isDM={true} currentUserId="user-1" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvalidateQueries.mockReset();
  mockToast.mockReset();
  fetchMock.mockClear();
  importsFixture = [completedImport];
  enrichPostResponse = {
    body: {
      message: "Enrichment already exists for this import",
      enrichmentRunId: "enr-1",
      status: "completed",
    },
    status: 400,
  };
  enrichmentFixture = completedEnrichment;
});

describe("ImportManagement AI suggestions button (P0-4)", () => {
  it("renders the Review AI suggestions button on completed import rows", async () => {
    renderImportManagement();

    expect(
      await screen.findByRole("button", { name: /review ai suggestions/i })
    ).toBeInTheDocument();
  });

  it("does not render the button when no reviewable import exists (failed import)", async () => {
    importsFixture = [failedImport];
    renderImportManagement();

    // Row rendered but no AI suggestions action
    expect(await screen.findByText("NUCLINO")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /review ai suggestions/i })
    ).not.toBeInTheDocument();
  });

  it("opens the EnrichmentReviewDialog for an existing enrichment run", async () => {
    renderImportManagement();

    fireEvent.click(
      await screen.findByRole("button", { name: /review ai suggestions/i })
    );

    // Dialog opens on the review view with the fixture classification
    expect(await screen.findByText("Review AI Suggestions")).toBeInTheDocument();
    expect(screen.getByText("Kettle")).toBeInTheDocument();
    expect(screen.getByText(/Classifications \(1\)/)).toBeInTheDocument();

    // Discovery used POST /enrich and then fetched the existing run
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teams/team-1/imports/imp-1/enrich",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teams/team-1/enrichments/enr-1",
      expect.objectContaining({ credentials: "include" })
    );

    // No "started" toast on the review path
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("starts a new enrichment and shows progress when none exists yet", async () => {
    enrichPostResponse = {
      body: { enrichmentRunId: "enr-2", status: "pending" },
      status: 200,
    };
    enrichmentFixture = {
      id: "enr-2",
      status: "pending",
      totals: null,
      classifications: [],
      relationships: [],
    };
    renderImportManagement();

    fireEvent.click(
      await screen.findByRole("button", { name: /review ai suggestions/i })
    );

    expect(
      await screen.findByText("AI Enhancement in Progress")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "AI enrichment started" })
      );
    });
  });

  it("invalidates needs-review and notes queries when the dialog closes", async () => {
    renderImportManagement();

    fireEvent.click(
      await screen.findByRole("button", { name: /review ai suggestions/i })
    );
    await screen.findByText("Review AI Suggestions");

    fireEvent.click(screen.getByRole("button", { name: /done reviewing/i }));

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["/api/teams", "team-1", "notes", "needs-review"],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["/api/teams", "team-1", "notes"],
      });
    });
    expect(screen.queryByText("Review AI Suggestions")).not.toBeInTheDocument();
  });

  it("shows an error toast and no dialog when AI is unavailable", async () => {
    enrichPostResponse = {
      body: { message: "AI features require a subscription" },
      status: 403,
    };
    renderImportManagement();

    fireEvent.click(
      await screen.findByRole("button", { name: /review ai suggestions/i })
    );

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "AI features require a subscription",
        })
      );
    });
    expect(screen.queryByText("Review AI Suggestions")).not.toBeInTheDocument();
  });
});
