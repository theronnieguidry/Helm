import { describe, it, expect } from "vitest";
import {
  buildCleanupSuggestions,
  buildFirstSeenSeed,
  confidenceBucket,
  inferRelationshipTypeForNoteTypes,
} from "./cleanup-suggestions";
import type { Note } from "./schema";

function makeNote(overrides: Partial<Note> & Pick<Note, "id" | "title" | "noteType">): Note {
  return {
    teamId: "team-1",
    authorId: "user-1",
    content: "",
    contentBlocks: null,
    isPrivate: false,
    sessionDate: null,
    questStatus: null,
    sourceSystem: null,
    sourcePageId: null,
    contentMarkdown: null,
    contentMarkdownResolved: null,
    importRunId: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as Note;
}

const SESSION_CONTENT =
  "We met Lord Blackwood in Silverwood Forest. He asked us to Find the Lost Relic before nightfall.";

describe("confidenceBucket (PRD-049 FR-5)", () => {
  it("labels HIGH at 0.80 and above", () => {
    expect(confidenceBucket(0.8)).toBe("HIGH");
    expect(confidenceBucket(0.95)).toBe("HIGH");
  });

  it("labels REVIEW between 0.65 and 0.79", () => {
    expect(confidenceBucket(0.65)).toBe("REVIEW");
    expect(confidenceBucket(0.79)).toBe("REVIEW");
  });

  it("labels LOW below 0.65", () => {
    expect(confidenceBucket(0.64)).toBe("LOW");
    expect(confidenceBucket(0.5)).toBe("LOW");
  });
});

describe("inferRelationshipTypeForNoteTypes (PRD-049/PRD-050)", () => {
  it("maps quest -> npc to QuestHasNPC", () => {
    expect(inferRelationshipTypeForNoteTypes("quest", "npc")).toEqual({
      relationshipType: "QuestHasNPC",
      swap: false,
    });
  });

  it("swaps npc -> quest so the quest is the from side", () => {
    expect(inferRelationshipTypeForNoteTypes("npc", "quest")).toEqual({
      relationshipType: "QuestHasNPC",
      swap: true,
    });
  });

  it("maps quest -> area/poi to QuestAtPlace", () => {
    expect(inferRelationshipTypeForNoteTypes("quest", "area")).toEqual({
      relationshipType: "QuestAtPlace",
      swap: false,
    });
    expect(inferRelationshipTypeForNoteTypes("poi", "quest")).toEqual({
      relationshipType: "QuestAtPlace",
      swap: true,
    });
  });

  it("maps npc/character -> area/poi to NPCInPlace", () => {
    expect(inferRelationshipTypeForNoteTypes("npc", "area")).toEqual({
      relationshipType: "NPCInPlace",
      swap: false,
    });
    expect(inferRelationshipTypeForNoteTypes("area", "character")).toEqual({
      relationshipType: "NPCInPlace",
      swap: true,
    });
  });

  it("falls back to Related for other combinations", () => {
    expect(inferRelationshipTypeForNoteTypes("note", "note")).toEqual({
      relationshipType: "Related",
      swap: false,
    });
  });
});

describe("buildFirstSeenSeed (PRD-048 FR-4)", () => {
  it("builds a First seen section with session label and snippet", () => {
    const seed = buildFirstSeenSeed("2026-02-17", "Kettle greeted the party warmly.");
    expect(seed).toBe(
      '## First seen\n- Session 2026-02-17: "Kettle greeted the party warmly."'
    );
  });

  it("truncates long snippets", () => {
    const seed = buildFirstSeenSeed("2026-02-17", "x".repeat(500));
    expect(seed.length).toBeLessThan(300);
    expect(seed).toContain("...");
  });
});

describe("buildCleanupSuggestions (PRD-049)", () => {
  it("generates relationship suggestions for co-occurring entities", () => {
    const result = buildCleanupSuggestions({
      content: SESSION_CONTENT,
      existingNotes: [
        makeNote({ id: "npc-1", title: "Lord Blackwood", noteType: "npc" }),
        makeNote({ id: "area-1", title: "Silverwood Forest", noteType: "area" }),
      ],
      includeLow: true,
      mode: "baseline",
    });

    expect(result.relationshipSuggestions.length).toBeGreaterThan(0);

    const npcInPlace = result.relationshipSuggestions.find(
      (s) => s.relationshipType === "NPCInPlace"
    );
    expect(npcInPlace).toBeDefined();
    expect(npcInPlace!.fromNoteId).toBe("npc-1");
    expect(npcInPlace!.toNoteId).toBe("area-1");
    expect(npcInPlace!.snippetText.length).toBeGreaterThan(0);
    expect(npcInPlace!.evidenceType).toBe("Mention");
    expect(["HIGH", "REVIEW", "LOW"]).toContain(npcInPlace!.confidenceBucket);
  });

  it("marks suggestions with unmatched entities as requiring resolution", () => {
    const result = buildCleanupSuggestions({
      content: SESSION_CONTENT,
      existingNotes: [],
      includeLow: true,
      mode: "baseline",
    });

    for (const suggestion of result.relationshipSuggestions) {
      expect(suggestion.requiresResolution).toBe(true);
      expect(suggestion.fromNoteId).toBeNull();
    }
  });

  it("detects quest promotion suggestions from actionable text (PRD-049 FR-3)", () => {
    const result = buildCleanupSuggestions({
      content: SESSION_CONTENT,
      existingNotes: [
        makeNote({ id: "npc-1", title: "Lord Blackwood", noteType: "npc" }),
        makeNote({ id: "area-1", title: "Silverwood Forest", noteType: "area" }),
      ],
      includeLow: true,
      mode: "baseline",
    });

    expect(result.questSuggestions.length).toBeGreaterThan(0);
    const quest = result.questSuggestions[0];
    expect(quest.proposedQuestTitle).toMatch(/^Find Lost Relic/);
    expect(quest.snippetText).toContain("Find the Lost Relic");
    // Nearest known NPC/Area are suggested for auto-linking
    expect(quest.suggestedNpcNoteId).toBe("npc-1");
    expect(quest.suggestedAreaNoteId).toBe("area-1");
  });

  it("matches existing quests by title overlap", () => {
    const result = buildCleanupSuggestions({
      content: SESSION_CONTENT,
      existingNotes: [
        makeNote({ id: "quest-1", title: "Find Lost Relic", noteType: "quest" }),
      ],
      includeLow: true,
      mode: "baseline",
    });

    const quest = result.questSuggestions[0];
    expect(quest.existingQuestMatches.map((m) => m.id)).toContain("quest-1");
  });

  it("is deterministic for the same input", () => {
    const input = {
      content: SESSION_CONTENT,
      existingNotes: [
        makeNote({ id: "npc-1", title: "Lord Blackwood", noteType: "npc" }),
      ],
      includeLow: true,
      mode: "baseline" as const,
    };

    const first = buildCleanupSuggestions(input);
    const second = buildCleanupSuggestions(input);

    expect(first.sourceContentHash).toBe(second.sourceContentHash);
    expect(first.relationshipSuggestions.map((s) => s.id)).toEqual(
      second.relationshipSuggestions.map((s) => s.id)
    );
    expect(first.questSuggestions.map((s) => s.id)).toEqual(
      second.questSuggestions.map((s) => s.id)
    );
  });
});
