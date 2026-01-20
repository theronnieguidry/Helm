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
        noteType: "npc",
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

  describe("Suggestion-Created Entity Cascade Delete (PRD-034)", () => {
    it("should delete suggestion-created notes when their source import is deleted", async () => {
      // 1. Create import run
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      // 2. Create a session log from the import
      const sessionNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Session 1",
        noteType: "session_log",
        importRunId: importRun.id,
      });

      // 3. Create an entity note from suggestions panel (linked to same import)
      const entityNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Gandalf the Grey",
        noteType: "npc",
        importRunId: importRun.id, // Key: inherits import run ID from session
      });

      // 4. Create a backlink from session to entity
      await storage.createBacklink({
        sourceNoteId: sessionNote.id,
        targetNoteId: entityNote.id,
        textSnippet: "met Gandalf the Grey",
      });

      // Verify notes exist
      let allNotes = await storage.getNotes(testTeam.id);
      expect(allNotes.length).toBe(2);

      // 5. Delete the import run notes
      await storage.deleteNotesByImportRun(importRun.id);

      // 6. Verify both notes are deleted
      allNotes = await storage.getNotes(testTeam.id);
      expect(allNotes.length).toBe(0);
    });

    it("should NOT delete manually-created notes when an import is deleted", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      // Create session from import
      await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Imported Session",
        noteType: "session_log",
        importRunId: importRun.id,
      });

      // Create manual note (no importRunId - simulating note created outside of imported session)
      const manualNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "My Manual Note",
        noteType: "note",
        // No importRunId - this is a manually created note
      });

      // Delete import
      await storage.deleteNotesByImportRun(importRun.id);

      // Manual note should still exist
      const allNotes = await storage.getNotes(testTeam.id);
      expect(allNotes.length).toBe(1);
      expect(allNotes[0].id).toBe(manualNote.id);
    });

    it("should delete backlinks when suggestion-created entity is deleted with import", async () => {
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      const sessionNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Session",
        noteType: "session_log",
        importRunId: importRun.id,
      });

      const entityNote = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Entity",
        noteType: "npc",
        importRunId: importRun.id,
      });

      await storage.createBacklink({
        sourceNoteId: sessionNote.id,
        targetNoteId: entityNote.id,
        textSnippet: "reference",
      });

      // Verify backlink exists
      let backlinks = await storage.getBacklinks(entityNote.id);
      expect(backlinks.length).toBe(1);

      // Delete import
      await storage.deleteNotesByImportRun(importRun.id);

      // Notes should all be gone
      const allNotes = await storage.getNotes(testTeam.id);
      expect(allNotes.length).toBe(0);
    });

    it("should allow creating notes with importRunId via API-style call", async () => {
      // This tests that importRunId can be passed when creating notes
      // (simulating what happens when suggestions panel creates an entity)
      const importRun = await storage.createImportRun({
        teamId: testTeam.id,
        sourceSystem: "NUCLINO",
        createdByUserId: testUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: null,
      });

      // Create note with explicit importRunId (like suggestion panel would do)
      const note = await storage.createNote({
        teamId: testTeam.id,
        authorId: testUser.id,
        title: "Suggestion Entity",
        noteType: "npc",
        importRunId: importRun.id,
      });

      expect(note.importRunId).toBe(importRun.id);

      // Verify it's tracked as part of import
      const importedNotes = await storage.getNotesByImportRun(importRun.id);
      expect(importedNotes.length).toBe(1);
      expect(importedNotes[0].title).toBe("Suggestion Entity");
    });
  });

  describe("Empty Page Filtering Logic (PRD-042)", () => {
    // Helper function that mirrors the backend filtering logic from routes.ts
    const filterPagesToImport = (
      pages: { sourcePageId: string; isEmpty: boolean }[],
      options?: { excludedEmptyPageIds?: string[]; importEmptyPages?: boolean }
    ) => {
      let excludedEmptyPageIds: Set<string>;
      if (options?.excludedEmptyPageIds && Array.isArray(options.excludedEmptyPageIds)) {
        excludedEmptyPageIds = new Set(options.excludedEmptyPageIds);
      } else {
        const importEmptyPages = options?.importEmptyPages !== false;
        excludedEmptyPageIds = importEmptyPages
          ? new Set()
          : new Set(pages.filter(p => p.isEmpty).map(p => p.sourcePageId));
      }
      return pages.filter(p => !p.isEmpty || !excludedEmptyPageIds.has(p.sourcePageId));
    };

    const testPages = [
      { sourcePageId: "page-1", isEmpty: false },
      { sourcePageId: "page-2", isEmpty: false },
      { sourcePageId: "empty-1", isEmpty: true },
      { sourcePageId: "empty-2", isEmpty: true },
      { sourcePageId: "empty-3", isEmpty: true },
    ];

    it("should include all pages when excludedEmptyPageIds is empty array", () => {
      const result = filterPagesToImport(testPages, { excludedEmptyPageIds: [] });
      expect(result.length).toBe(5);
      expect(result.map(p => p.sourcePageId)).toEqual([
        "page-1", "page-2", "empty-1", "empty-2", "empty-3"
      ]);
    });

    it("should exclude specific empty pages based on excludedEmptyPageIds", () => {
      const result = filterPagesToImport(testPages, {
        excludedEmptyPageIds: ["empty-1", "empty-3"]
      });
      expect(result.length).toBe(3);
      expect(result.map(p => p.sourcePageId)).toEqual(["page-1", "page-2", "empty-2"]);
    });

    it("should exclude all empty pages when all are in excludedEmptyPageIds", () => {
      const result = filterPagesToImport(testPages, {
        excludedEmptyPageIds: ["empty-1", "empty-2", "empty-3"]
      });
      expect(result.length).toBe(2);
      expect(result.map(p => p.sourcePageId)).toEqual(["page-1", "page-2"]);
    });

    it("should ignore non-existent page IDs in excludedEmptyPageIds", () => {
      const result = filterPagesToImport(testPages, {
        excludedEmptyPageIds: ["empty-1", "nonexistent-id"]
      });
      expect(result.length).toBe(4);
      expect(result.map(p => p.sourcePageId)).toEqual([
        "page-1", "page-2", "empty-2", "empty-3"
      ]);
    });

    describe("Backward Compatibility with importEmptyPages boolean", () => {
      it("should include all pages when importEmptyPages is true", () => {
        const result = filterPagesToImport(testPages, { importEmptyPages: true });
        expect(result.length).toBe(5);
      });

      it("should include all pages when importEmptyPages is undefined (defaults to true)", () => {
        const result = filterPagesToImport(testPages, {});
        expect(result.length).toBe(5);
      });

      it("should include all pages when options is undefined", () => {
        const result = filterPagesToImport(testPages, undefined);
        expect(result.length).toBe(5);
      });

      it("should exclude all empty pages when importEmptyPages is false", () => {
        const result = filterPagesToImport(testPages, { importEmptyPages: false });
        expect(result.length).toBe(2);
        expect(result.every(p => !p.isEmpty)).toBe(true);
      });
    });

    describe("excludedEmptyPageIds takes precedence over importEmptyPages", () => {
      it("should use excludedEmptyPageIds when both options are provided", () => {
        // excludedEmptyPageIds should take precedence
        const result = filterPagesToImport(testPages, {
          excludedEmptyPageIds: ["empty-1"],
          importEmptyPages: false // This should be ignored
        });
        // Only empty-1 should be excluded, not all empty pages
        expect(result.length).toBe(4);
        expect(result.map(p => p.sourcePageId)).toEqual([
          "page-1", "page-2", "empty-2", "empty-3"
        ]);
      });
    });
  });
});
