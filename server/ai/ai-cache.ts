/**
 * PRD-043: AI Enrichment Result Caching
 *
 * This module provides caching for AI classification and relationship extraction
 * results to reduce API costs when re-importing unchanged content.
 *
 * Key features:
 * - Content-based cache keys using SHA-256 hashing
 * - Algorithm version tracking for automatic invalidation
 * - Team-scoped isolation (no global cache sharing)
 * - 30-day TTL with configurable expiration
 */

import { createHash } from "crypto";
import type { IStorage } from "../storage";
import type {
  NoteForClassification,
  NoteWithClassification,
  ClassificationResult,
  RelationshipResult,
} from "./ai-provider";
import { getCurrentVersion, type OperationType } from "./cache-versions";
import type { AICacheStats, InsertAICacheEntry } from "@shared/schema";

/** Default cache TTL: 30 days in milliseconds */
const DEFAULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Model ID used for cache entries */
const MODEL_ID = "claude-3-haiku-20240307";

/**
 * Generate SHA-256 hash of input string
 */
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Normalize content for consistent hashing.
 * - Trim whitespace
 * - Convert to lowercase
 * - Collapse multiple whitespace to single space
 * - Remove markdown formatting characters
 * - Limit content length to 2000 chars (matches classification truncation)
 */
