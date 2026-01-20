import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "./test/memory-storage";
import type { User, Team, TeamMember, Note, ImportRun, EnrichmentRun } from "@shared/schema";

describe("Enrichment API (PRD-016)", () => {
  let storage: MemoryStorage;
  let testUser: User;
  let testUser2: User;
  let testTeam: Team;
  let dmMember: TeamMember;
  let importRun: ImportRun;

  beforeEach(async () => {
    storage = new MemoryStorage();

    // Create test users
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

    testUser2 = {
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

    // Create test team
    testTeam = await storage.createTeam({
      name: "Test Team",
      teamType: "dnd",
      diceMode: "polyhedral",
      ownerId: testUser.id,
    });

    // Add DM member
    dmMember = await storage.createTeamMember({
      teamId: testTeam.id,
      userId: testUser.id,
      role: "dm",
    });

    // Create an import run to use for enrichment tests
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

  describe("Enrichment Run CRUD Operations", () => {
    it("should create an enrichment run", async () => {
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "pending",
      });

      expect(enrichmentRun.id).toBeDefined();
      expect(enrichmentRun.importRunId).toBe(importRun.id);
      expect(enrichmentRun.teamId).toBe(testTeam.id);
      expect(enrichmentRun.createdByUserId).toBe(testUser.id);
      expect(enrichmentRun.status).toBe("pending");
      expect(enrichmentRun.createdAt).toBeDefined();
    });

    it("should get enrichment run by ID", async () => {
      const created = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "pending",
      });

      const fetched = await storage.getEnrichmentRun(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.importRunId).toBe(importRun.id);
    });

    it("should return undefined for non-existent enrichment run", async () => {
      const fetched = await storage.getEnrichmentRun("non-existent-id");
      expect(fetched).toBeUndefined();
    });

    it("should get enrichment run by import run ID", async () => {
      const created = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "pending",
      });

      const fetched = await storage.getEnrichmentRunByImportId(importRun.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
    });

    it("should update enrichment run status", async () => {
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "pending",
      });

      const updated = await storage.updateEnrichmentRunStatus(enrichmentRun.id, "running");
      expect(updated.status).toBe("running");
      expect(updated.startedAt).toBeDefined();
    });

    it("should update enrichment run with totals", async () => {
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "pending",
      });

      const totals = {
        notesProcessed: 5,
        classificationsCreated: 5,
        relationshipsFound: 3,
        highConfidenceCount: 4,
        lowConfidenceCount: 1,
        userReviewRequired: 1,
      };

      const updated = await storage.updateEnrichmentRun(enrichmentRun.id, {
        status: "completed",
        totals,
      });

      expect(updated.status).toBe("completed");
      expect(updated.totals).toEqual(totals);
    });

    it("should update enrichment run with error message on failure", async () => {
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "running",
      });

      const updated = await storage.updateEnrichmentRun(enrichmentRun.id, {
        status: "failed",
        errorMessage: "AI provider error: Rate limit exceeded",
      });

      expect(updated.status).toBe("failed");
      expect(updated.errorMessage).toBe("AI provider error: Rate limit exceeded");
    });
  });

  describe("Note Classification Operations", () => {
    let enrichmentRun: EnrichmentRun;
    let note1: Note;
    let note2: Note;

    beforeEach(async () => {
      // Create notes for the import
      note1 = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Gandalf the Grey",
        content: "A powerful wizard who guides the fellowship.",
        noteType: "note",
        importRunId: importRun.id,
      });

      note2 = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Moria",
        content: "The ancient dwarven city beneath the Misty Mountains.",
        noteType: "note",
        importRunId: importRun.id,
      });

      enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "running",
      });
    });

    it("should create a note classification", async () => {
      const classification = await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.92,
        explanation: "Name pattern suggests a person (Gandalf)",
        extractedEntities: ["wizard", "fellowship"],
        status: "pending",
      });

      expect(classification.id).toBeDefined();
      expect(classification.noteId).toBe(note1.id);
      expect(classification.enrichmentRunId).toBe(enrichmentRun.id);
      expect(classification.inferredType).toBe("NPC");
      expect(classification.confidence).toBe(0.92);
      expect(classification.status).toBe("pending");
    });

    it("should get classifications by enrichment run", async () => {
      await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.92,
        status: "pending",
      });

      await storage.createNoteClassification({
        noteId: note2.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "Area",
        confidence: 0.88,
        status: "pending",
      });

      const classifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRun.id);
      expect(classifications.length).toBe(2);
      expect(classifications.map(c => c.inferredType)).toContain("NPC");
      expect(classifications.map(c => c.inferredType)).toContain("Area");
    });

    it("should get single classification by note ID", async () => {
      await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.92,
        status: "pending",
      });

      // getNoteClassification gets by noteId, not by classification id
      const fetched = await storage.getNoteClassification(note1.id);
      expect(fetched).toBeDefined();
      expect(fetched?.noteId).toBe(note1.id);
      expect(fetched?.inferredType).toBe("NPC");
    });

    it("should update classification status to approved", async () => {
      const classification = await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.92,
        status: "pending",
      });

      const updated = await storage.updateNoteClassificationStatus(
        classification.id,
        "approved",
        testUser.id
      );

      expect(updated.status).toBe("approved");
      expect(updated.approvedByUserId).toBe(testUser.id);
    });

    it("should update classification status to rejected", async () => {
      const classification = await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "Quest",
        confidence: 0.55,
        status: "pending",
      });

      const updated = await storage.updateNoteClassificationStatus(
        classification.id,
        "rejected",
        testUser.id
      );

      expect(updated.status).toBe("rejected");
      // approvedByUserId is only set for "approved" status
      expect(updated.approvedByUserId).toBeNull();
    });

    it("should bulk approve high-confidence classifications", async () => {
      const c1 = await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.92,
        status: "pending",
      });

      const c2 = await storage.createNoteClassification({
        noteId: note2.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "Area",
        confidence: 0.88,
        status: "pending",
      });

      const count = await storage.bulkUpdateClassificationStatus(
        [c1.id, c2.id],
        "approved",
        testUser.id
      );

      expect(count).toBe(2);

      const classifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRun.id);
      expect(classifications.every(c => c.status === "approved")).toBe(true);
    });

    it("should delete classifications by enrichment run", async () => {
      await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.92,
        status: "pending",
      });

      await storage.createNoteClassification({
        noteId: note2.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "Area",
        confidence: 0.88,
        status: "pending",
      });

      // Verify we have 2 classifications before delete
      let classifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRun.id);
      expect(classifications.length).toBe(2);

      await storage.deleteClassificationsByEnrichmentRun(enrichmentRun.id);

      const remaining = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRun.id);
      expect(remaining.length).toBe(0);
    });
  });

  describe("Note Relationship Operations", () => {
    let enrichmentRun: EnrichmentRun;
    let questNote: Note;
    let npcNote: Note;
    let placeNote: Note;

    beforeEach(async () => {
      // Create notes representing different entity types
      questNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Destroy the Ring",
        content: "The fellowship must travel to Mount Doom to destroy the One Ring.",
        noteType: "quest",
        importRunId: importRun.id,
      });

      npcNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Frodo Baggins",
        content: "A hobbit tasked with carrying the Ring.",
        noteType: "npc",
        importRunId: importRun.id,
      });

      placeNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Mount Doom",
        content: "The volcanic mountain where the Ring was forged.",
        noteType: "poi",
        importRunId: importRun.id,
      });

      enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "running",
      });
    });

    it("should create a note relationship", async () => {
      const relationship = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: npcNote.id,
        relationshipType: "QuestHasNPC",
        confidence: 0.85,
        evidenceSnippet: "Frodo is tasked with carrying the Ring",
        evidenceType: "Mention",
        status: "pending",
      });

      expect(relationship.id).toBeDefined();
      expect(relationship.fromNoteId).toBe(questNote.id);
      expect(relationship.toNoteId).toBe(npcNote.id);
      expect(relationship.relationshipType).toBe("QuestHasNPC");
      expect(relationship.confidence).toBe(0.85);
    });

    it("should get relationships by enrichment run", async () => {
      await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: npcNote.id,
        relationshipType: "QuestHasNPC",
        confidence: 0.85,
        evidenceType: "Mention",
        status: "pending",
      });

      await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: placeNote.id,
        relationshipType: "QuestAtPlace",
        confidence: 0.90,
        evidenceType: "Mention",
        status: "pending",
      });

      const relationships = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRun.id);
      expect(relationships.length).toBe(2);
      expect(relationships.map(r => r.relationshipType)).toContain("QuestHasNPC");
      expect(relationships.map(r => r.relationshipType)).toContain("QuestAtPlace");
    });

    it("should get relationships for a specific note", async () => {
      await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: npcNote.id,
        relationshipType: "QuestHasNPC",
        confidence: 0.85,
        evidenceType: "Mention",
        status: "pending",
      });

      await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: npcNote.id,
        toNoteId: placeNote.id,
        relationshipType: "NPCInPlace",
        confidence: 0.75,
        evidenceType: "Heuristic",
        status: "pending",
      });

      // Get relationships where questNote is involved
      const questRelationships = await storage.getRelationshipsForNote(questNote.id);
      expect(questRelationships.length).toBe(1);
      expect(questRelationships[0].relationshipType).toBe("QuestHasNPC");

      // Get relationships where npcNote is involved (appears in both)
      const npcRelationships = await storage.getRelationshipsForNote(npcNote.id);
      expect(npcRelationships.length).toBe(2);
    });

    it("should update relationship status to approved", async () => {
      const relationship = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: npcNote.id,
        relationshipType: "QuestHasNPC",
        confidence: 0.85,
        evidenceType: "Mention",
        status: "pending",
      });

      const updated = await storage.updateNoteRelationshipStatus(
        relationship.id,
        "approved",
        testUser.id
      );

      expect(updated.status).toBe("approved");
      expect(updated.approvedByUserId).toBe(testUser.id);
    });

    it("should update relationship status to rejected", async () => {
      const relationship = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: placeNote.id,
        relationshipType: "Related",
        confidence: 0.50,
        evidenceType: "Heuristic",
        status: "pending",
      });

      const updated = await storage.updateNoteRelationshipStatus(
        relationship.id,
        "rejected",
        testUser.id
      );

      expect(updated.status).toBe("rejected");
      // approvedByUserId is only set for "approved" status
      expect(updated.approvedByUserId).toBeNull();
    });

    it("should bulk approve relationships", async () => {
      const r1 = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: npcNote.id,
        relationshipType: "QuestHasNPC",
        confidence: 0.85,
        evidenceType: "Mention",
        status: "pending",
      });

      const r2 = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: placeNote.id,
        relationshipType: "QuestAtPlace",
        confidence: 0.90,
        evidenceType: "Link",
        status: "pending",
      });

      const count = await storage.bulkUpdateRelationshipStatus(
        [r1.id, r2.id],
        "approved",
        testUser.id
      );

      expect(count).toBe(2);

      const relationships = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRun.id);
      expect(relationships.every(r => r.status === "approved")).toBe(true);
    });

    it("should delete relationships by enrichment run", async () => {
      await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: npcNote.id,
        relationshipType: "QuestHasNPC",
        confidence: 0.85,
        evidenceType: "Mention",
        status: "pending",
      });

      await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: questNote.id,
        toNoteId: placeNote.id,
        relationshipType: "QuestAtPlace",
        confidence: 0.90,
        evidenceType: "Link",
        status: "pending",
      });

      // Verify we have 2 relationships before delete
      let relationships = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRun.id);
      expect(relationships.length).toBe(2);

      await storage.deleteRelationshipsByEnrichmentRun(enrichmentRun.id);

      const remaining = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRun.id);
      expect(remaining.length).toBe(0);
    });
  });

  describe("Confidence Thresholds", () => {
    let enrichmentRun: EnrichmentRun;
    let note: Note;

    beforeEach(async () => {
      note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Test Note",
        content: "Test content",
        noteType: "note",
        importRunId: importRun.id,
      });

      enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "running",
      });
    });

    it("should store high confidence classifications (>=0.80)", async () => {
      const classification = await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.92,
        status: "pending",
      });

      expect(classification.confidence).toBeGreaterThanOrEqual(0.80);
    });

    it("should store low confidence classifications (<0.65)", async () => {
      const classification = await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "Quest",
        confidence: 0.52,
        status: "pending",
      });

      expect(classification.confidence).toBeLessThan(0.65);
    });

    it("should store medium confidence classifications (0.65-0.80)", async () => {
      const classification = await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "Area",
        confidence: 0.72,
        status: "pending",
      });

      expect(classification.confidence).toBeGreaterThanOrEqual(0.65);
      expect(classification.confidence).toBeLessThan(0.80);
    });
  });

  describe("Full Enrichment Workflow", () => {
    it("should support complete enrichment lifecycle", async () => {
      // 1. Create notes from import
      const notes = await Promise.all([
        storage.createNote({
          teamId: testTeam.id,
          authorId: testUser.id,
          title: "The Dark Forest",
          content: "A mysterious forest where the party must venture.",
          noteType: "note",
          importRunId: importRun.id,
        }),
        storage.createNote({
          teamId: testTeam.id,
          authorId: testUser.id,
          title: "Elder Druid",
          content: "An ancient guardian of the forest.",
          noteType: "note",
          importRunId: importRun.id,
        }),
        storage.createNote({
          teamId: testTeam.id,
          authorId: testUser.id,
          title: "Find the Sacred Grove",
          content: "Locate the ancient grove in the Dark Forest with help from the Elder Druid.",
          noteType: "note",
          importRunId: importRun.id,
        }),
      ]);

      // 2. Start enrichment run
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "pending",
      });

      await storage.updateEnrichmentRunStatus(enrichmentRun.id, "running");

      // 3. Create classifications
      const classifications = await Promise.all([
        storage.createNoteClassification({
          noteId: notes[0].id,
          enrichmentRunId: enrichmentRun.id,
          inferredType: "Area",
          confidence: 0.88,
          explanation: "Forest location mentioned",
          status: "pending",
        }),
        storage.createNoteClassification({
          noteId: notes[1].id,
          enrichmentRunId: enrichmentRun.id,
          inferredType: "NPC",
          confidence: 0.85,
          explanation: "Character title 'Elder Druid' suggests person",
          status: "pending",
        }),
        storage.createNoteClassification({
          noteId: notes[2].id,
          enrichmentRunId: enrichmentRun.id,
          inferredType: "Quest",
          confidence: 0.92,
          explanation: "Action-oriented title 'Find the...' suggests quest",
          status: "pending",
        }),
      ]);

      // 4. Create relationships
      const relationships = await Promise.all([
        storage.createNoteRelationship({
          enrichmentRunId: enrichmentRun.id,
          fromNoteId: notes[2].id, // Quest
          toNoteId: notes[0].id, // Place
          relationshipType: "QuestAtPlace",
          confidence: 0.85,
          evidenceSnippet: "Dark Forest",
          evidenceType: "Mention",
          status: "pending",
        }),
        storage.createNoteRelationship({
          enrichmentRunId: enrichmentRun.id,
          fromNoteId: notes[2].id, // Quest
          toNoteId: notes[1].id, // NPC
          relationshipType: "QuestHasNPC",
          confidence: 0.80,
          evidenceSnippet: "Elder Druid",
          evidenceType: "Mention",
          status: "pending",
        }),
        storage.createNoteRelationship({
          enrichmentRunId: enrichmentRun.id,
          fromNoteId: notes[1].id, // NPC
          toNoteId: notes[0].id, // Place
          relationshipType: "NPCInPlace",
          confidence: 0.75,
          evidenceSnippet: "guardian of the forest",
          evidenceType: "Heuristic",
          status: "pending",
        }),
      ]);

      // 5. Complete enrichment run
      await storage.updateEnrichmentRun(enrichmentRun.id, {
        status: "completed",
        totals: {
          notesProcessed: 3,
          classificationsCreated: 3,
          relationshipsFound: 3,
          highConfidenceCount: 5,
          lowConfidenceCount: 0,
          userReviewRequired: 1,
        },
      });

      // 6. Verify enrichment run completion
      const completedRun = await storage.getEnrichmentRun(enrichmentRun.id);
      expect(completedRun?.status).toBe("completed");
      expect(completedRun?.totals?.notesProcessed).toBe(3);

      // 7. User reviews and bulk approves high-confidence classifications
      const highConfidenceIds = classifications
        .filter(c => c.confidence >= 0.80)
        .map(c => c.id);

      await storage.bulkUpdateClassificationStatus(highConfidenceIds, "approved", testUser.id);

      // 8. User bulk approves high-confidence relationships
      const highConfRelIds = relationships
        .filter(r => r.confidence >= 0.80)
        .map(r => r.id);

      await storage.bulkUpdateRelationshipStatus(highConfRelIds, "approved", testUser.id);

      // 9. Verify approvals
      const allClassifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRun.id);
      const approvedClassifications = allClassifications.filter(c => c.status === "approved");
      expect(approvedClassifications.length).toBe(3);

      const allRelationships = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRun.id);
      const approvedRelationships = allRelationships.filter(r => r.status === "approved");
      expect(approvedRelationships.length).toBe(2);
    });

    it("should support undo enrichment run", async () => {
      // Create enrichment run with data
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "completed",
      });

      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Test Note",
        noteType: "note",
        importRunId: importRun.id,
      });

      await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.85,
        status: "approved",
      });

      await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: note.id,
        toNoteId: note.id,
        relationshipType: "Related",
        confidence: 0.70,
        evidenceType: "Heuristic",
        status: "pending",
      });

      // Verify data exists before undo
      let classifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRun.id);
      let relationships = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRun.id);
      expect(classifications.length).toBe(1);
      expect(relationships.length).toBe(1);

      // Undo: delete classifications and relationships
      await storage.deleteClassificationsByEnrichmentRun(enrichmentRun.id);
      await storage.deleteRelationshipsByEnrichmentRun(enrichmentRun.id);

      // Verify cleanup
      const remainingClassifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRun.id);
      const remainingRelationships = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRun.id);

      expect(remainingClassifications.length).toBe(0);
      expect(remainingRelationships.length).toBe(0);
    });
  });

  describe("Extracted Entities", () => {
    it("should store and retrieve extracted entities from classifications", async () => {
      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Battle of Helm's Deep",
        content: "Aragorn and Legolas defended the fortress against Saruman's army.",
        noteType: "note",
        importRunId: importRun.id,
      });

      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "running",
      });

      const classification = await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "SessionLog",
        confidence: 0.78,
        explanation: "Battle narrative suggests session log",
        extractedEntities: ["Aragorn", "Legolas", "Saruman", "Helm's Deep"],
        status: "pending",
      });

      expect(classification.extractedEntities).toBeDefined();
      expect(classification.extractedEntities).toContain("Aragorn");
      expect(classification.extractedEntities).toContain("Helm's Deep");
      expect(classification.extractedEntities?.length).toBe(4);
    });
  });

  describe("Evidence Types", () => {
    let enrichmentRun: EnrichmentRun;
    let note1: Note;
    let note2: Note;

    beforeEach(async () => {
      note1 = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note 1",
        noteType: "note",
        importRunId: importRun.id,
      });

      note2 = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note 2",
        noteType: "note",
        importRunId: importRun.id,
      });

      enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: testTeam.id,
        createdByUserId: testUser.id,
        status: "running",
      });
    });

    it("should support Link evidence type", async () => {
      const relationship = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: note1.id,
        toNoteId: note2.id,
        relationshipType: "Related",
        confidence: 0.95,
        evidenceSnippet: "[Note 2](/notes/note-2)",
        evidenceType: "Link",
        status: "pending",
      });

      expect(relationship.evidenceType).toBe("Link");
    });

    it("should support Mention evidence type", async () => {
      const relationship = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: note1.id,
        toNoteId: note2.id,
        relationshipType: "Related",
        confidence: 0.80,
        evidenceSnippet: "See also the information about Note 2",
        evidenceType: "Mention",
        status: "pending",
      });

      expect(relationship.evidenceType).toBe("Mention");
    });

    it("should support Heuristic evidence type", async () => {
      const relationship = await storage.createNoteRelationship({
        enrichmentRunId: enrichmentRun.id,
        fromNoteId: note1.id,
        toNoteId: note2.id,
        relationshipType: "Related",
        confidence: 0.60,
        evidenceSnippet: "Similar topics detected",
        evidenceType: "Heuristic",
        status: "pending",
      });

      expect(relationship.evidenceType).toBe("Heuristic");
    });
  });
});
