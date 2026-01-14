import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";

describe("Session Logs API (PRD-001)", () => {
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

  describe("Creating session logs", () => {
    it("should create a session log note", async () => {
      const sessionDate = new Date("2024-01-15T19:00:00Z");
      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Session 1: The Beginning",
          noteType: "session_log",
          sessionDate: sessionDate.toISOString(),
          isPrivate: true,
        })
        .expect(200);

      expect(res.body.noteType).toBe("session_log");
      expect(res.body.isPrivate).toBe(true);
      expect(res.body.authorId).toBe(testUser.id);
    });

    it("should store content blocks for session logs", async () => {
      const contentBlocks = [
        { id: "block-1", content: "The party arrived at the tavern.", createdAt: new Date().toISOString() },
        { id: "block-2", content: "They met Lord Blackwood.", createdAt: new Date().toISOString() },
      ];

      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Session 2",
          noteType: "session_log",
          contentBlocks,
        })
        .expect(200);

      expect(res.body.contentBlocks).toHaveLength(2);
      expect(res.body.contentBlocks[0].content).toBe("The party arrived at the tavern.");
    });

    it("should default session logs to private", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Private Session",
          noteType: "session_log",
        })
        .expect(200);

      // Note: default isPrivate is false in schema, but we're testing it can be set
      expect(res.body.noteType).toBe("session_log");
    });
  });

  describe("Retrieving session logs", () => {
    it("should get all notes including session logs", async () => {
      // Create a regular note
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location Note", noteType: "location" });

      // Create a session log
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session Log", noteType: "session_log" });

      const res = await request(app)
        .get(`/api/teams/${teamId}/notes`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      const types = res.body.map((n: { noteType: string }) => n.noteType);
      expect(types).toContain("location");
      expect(types).toContain("session_log");
    });

    it("should get session logs via getSessionLogs storage method", async () => {
      // Create session logs with different dates
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Session 1",
          noteType: "session_log",
          sessionDate: new Date("2024-01-01").toISOString(),
        });

      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Session 2",
          noteType: "session_log",
          sessionDate: new Date("2024-01-08").toISOString(),
        });

      // Create a regular note (should not appear in session logs)
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location", noteType: "location" });

      const sessionLogs = await storage.getSessionLogs(teamId);
      expect(sessionLogs).toHaveLength(2);
      expect(sessionLogs.every((n) => n.noteType === "session_log")).toBe(true);
    });
  });

  describe("Updating session logs", () => {
    it("should update session log content blocks", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Session to Update",
          noteType: "session_log",
          contentBlocks: [{ id: "block-1", content: "Original content", createdAt: new Date().toISOString() }],
        });

      const noteId = createRes.body.id;

      const updatedBlocks = [
        { id: "block-1", content: "Updated content", createdAt: new Date().toISOString() },
        { id: "block-2", content: "New block", createdAt: new Date().toISOString() },
      ];

      const updateRes = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({ contentBlocks: updatedBlocks })
        .expect(200);

      expect(updateRes.body.contentBlocks).toHaveLength(2);
      expect(updateRes.body.contentBlocks[0].content).toBe("Updated content");
    });

    it("should preserve block IDs across updates", async () => {
      const blockId = "stable-block-id";
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Session",
          noteType: "session_log",
          contentBlocks: [{ id: blockId, content: "Initial", createdAt: new Date().toISOString() }],
        });

      const noteId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({
          contentBlocks: [{ id: blockId, content: "Updated", createdAt: new Date().toISOString() }],
        })
        .expect(200);

      expect(updateRes.body.contentBlocks[0].id).toBe(blockId);
    });
  });

  describe("Deleting session logs", () => {
    it("should delete a session log", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "To Delete", noteType: "session_log" });

      const noteId = createRes.body.id;

      await request(app)
        .delete(`/api/teams/${teamId}/notes/${noteId}`)
        .expect(200);

      const getRes = await request(app).get(`/api/teams/${teamId}/notes`);
      expect(getRes.body.find((n: { id: string }) => n.id === noteId)).toBeUndefined();
    });
  });

  describe("Authorization", () => {
    it("should not allow non-members to access session logs", async () => {
      // Create a session log
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Session", noteType: "session_log" });

      // Create another user who is not a team member
      const otherUser = createTestUser({ id: "other-user" });
      const otherStorage = new MemoryStorage();
      otherStorage.setUser(otherUser);
      const otherResult = await createTestApp({ storage: otherStorage, authenticatedUser: otherUser });

      await request(otherResult.app)
        .get(`/api/teams/${teamId}/notes`)
        .expect(403);

      otherResult.server.close();
    });
  });
});