function normalizeForHash(title: string, content: string): string {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedContent = content
    .slice(0, 2000)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[#*_\[\]`]/g, "");

  return `${normalizedTitle}::${normalizedContent}`;
}

/**
 * Generate cache key components for a classification request.
 *
 * The key includes:
 * - contentHash: Hash of normalized title + content
 * - contextHash: Hash of sorted PC names (affects Character vs NPC classification)
 * - algorithmVersion: Current version of classification algorithm
 */
export function generateClassificationCacheKey(
  note: NoteForClassification,
  pcNames: string[],
  algorithmVersion: string
): { contentHash: string; contextHash: string; algorithmVersion: string } {
  const contentHash = sha256(normalizeForHash(note.title, note.content));

  // PC names affect Character vs NPC classification
  const sortedPCNames = [...pcNames].sort().map((n) => n.toLowerCase());
  const contextHash = sha256(sortedPCNames.join("|") || "no-pc-context");

  return { contentHash, contextHash, algorithmVersion };
}

/**
 * Generate cache key components for a relationship extraction request.
 *
 * The key includes:
 * - pairHash: Order-independent hash of both notes
 * - algorithmVersion: Current version of relationship algorithm
 */
export function generateRelationshipCacheKey(
  fromNote: NoteWithClassification,
  toNote: NoteWithClassification,
  algorithmVersion: string
): { pairHash: string; algorithmVersion: string } {
  // Create order-independent pair hash
  const hash1 = sha256(normalizeForHash(fromNote.title, fromNote.content));
  const hash2 = sha256(normalizeForHash(toNote.title, toNote.content));
  const sortedHashes = [hash1, hash2].sort();
  const pairHash = sha256(sortedHashes.join("::"));

  return { pairHash, algorithmVersion };
}

/**
 * AI Cache Service
 *
 * Provides caching functionality for AI classification and relationship extraction.
 * All operations are team-scoped for data isolation.
 */
export class AICache {
  constructor(private storage: IStorage) {}

  /**
   * Get a cached classification result for a note.
   * Returns null if not found or expired.
   */
  async getClassification(
    note: NoteForClassification,
    pcNames: string[],
    teamId: string
  ): Promise<ClassificationResult | null> {
    const version = getCurrentVersion("classification");
    const { contentHash, contextHash } = generateClassificationCacheKey(
      note,
      pcNames,
      version
    );

    const entry = await this.storage.getAICacheEntry(
      "classification",
      contentHash,
      version,
      contextHash,
      teamId
    );

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      return null;
    }

    // Increment hit count (fire and forget)
    this.storage.incrementAICacheHitCount(entry.id).catch(() => {
      // Ignore errors - hit counting is not critical
    });

    // Map cached result to match note ID
    const result = entry.result as ClassificationResult;
    return {
      ...result,
      noteId: note.id, // Use current note ID, not cached ID
    };
  }

  /**
   * Store a classification result in the cache.
   */
  async setClassification(
    note: NoteForClassification,
    pcNames: string[],
    result: ClassificationResult,
    teamId: string
  ): Promise<void> {
    const version = getCurrentVersion("classification");
    const { contentHash, contextHash } = generateClassificationCacheKey(
      note,
      pcNames,
      version
    );

    const expiresAt = new Date(Date.now() + DEFAULT_CACHE_TTL_MS);

    const entry: InsertAICacheEntry = {
      cacheType: "classification",
      contentHash,
      algorithmVersion: version,
      contextHash,
      teamId,
      result,
      modelId: MODEL_ID,
      expiresAt,
    };

    await this.storage.setAICacheEntry(entry);
  }

  /**
   * Batch lookup for classification cache entries.
   * Returns a map of noteId -> ClassificationResult for cache hits.
   */
  async getClassificationsBatch(
    notes: NoteForClassification[],
    pcNames: string[],
    teamId: string
  ): Promise<Map<string, ClassificationResult>> {
    const version = getCurrentVersion("classification");
    const results = new Map<string, ClassificationResult>();

    // Build lookup map: contentHash -> note
    const hashToNote = new Map<string, NoteForClassification>();
    const contentHashes: string[] = [];

    // Calculate context hash once (same for all notes in batch)
    const sortedPCNames = [...pcNames].sort().map((n) => n.toLowerCase());
    const contextHash = sha256(sortedPCNames.join("|") || "no-pc-context");

    for (const note of notes) {
      const contentHash = sha256(normalizeForHash(note.title, note.content));
      contentHashes.push(contentHash);
      hashToNote.set(contentHash, note);
    }

    // Batch lookup
    const entries = await this.storage.getAICacheEntriesBatch(
      "classification",
      contentHashes,
      version,
      contextHash,
      teamId
    );

    const now = new Date();
    const hitIds: string[] = [];

    for (const entry of entries) {
      // Check expiration
      if (entry.expiresAt && new Date(entry.expiresAt) < now) {
        continue;
      }

      const note = hashToNote.get(entry.contentHash);
      if (note) {
        const cachedResult = entry.result as ClassificationResult;
        results.set(note.id, {
          ...cachedResult,
          noteId: note.id, // Use current note ID
        });
        hitIds.push(entry.id);
      }
    }

    // Increment hit counts (fire and forget)
    if (hitIds.length > 0) {
      Promise.all(
        hitIds.map((id) => this.storage.incrementAICacheHitCount(id))
      ).catch(() => {
        // Ignore errors
      });
    }

    return results;
  }

  /**
   * Get a cached relationship result between two notes.
   * Returns null if not found or expired.
   */
  async getRelationship(
    fromNote: NoteWithClassification,
    toNote: NoteWithClassification,
    teamId: string
  ): Promise<RelationshipResult | null> {
    const version = getCurrentVersion("relationship");
    const { pairHash } = generateRelationshipCacheKey(fromNote, toNote, version);

    const entry = await this.storage.getAICacheEntry(
      "relationship",
      pairHash,
      version,
      undefined,
      teamId
    );

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      return null;
    }

    // Increment hit count
    this.storage.incrementAICacheHitCount(entry.id).catch(() => {});

    // Map cached result to match current note IDs
    const result = entry.result as RelationshipResult;

    // Relationships are order-dependent, but our cache key is order-independent
    // We need to return the relationship with correct from/to based on input order
    const cachedHash1 = sha256(normalizeForHash(fromNote.title, fromNote.content));
    const cachedFromHash = sha256(normalizeForHash(
      (result as any)._cachedFromTitle || "",
      (result as any)._cachedFromContent || ""
    ));

    // If the from note matches, return as-is; otherwise swap
    if (cachedHash1 === cachedFromHash) {
      return {
        ...result,
        fromNoteId: fromNote.id,
        toNoteId: toNote.id,
      };
    } else {
      return {
        ...result,
        fromNoteId: toNote.id,
        toNoteId: fromNote.id,
      };
    }
  }

  /**
   * Store a relationship result in the cache.
   */
  async setRelationship(
    fromNote: NoteWithClassification,
    toNote: NoteWithClassification,
    result: RelationshipResult,
    teamId: string
  ): Promise<void> {
    const version = getCurrentVersion("relationship");
    const { pairHash } = generateRelationshipCacheKey(fromNote, toNote, version);

    const expiresAt = new Date(Date.now() + DEFAULT_CACHE_TTL_MS);

    // Store with metadata to preserve direction
    const resultWithMeta = {
      ...result,
      _cachedFromTitle: fromNote.title,
      _cachedFromContent: fromNote.content.slice(0, 100), // Just enough to identify
    };

    const entry: InsertAICacheEntry = {
      cacheType: "relationship",
      contentHash: pairHash,
      algorithmVersion: version,
      teamId,
      result: resultWithMeta,
      modelId: MODEL_ID,
      expiresAt,
    };

    await this.storage.setAICacheEntry(entry);
  }

  /**
   * Invalidate all cache entries for a specific algorithm version.
   * Returns the number of entries deleted.
   */
  async invalidateByVersion(
    operationType: OperationType,
    version: string
  ): Promise<number> {
    return this.storage.deleteAICacheByVersion(operationType, version);
  }

  /**
   * Invalidate all cache entries for a specific team.
   * Returns the number of entries deleted.
   */
  async invalidateByTeam(teamId: string): Promise<number> {
    return this.storage.deleteAICacheByTeam(teamId);
  }

  /**
   * Delete all expired cache entries.
   * Returns the number of entries deleted.
   */
  async pruneExpired(): Promise<number> {
    return this.storage.deleteExpiredAICacheEntries();
  }

  /**
   * Get cache statistics for monitoring.
   */
  async getStats(): Promise<AICacheStats> {
    return this.storage.getAICacheStats();
  }
}

/**
 * Create an AICache instance with the given storage.
 */
export function createAICache(storage: IStorage): AICache {
  return new AICache(storage);
}
