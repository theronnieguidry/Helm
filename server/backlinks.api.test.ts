import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";

describe("Backlinks API (PRD-005)", () => {
  let app: Express;
  let server: Server;
  let storage: MemoryStorage;
  let testUser: ReturnType<typeof createTestUser>;
  let teamId: string;

  beforeEach(async () => {
    testUser = createTestUser();
    storage = new MemoryStorage();
    storage.setUser(testUser);
    const result = await createTestApp({ storage, authenticatedUser: testUser });
    app = result.app;
    server = result.server;

    // Create a test team
    const teamRes = await request(app)
      .post("/api/teams")
      .send({
        name: "Test Team",
        teamType: "dnd",
        diceMode: "polyhedral",
      });
    teamId = teamRes.body.id;
  });

  afterEach(() => {
    server.close();
  });

  describe("Creating backlinks", () => {
    it("should create a backlink between two notes", async () => {
      // Create source note
      const sourceRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });
      const sourceNoteId = sourceRes.body.id;

      // Create target note
      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "The Dragon's Lair", noteType: "location" });
      const targetNoteId = targetRes.body.id;

      // Create backlink
      const backlinkRes = await request(app)
        .post(`/api/teams/${teamId}/notes/${targetNoteId}/backlinks`)
        .send({
          sourceNoteId,
          textSnippet: "We discovered The Dragon's Lair",
        })
        .expect(200);

      expect(backlinkRes.body.sourceNoteId).toBe(sourceNoteId);
      expect(backlinkRes.body.targetNoteId).toBe(targetNoteId);
      expect(backlinkRes.body.textSnippet).toBe("We discovered The Dragon's Lair");
    });

    it("should create a backlink with a source block ID", async () => {
      const sourceRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });

      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Lord Blackwood", noteType: "npc" });

      const backlinkRes = await request(app)
        .post(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .send({
          sourceNoteId: sourceRes.body.id,
          sourceBlockId: "block-123",
          textSnippet: "We met Lord Blackwood at the tavern",
        })
        .expect(200);

      expect(backlinkRes.body.sourceBlockId).toBe("block-123");
    });

    it("should reject backlink to non-existent target note", async () => {
      const sourceRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/non-existent-id/backlinks`)
        .send({
          sourceNoteId: sourceRes.body.id,
          textSnippet: "Some text",
        })
        .expect(404);
    });

    it("should reject backlink from non-existent source note", async () => {
      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location", noteType: "location" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .send({
          sourceNoteId: "non-existent-id",
          textSnippet: "Some text",
        })
        .expect(400);
    });
  });

  describe("Retrieving backlinks", () => {
    it("should get all backlinks for a note", async () => {
      // Create target note
      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "The Dragon", noteType: "npc" });
      const targetNoteId = targetRes.body.id;

      // Create multiple source notes and backlinks
      const source1Res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session 1", noteType: "session_log" });

      const source2Res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session 2", noteType: "session_log" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/${targetNoteId}/backlinks`)
        .send({ sourceNoteId: source1Res.body.id, textSnippet: "First mention" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/${targetNoteId}/backlinks`)
        .send({ sourceNoteId: source2Res.body.id, textSnippet: "Second mention" });

      const backlinksRes = await request(app)
        .get(`/api/teams/${teamId}/notes/${targetNoteId}/backlinks`)
        .expect(200);

      expect(backlinksRes.body).toHaveLength(2);
    });

    it("should return empty array for note with no backlinks", async () => {
      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Lonely Note", noteType: "location" });

      const backlinksRes = await request(app)
        .get(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .expect(200);

      expect(backlinksRes.body).toHaveLength(0);
    });
  });

  describe("Retrieving outgoing links", () => {
    it("should get all outgoing links from a note", async () => {
      // Create source note
      const sourceRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });
      const sourceNoteId = sourceRes.body.id;

      // Create multiple target notes and backlinks
      const target1Res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location 1", noteType: "location" });

      const target2Res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "NPC 1", noteType: "npc" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/${target1Res.body.id}/backlinks`)
        .send({ sourceNoteId, textSnippet: "Visited Location 1" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/${target2Res.body.id}/backlinks`)
        .send({ sourceNoteId, textSnippet: "Met NPC 1" });

      const outgoingRes = await request(app)
        .get(`/api/teams/${teamId}/notes/${sourceNoteId}/outgoing-links`)
        .expect(200);

      expect(outgoingRes.body).toHaveLength(2);
    });
  });

  describe("Deleting backlinks", () => {
    it("should delete a backlink", async () => {
      const sourceRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });

      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location", noteType: "location" });

      const backlinkRes = await request(app)
        .post(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .send({ sourceNoteId: sourceRes.body.id, textSnippet: "Some text" });

      await request(app)
        .delete(`/api/teams/${teamId}/backlinks/${backlinkRes.body.id}`)
        .expect(200);

      // Verify backlink is deleted
      const backlinksRes = await request(app)
        .get(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .expect(200);

      expect(backlinksRes.body).toHaveLength(0);
    });
  });

  describe("Backlinks cascade on note deletion", () => {
    it("should delete backlinks when target note is deleted", async () => {
      const sourceRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });

      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location", noteType: "location" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .send({ sourceNoteId: sourceRes.body.id, textSnippet: "Some text" });

      // Delete target note
      await request(app)
        .delete(`/api/teams/${teamId}/notes/${targetRes.body.id}`)
        .expect(200);

      // Outgoing links from source should be empty
      const outgoingRes = await request(app)
        .get(`/api/teams/${teamId}/notes/${sourceRes.body.id}/outgoing-links`)
        .expect(200);

      expect(outgoingRes.body).toHaveLength(0);
    });

    it("should delete backlinks when source note is deleted", async () => {
      const sourceRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });

      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location", noteType: "location" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .send({ sourceNoteId: sourceRes.body.id, textSnippet: "Some text" });

      // Delete source note
      await request(app)
        .delete(`/api/teams/${teamId}/notes/${sourceRes.body.id}`)
        .expect(200);

      // Backlinks to target should be empty
      const backlinksRes = await request(app)
        .get(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .expect(200);

      expect(backlinksRes.body).toHaveLength(0);
    });
  });

  describe("Authorization", () => {
    it("should not allow non-members to access backlinks", async () => {
      const sourceRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });

      const targetRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location", noteType: "location" });

      await request(app)
        .post(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .send({ sourceNoteId: sourceRes.body.id, textSnippet: "Some text" });

      // Create another user who is not a team member
      const otherUser = createTestUser({ id: "other-user" });
      const otherStorage = new MemoryStorage();
      otherStorage.setUser(otherUser);
      const otherResult = await createTestApp({ storage: otherStorage, authenticatedUser: otherUser });

      await request(otherResult.app)
        .get(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
        .expect(403);

      otherResult.server.close();
    });
  });
});
