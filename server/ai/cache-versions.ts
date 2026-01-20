/**
 * PRD-043: AI Algorithm Version Tracking
 *
 * This module tracks the versions of AI prompts/algorithms used for classification
 * and relationship extraction. When prompts are improved, bump the version to
 * automatically invalidate stale cache entries.
 *
 * Version Bump Process:
 * 1. Increment the `current` version for the affected operation
 * 2. Add an entry to `history` with the new version and description
 * 3. Old cache entries will automatically miss (different version in key)
 */

export const AI_ALGORITHM_VERSIONS = {
  classification: {
    current: "1.0.0",
    history: [
      {
        version: "1.0.0",
        date: "2026-01-19",
        description: "Initial caching implementation with content hash normalization",
      },
    ],
  },
  relationship: {
    current: "1.0.0",
    history: [
      {
        version: "1.0.0",
        date: "2026-01-19",
        description: "Initial caching implementation with order-independent pair hashing",
      },
    ],
  },
} as const;

export type OperationType = keyof typeof AI_ALGORITHM_VERSIONS;

/**
 * Get the current algorithm version for a given operation type.
 * This version is used as part of the cache key.
 */
export function getCurrentVersion(operationType: OperationType): string {
  return AI_ALGORITHM_VERSIONS[operationType].current;
}

/**
 * Get the version history for a given operation type.
 * Useful for debugging and admin interfaces.
 */
export function getVersionHistory(
  operationType: OperationType
): readonly { version: string; date: string; description: string }[] {
  return AI_ALGORITHM_VERSIONS[operationType].history;
}

/**
 * Check if a given version is the current version.
 * Returns false for outdated versions (cache miss).
 */
export function isCurrentVersion(operationType: OperationType, version: string): boolean {
  return AI_ALGORITHM_VERSIONS[operationType].current === version;
}
