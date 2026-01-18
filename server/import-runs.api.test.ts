import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "./test/memory-storage";
import type { User, Team, TeamMember, Note } from "@shared/schema";

describe("Import Runs API (PRD-015A)", () => {
  let storage: MemoryStorage;
  let testUser: User;
  let testUser2: User;
  let testTeam: Team;
  let dmMember: TeamMember;
  let regularMember: TeamMember;

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

    // Add regular member
    regularMember = await storage.createTeamMember({
      teamId: testTeam.id,
      userId: testUser2.id,
      role: "member",
    });
  });

  describe("Import Run CRUD Operations", () => {
    it("should create an import run", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: {
          importEmptyPages: true,
          defaultVisibility: "private",
        },
        stats: {
          totalPagesDetected: 10,
          notesCreated: 8,
          notesUpdated: 1,
          notesSkipped: 1,
          emptyPagesImported: 2,
          linksResolved: 5,
          warningsCount: 2,
        },
      });

      expect(importRun.id).toBeDefined();
      expect(importRun.teamId).toBe(testTeam.id);
      expect(importRun.sourceSystem).toBe("NUCLINO");
      expect(importRun.createdByUserId).toBe(testUser.id);
      expect(importRun.status).toBe("completed");
      expect(importRun.options?.defaultVisibility).toBe("private");
      expect(importRun.stats?.notesCreated).toBe(8);
    });

    it("should get import runs for a team", async () => {
      // Create two import runs
      await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser2.id,
        status: "completed",
        options: { importEmptyPages: false, defaultVisibility: "team" },
        stats: null,
      });

      const importRuns = await storage.getImportRuns(testTeam.id);
      expect(importRuns.length).toBe(2);
    });

    it("should get a single import run by ID", async () => {
      const created = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      const fetched = await storage.getImportRun(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
    });

    it("should update import run status", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      const updated = await storage.updateImportRunStatus(importRun.id, "deleted");
      expect(updated.status).toBe("deleted");
    });

    it("should update import run with stats", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      const stats = {
        totalPagesDetected: 10,
        notesCreated: 8,
        notesUpdated: 1,
        notesSkipped: 1,
        emptyPagesImported: 2,
        linksResolved: 5,
        warningsCount: 2,
      };

      const updated = await storage.updateImportRun(importRun.id, { stats });
      expect(updated.stats).toEqual(stats);
    });
  });

  describe("Notes by Import Run", () => {
    it("should get notes by import run ID", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      // Create notes with importRunId
      await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note 1",
        noteType: "note",
        importRunId: importRun.id,
        createdByUserId: testUser.id,
        updatedByUserId: testUser.id,
      });

      await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note 2",
        noteType: "person",
        importRunId: importRun.id,
        createdByUserId: testUser.id,
        updatedByUserId: testUser.id,
      });

      // Create a note without importRunId (not from this import)
      await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Manual Note",
        noteType: "note",
      });

      const importedNotes = await storage.getNotesByImportRun(importRun.id);
      expect(importedNotes.length).toBe(2);
      expect(importedNotes.map(n => n.title)).toContain("Note 1");
      expect(importedNotes.map(n => n.title)).toContain("Note 2");
    });

    it("should delete notes by import run ID", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      // Create notes with importRunId
      await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note 1",
        noteType: "note",
        importRunId: importRun.id,
      });

      await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note 2",
        noteType: "note",
        importRunId: importRun.id,
      });

      // Create a note without importRunId
      await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Manual Note",
        noteType: "note",
      });

      const deletedCount = await storage.deleteNotesByImportRun(importRun.id);
      expect(deletedCount).toBe(2);

      // Verify only manual note remains
      const allNotes = await storage.getNotes(testTeam.id);
      expect(allNotes.length).toBe(1);
      expect(allNotes[0].title).toBe("Manual Note");
    });
  });

  describe("Note Import Snapshots (FR-6)", () => {
    it("should create a snapshot before updating note", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      // Create existing note
      const existingNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Original Title",
        content: "Original content",
        noteType: "note",
        isPrivate: false,
      });

      // Create snapshot
      const snapshot = await storage.createNoteImportSnapshot({
        noteId: existingNote.id,
        importRunId: importRun.id,
        previousTitle: existingNote.title,
        previousContent: existingNote.content,
        previousNoteType: existingNote.noteType,
        previousQuestStatus: existingNote.questStatus,
        previousContentMarkdown: existingNote.contentMarkdown,
        previousContentMarkdownResolved: existingNote.contentMarkdownResolved,
        previousIsPrivate: existingNote.isPrivate,
      });

      expect(snapshot.id).toBeDefined();
      expect(snapshot.noteId).toBe(existingNote.id);
      expect(snapshot.previousTitle).toBe("Original Title");
      expect(snapshot.previousContent).toBe("Original content");
    });

    it("should restore note from snapshot", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      // Create note with original content
      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Original Title",
        content: "Original content",
        noteType: "note",
        isPrivate: false,
      });

      // Create snapshot
      const snapshot = await storage.createNoteImportSnapshot({
        noteId: note.id,
        importRunId: importRun.id,
        previousTitle: note.title,
        previousContent: note.content,
        previousNoteType: note.noteType,
        previousQuestStatus: note.questStatus,
        previousContentMarkdown: note.contentMarkdown,
        previousContentMarkdownResolved: note.contentMarkdownResolved,
        previousIsPrivate: note.isPrivate,
      });

      // Update note (simulating import update)
      await storage.updateNote(note.id, {
        title: "Updated Title",
        content: "Updated content",
        importRunId: importRun.id,
      });

      // Verify note was updated
      let updatedNote = await storage.getNote(note.id);
      expect(updatedNote?.title).toBe("Updated Title");
      expect(updatedNote?.content).toBe("Updated content");

      // Restore from snapshot
      const restored = await storage.restoreNoteFromSnapshot(snapshot.id);
      expect(restored.title).toBe("Original Title");
      expect(restored.content).toBe("Original content");
      expect(restored.importRunId).toBeNull(); // importRunId should be cleared
    });

    it("should get snapshots by import run", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      // Create two notes
      const note1 = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note 1",
        noteType: "note",
      });

      const note2 = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note 2",
        noteType: "note",
      });

      // Create snapshots for both
      await storage.createNoteImportSnapshot({
        noteId: note1.id,
        importRunId: importRun.id,
        previousTitle: note1.title,
        previousNoteType: note1.noteType,
      });

      await storage.createNoteImportSnapshot({
        noteId: note2.id,
        importRunId: importRun.id,
        previousTitle: note2.title,
        previousNoteType: note2.noteType,
      });

      const snapshots = await storage.getSnapshotsByImportRun(importRun.id);
      expect(snapshots.length).toBe(2);
    });

    it("should delete snapshots by import run", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Note",
        noteType: "note",
      });

      await storage.createNoteImportSnapshot({
        noteId: note.id,
        importRunId: importRun.id,
        previousTitle: note.title,
        previousNoteType: note.noteType,
      });

      let snapshots = await storage.getSnapshotsByImportRun(importRun.id);
      expect(snapshots.length).toBe(1);

      await storage.deleteSnapshotsByImportRun(importRun.id);

      snapshots = await storage.getSnapshotsByImportRun(importRun.id);
      expect(snapshots.length).toBe(0);
    });
  });

  describe("Visibility Settings", () => {
    it("should set isPrivate=true for private visibility", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Private Note",
        noteType: "note",
        isPrivate: true, // Private visibility
        importRunId: importRun.id,
        createdByUserId: testUser.id,
        updatedByUserId: testUser.id,
      });

      expect(note.isPrivate).toBe(true);
    });

    it("should set isPrivate=false for team visibility", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "team" },
        stats: null,
      });

      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Team Note",
        noteType: "note",
        isPrivate: false, // Team visibility
        importRunId: importRun.id,
        createdByUserId: testUser.id,
        updatedByUserId: testUser.id,
      });

      expect(note.isPrivate).toBe(false);
    });
  });

  describe("Attribution Fields", () => {
    it("should store createdByUserId and updatedByUserId on imported notes", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Imported Note",
        noteType: "note",
        importRunId: importRun.id,
        createdByUserId: testUser.id,
        updatedByUserId: testUser.id,
      });

      expect(note.importRunId).toBe(importRun.id);
      expect(note.createdByUserId).toBe(testUser.id);
      expect(note.updatedByUserId).toBe(testUser.id);
    });
  });
});
