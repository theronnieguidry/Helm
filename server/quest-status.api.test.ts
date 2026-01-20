import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";

describe("Quest Status API (PRD-004)", () => {
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

  describe("Creating quests with status", () => {
    it("should create a quest with default 'lead' status", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Find the Lost Artifact",
          noteType: "quest",
        })
        .expect(200);

      expect(res.body.noteType).toBe("quest");
      expect(res.body.questStatus).toBe("lead");
    });

    it("should create a quest with explicit status", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Defeat the Dragon",
          noteType: "quest",
          questStatus: "active",
        })
        .expect(200);

      expect(res.body.questStatus).toBe("active");
    });

    it("should create a quest with 'todo' status", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Investigate the Ruins",
          noteType: "quest",
          questStatus: "todo",
        })
        .expect(200);

      expect(res.body.questStatus).toBe("todo");
    });

    it("should not set questStatus for non-quest notes", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Silverwood Tavern",
          noteType: "area",
        })
        .expect(200);

      expect(res.body.questStatus).toBeNull();
    });
  });

  describe("Updating quest status", () => {
    it("should update quest status from lead to todo", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "New Quest",
          noteType: "quest",
          questStatus: "lead",
        });

      const noteId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({ questStatus: "todo" })
        .expect(200);

      expect(updateRes.body.questStatus).toBe("todo");
    });

    it("should update quest status to active", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Quest",
          noteType: "quest",
          questStatus: "todo",
        });

      const noteId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({ questStatus: "active" })
        .expect(200);

      expect(updateRes.body.questStatus).toBe("active");
    });

    it("should update quest status to done", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Quest",
          noteType: "quest",
          questStatus: "active",
        });

      const noteId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({ questStatus: "done" })
        .expect(200);

      expect(updateRes.body.questStatus).toBe("done");
    });

    it("should update quest status to abandoned", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Quest",
          noteType: "quest",
          questStatus: "lead",
        });

      const noteId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({ questStatus: "abandoned" })
        .expect(200);

      expect(updateRes.body.questStatus).toBe("abandoned");
    });

    it("should preserve linked entities when status changes", async () => {
      // Create a location to link
      const locationRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Location", noteType: "area" });

      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Quest with Links",
          noteType: "quest",
          questStatus: "lead",
          linkedNoteIds: [locationRes.body.id],
        });

      const noteId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({ questStatus: "active" })
        .expect(200);

      expect(updateRes.body.linkedNoteIds).toContain(locationRes.body.id);
    });
  });

  describe("All quest statuses", () => {
    const statuses = ["lead", "todo", "active", "done", "abandoned"] as const;

    statuses.forEach((status) => {
      it(`should accept '${status}' as a valid quest status`, async () => {
        const res = await request(app)
          .post(`/api/teams/${teamId}/notes`)
          .send({
            title: `Quest with ${status} status`,
            noteType: "quest",
            questStatus: status,
          })
          .expect(200);

        expect(res.body.questStatus).toBe(status);
      });
    });
  });

  describe("Filtering quests", () => {
    beforeEach(async () => {
      // Create quests with different statuses
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Lead Quest 1", noteType: "quest", questStatus: "lead" });
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Lead Quest 2", noteType: "quest", questStatus: "lead" });
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Active Quest", noteType: "quest", questStatus: "active" });
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: "Done Quest", noteType: "quest", questStatus: "done" });
    });

    it("should retrieve all quests regardless of status", async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/notes`)
        .expect(200);

      const quests = res.body.filter((n: { noteType: string }) => n.noteType === "quest");
      expect(quests).toHaveLength(4);
    });

    it("should allow client-side filtering by status", async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/notes`)
        .expect(200);

      const leadQuests = res.body.filter(
        (n: { noteType: string; questStatus: string }) =>
          n.noteType === "quest" && n.questStatus === "lead"
      );
      expect(leadQuests).toHaveLength(2);

      const activeQuests = res.body.filter(
        (n: { noteType: string; questStatus: string }) =>
          n.noteType === "quest" && n.questStatus === "active"
      );
      expect(activeQuests).toHaveLength(1);
    });
  });

  describe("Proto-quest (lead state)", () => {
    it("should create a minimal lead quest with only title", async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Mysterious Rumor",
          noteType: "quest",
          // No content, no description, just a title
        })
        .expect(200);

      expect(res.body.title).toBe("Mysterious Rumor");
      expect(res.body.questStatus).toBe("lead");
      expect(res.body.content).toBeNull();
    });

    it("should allow adding content to lead quest later", async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: "Rumor",
          noteType: "quest",
        });

      const noteId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({
          content: "The innkeeper mentioned a treasure hidden in the mountains.",
          questStatus: "todo",
        })
        .expect(200);

      expect(updateRes.body.content).toContain("innkeeper");
      expect(updateRes.body.questStatus).toBe("todo");
    });
  });
});
