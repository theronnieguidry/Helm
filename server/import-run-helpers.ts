/**
 * P2-4 "Import-run truthfulness" helpers (NOTE_TAKING_GAP_REPORT F50/F51).
 *
 * Pure/lightweight helpers extracted from the Nuclino commit endpoint so the
 * stats and status lifecycle logic can be unit-tested without registering the
 * heavy import endpoints in the test harness.
 */
import type { ImportRun, InsertImportRun, ImportRunStats } from "@shared/schema";

/** Minimal structural slice of IStorage needed to finalize an import run. */
export interface ImportRunStatusStore {
  updateImportRun(id: string, data: Partial<InsertImportRun>): Promise<ImportRun>;
}

/** Page shape needed for empty-page selection math. */
export interface SelectablePage {
  sourcePageId: string;
  isEmpty: boolean;
}

export interface EmptyPageSelectionOptions {
  excludedEmptyPageIds?: unknown;
  importEmptyPages?: boolean;
}

export interface EmptyPageSelection {
  excludedEmptyPageIds: Set<string>;
  /**
   * F50: true only when zero empty pages were actually excluded. Ids in the
   * exclusion list that do not match an empty page in the plan do not count.
   */
  importEmptyPages: boolean;
}

/**
 * PRD-042 / F50: Resolve which empty pages are excluded from an import.
 * Supports the granular `excludedEmptyPageIds` format with backward
 * compatibility for the legacy `importEmptyPages` boolean.
 */
export function resolveEmptyPageSelection(
  pages: SelectablePage[],
  options?: EmptyPageSelectionOptions,
): EmptyPageSelection {
  let excludedEmptyPageIds: Set<string>;

  if (options?.excludedEmptyPageIds && Array.isArray(options.excludedEmptyPageIds)) {
    // New format: explicit list of empty page IDs to exclude
    excludedEmptyPageIds = new Set(options.excludedEmptyPageIds as string[]);
  } else {
    // Legacy format: boolean importEmptyPages (defaults to true)
    const legacyImportEmptyPages = options?.importEmptyPages !== false;
    excludedEmptyPageIds = legacyImportEmptyPages
      ? new Set()
      : new Set(pages.filter(p => p.isEmpty).map(p => p.sourcePageId));
  }

  // F50: derive importEmptyPages from pages that are ACTUALLY excluded, not
  // from the raw size of the exclusion list.
  const excludedEmptyCount = pages.filter(
    p => p.isEmpty && excludedEmptyPageIds.has(p.sourcePageId),
  ).length;

  return {
    excludedEmptyPageIds,
    importEmptyPages: excludedEmptyCount === 0,
  };
}

/** PRD-042: Filter the plan's pages down to those that will be imported. */
export function filterPagesToImport<T extends SelectablePage>(
  pages: T[],
  excludedEmptyPageIds: Set<string>,
): T[] {
  return pages.filter(p => !p.isEmpty || !excludedEmptyPageIds.has(p.sourcePageId));
}

/**
 * F51: Mark an import run as truthfully completed, persisting final stats.
 * Call this only after all note-writing work has finished.
 */
export async function completeImportRun(
  storage: ImportRunStatusStore,
  importRunId: string,
  stats: ImportRunStats,
): Promise<ImportRun> {
  return storage.updateImportRun(importRunId, { stats, status: "completed" });
}

/**
 * F51: Mark an import run as failed, keeping whatever stats were gathered
 * before the crash. Never throws — the caller is already on an error path
 * and still needs to send its 500 response.
 */
export async function markImportRunFailed(
  storage: ImportRunStatusStore,
  importRunId: string,
  stats: ImportRunStats,
): Promise<void> {
  try {
    await storage.updateImportRun(importRunId, { stats, status: "failed" });
  } catch (err) {
    console.error(`Failed to mark import run ${importRunId} as failed:`, err);
  }
}
