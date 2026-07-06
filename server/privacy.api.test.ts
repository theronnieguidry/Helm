import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser, type TestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";
import type { Team, Note, ImportRun, EnrichmentRun } from "@shared/schema";

/**
 * P0-1 (NOTE_TAKING_GAP_REPORT F0/F48/F81/F9): server-side privacy enforcement.
 * Private notes must be invisible to non-author members (DM sees all) on:
 * - the notes list
 * - the needs-review list (titles + AI explanations)
 * - the classification PATCH (approve/reject/reclassify)
 * - the idempotent session_log POST path
 */
describe("Privacy enforcement (P0-1)", () => {
  let storage: MemoryStorage;
  let dmUser: TestUser;
  let authorUser: TestUser;
  let otherUser: TestUser;
  let dmApp: Express;
  let authorApp: Express;
  let otherApp: Express;
  let servers: Server[];
  let team: Team;

  beforeEach(async () => {
    storage = new MemoryStorage();
    servers = [];

    dmUser = createTestUser({ id: "user-dm", email: "dm@test.com" });
    authorUser = createTestUser({ id: "user-author", email: "author@test.com" });
    otherUser = createTestUser({ id: "user-other", email: "other@test.com" });
    storage.setUser(dmUser);
    storage.setUser(authorUser);
    storage.setUser(otherUser);

    const dmResult = await createTestApp({ storage, authenticatedUser: dmUser });
    dmApp = dmResult.app;
    servers.push(dmResult.server);

    const teamRes = await request(dmApp)
      .post("/api/teams")
      .send({ name: "Privacy Team", teamType: "dnd" })
      .expect(200);
    team = teamRes.body;

    await storage.createTeamMember({ teamId: team.id, userId: authorUser.id, role: "member" });
    await storage.createTeamMember({ teamId: team.id, userId: otherUser.id, role: "member" });

    const authorResult = await createTestApp({ storage, authenticatedUser: authorUser });
    authorApp = authorResult.app;
    servers.push(authorResult.server);

    const otherResult = await createTestApp({ storage, authenticatedUser: otherUser });
    otherApp = otherResult.app;
    servers.push(otherResult.server);
  });

  afterEach(() => {
    for (const server of servers) server.close();
  });

  async function createPrivateNote(overrides: Record<string, unknown> = {}): Promise<Note> {
    const res = await request(authorApp)
      .post(`/api/teams/${team.id}/notes`)
      .send({
        title: "Secret Villain Plans",
        content: "The lich is secretly the mayor",
        noteType: "npc",
        isPrivate: true,
        ...overrides,
      })
      .expect(200);
    return res.body;
  }

  describe("GET /api/teams/:teamId/notes", () => {
    it("hides another author's private note from a member but shows it to the author and the DM", async () => {
      await createPrivateNote();
      await request(authorApp)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: "Public Lore", noteType: "area", isPrivate: false })
        .expect(200);

      const memberRes = await request(otherApp).get(`/api/teams/${team.id}/notes`).expect(200);
      expect(memberRes.body.map((n: Note) => n.title)).toEqual(["Public Lore"]);

      const authorRes = await request(authorApp).get(`/api/teams/${team.id}/notes`).expect(200);
      expect(authorRes.body).toHaveLength(2);

      const dmRes = await request(dmApp).get(`/api/teams/${team.id}/notes`).expect(200);
      expect(dmRes.body).toHaveLength(2);
    });
  });

  describe("GET /api/teams/:teamId/notes/needs-review (F81)", () => {
    let importRun: ImportRun;
    let enrichmentRun: EnrichmentRun;
    let privateNote: Note;
    let publicNote: Note;
    let privateClassificationId: string;

    beforeEach(async () => {
      importRun = await storage.createImportRun({
        teamId: team.id,
        sourceSystem: "NUCLINO",
        createdByUserId: dmUser.id,
        status: "completed",
        options: { importEmptyPages: true, defaultVisibility: "private" },
        stats: {
          totalPagesDetected: 2,
          notesCreated: 2,
          notesUpdated: 0,
          notesSkipped: 0,
          emptyPagesImported: 0,
          linksResolved: 0,
          warningsCount: 0,
        },
      });
      enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importRun.id,
        teamId: team.id,
        createdByUserId: dmUser.id,
        status: "completed",
        totals: {
          notesProcessed: 2,
          classificationsCreated: 2,
          relationshipsFound: 0,
          highConfidenceCount: 0,
          lowConfidenceCount: 2,
          userReviewRequired: 2,
        },
      });

      privateNote = await createPrivateNote();
      const publicRes = await request(authorApp)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: "Public Tavern", noteType: "poi", isPrivate: false })
        .expect(200);
      publicNote = publicRes.body;

      const privateClassification = await storage.createNoteClassification({
        noteId: privateNote.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "NPC",
        confidence: 0.4,
        explanation: "Mentions the lich's secret identity",
        extractedEntities: [],
        status: "pending",
      });
      privateClassificationId = privateClassification.id;

      await storage.createNoteClassification({
        noteId: publicNote.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: "Area",
        confidence: 0.5,
        explanation: "Looks like a tavern",
        extractedEntities: [],
        status: "pending",
      });
    });

    it("excludes private notes' items for a non-author member", async () => {
      const res = await request(otherApp)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].noteId).toBe(publicNote.id);
      const titles = res.body.items.map((i: any) => i.noteTitle);
      expect(titles).not.toContain("Secret Villain Plans");
    });

    it("includes the private note's item for its author", async () => {
      const res = await request(authorApp)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res.body.count).toBe(2);
      expect(res.body.items.map((i: any) => i.noteId)).toContain(privateNote.id);
    });

    it("includes the private note's item for the DM", async () => {
      const res = await request(dmApp)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res.body.count).toBe(2);
      expect(res.body.items.map((i: any) => i.noteId)).toContain(privateNote.id);
    });

    describe("PATCH /api/teams/:teamId/classifications/:classificationId (F81)", () => {
      it("returns 404 when a non-author member tries to approve a private note's classification", async () => {
        const res = await request(otherApp)
          .patch(`/api/teams/${team.id}/classifications/${privateClassificationId}`)
          .send({ status: "approved" })
          .expect(404);

        expect(res.body.message).toBe("Classification not found");

        // Classification must be untouched
        const classifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRun.id);
        const target = classifications.find((c) => c.id === privateClassificationId);
        expect(target?.status).toBe("pending");
      });

      it("returns 404 when a non-author member tries to reject it too", async () => {
        await request(otherApp)
          .patch(`/api/teams/${team.id}/classifications/${privateClassificationId}`)
          .send({ status: "rejected" })
          .expect(404);
      });

      it("lets the author approve their own private note's classification", async () => {
        const res = await request(authorApp)
          .patch(`/api/teams/${team.id}/classifications/${privateClassificationId}`)
          .send({ status: "approved" })
          .expect(200);

        expect(res.body.status).toBe("approved");
        const updatedNote = await storage.getNote(privateNote.id);
        expect(updatedNote?.noteType).toBe("npc");
      });

      it("lets the DM approve a member's private note's classification", async () => {
        const res = await request(dmApp)
          .patch(`/api/teams/${team.id}/classifications/${privateClassificationId}`)
          .send({ status: "approved" })
          .expect(200);

        expect(res.body.status).toBe("approved");
      });

      it("returns 404 for a classification id that does not exist", async () => {
        await request(otherApp)
          .patch(`/api/teams/${team.id}/classifications/does-not-exist`)
          .send({ status: "approved" })
          .expect(404);
      });
    });
  });

  describe("POST /api/teams/:teamId/notes idempotent session path (F9)", () => {
    const today = new Date().toISOString();

    it("returns 409 without leaking content when another author's private session exists for the date", async () => {
      const privateSession = await createPrivateNote({
        title: "Session 12 (DM eyes only)",
        content: "Players are about to be betrayed",
        noteType: "session_log",
        sessionDate: today,
      });

      const res = await request(otherApp)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: "Session 12", noteType: "session_log", sessionDate: today })
        .expect(409);

      expect(res.body.message).toBe("A private session already exists for this date");
      expect(JSON.stringify(res.body)).not.toContain("betrayed");
      expect(res.body.id).toBeUndefined();

      // No duplicate session was created
      const sessions = (await storage.getNotes(team.id)).filter((n) => n.noteType === "session_log");
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(privateSession.id);
    });

    it("returns the existing private session to its own author (200)", async () => {
      const privateSession = await createPrivateNote({
        title: "Session 12 (DM eyes only)",
        noteType: "session_log",
        sessionDate: today,
      });

      const res = await request(authorApp)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: "Session 12", noteType: "session_log", sessionDate: today })
        .expect(200);

      expect(res.body.id).toBe(privateSession.id);
    });

    it("returns the existing private session to the DM (200, DM sees all)", async () => {
      const privateSession = await createPrivateNote({
        title: "Session 12 (DM eyes only)",
        noteType: "session_log",
        sessionDate: today,
      });

      const res = await request(dmApp)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: "Session 12", noteType: "session_log", sessionDate: today })
        .expect(200);

      expect(res.body.id).toBe(privateSession.id);
    });

    it("still returns an existing public session to any member (200)", async () => {
      const publicSession = await createPrivateNote({
        title: "Session 12",
        noteType: "session_log",
        isPrivate: false,
        sessionDate: today,
      });

      const res = await request(otherApp)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: "Session 12", noteType: "session_log", sessionDate: today })
        .expect(200);

      expect(res.body.id).toBe(publicSession.id);
    });
  });
});
