import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "./test/memory-storage";
import type { User, Team, TeamMember, ImportRun } from "@shared/schema";
import {
  areTypesEquivalent,
  mapNoteTypeToInferredType,
  mapInferredTypeToNoteType,
  getConfidenceLevel,
  getConfidenceBadgeClass,
} from "@shared/ai-preview-types";

describe("AI Preview API (PRD-030)", () => {
  let storage: MemoryStorage;
  let testUser: User;
  let testTeam: Team;
  let dmMember: TeamMember;
  let importRun: ImportRun;

  beforeEach(async () => {
    storage = new MemoryStorage();

    // Create test user
    testUser = {
      id: "user-1",
      email: "dm@test.com",
      firstName: "Test",
      lastName: "DM",
      profileImageUrl: null,
      timezone: "America/New_York",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    storage.setUser(testUser);

    // Create test team
    testTeam = await storage.createTeam({
      name: "Test Team",
      teamType: "dnd",
      diceMode: "polyhedral",
      ownerId: testUser.id,
    });

    // Add DM member with AI enabled
    dmMember = await storage.createTeamMember({
      teamId: testTeam.id,
      userId: testUser.id,
      role: "dm",
      aiEnabled: true,
    });

    // Create import run
    importRun = await storage.createImportRun({
      teamId: testTeam.id,
      sourceSystem: "NUCLINO",
      createdByUserId: testUser.id,
      status: "completed",
      options: { importEmptyPages: true, defaultVisibility: "private" },
      stats: {
        totalPagesDetected: 5,
        notesCreated: 5,
        notesUpdated: 0,
        notesSkipped: 0,
        emptyPagesImported: 0,
        linksResolved: 0,
        warningsCount: 0,
      },
    });
  });

  describe("Type Mapping Utilities", () => {
    it("should map NoteType to InferredEntityType correctly", () => {
      expect(mapNoteTypeToInferredType("character")).toBe("Character");
      expect(mapNoteTypeToInferredType("npc")).toBe("NPC");
      expect(mapNoteTypeToInferredType("poi")).toBe("Area");
      expect(mapNoteTypeToInferredType("area")).toBe("Area");
      expect(mapNoteTypeToInferredType("quest")).toBe("Quest");
      expect(mapNoteTypeToInferredType("session_log")).toBe("SessionLog");
      expect(mapNoteTypeToInferredType("note")).toBe("Note");
    });

    it("should map InferredEntityType to NoteType correctly", () => {
      expect(mapInferredTypeToNoteType("Character")).toBe("character");
      expect(mapInferredTypeToNoteType("NPC")).toBe("npc");
      expect(mapInferredTypeToNoteType("Area")).toBe("poi");
      expect(mapInferredTypeToNoteType("Quest")).toBe("quest");
      expect(mapInferredTypeToNoteType("SessionLog")).toBe("session_log");
      expect(mapInferredTypeToNoteType("Note")).toBe("note");
    });

    it("should detect equivalent types correctly", () => {
      expect(areTypesEquivalent("npc", "NPC")).toBe(true);
      expect(areTypesEquivalent("poi", "Area")).toBe(true);
      expect(areTypesEquivalent("area", "Area")).toBe(true);
      expect(areTypesEquivalent("quest", "Quest")).toBe(true);
      expect(areTypesEquivalent("npc", "Character")).toBe(false);
      expect(areTypesEquivalent("note", "NPC")).toBe(false);
    });
  });

  describe("Confidence Level Utilities", () => {
    it("should categorize confidence levels correctly", () => {
      expect(getConfidenceLevel(0.95)).toBe("high");
      expect(getConfidenceLevel(0.80)).toBe("high");
      expect(getConfidenceLevel(0.79)).toBe("medium");
      expect(getConfidenceLevel(0.65)).toBe("medium");
      expect(getConfidenceLevel(0.64)).toBe("low");
      expect(getConfidenceLevel(0.50)).toBe("low");
      expect(getConfidenceLevel(0.30)).toBe("low");
    });

    it("should return correct badge classes", () => {
      const highBadge = getConfidenceBadgeClass(0.85);
      expect(highBadge).toContain("green");

      const mediumBadge = getConfidenceBadgeClass(0.70);
      expect(mediumBadge).toContain("yellow");

      const lowBadge = getConfidenceBadgeClass(0.55);
      expect(lowBadge).toContain("red");
    });
  });

  describe("AI Feature Gating", () => {
    it("should check aiEnabled flag on team member", async () => {
      // Verify DM has AI enabled
      const member = await storage.getTeamMember(testTeam.id, testUser.id);
      expect(member?.aiEnabled).toBe(true);
    });

    it("should create member without AI by default", async () => {
      const testUser2: User = {
        id: "user-2",
        email: "player@test.com",
        firstName: "Test",
        lastName: "Player",
        profileImageUrl: null,
        timezone: "America/New_York",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      storage.setUser(testUser2);

      const playerMember = await storage.createTeamMember({
        teamId: testTeam.id,
        userId: testUser2.id,
        role: "member",
      });

      expect(playerMember.aiEnabled).toBe(false);
    });
  });

  describe("Enrichment Run Storage", () => {
    it("should create enrichment run with totals", async () => {
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "completed",
      });

      expect(enrichmentRun.id).toBeDefined();
      expect(enrichmentRun.status).toBe("completed");

      // Update with totals
      const updatedRun = await storage.updateEnrichmentRun(enrichmentRun.id, {
        totals: {
          notesProcessed: 5,
          classificationsCreated: 5,
          relationshipsFound: 3,
          highConfidenceCount: 4,
          lowConfidenceCount: 1,
          userReviewRequired: 1,
        },
      });

      expect(updatedRun.totals).toBeDefined();
      expect(updatedRun.totals?.notesProcessed).toBe(5);
      expect(updatedRun.totals?.relationshipsFound).toBe(3);
    });

    it("should store note classifications", async () => {
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "running",
      });

      // Create a note first
      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Test NPC",
        content: "A mysterious character",
        noteType: "note",
      });

      // Store classification
      const classification = await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.85,
        explanation: "Character with proper name and dialogue",
        extractedEntities: ["Lord Gareth", "Silvertown"],
        status: "pending",
      });

      expect(classification.id).toBeDefined();
      expect(classification.inferredType).toBe("NPC");
      expect(classification.confidence).toBe(0.85);
      expect(classification.extractedEntities).toContain("Lord Gareth");
    });

    it("should store note relationships", async () => {
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "running",
      });

      // Create two notes
      const note1 = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Lord Gareth",
        content: "A noble from Silvertown",
        noteType: "npc",
      });

      const note2 = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Silvertown",
        content: "A prosperous city",
        noteType: "poi",
      });

      // Store relationship
      const relationship = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: note1.id,
        toNoteId: note2.id,
        relationshipType: "NPCInPlace",
        confidence: 0.90,
        evidenceSnippet: "A noble from Silvertown",
        evidenceType: "Mention",
        status: "pending",
      });

      expect(relationship.id).toBeDefined();
      expect(relationship.relationshipType).toBe("NPCInPlace");
      expect(relationship.confidence).toBe(0.90);
      expect(relationship.evidenceType).toBe("Mention");
    });
  });

  describe("Diff Calculation Logic", () => {
    it("should count changed types when AI differs from baseline", () => {
      const baseline = [
        { sourcePageId: "1", noteType: "note" as const },
        { sourcePageId: "2", noteType: "note" as const },
        { sourcePageId: "3", noteType: "npc" as const },
      ];

      const aiClassifications = [
        { sourcePageId: "1", inferredType: "NPC" as const },
        { sourcePageId: "2", inferredType: "Area" as const },
        { sourcePageId: "3", inferredType: "NPC" as const },
      ];

      let changedCount = 0;
      let upgradedCount = 0;

      for (const ai of aiClassifications) {
        const base = baseline.find(b => b.sourcePageId === ai.sourcePageId);
        if (base) {
          if (areTypesEquivalent(base.noteType, ai.inferredType)) {
            upgradedCount++;
          } else {
            changedCount++;
          }
        }
      }

      expect(changedCount).toBe(2); // note->NPC, note->Area
      expect(upgradedCount).toBe(1); // npc->NPC (confirmed)
    });
  });
});
