/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSuggestionPersistence } from "./use-suggestion-persistence";

describe("useSuggestionPersistence", () => {
  const mockLocalStorage: Record<string, string> = {};

  beforeEach(() => {
    // Clear mock storage before each test
    Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);

    // Mock localStorage
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key: string) => mockLocalStorage[key] || null
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      (key: string, value: string) => {
        mockLocalStorage[key] = value;
      }
    );
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(
      (key: string) => {
        delete mockLocalStorage[key];
      }
    );
    vi.spyOn(Storage.prototype, "key").mockImplementation((index: number) => {
      return Object.keys(mockLocalStorage)[index] || null;
    });
    Object.defineProperty(Storage.prototype, "length", {
      get: () => Object.keys(mockLocalStorage).length,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should start with empty state when no localStorage data", () => {
    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    expect(result.current.dismissed.size).toBe(0);
    expect(result.current.reclassified.size).toBe(0);
    expect(result.current.created.size).toBe(0);
  });

  it("should load persisted state from localStorage on mount", () => {
    // Pre-populate localStorage
    mockLocalStorage["suggestions:team-1:2026-01-18"] = JSON.stringify({
      version: 1,
      dismissed: ["entity-1", "entity-2"],
      reclassified: [["entity-3", "area"]],
      created: ["entity-4"],
      timestamp: Date.now(),
    });

    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    expect(result.current.dismissed.has("entity-1")).toBe(true);
    expect(result.current.dismissed.has("entity-2")).toBe(true);
    expect(result.current.reclassified.get("entity-3")).toBe("area");
    expect(result.current.created.has("entity-4")).toBe(true);
  });

  it("should dismiss entity and persist to localStorage", () => {
    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    act(() => {
      result.current.dismissEntity("entity-1");
    });

    expect(result.current.dismissed.has("entity-1")).toBe(true);
    expect(result.current.isDismissed("entity-1")).toBe(true);

    // Check localStorage was updated
    const stored = JSON.parse(mockLocalStorage["suggestions:team-1:2026-01-18"]);
    expect(stored.dismissed).toContain("entity-1");
  });

  it("should reclassify entity and persist to localStorage", () => {
    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    act(() => {
      result.current.reclassifyEntity("entity-1", "quest");
    });

    expect(result.current.reclassified.get("entity-1")).toBe("quest");
    expect(result.current.getReclassifiedType("entity-1")).toBe("quest");

    // Check localStorage was updated
    const stored = JSON.parse(mockLocalStorage["suggestions:team-1:2026-01-18"]);
    expect(stored.reclassified).toContainEqual(["entity-1", "quest"]);
  });

  it("should mark entity as created and persist to localStorage", () => {
    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    act(() => {
      result.current.markCreated("entity-1");
    });

    expect(result.current.created.has("entity-1")).toBe(true);
    expect(result.current.isCreated("entity-1")).toBe(true);

    // Check localStorage was updated
    const stored = JSON.parse(mockLocalStorage["suggestions:team-1:2026-01-18"]);
    expect(stored.created).toContain("entity-1");
  });

  it("should return false for isDismissed when entity not dismissed", () => {
    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    expect(result.current.isDismissed("unknown-entity")).toBe(false);
  });

  it("should return undefined for getReclassifiedType when not reclassified", () => {
    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    expect(result.current.getReclassifiedType("unknown-entity")).toBeUndefined();
  });

  it("should clear session state", () => {
    // Pre-populate localStorage
    mockLocalStorage["suggestions:team-1:2026-01-18"] = JSON.stringify({
      version: 1,
      dismissed: ["entity-1"],
      reclassified: [["entity-2", "area"]],
      created: ["entity-3"],
      timestamp: Date.now(),
    });

    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    // Verify state was loaded
    expect(result.current.dismissed.size).toBe(1);

    act(() => {
      result.current.clearSession();
    });

    expect(result.current.dismissed.size).toBe(0);
    expect(result.current.reclassified.size).toBe(0);
    expect(result.current.created.size).toBe(0);
    // After clearing, either no localStorage entry or empty state entry is acceptable
    const stored = mockLocalStorage["suggestions:team-1:2026-01-18"];
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.dismissed).toEqual([]);
      expect(parsed.reclassified).toEqual([]);
      expect(parsed.created).toEqual([]);
    }
  });

  it("should handle corrupted localStorage gracefully", () => {
    mockLocalStorage["suggestions:team-1:2026-01-18"] = "not valid json";

    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    // Should start with empty state
    expect(result.current.dismissed.size).toBe(0);
  });

  it("should handle wrong version gracefully", () => {
    mockLocalStorage["suggestions:team-1:2026-01-18"] = JSON.stringify({
      version: 99, // Unknown version
      dismissed: ["entity-1"],
      reclassified: [],
      created: [],
      timestamp: Date.now(),
    });

    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    // Should start with empty state due to version mismatch
    expect(result.current.dismissed.size).toBe(0);
  });

  it("should isolate state between different teams", () => {
    mockLocalStorage["suggestions:team-1:2026-01-18"] = JSON.stringify({
      version: 1,
      dismissed: ["entity-from-team-1"],
      reclassified: [],
      created: [],
      timestamp: Date.now(),
    });

    const { result: result1 } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    const { result: result2 } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-2",
        sessionDate: "2026-01-18",
      })
    );

    expect(result1.current.isDismissed("entity-from-team-1")).toBe(true);
    expect(result2.current.isDismissed("entity-from-team-1")).toBe(false);
  });

  it("should isolate state between different session dates", () => {
    mockLocalStorage["suggestions:team-1:2026-01-18"] = JSON.stringify({
      version: 1,
      dismissed: ["entity-from-jan-18"],
      reclassified: [],
      created: [],
      timestamp: Date.now(),
    });

    const { result: result1 } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
      })
    );

    const { result: result2 } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-19",
      })
    );

    expect(result1.current.isDismissed("entity-from-jan-18")).toBe(true);
    expect(result2.current.isDismissed("entity-from-jan-18")).toBe(false);
  });

  it("should not persist when disabled", () => {
    const { result } = renderHook(() =>
      useSuggestionPersistence({
        teamId: "team-1",
        sessionDate: "2026-01-18",
        enabled: false,
      })
    );

    act(() => {
      result.current.dismissEntity("entity-1");
    });

    // State should update locally
    expect(result.current.isDismissed("entity-1")).toBe(true);

    // But localStorage should not be updated
    expect(mockLocalStorage["suggestions:team-1:2026-01-18"]).toBeUndefined();
  });
});
