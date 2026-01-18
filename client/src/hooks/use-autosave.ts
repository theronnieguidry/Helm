import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface UseAutosaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  debounceMs?: number;
  maxWaitMs?: number;
  enabled?: boolean;
}

interface UseAutosaveResult {
  status: SaveStatus;
  lastSavedAt: Date | null;
  save: () => Promise<void>;
  isPending: boolean;
}

/**
 * Hook for autosaving data with debounce and max wait time.
 *
 * @param data - The data to save
 * @param onSave - Async function to call when saving
 * @param debounceMs - Time to wait after last change before saving (default: 2000ms)
 * @param maxWaitMs - Maximum time between saves regardless of activity (default: 15000ms)
 * @param enabled - Whether autosave is enabled (default: true)
 */
export function useAutosave<T>({
  data,
  onSave,
  debounceMs = 2000,
  maxWaitMs = 15000,
  enabled = true,
}: UseAutosaveOptions<T>): UseAutosaveResult {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveTimeRef = useRef<number>(Date.now());
  const dataRef = useRef<T>(data);
  const isSavingRef = useRef(false);
  const pendingDataRef = useRef<T | null>(null);

  // Keep dataRef in sync with latest data
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const performSave = useCallback(async () => {
    if (isSavingRef.current) {
      // If already saving, queue this save
      pendingDataRef.current = dataRef.current;
      return;
    }

    isSavingRef.current = true;
    setStatus("saving");

    try {
      await onSave(dataRef.current);
      setStatus("saved");
      setLastSavedAt(new Date());
      lastSaveTimeRef.current = Date.now();

      // If there was a pending save, execute it
      if (pendingDataRef.current !== null) {
        const pendingData = pendingDataRef.current;
        pendingDataRef.current = null;
        isSavingRef.current = false;
        dataRef.current = pendingData;
        await performSave();
        return;
      }
    } catch (error) {
      setStatus("error");
      console.error("Autosave failed:", error);
    } finally {
      isSavingRef.current = false;
    }
  }, [onSave]);

  const scheduleSave = useCallback(() => {
    if (!enabled) return;

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setStatus("pending");

    // Set up debounce timer
    debounceTimerRef.current = setTimeout(() => {
      performSave();
      // Clear max wait timer since we're saving
      if (maxWaitTimerRef.current) {
        clearTimeout(maxWaitTimerRef.current);
        maxWaitTimerRef.current = null;
      }
    }, debounceMs);

    // Set up max wait timer if not already set
    if (!maxWaitTimerRef.current) {
      const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
      const remainingMaxWait = Math.max(0, maxWaitMs - timeSinceLastSave);

      maxWaitTimerRef.current = setTimeout(() => {
        // Clear debounce timer and save immediately
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        performSave();
        maxWaitTimerRef.current = null;
      }, remainingMaxWait);
    }
  }, [enabled, debounceMs, maxWaitMs, performSave]);

  // Track data changes and schedule saves
  const isFirstRender = useRef(true);
  const previousDataRef = useRef<T>(data);

  useEffect(() => {
    // Skip first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      previousDataRef.current = data;
      return;
    }

    // Check if data actually changed (deep comparison for objects)
    const dataChanged = JSON.stringify(data) !== JSON.stringify(previousDataRef.current);
    previousDataRef.current = data;

    if (dataChanged && enabled) {
      scheduleSave();
    }
  }, [data, enabled, scheduleSave]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (maxWaitTimerRef.current) {
        clearTimeout(maxWaitTimerRef.current);
      }
    };
  }, []);

  // Manual save function
  const save = useCallback(async () => {
    // Clear pending timers
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
    await performSave();
  }, [performSave]);

  return {
    status,
    lastSavedAt,
    save,
    isPending: status === "pending" || status === "saving",
  };
}
