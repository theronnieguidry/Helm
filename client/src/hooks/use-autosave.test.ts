/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutosave } from "./use-autosave";

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with idle status", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutosave({
        data: { content: "initial" },
        onSave,
      })
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.lastSavedAt).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it("should not save on initial render", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useAutosave({
        data: { content: "initial" },
        onSave,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("should trigger save after debounce when data changes", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          debounceMs: 2000,
        }),
      { initialProps: { data: { content: "initial" } } }
    );

    // Change the data
    rerender({ data: { content: "updated" } });

    // Status should be pending
    expect(result.current.status).toBe("pending");
    expect(result.current.isPending).toBe(true);

    // Advance time less than debounce
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSave).not.toHaveBeenCalled();

    // Advance time past debounce
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ content: "updated" });
  });

  it("should reset debounce timer on rapid changes", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          debounceMs: 2000,
        }),
      { initialProps: { data: { content: "initial" } } }
    );

    // Make multiple rapid changes
    rerender({ data: { content: "change1" } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    rerender({ data: { content: "change2" } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    rerender({ data: { content: "change3" } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Still should not have saved
    expect(onSave).not.toHaveBeenCalled();

    // Wait for full debounce after last change
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Should save only once with the latest data
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ content: "change3" });
  });

  it("should respect maxWaitMs for rapid continuous changes", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          debounceMs: 2000,
          maxWaitMs: 5000,
        }),
      { initialProps: { data: { content: "initial" } } }
    );

    // Make changes every 1 second for 6 seconds
    for (let i = 1; i <= 6; i++) {
      rerender({ data: { content: `change${i}` } });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }

    // Should have saved at least once due to maxWait
    expect(onSave).toHaveBeenCalled();
  });

  it("should update status to saving during save", async () => {
    let resolvePromise: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    const onSave = vi.fn().mockReturnValue(savePromise);

    const { result, rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          debounceMs: 1000,
        }),
      { initialProps: { data: { content: "initial" } } }
    );

    rerender({ data: { content: "updated" } });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.status).toBe("saving");
    expect(result.current.isPending).toBe(true);

    // Resolve the save
    await act(async () => {
      resolvePromise!();
    });

    expect(result.current.status).toBe("saved");
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it("should set error status on save failure", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Save failed"));

    const { result, rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          debounceMs: 1000,
        }),
      { initialProps: { data: { content: "initial" } } }
    );

    rerender({ data: { content: "updated" } });

    // Advance past debounce and let promises resolve
    await act(async () => {
      vi.advanceTimersByTime(1500);
      // Allow rejected promise to be caught
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("error");
  });

  it("should not save when disabled", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { rerender } = renderHook(
      ({ data, enabled }) =>
        useAutosave({
          data,
          onSave,
          debounceMs: 1000,
          enabled,
        }),
      { initialProps: { data: { content: "initial" }, enabled: false } }
    );

    rerender({ data: { content: "updated" }, enabled: false });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("should allow manual save via save function", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAutosave({
        data: { content: "test" },
        onSave,
        debounceMs: 2000,
      })
    );

    await act(async () => {
      await result.current.save();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
  });

  it("should not trigger save if data is same as previous", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const data = { content: "same" };

    const { rerender } = renderHook(
      ({ data }) =>
        useAutosave({
          data,
          onSave,
          debounceMs: 1000,
        }),
      { initialProps: { data } }
    );

    // Rerender with same data reference
    rerender({ data });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(onSave).not.toHaveBeenCalled();
  });
});
