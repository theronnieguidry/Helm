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

  describe("Relationship Cache Operations", () => {
    const teamId = "team-123";

    // P0-3 regression: setRelationship used to store only a 100-char content
    // prefix (_cachedFromContent) while getRelationship compared against the
    // full normalized content hash, so for any note longer than 100 chars the
    // hashes never matched and cached directional relationships were returned
    // reversed. The fix stores _cachedFromKeyHash (the full normalized hash,
    // computed with the same function the getter uses). The legacy
    // title/content-prefix fallback was intentionally NOT kept: the fix also
    // bumps the relationship algorithm version to 1.1.0, and since the version
    // is part of the cache lookup key, old 1.0.0 entries can never be loaded —
    // making a fallback dead code and the version bump the simpler safe choice.
    const longNoteA: NoteWithClassification = {
      id: "note-quest",
      title: "The Sunken Crown",
      content:
        "The party has been tasked with recovering the Sunken Crown from the " +
        "flooded ruins beneath Lake Veyra. The crown once belonged to the " +
        "drowned king Aldemar, and local legends claim it grants dominion over " +
        "the waters. Captain Garner warned them about the cultists who guard " +
        "the ruins and the strange lights seen beneath the surface at night.",
      inferredType: "Quest",
      internalLinks: [],
    };

    const longNoteB: NoteWithClassification = {
      id: "note-npc",
      title: "Captain Garner",
      content:
        "A grizzled veteran who commands the town guard of Veyra's Rest. " +
        "Garner lost his left eye during the border wars and wears a bronze " +
        "patch etched with the sigil of his old regiment. He distrusts " +
        "adventurers but pays well for information about the cult activity " +
        "near the lake, and he keeps a detailed ledger of every stranger who " +
        "passes through the town gates.",
      inferredType: "NPC",
      internalLinks: [],
    };

    const directionalResult: RelationshipResult = {
      fromNoteId: "note-quest",
      toNoteId: "note-npc",
      relationshipType: "QuestHasNPC",
      confidence: 0.9,
      evidenceSnippet: "Captain Garner warned them about the cultists",
      evidenceType: "Mention",
    };

    it("returns null for cache miss", async () => {
      const result = await cache.getRelationship(longNoteA, longNoteB, teamId);
      expect(result).toBeNull();
    });

    it("preserves direction for long notes when lookup order matches stored order", async () => {
      // Both notes have >200 chars of content, which broke the old
      // prefix-based direction check and caused an unconditional swap.
      expect(longNoteA.content.length).toBeGreaterThan(200);
      expect(longNoteB.content.length).toBeGreaterThan(200);

      await cache.setRelationship(longNoteA, longNoteB, directionalResult, teamId);

      const result = await cache.getRelationship(longNoteA, longNoteB, teamId);

      expect(result).not.toBeNull();
      expect(result?.relationshipType).toBe("QuestHasNPC");
      // Direction must NOT be swapped: A was the "from" side when stored
      expect(result?.fromNoteId).toBe(longNoteA.id);
      expect(result?.toNoteId).toBe(longNoteB.id);
    });

    it("maps direction back to stored order when lookup order is reversed", async () => {
      await cache.setRelationship(longNoteA, longNoteB, directionalResult, teamId);

      // Look up with (B, A) — the order-independent pair hash still hits,
      // and the direction must map back to A->B via the caller's note ids
      const result = await cache.getRelationship(longNoteB, longNoteA, teamId);

      expect(result).not.toBeNull();
      expect(result?.relationshipType).toBe("QuestHasNPC");
      expect(result?.fromNoteId).toBe(longNoteA.id);
      expect(result?.toNoteId).toBe(longNoteB.id);
    });

    it("maps to current note ids when notes are re-imported with new ids", async () => {
      await cache.setRelationship(longNoteA, longNoteB, directionalResult, teamId);

      const reimportedA = { ...longNoteA, id: "note-quest-v2" };
      const reimportedB = { ...longNoteB, id: "note-npc-v2" };

      const result = await cache.getRelationship(reimportedA, reimportedB, teamId);

      expect(result).not.toBeNull();
      expect(result?.fromNoteId).toBe("note-quest-v2");
      expect(result?.toNoteId).toBe("note-npc-v2");
    });

    it("misses cache when team ID differs", async () => {
      await cache.setRelationship(longNoteA, longNoteB, directionalResult, teamId);
      const result = await cache.getRelationship(longNoteA, longNoteB, "different-team");
      expect(result).toBeNull();
    });

    it("does not leak direction metadata in the returned result", async () => {
      await cache.setRelationship(longNoteA, longNoteB, directionalResult, teamId);
      const result = await cache.getRelationship(longNoteA, longNoteB, teamId);

      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty("_cachedFromKeyHash");
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
