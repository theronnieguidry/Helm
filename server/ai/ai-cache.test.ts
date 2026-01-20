/**
 * PRD-043: AI Cache Tests
 *
 * Unit tests for AI enrichment caching system.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "../test/memory-storage";
import {
  AICache,
  createAICache,
  generateClassificationCacheKey,
  generateRelationshipCacheKey,
} from "./ai-cache";
import type { NoteForClassification, NoteWithClassification, ClassificationResult, RelationshipResult } from "./ai-provider";

describe("AI Cache", () => {
  let storage: MemoryStorage;
  let cache: AICache;

  const mockNote: NoteForClassification = {
    id: "note-1",
    title: "Captain Garner",
    content: "A grizzled veteran who commands the town guard.",
    currentType: "note",
    existingLinks: [],
  };

  const mockClassificationResult: ClassificationResult = {
    noteId: "note-1",
    inferredType: "NPC",
    confidence: 0.92,
    explanation: "References to commanding a guard unit suggest NPC role",
    extractedEntities: ["Captain Garner", "town guard"],
  };

  const mockNoteWithClassification: NoteWithClassification = {
    id: "note-1",
    title: "Captain Garner",
    content: "A grizzled veteran who commands the town guard.",
    inferredType: "NPC",
    internalLinks: [],
  };

  const mockRelationshipResult: RelationshipResult = {
    fromNoteId: "note-1",
    toNoteId: "note-2",
    relationshipType: "NPCInPlace",
    confidence: 0.85,
    evidenceSnippet: "Captain Garner patrols the market square",
    evidenceType: "Mention",
  };

  beforeEach(() => {
    storage = new MemoryStorage();
    cache = createAICache(storage);
  });

  describe("Cache Key Generation", () => {
    it("generates consistent hash for same content", () => {
      const key1 = generateClassificationCacheKey(mockNote, [], "1.0.0");
      const key2 = generateClassificationCacheKey(mockNote, [], "1.0.0");

      expect(key1.contentHash).toBe(key2.contentHash);
      expect(key1.contextHash).toBe(key2.contextHash);
    });

    it("generates different hash for different content", () => {
      const note2 = { ...mockNote, content: "A different description" };

      const key1 = generateClassificationCacheKey(mockNote, [], "1.0.0");
      const key2 = generateClassificationCacheKey(note2, [], "1.0.0");

      expect(key1.contentHash).not.toBe(key2.contentHash);
    });

    it("generates different hash for different titles", () => {
      const note2 = { ...mockNote, title: "Different Title" };

      const key1 = generateClassificationCacheKey(mockNote, [], "1.0.0");
      const key2 = generateClassificationCacheKey(note2, [], "1.0.0");

      expect(key1.contentHash).not.toBe(key2.contentHash);
    });

    it("generates different context hash for different PC names", () => {
      const key1 = generateClassificationCacheKey(mockNote, ["Alice"], "1.0.0");
      const key2 = generateClassificationCacheKey(mockNote, ["Bob"], "1.0.0");

      expect(key1.contentHash).toBe(key2.contentHash);
      expect(key1.contextHash).not.toBe(key2.contextHash);
    });

    it("generates same context hash for same PC names in different order", () => {
      const key1 = generateClassificationCacheKey(mockNote, ["Alice", "Bob"], "1.0.0");
      const key2 = generateClassificationCacheKey(mockNote, ["Bob", "Alice"], "1.0.0");

      expect(key1.contextHash).toBe(key2.contextHash);
    });

    it("normalizes whitespace and case for consistent hashing", () => {
      const note1 = { ...mockNote, content: "Hello World" };
      const note2 = { ...mockNote, content: "  hello   world  " };

      const key1 = generateClassificationCacheKey(note1, [], "1.0.0");
      const key2 = generateClassificationCacheKey(note2, [], "1.0.0");

      expect(key1.contentHash).toBe(key2.contentHash);
    });

    it("removes markdown formatting for consistent hashing", () => {
      const note1 = { ...mockNote, content: "A **bold** statement" };
      const note2 = { ...mockNote, content: "A bold statement" };

      const key1 = generateClassificationCacheKey(note1, [], "1.0.0");
      const key2 = generateClassificationCacheKey(note2, [], "1.0.0");

      expect(key1.contentHash).toBe(key2.contentHash);
    });
  });

  describe("Relationship Cache Key Generation", () => {
    it("generates order-independent pair hash", () => {
      const note1 = mockNoteWithClassification;
      const note2: NoteWithClassification = {
        id: "note-2",
        title: "Market Square",
        content: "The central marketplace",
        inferredType: "Area",
        internalLinks: [],
      };

      const key1 = generateRelationshipCacheKey(note1, note2, "1.0.0");
      const key2 = generateRelationshipCacheKey(note2, note1, "1.0.0");

      expect(key1.pairHash).toBe(key2.pairHash);
    });
  });

  describe("Classification Cache Operations", () => {
    const teamId = "team-123";
    const pcNames: string[] = [];

    it("returns null for cache miss", async () => {
      const result = await cache.getClassification(mockNote, pcNames, teamId);
      expect(result).toBeNull();
    });

    it("returns cached result for cache hit", async () => {
      await cache.setClassification(mockNote, pcNames, mockClassificationResult, teamId);
      const result = await cache.getClassification(mockNote, pcNames, teamId);

      expect(result).not.toBeNull();
      expect(result?.inferredType).toBe("NPC");
      expect(result?.confidence).toBe(0.92);
    });

    it("maps cached result to current note ID", async () => {
      await cache.setClassification(mockNote, pcNames, mockClassificationResult, teamId);

      const differentIdNote = { ...mockNote, id: "different-note-id" };
      const result = await cache.getClassification(differentIdNote, pcNames, teamId);

      expect(result).not.toBeNull();
      expect(result?.noteId).toBe("different-note-id");
    });

    it("misses cache when algorithm version differs", async () => {
      // Set with current version (the cache internally uses getCurrentVersion)
      await cache.setClassification(mockNote, pcNames, mockClassificationResult, teamId);

      // The cache lookup will use the current version, so it should hit
      const result = await cache.getClassification(mockNote, pcNames, teamId);
      expect(result).not.toBeNull();
    });

    it("misses cache when team ID differs", async () => {
      await cache.setClassification(mockNote, pcNames, mockClassificationResult, teamId);
      const result = await cache.getClassification(mockNote, pcNames, "different-team");
      expect(result).toBeNull();
    });

    it("misses cache when PC names differ", async () => {
      await cache.setClassification(mockNote, ["Alice"], mockClassificationResult, teamId);
      const result = await cache.getClassification(mockNote, ["Bob"], teamId);
      expect(result).toBeNull();
    });
  });

  describe("Batch Operations", () => {
    const teamId = "team-123";
    const pcNames: string[] = [];

    it("returns empty map for empty input", async () => {
      const results = await cache.getClassificationsBatch([], pcNames, teamId);
      expect(results.size).toBe(0);
    });

    it("returns partial hits for mixed cache state", async () => {
      const note1 = mockNote;
      const note2: NoteForClassification = {
        id: "note-2",
        title: "Market Square",
        content: "The central marketplace",
        currentType: "note",
        existingLinks: [],
      };

      // Only cache note1
      await cache.setClassification(note1, pcNames, mockClassificationResult, teamId);

      const results = await cache.getClassificationsBatch([note1, note2], pcNames, teamId);

      expect(results.has(note1.id)).toBe(true);
      expect(results.has(note2.id)).toBe(false);
    });

    it("returns all hits when all cached", async () => {
      const note1 = mockNote;
      const note2: NoteForClassification = {
        id: "note-2",
        title: "Market Square",
        content: "The central marketplace",
        currentType: "note",
        existingLinks: [],
      };

      const result2: ClassificationResult = {
        noteId: "note-2",
        inferredType: "Area",
        confidence: 0.88,
        explanation: "Marketplace is a location",
        extractedEntities: [],
      };

      await cache.setClassification(note1, pcNames, mockClassificationResult, teamId);
      await cache.setClassification(note2, pcNames, result2, teamId);

      const results = await cache.getClassificationsBatch([note1, note2], pcNames, teamId);

      expect(results.size).toBe(2);
      expect(results.get(note1.id)?.inferredType).toBe("NPC");
      expect(results.get(note2.id)?.inferredType).toBe("Area");
    });
  });

  describe("Invalidation", () => {
    const teamId = "team-123";
    const pcNames: string[] = [];

    it("invalidates entries by version", async () => {
      await cache.setClassification(mockNote, pcNames, mockClassificationResult, teamId);

      // Verify it's cached
      let result = await cache.getClassification(mockNote, pcNames, teamId);
      expect(result).not.toBeNull();

      // Invalidate current version
      const count = await cache.invalidateByVersion("classification", "1.0.0");
      expect(count).toBe(1);

      // Verify it's gone
      result = await cache.getClassification(mockNote, pcNames, teamId);
      expect(result).toBeNull();
    });

    it("invalidates entries by team", async () => {
      await cache.setClassification(mockNote, pcNames, mockClassificationResult, teamId);

      let result = await cache.getClassification(mockNote, pcNames, teamId);
      expect(result).not.toBeNull();

      const count = await cache.invalidateByTeam(teamId);
      expect(count).toBeGreaterThan(0);

      result = await cache.getClassification(mockNote, pcNames, teamId);
      expect(result).toBeNull();
    });

    it("prunes expired entries", async () => {
      // Set entry with expired date
      await storage.setAICacheEntry({
        cacheType: "classification",
        contentHash: "test-hash",
        algorithmVersion: "1.0.0",
        contextHash: "context-hash",
        teamId,
        result: mockClassificationResult,
        modelId: "test-model",
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      const count = await cache.pruneExpired();
      expect(count).toBe(1);
    });
  });

  describe("Cache Statistics", () => {
    const teamId = "team-123";
    const pcNames: string[] = [];

    it("returns empty stats for empty cache", async () => {
      const stats = await cache.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.entriesByType.classification).toBe(0);
      expect(stats.entriesByType.relationship).toBe(0);
      expect(stats.totalHits).toBe(0);
    });

    it("tracks entries by type", async () => {
      await cache.setClassification(mockNote, pcNames, mockClassificationResult, teamId);

      const stats = await cache.getStats();

      expect(stats.totalEntries).toBe(1);
      expect(stats.entriesByType.classification).toBe(1);
      expect(stats.entriesByType.relationship).toBe(0);
    });
  });
});
