import { describe, it, expect } from "vitest";
import {
  findProximitySuggestions,
  suggestEntityLinks,
  groupEntitiesByType,
  calculateRelationshipStrength,
} from "./proximity-suggestions";
import type { DetectedEntity } from "./entity-detection";

describe("Proximity Suggestions (PRD-006)", () => {
  describe("findProximitySuggestions", () => {
    it("should find high confidence suggestions for close entities", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "npc",
          text: "Lord Blackwood",
          normalizedText: "lord blackwood",
          confidence: "high",
          frequency: 1,
          mentions: [{ startOffset: 0, endOffset: 14, text: "Lord Blackwood" }],
        },
        {
          id: "entity-2",
          type: "place",
          text: "Silverwood Castle",
          normalizedText: "silverwood castle",
          confidence: "high",
          frequency: 1,
          mentions: [{ startOffset: 30, endOffset: 47, text: "Silverwood Castle" }],
        },
      ];

      const content = "Lord Blackwood rules from Silverwood Castle with an iron fist.";
      const suggestions = findProximitySuggestions(entities, content);

      expect(suggestions.length).toBeGreaterThan(0);

      const lordSuggestion = suggestions.find((s) => s.entityId === "entity-1");
      expect(lordSuggestion).toBeDefined();
      expect(lordSuggestion?.relatedEntities).toHaveLength(1);
      expect(lordSuggestion?.relatedEntities[0].entityText).toBe("Silverwood Castle");
      expect(lordSuggestion?.relatedEntities[0].confidence).toBe("high");
    });

    it("should assign lower confidence for distant entities", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "npc",
          text: "Lord Blackwood",
          normalizedText: "lord blackwood",
          confidence: "high",
          frequency: 1,
          mentions: [{ startOffset: 0, endOffset: 14, text: "Lord Blackwood" }],
        },
        {
          id: "entity-2",
          type: "place",
          text: "Distant Mountain",
          normalizedText: "distant mountain",
          confidence: "high",
          frequency: 1,
          mentions: [{ startOffset: 250, endOffset: 266, text: "Distant Mountain" }],
        },
      ];

      // Content with significant distance between mentions
      const content =
        "Lord Blackwood" +
        " ".repeat(200) +
        "and later they traveled to Distant Mountain.";
      const suggestions = findProximitySuggestions(entities, content);

      const lordSuggestion = suggestions.find((s) => s.entityId === "entity-1");
      if (lordSuggestion && lordSuggestion.relatedEntities.length > 0) {
        // Should have lower confidence due to distance
        expect(["medium", "low"]).toContain(
          lordSuggestion.relatedEntities[0].confidence
        );
      }
    });

    it("should handle entities in different blocks", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "npc",
          text: "Lord Blackwood",
          normalizedText: "lord blackwood",
          confidence: "high",
          frequency: 1,
          mentions: [
            { blockId: "block-1", startOffset: 0, endOffset: 14, text: "Lord Blackwood" },
          ],
        },
        {
          id: "entity-2",
          type: "place",
          text: "Silverwood Castle",
          normalizedText: "silverwood castle",
          confidence: "high",
          frequency: 1,
          mentions: [
            { blockId: "block-2", startOffset: 0, endOffset: 17, text: "Silverwood Castle" },
          ],
        },
      ];

      const contentMap = new Map([
        ["block-1", "Lord Blackwood spoke."],
        ["block-2", "Silverwood Castle loomed in the distance."],
      ]);

      const suggestions = findProximitySuggestions(entities, contentMap);

      // Entities in different blocks should not have high proximity suggestions
      const lordSuggestion = suggestions.find((s) => s.entityId === "entity-1");
      if (lordSuggestion && lordSuggestion.relatedEntities.length > 0) {
        // Should not find related entities in different blocks
        expect(lordSuggestion.relatedEntities).toHaveLength(0);
      }
    });

    it("should handle entities with multiple mentions", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "npc",
          text: "Lord Blackwood",
          normalizedText: "lord blackwood",
          confidence: "high",
          frequency: 2,
          mentions: [
            { startOffset: 0, endOffset: 14, text: "Lord Blackwood" },
            { startOffset: 100, endOffset: 114, text: "Lord Blackwood" },
          ],
        },
        {
          id: "entity-2",
          type: "npc",
          text: "Lady Silverwood",
          normalizedText: "lady silverwood",
          confidence: "high",
          frequency: 1,
          mentions: [{ startOffset: 20, endOffset: 35, text: "Lady Silverwood" }],
        },
      ];

      const content =
        "Lord Blackwood met Lady Silverwood" +
        " ".repeat(50) +
        "Lord Blackwood then departed.";
      const suggestions = findProximitySuggestions(entities, content);

      const lordSuggestion = suggestions.find((s) => s.entityId === "entity-1");
      expect(lordSuggestion).toBeDefined();
      // Should find Lady Silverwood as related due to proximity to first mention
      expect(
        lordSuggestion?.relatedEntities.some(
          (r) => r.entityText === "Lady Silverwood"
        )
      ).toBe(true);
    });

    it("should return empty array for single entity", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "npc",
          text: "Lord Blackwood",
          normalizedText: "lord blackwood",
          confidence: "high",
          frequency: 1,
          mentions: [{ startOffset: 0, endOffset: 14, text: "Lord Blackwood" }],
        },
      ];

      const content = "Lord Blackwood spoke.";
      const suggestions = findProximitySuggestions(entities, content);

      expect(suggestions).toHaveLength(0);
    });
  });

  describe("suggestEntityLinks", () => {
    it("should match entities to notes with exact title match", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "npc",
          text: "Lord Blackwood",
          normalizedText: "lord blackwood",
          confidence: "high",
          frequency: 1,
          mentions: [],
        },
      ];

      const existingNotes = [
        { id: "note-1", title: "Lord Blackwood", noteType: "npc" },
        { id: "note-2", title: "Silverwood Forest", noteType: "area" },
      ];

      const suggestions = suggestEntityLinks(entities, existingNotes);

      expect(suggestions.has("entity-1")).toBe(true);
      expect(suggestions.get("entity-1")).toHaveLength(1);
      expect(suggestions.get("entity-1")![0].id).toBe("note-1");
    });

    it("should match entities to notes with partial title match", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "place",
          text: "Silverwood",
          normalizedText: "silverwood",
          confidence: "high",
          frequency: 1,
          mentions: [],
        },
      ];

      const existingNotes = [
        { id: "note-1", title: "Silverwood Forest", noteType: "area" },
        { id: "note-2", title: "Silverwood Castle", noteType: "area" },
      ];

      const suggestions = suggestEntityLinks(entities, existingNotes);

      expect(suggestions.has("entity-1")).toBe(true);
      expect(suggestions.get("entity-1")!.length).toBeGreaterThanOrEqual(1);
    });

    it("should not match unrelated entities", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "npc",
          text: "Lord Blackwood",
          normalizedText: "lord blackwood",
          confidence: "high",
          frequency: 1,
          mentions: [],
        },
      ];

      const existingNotes = [
        { id: "note-1", title: "Silverwood Forest", noteType: "area" },
        { id: "note-2", title: "Dragon's Lair", noteType: "area" },
      ];

      const suggestions = suggestEntityLinks(entities, existingNotes);

      expect(suggestions.has("entity-1")).toBe(false);
    });
  });

  describe("groupEntitiesByType", () => {
    it("should group entities by their type", () => {
      const entities: DetectedEntity[] = [
        {
          id: "entity-1",
          type: "npc",
          text: "Lord Blackwood",
          normalizedText: "lord blackwood",
          confidence: "high",
          frequency: 1,
          mentions: [],
        },
        {
          id: "entity-2",
          type: "place",
          text: "Silverwood",
          normalizedText: "silverwood",
          confidence: "high",
          frequency: 1,
          mentions: [],
        },
        {
          id: "entity-3",
          type: "npc",
          text: "Lady Silverwood",
          normalizedText: "lady silverwood",
          confidence: "high",
          frequency: 1,
          mentions: [],
        },
      ];

      const groups = groupEntitiesByType(entities);

      expect(groups.get("npc")).toHaveLength(2);
      expect(groups.get("place")).toHaveLength(1);
      expect(groups.has("quest")).toBe(false);
    });
  });

  describe("calculateRelationshipStrength", () => {
    it("should calculate higher strength for close entities", () => {
      const entity1: DetectedEntity = {
        id: "entity-1",
        type: "npc",
        text: "Lord Blackwood",
        normalizedText: "lord blackwood",
        confidence: "high",
        frequency: 1,
        mentions: [{ startOffset: 0, endOffset: 14, text: "Lord Blackwood" }],
      };

      const entity2Close: DetectedEntity = {
        id: "entity-2",
        type: "npc",
        text: "Lady Silverwood",
        normalizedText: "lady silverwood",
        confidence: "high",
        frequency: 1,
        mentions: [{ startOffset: 20, endOffset: 35, text: "Lady Silverwood" }],
      };

      const entity3Far: DetectedEntity = {
        id: "entity-3",
        type: "place",
        text: "Distant Mountain",
        normalizedText: "distant mountain",
        confidence: "high",
        frequency: 1,
        mentions: [{ startOffset: 500, endOffset: 516, text: "Distant Mountain" }],
      };

      const content = "Lord Blackwood met Lady Silverwood" + " ".repeat(450) + "at Distant Mountain.";

      const strengthClose = calculateRelationshipStrength(
        entity1,
        entity2Close,
        content
      );
      const strengthFar = calculateRelationshipStrength(
        entity1,
        entity3Far,
        content
      );

      expect(strengthClose).toBeGreaterThan(strengthFar);
    });

    it("should increase strength for entities in same blocks", () => {
      const entity1: DetectedEntity = {
        id: "entity-1",
        type: "npc",
        text: "Lord Blackwood",
        normalizedText: "lord blackwood",
        confidence: "high",
        frequency: 2,
        mentions: [
          { blockId: "block-1", startOffset: 0, endOffset: 14, text: "Lord Blackwood" },
          { blockId: "block-2", startOffset: 0, endOffset: 14, text: "Lord Blackwood" },
        ],
      };

      const entitySameBlocks: DetectedEntity = {
        id: "entity-2",
        type: "npc",
        text: "Lady Silverwood",
        normalizedText: "lady silverwood",
        confidence: "high",
        frequency: 2,
        mentions: [
          { blockId: "block-1", startOffset: 20, endOffset: 35, text: "Lady Silverwood" },
          { blockId: "block-2", startOffset: 20, endOffset: 35, text: "Lady Silverwood" },
        ],
      };

      const entityDifferentBlock: DetectedEntity = {
        id: "entity-3",
        type: "place",
        text: "Silverwood",
        normalizedText: "silverwood",
        confidence: "high",
        frequency: 1,
        mentions: [
          { blockId: "block-3", startOffset: 0, endOffset: 10, text: "Silverwood" },
        ],
      };

      const contentMap = new Map([
        ["block-1", "Lord Blackwood met Lady Silverwood."],
        ["block-2", "Lord Blackwood met Lady Silverwood again."],
        ["block-3", "Silverwood loomed in the distance."],
      ]);

      const strengthSameBlocks = calculateRelationshipStrength(
        entity1,
        entitySameBlocks,
        contentMap
      );
      const strengthDifferentBlock = calculateRelationshipStrength(
        entity1,
        entityDifferentBlock,
        contentMap
      );

      expect(strengthSameBlocks).toBeGreaterThan(strengthDifferentBlock);
    });
  });
});
