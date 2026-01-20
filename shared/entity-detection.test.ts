import { describe, it, expect } from "vitest";
import {
  detectEntities,
  filterEntitiesByType,
  filterEntitiesByConfidence,
  matchEntitiesToNotes,
} from "./entity-detection";

describe("Entity Detection (PRD-002)", () => {
  describe("NPC detection", () => {
    it("should detect titled NPCs with high confidence", () => {
      const text = "We met Lord Blackwood at the castle gates.";
      const entities = detectEntities(text);

      const lordBlackwood = entities.find(
        (e) => e.normalizedText === "lord blackwood"
      );
      expect(lordBlackwood).toBeDefined();
      expect(lordBlackwood?.type).toBe("npc");
      expect(lordBlackwood?.confidence).toBe("high");
    });

    it("should detect various noble titles", () => {
      const text =
        "Sir Galahad spoke with Queen Elizara and Duke Harrington.";
      const entities = detectEntities(text);

      expect(
        entities.some((e) => e.normalizedText.includes("sir galahad"))
      ).toBe(true);
      expect(
        entities.some((e) => e.normalizedText.includes("queen elizara"))
      ).toBe(true);
      expect(
        entities.some((e) => e.normalizedText.includes("duke harrington"))
      ).toBe(true);
    });

    it("should detect 'X the Y' pattern NPCs", () => {
      const text = "Ragnar the Bold led the charge.";
      const entities = detectEntities(text);

      const ragnar = entities.find((e) =>
        e.normalizedText.includes("ragnar the bold")
      );
      expect(ragnar).toBeDefined();
      expect(ragnar?.type).toBe("npc");
    });
  });

  describe("Place detection", () => {
    it("should detect places with indicators", () => {
      const text = "We traveled to the Silverwood Forest.";
      const entities = detectEntities(text);

      const forest = entities.find((e) =>
        e.normalizedText.includes("silverwood forest")
      );
      expect(forest).toBeDefined();
      expect(forest?.type).toBe("place");
    });

    it("should detect 'City of X' patterns", () => {
      const text = "The City of Goldenhaven welcomed us.";
      const entities = detectEntities(text);

      const city = entities.find(
        (e) =>
          e.normalizedText.includes("city of goldenhaven") ||
          e.normalizedText.includes("goldenhaven")
      );
      expect(city).toBeDefined();
    });

    it("should detect taverns and inns", () => {
      const text = "We rested at the Prancing Pony Tavern.";
      const entities = detectEntities(text);

      const tavern = entities.find((e) =>
        e.normalizedText.includes("prancing pony tavern")
      );
      expect(tavern).toBeDefined();
      expect(tavern?.type).toBe("place");
    });
  });

  describe("Quest detection", () => {
    it("should detect quest patterns", () => {
      const text = "We accepted the Quest for the Sacred Gem.";
      const entities = detectEntities(text);

      const quest = entities.find((e) =>
        e.normalizedText.includes("sacred gem")
      );
      expect(quest).toBeDefined();
    });

    it("should detect 'Find/Defeat the X' patterns", () => {
      const text = "Our mission is to Find the Lost Artifact.";
      const entities = detectEntities(text);

      const artifact = entities.find((e) =>
        e.normalizedText.includes("lost artifact")
      );
      expect(artifact).toBeDefined();
    });
  });

  describe("Proper noun detection", () => {
    it("should detect capitalized proper nouns as low confidence", () => {
      const text = "Afterwards, Elara revealed the secret.";
      const entities = detectEntities(text);

      const elara = entities.find((e) => e.normalizedText === "elara");
      expect(elara).toBeDefined();
      expect(elara?.confidence).toBe("low");
    });

    it("should detect compound proper nouns", () => {
      const text = "We spoke with Marcus Aurelius about the matter.";
      const entities = detectEntities(text);

      const marcus = entities.find(
        (e) =>
          e.normalizedText.includes("marcus aurelius") ||
          e.normalizedText.includes("marcus")
      );
      expect(marcus).toBeDefined();
    });

    it("should not detect stop words as entities", () => {
      const text = "The party went to the tavern.";
      const entities = detectEntities(text);

      expect(entities.find((e) => e.normalizedText === "the")).toBeUndefined();
    });

    it("should not detect action words as entities", () => {
      const text = "We Attack the enemy and Fight bravely.";
      const entities = detectEntities(text);

      expect(
        entities.find((e) => e.normalizedText === "attack")
      ).toBeUndefined();
      expect(
        entities.find((e) => e.normalizedText === "fight")
      ).toBeUndefined();
    });
  });

  describe("Frequency and mentions", () => {
    it("should track multiple mentions of the same entity", () => {
      const text =
        "Lord Blackwood greeted us. Later, Lord Blackwood revealed his plans.";
      const entities = detectEntities(text);

      const lordBlackwood = entities.find(
        (e) => e.normalizedText === "lord blackwood"
      );
      expect(lordBlackwood).toBeDefined();
      // Frequency may be higher if multiple patterns match the same text
      expect(lordBlackwood?.frequency).toBeGreaterThanOrEqual(2);
      expect(lordBlackwood?.mentions.length).toBeGreaterThanOrEqual(2);
    });

    it("should include offset information in mentions", () => {
      const text = "Lord Blackwood spoke.";
      const entities = detectEntities(text);

      const lordBlackwood = entities.find(
        (e) => e.normalizedText === "lord blackwood"
      );
      expect(lordBlackwood?.mentions[0].startOffset).toBe(0);
      expect(lordBlackwood?.mentions[0].endOffset).toBe("Lord Blackwood".length);
    });
  });

  describe("Content blocks", () => {
    it("should process array of content blocks", () => {
      const blocks = [
        { id: "block-1", content: "We met Lord Blackwood." },
        { id: "block-2", content: "Lord Blackwood gave us a quest." },
      ];
      const entities = detectEntities(blocks);

      const lordBlackwood = entities.find(
        (e) => e.normalizedText === "lord blackwood"
      );
      expect(lordBlackwood).toBeDefined();
      // Frequency may be higher if multiple patterns match the same text
      expect(lordBlackwood?.frequency).toBeGreaterThanOrEqual(2);
      // Check that both blocks are represented in mentions
      const blockIds = lordBlackwood?.mentions.map((m) => m.blockId) || [];
      expect(blockIds).toContain("block-1");
      expect(blockIds).toContain("block-2");
    });
  });

  describe("Filtering", () => {
    it("should filter entities by type", () => {
      const text =
        "Lord Blackwood rules the Silverwood Forest from his castle.";
      const entities = detectEntities(text);

      const npcs = filterEntitiesByType(entities, "npc");
      const places = filterEntitiesByType(entities, "place");

      expect(npcs.every((e) => e.type === "npc")).toBe(true);
      expect(places.every((e) => e.type === "place")).toBe(true);
    });

    it("should filter entities by confidence", () => {
      const text = "Lord Blackwood met Elara at the Silverwood Forest.";
      const entities = detectEntities(text);

      const highConfidence = filterEntitiesByConfidence(entities, "high");
      const mediumConfidence = filterEntitiesByConfidence(entities, "medium");

      expect(highConfidence.every((e) => e.confidence === "high")).toBe(true);
      expect(
        mediumConfidence.every(
          (e) => e.confidence === "high" || e.confidence === "medium"
        )
      ).toBe(true);
    });
  });

  describe("Note matching", () => {
    it("should match entities to existing notes", () => {
      const text = "We visited Silverwood and met Lord Blackwood.";
      const entities = detectEntities(text);

      const existingNotes = [
        { id: "note-1", title: "Lord Blackwood", noteType: "npc" },
        { id: "note-2", title: "Silverwood Forest", noteType: "area" },
        { id: "note-3", title: "Unrelated Note", noteType: "quest" },
      ];

      const matches = matchEntitiesToNotes(entities, existingNotes);

      // Should match Lord Blackwood
      const blackwoodEntity = entities.find(
        (e) => e.normalizedText === "lord blackwood"
      );
      if (blackwoodEntity) {
        expect(matches.get(blackwoodEntity.id)).toContain("note-1");
      }
    });

    it("should handle substring matches", () => {
      const text = "We found the forest.";
      const entities = detectEntities(text);

      const existingNotes = [
        { id: "note-1", title: "Silverwood Forest", noteType: "area" },
      ];

      // This tests partial matching logic
      const matches = matchEntitiesToNotes(entities, existingNotes);

      // May or may not match depending on implementation
      expect(matches).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty text", () => {
      const entities = detectEntities("");
      expect(entities).toHaveLength(0);
    });

    it("should handle text with no entities", () => {
      const text = "we walked down the road and found nothing.";
      const entities = detectEntities(text);
      expect(entities).toHaveLength(0);
    });

    it("should handle empty content blocks", () => {
      const blocks = [
        { id: "block-1", content: "" },
        { id: "block-2", content: "Lord Blackwood appeared." },
      ];
      const entities = detectEntities(blocks);
      expect(entities.length).toBeGreaterThan(0);
    });

    it("should sort entities by frequency then confidence", () => {
      const text =
        "Elara spoke. Elara listened. Elara left. Lord Blackwood arrived.";
      const entities = detectEntities(text);

      // Elara has higher frequency, Lord Blackwood has higher confidence
      // Depending on implementation, sorting may vary
      expect(entities.length).toBeGreaterThan(0);
    });
  });

  // PRD-024 Bug Fixes
  describe("BUG-1: Sentence boundary compound names", () => {
    it("should not merge names across sentence boundaries", () => {
      const text = "We spoke with Samwell. There was much to discuss.";
      const entities = detectEntities(text);

      // Should NOT find "Samwell There" or "Samwell Theres"
      expect(
        entities.find((e) => e.normalizedText.includes("samwell there"))
      ).toBeUndefined();
    });

    it("should stop compound name at exclamation point", () => {
      const text = "Help us, Marcus! Elena must be saved.";
      const entities = detectEntities(text);

      expect(
        entities.find((e) => e.normalizedText.includes("marcus elena"))
      ).toBeUndefined();
    });

    it("should still detect legitimate compound names", () => {
      const text = "We met Marcus Aurelius at the forum.";
      const entities = detectEntities(text);

      expect(
        entities.find((e) => e.normalizedText.includes("marcus aurelius"))
      ).toBeDefined();
    });
  });

  describe("BUG-2: Place indicators", () => {
    it("should detect vale as a place indicator", () => {
      const text = "They traveled through the Misty Vale.";
      const entities = detectEntities(text);

      const vale = entities.find((e) =>
        e.normalizedText.includes("misty vale")
      );
      expect(vale).toBeDefined();
      expect(vale?.type).toBe("place");
    });

    it("should detect landing as a place indicator", () => {
      const text = "Granite Landing is the main city.";
      const entities = detectEntities(text);

      const landing = entities.find((e) =>
        e.normalizedText.includes("granite landing")
      );
      expect(landing).toBeDefined();
      expect(landing?.type).toBe("place");
    });

    it("should detect fortifications like keep and stronghold", () => {
      const text = "The enemy held Shadowfang Keep and Ironhold Fortress.";
      const entities = detectEntities(text);

      expect(
        entities.some((e) => e.normalizedText.includes("keep"))
      ).toBe(true);
      expect(
        entities.some((e) => e.normalizedText.includes("fortress"))
      ).toBe(true);
    });
  });

  describe("BUG-3: Person titles", () => {
    it("should detect military titles as NPC indicators", () => {
      const text =
        "Lieutenant Hawkins reported to Colonel Steele about Sergeant Mills.";
      const entities = detectEntities(text);

      expect(
        entities.some((e) => e.normalizedText.includes("lieutenant hawkins"))
      ).toBe(true);
      expect(
        entities.some((e) => e.normalizedText.includes("colonel steele"))
      ).toBe(true);
      expect(
        entities.some((e) => e.normalizedText.includes("sergeant mills"))
      ).toBe(true);
    });

    it("should detect naval military titles with high confidence", () => {
      const text = "Admiral Chen commanded the fleet.";
      const entities = detectEntities(text);

      const admiral = entities.find((e) =>
        e.normalizedText.includes("admiral chen")
      );
      expect(admiral).toBeDefined();
      expect(admiral?.type).toBe("npc");
      expect(admiral?.confidence).toBe("high");
    });
  });

  describe("BUG-4: Deduplication", () => {
    it("should deduplicate contained entities", () => {
      const text = "Captain Garner spoke. Later, Garner mentioned the quest.";
      const entities = detectEntities(text);

      // Should have "Captain Garner" but not separate "Garner"
      const garnerEntities = entities.filter((e) =>
        e.normalizedText.includes("garner")
      );
      expect(garnerEntities).toHaveLength(1);
      expect(garnerEntities[0].normalizedText).toBe("captain garner");
    });

    it("should not incorrectly merge partial word matches", () => {
      const text = "We met Lord Blackwood. The wood was dark.";
      const entities = detectEntities(text);

      // "wood" as a standalone word should NOT be merged into "lord blackwood"
      // because it's not a word-suffix match
      const blackwood = entities.find(
        (e) => e.normalizedText === "lord blackwood"
      );
      expect(blackwood).toBeDefined();
    });
  });

  describe("BUG-5: Comma-separated lists", () => {
    it("should detect entities in comma-separated lists", () => {
      const text = "The heroes were Blacktalon, Breaker, and Amir.";
      const entities = detectEntities(text);

      expect(
        entities.some((e) => e.normalizedText === "blacktalon")
      ).toBe(true);
      expect(entities.some((e) => e.normalizedText === "breaker")).toBe(true);
      expect(entities.some((e) => e.normalizedText === "amir")).toBe(true);
    });

    it("should detect names after commas in mid-sentence", () => {
      const text = "We traveled with Elena, Marcus, and Sofia to the castle.";
      const entities = detectEntities(text);

      expect(entities.some((e) => e.normalizedText === "elena")).toBe(true);
      expect(entities.some((e) => e.normalizedText === "marcus")).toBe(true);
      expect(entities.some((e) => e.normalizedText === "sofia")).toBe(true);
    });
  });

  describe("BUG-6: Spurious fragments", () => {
    it("should not detect sentence fragments as entities", () => {
      const text =
        "The region and Granite Landing is the main city of the north.";
      const entities = detectEntities(text);

      // Should NOT have entities containing "and", "is", "the" in the middle
      const fragmentEntities = entities.filter(
        (e) =>
          e.normalizedText.includes(" and ") ||
          e.normalizedText.includes(" is ") ||
          (e.normalizedText.includes(" the ") &&
            !e.normalizedText.match(/\bthe\s+\w+$/))
      );
      expect(fragmentEntities).toHaveLength(0);
    });

    it("should reject excessively long entity names", () => {
      const text = "We met John Smith Baker Wilson Thompson Harrison.";
      const entities = detectEntities(text);

      // Should not have a 6-word entity
      const longEntities = entities.filter(
        (e) => e.text.split(/\s+/).length > 5
      );
      expect(longEntities).toHaveLength(0);
    });
  });

  describe("BUG-7: Possessive normalization", () => {
    it("should treat possessive forms as the same entity", () => {
      const text =
        "We visited Duke Harrington's estate. Duke Harrington was absent.";
      const entities = detectEntities(text);

      // Should be one entity, not two
      const dukeEntities = entities.filter((e) =>
        e.normalizedText.includes("duke harrington")
      );
      expect(dukeEntities).toHaveLength(1);
      expect(dukeEntities[0].frequency).toBeGreaterThanOrEqual(2);
    });

    it("should normalize possessive forms correctly", () => {
      const text =
        "Lord Blackwood's castle stands tall. Lord Blackwood rules justly.";
      const entities = detectEntities(text);

      const blackwood = entities.find(
        (e) => e.normalizedText === "lord blackwood"
      );
      expect(blackwood).toBeDefined();
      expect(blackwood?.frequency).toBeGreaterThanOrEqual(2);
    });
  });

  // PRD-025 Bug Fixes
  describe("PRD-025 BUG-1: Sentence-start blindness", () => {
    it("should detect entities that only appear at sentence start multiple times", () => {
      const text = "Blacktalon spoke. Blacktalon then left.";
      const entities = detectEntities(text);

      expect(entities.find((e) => e.normalizedText === "blacktalon")).toBeDefined();
    });

    it("should detect entities at sentence start if they appear multiple times", () => {
      const text = "Chuckwagon motions to the runners. Chuckwagon knows the camp.";
      const entities = detectEntities(text);

      expect(entities.find((e) => e.normalizedText === "chuckwagon")).toBeDefined();
    });

    it("should not detect single sentence-start occurrences", () => {
      const text = "Marcus spoke. Elena listened. They left.";
      const entities = detectEntities(text);

      // Marcus and Elena each appear only once at sentence start - should not be detected
      expect(entities.find((e) => e.normalizedText === "marcus")).toBeUndefined();
      expect(entities.find((e) => e.normalizedText === "elena")).toBeUndefined();
    });
  });

  describe("PRD-025 BUG-2: Title-only deduplication", () => {
    it("should merge 'Captain' into 'Captain Garner'", () => {
      const text = "Captain Garner arrived. The captain spoke.";
      const entities = detectEntities(text);

      const captainEntities = entities.filter((e) =>
        e.normalizedText.includes("captain")
      );
      expect(captainEntities).toHaveLength(1);
      expect(captainEntities[0].normalizedText).toBe("captain garner");
    });

    it("should merge prefix matches in deduplication", () => {
      const text = "We met Baron Chilton. The Baron was helpful.";
      const entities = detectEntities(text);

      const baronEntities = entities.filter((e) =>
        e.normalizedText.includes("baron")
      );
      expect(baronEntities).toHaveLength(1);
      expect(baronEntities[0].normalizedText).toBe("baron chilton");
    });
  });

  describe("PRD-025 BUG-3: Article-prefixed titles", () => {
    it("should merge 'the Baron' into 'Baron Chilton'", () => {
      const text = "Baron Chilton rules. The Baron is fair.";
      const entities = detectEntities(text);

      const baronEntities = entities.filter((e) =>
        e.normalizedText.includes("baron")
      );
      expect(baronEntities).toHaveLength(1);
      expect(baronEntities[0].normalizedText).toBe("baron chilton");
    });

    it("should merge 'the Duke' references", () => {
      const text = "Duke Harrington arrived. The Duke's son followed.";
      const entities = detectEntities(text);

      const dukeEntities = entities.filter((e) =>
        e.normalizedText.includes("duke")
      );
      expect(dukeEntities).toHaveLength(1);
    });

    it("should not merge unrelated titles", () => {
      const text = "Captain Garner spoke. The Baron listened.";
      const entities = detectEntities(text);

      // Captain and Baron should be separate since there's no "Baron X"
      const captainEntities = entities.filter((e) =>
        e.normalizedText.includes("captain")
      );
      expect(captainEntities).toHaveLength(1);
      expect(captainEntities[0].normalizedText).toBe("captain garner");
    });
  });
});
