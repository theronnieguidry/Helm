import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";

describe("Cleanup Suggestions + Relationship APIs (PRD-047..049)", () => {
  let app: Express;
  let server: Server;
  let storage: MemoryStorage;
  let testUser: ReturnType<typeof createTestUser>;
  let teamId: string;

  beforeEach(async () => {
    testUser = createTestUser({ id: "user-dm" });
    storage = new MemoryStorage();
    storage.setUser(testUser);
    const result = await createTestApp({ storage, authenticatedUser: testUser });
    app = result.app;
    server = result.server;

    const teamRes = await request(app)
      .post("/api/teams")
      .send({
        name: "Test Team",
        teamType: "dnd",
        diceMode: "polyhedral",
      })
      .expect(200);
    teamId = teamRes.body.id;
  });

  afterEach(() => {
    server.close();
  });

  it("upserts backlinks using fallback sourceBlockId hashing", async () => {
    const sourceRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Session 1", noteType: "session_log", content: "Met Lord Blackwood." })
      .expect(200);
    const targetRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Lord Blackwood", noteType: "npc" })
      .expect(200);

    const first = await request(app)
      .post(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
      .send({
        sourceNoteId: sourceRes.body.id,
        textSnippet: "Lord Blackwood",
      })
      .expect(200);

    const second = await request(app)
      .post(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
      .send({
        sourceNoteId: sourceRes.body.id,
        textSnippet: "Lord Blackwood",
      })
      .expect(200);

    expect(first.body.id).toBe(second.body.id);
    expect(first.body.sourceBlockId).toMatch(/^auto:/);

    const backlinks = await request(app)
      .get(`/api/teams/${teamId}/notes/${targetRes.body.id}/backlinks`)
      .expect(200);
    expect(backlinks.body).toHaveLength(1);
  });

  it("enforces relationship provenance fields and is idempotent", async () => {
    const sourceRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Session 2", noteType: "session_log", content: "Quest for the relic." })
      .expect(200);
    const questRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Find the Relic", noteType: "quest" })
      .expect(200);
    const npcRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Lord Blackwood", noteType: "npc" })
      .expect(200);

    await request(app)
      .post(`/api/teams/${teamId}/relationships`)
      .send({
        fromNoteId: questRes.body.id,
        toNoteId: npcRes.body.id,
        relationshipType: "QuestHasNPC",
        evidenceType: "Heuristic",
        confidence: 0.72,
        sourceNoteId: sourceRes.body.id,
      })
      .expect(400);

    const first = await request(app)
      .post(`/api/teams/${teamId}/relationships`)
      .send({
        fromNoteId: questRes.body.id,
        toNoteId: npcRes.body.id,
        relationshipType: "QuestHasNPC",
        evidenceType: "Heuristic",
        confidence: 0.72,
        sourceNoteId: sourceRes.body.id,
        snippetText: "Find the Relic",
      })
      .expect(200);

    const second = await request(app)
      .post(`/api/teams/${teamId}/relationships`)
      .send({
        fromNoteId: questRes.body.id,
        toNoteId: npcRes.body.id,
        relationshipType: "QuestHasNPC",
        evidenceType: "Heuristic",
        confidence: 0.72,
        sourceNoteId: sourceRes.body.id,
        snippetText: "Find the Relic",
      })
      .expect(200);

    expect(first.body.id).toBe(second.body.id);
    expect(first.body.sourceBlockId).toMatch(/^auto:/);
  });

  it("returns cleanup suggestions with sourceContentHash and generatedAt", async () => {
    const sessionRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({
        title: "Session 3",
        noteType: "session_log",
        content: "Lord Blackwood met us in The Silverwood Forest.",
      })
      .expect(200);

    await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Lord Blackwood", noteType: "npc" })
      .expect(200);

    const getRes = await request(app)
      .get(`/api/teams/${teamId}/session-logs/${sessionRes.body.id}/cleanup-suggestions?mode=baseline&includeLow=1`)
      .expect(200);

    expect(getRes.body.sourceContentHash).toMatch(/^[a-f0-9]{16}$/);
    expect(typeof getRes.body.generatedAt).toBe("string");
    expect(Array.isArray(getRes.body.entities)).toBe(true);
    expect(Array.isArray(getRes.body.relationshipSuggestions)).toBe(true);

    const postRes = await request(app)
      .post(`/api/teams/${teamId}/session-logs/${sessionRes.body.id}/cleanup-suggestions`)
      .send({
        mode: "baseline",
        includeLow: true,
        content: "Find the relic at the Silverwood Forest with Lord Blackwood.",
      })
      .expect(200);

    expect(postRes.body.sourceContentHash).toMatch(/^[a-f0-9]{16}$/);
    expect(typeof postRes.body.generatedAt).toBe("string");
  });

  it("redacts private reference snippets in note detail for non-dm members", async () => {
    const sourceAuthor = createTestUser({ id: "user-source" });
    const viewer = createTestUser({ id: "user-viewer" });
    storage.setUser(sourceAuthor);
    storage.setUser(viewer);

    await storage.createTeamMember({
      teamId,
      userId: sourceAuthor.id,
      role: "member",
    });
    await storage.createTeamMember({
      teamId,
      userId: viewer.id,
      role: "member",
    });

    const targetRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Hidden NPC", noteType: "npc" })
      .expect(200);

    const privateSource = await storage.createNote({
      teamId,
      authorId: sourceAuthor.id,
      title: "Private Session",
      noteType: "session_log",
      isPrivate: true,
      content: "Secret mention of Hidden NPC",
    });

    await storage.createBacklink({
      sourceNoteId: privateSource.id,
      targetNoteId: targetRes.body.id,
      sourceBlockId: "block-private",
      textSnippet: "Secret mention of Hidden NPC",
      createdByUserId: sourceAuthor.id,
      evidenceType: "Mention",
      confidence: 0.8,
    });

    const viewerApp = await createTestApp({ storage, authenticatedUser: viewer });
    const detailRes = await request(viewerApp.app)
      .get(`/api/teams/${teamId}/notes/${targetRes.body.id}`)
      .expect(200);
    viewerApp.server.close();

    expect(Array.isArray(detailRes.body.referencesIn)).toBe(true);
    expect(detailRes.body.referencesIn[0].textSnippet).toBe("Referenced in a private note");
    expect(Array.isArray(detailRes.body.referencesOut)).toBe(true);
    expect(Array.isArray(detailRes.body.relationships)).toBe(true);
  });
});
