import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import type { NoteType } from "@shared/schema";

interface StoredSuggestionState {
  version: 1;
  dismissed: string[];
  reclassified: [string, NoteType][];
  created: string[];
  timestamp: number;
}

interface UseSuggestionPersistenceOptions {
  teamId: string;
  sessionDate?: string; // YYYY-MM-DD format, defaults to today
  enabled?: boolean;
}

interface UseSuggestionPersistenceResult {
  dismissed: Set<string>;
  reclassified: Map<string, NoteType>;
  created: Set<string>;
  dismissEntity: (entityId: string) => void;
  reclassifyEntity: (entityId: string, newType: NoteType) => void;
  markCreated: (entityId: string) => void;
  isDismissed: (entityId: string) => boolean;
  getReclassifiedType: (entityId: string) => NoteType | undefined;
  isCreated: (entityId: string) => boolean;
  clearSession: () => void;
}

const STORAGE_KEY_PREFIX = "suggestions:";
const MAX_AGE_DAYS = 7;

function getStorageKey(teamId: string, sessionDate: string): string {
  return `${STORAGE_KEY_PREFIX}${teamId}:${sessionDate}`;
}

function cleanupOldSessions(teamId: string, currentDate: string): void {
  try {
    const keysToRemove: string[] = [];
    const prefix = `${STORAGE_KEY_PREFIX}${teamId}:`;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && !key.endsWith(currentDate)) {
        // Parse the date from the key and check if it's too old
        const dateStr = key.slice(prefix.length);
        const keyDate = new Date(dateStr);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - keyDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff > MAX_AGE_DAYS || isNaN(daysDiff)) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    // Ignore localStorage errors
  }
}

function loadState(key: string): StoredSuggestionState | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as StoredSuggestionState;
    if (parsed.version !== 1) return null;

    return parsed;
  } catch {
    return null;
  }
}

function saveState(key: string, state: {
  dismissed: Set<string>;
  reclassified: Map<string, NoteType>;
  created: Set<string>;
}): void {
  try {
    const stored: StoredSuggestionState = {
      version: 1,
      dismissed: Array.from(state.dismissed),
      reclassified: Array.from(state.reclassified.entries()),
      created: Array.from(state.created),
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Ignore localStorage errors (quota exceeded, etc.)
  }
}

/**
 * Hook for persisting entity suggestion state (dismissed, reclassified, created)
 * across browser sessions within the same day.
 *
 * State is stored in localStorage keyed by teamId and session date.
 * Old sessions (>7 days) are automatically cleaned up.
 */
export function useSuggestionPersistence({
  teamId,
  sessionDate,
  enabled = true,
}: UseSuggestionPersistenceOptions): UseSuggestionPersistenceResult {
  const currentDate = sessionDate || format(new Date(), "yyyy-MM-dd");
  const storageKey = getStorageKey(teamId, currentDate);

  // Initialize state from localStorage
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (!enabled) return new Set();
    const stored = loadState(storageKey);
    return stored ? new Set(stored.dismissed) : new Set();
  });

  const [reclassified, setReclassified] = useState<Map<string, NoteType>>(() => {
    if (!enabled) return new Map();
    const stored = loadState(storageKey);
    return stored ? new Map(stored.reclassified) : new Map();
  });

  const [created, setCreated] = useState<Set<string>>(() => {
    if (!enabled) return new Set();
    const stored = loadState(storageKey);
    return stored ? new Set(stored.created) : new Set();
  });

  // Cleanup old sessions on mount
  useEffect(() => {
    if (enabled && teamId) {
      cleanupOldSessions(teamId, currentDate);
    }
  }, [enabled, teamId, currentDate]);

  // Persist state changes
  useEffect(() => {
    if (enabled && teamId) {
      saveState(storageKey, { dismissed, reclassified, created });
    }
  }, [enabled, teamId, storageKey, dismissed, reclassified, created]);

  const dismissEntity = useCallback((entityId: string) => {
    setDismissed(prev => new Set([...prev, entityId]));
  }, []);

  const reclassifyEntity = useCallback((entityId: string, newType: NoteType) => {
    setReclassified(prev => new Map([...prev, [entityId, newType]]));
  }, []);

  const markCreated = useCallback((entityId: string) => {
    setCreated(prev => new Set([...prev, entityId]));
  }, []);

  const isDismissed = useCallback((entityId: string) => {
    return dismissed.has(entityId);
  }, [dismissed]);

  const getReclassifiedType = useCallback((entityId: string): NoteType | undefined => {
    return reclassified.get(entityId);
  }, [reclassified]);

  const isCreated = useCallback((entityId: string) => {
    return created.has(entityId);
  }, [created]);

  const clearSession = useCallback(() => {
    setDismissed(new Set());
    setReclassified(new Map());
    setCreated(new Set());
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
  }, [storageKey]);

  return {
    dismissed,
    reclassified,
    created,
    dismissEntity,
    reclassifyEntity,
    markCreated,
    isDismissed,
    getReclassifiedType,
    isCreated,
    clearSession,
  };
}
