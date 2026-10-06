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

  // PRD-047 FR-4: only creator or DM can delete a backlink
  it("enforces backlink delete authorization (creator or DM only)", async () => {
    const creator = createTestUser({ id: "user-creator" });
    const otherMember = createTestUser({ id: "user-other" });
    storage.setUser(creator);
    storage.setUser(otherMember);
    await storage.createTeamMember({ teamId, userId: creator.id, role: "member" });
    await storage.createTeamMember({ teamId, userId: otherMember.id, role: "member" });

    const sessionRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Session A", noteType: "session_log", content: "Met Kettle." })
      .expect(200);
    const entityRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Kettle", noteType: "npc" })
      .expect(200);

    const creatorApp = await createTestApp({ storage, authenticatedUser: creator });
    const backlinkRes = await request(creatorApp.app)
      .post(`/api/teams/${teamId}/notes/${entityRes.body.id}/backlinks`)
      .send({ sourceNoteId: sessionRes.body.id, textSnippet: "Met Kettle." })
      .expect(200);

    // Another (non-creator, non-DM) member cannot delete
    const otherApp = await createTestApp({ storage, authenticatedUser: otherMember });
    await request(otherApp.app)
      .delete(`/api/teams/${teamId}/backlinks/${backlinkRes.body.id}`)
      .expect(403);
    otherApp.server.close();

    // The creator can delete (undo)
    await request(creatorApp.app)
      .delete(`/api/teams/${teamId}/backlinks/${backlinkRes.body.id}`)
      .expect(200);
    creatorApp.server.close();

    // DM can delete a backlink created by someone else
    const secondBacklink = await storage.createBacklink({
      sourceNoteId: sessionRes.body.id,
      targetNoteId: entityRes.body.id,
      sourceBlockId: "block-x",
      textSnippet: "Met Kettle again.",
      createdByUserId: creator.id,
      evidenceType: "Mention",
      confidence: 0.8,
    });
    await request(app)
      .delete(`/api/teams/${teamId}/backlinks/${secondBacklink.id}`)
      .expect(200);

    const remaining = await storage.getBacklinks(entityRes.body.id);
    expect(remaining).toHaveLength(0);
  });

  // PRD-048 FR-3 / PRD-049: only creator or DM can delete a relationship
  it("enforces relationship delete authorization (creator or DM only)", async () => {
    const creator = createTestUser({ id: "rel-creator" });
    const otherMember = createTestUser({ id: "rel-other" });
    storage.setUser(creator);
    storage.setUser(otherMember);
    await storage.createTeamMember({ teamId, userId: creator.id, role: "member" });
    await storage.createTeamMember({ teamId, userId: otherMember.id, role: "member" });

    const sessionRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Session B", noteType: "session_log", content: "Quest talk." })
      .expect(200);
    const questRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Save the Town", noteType: "quest" })
      .expect(200);
    const npcRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Mayor Tobin", noteType: "npc" })
      .expect(200);

    const creatorApp = await createTestApp({ storage, authenticatedUser: creator });
    const relationshipRes = await request(creatorApp.app)
      .post(`/api/teams/${teamId}/relationships`)
      .send({
        fromNoteId: questRes.body.id,
        toNoteId: npcRes.body.id,
        relationshipType: "QuestHasNPC",
        evidenceType: "Heuristic",
        confidence: 0.72,
        sourceNoteId: sessionRes.body.id,
        snippetText: "Mayor Tobin asked us to save the town",
      })
      .expect(200);
    creatorApp.server.close();

    // Another member cannot delete
    const otherApp = await createTestApp({ storage, authenticatedUser: otherMember });
    await request(otherApp.app)
      .delete(`/api/teams/${teamId}/relationships/${relationshipRes.body.id}`)
      .expect(403);
    otherApp.server.close();

    // DM can delete
    await request(app)
      .delete(`/api/teams/${teamId}/relationships/${relationshipRes.body.id}`)
      .expect(200);
  });

  // PRD-049 FR-3: quest promotion end-to-end
  it("supports the quest promotion flow: suggestion -> quest note -> backlink + relationships visible on quest detail", async () => {
    const npcRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Lord Blackwood", noteType: "npc" })
      .expect(200);
    const areaRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Silverwood Forest", noteType: "area" })
      .expect(200);

    const sessionRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({
        title: "Session C",
        noteType: "session_log",
        content:
          "We met Lord Blackwood in Silverwood Forest. He asked us to Find the Lost Relic before nightfall.",
      })
      .expect(200);

    // 1. Cleanup suggestions include a quest promotion with suggested NPC/Area
    const suggestionsRes = await request(app)
      .get(`/api/teams/${teamId}/session-logs/${sessionRes.body.id}/cleanup-suggestions?mode=baseline&includeLow=1`)
      .expect(200);

    expect(suggestionsRes.body.questSuggestions.length).toBeGreaterThan(0);
    const questSuggestion = suggestionsRes.body.questSuggestions[0];
    expect(questSuggestion.proposedQuestTitle).toMatch(/^Find Lost Relic/);
    expect(questSuggestion.suggestedNpcNoteId).toBe(npcRes.body.id);
    expect(questSuggestion.suggestedAreaNoteId).toBe(areaRes.body.id);

    // 2. Promote: create the quest note (seeded content), backlink, relationships
    const questRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({
        title: questSuggestion.proposedQuestTitle,
        noteType: "quest",
        content: `## First seen\n- Session 2026-02-17: "${questSuggestion.snippetText}"`,
      })
      .expect(200);

    await request(app)
      .post(`/api/teams/${teamId}/notes/${questRes.body.id}/backlinks`)
      .send({
        sourceNoteId: sessionRes.body.id,
        textSnippet: questSuggestion.snippetText,
        evidenceType: "Mention",
        confidence: 0.8,
      })
      .expect(200);

    await request(app)
      .post(`/api/teams/${teamId}/relationships`)
      .send({
        fromNoteId: questRes.body.id,
        toNoteId: questSuggestion.suggestedNpcNoteId,
        relationshipType: "QuestHasNPC",
        evidenceType: "Heuristic",
        confidence: 0.72,
        sourceNoteId: sessionRes.body.id,
        snippetText: questSuggestion.snippetText,
      })
      .expect(200);

    await request(app)
      .post(`/api/teams/${teamId}/relationships`)
      .send({
        fromNoteId: questRes.body.id,
        toNoteId: questSuggestion.suggestedAreaNoteId,
        relationshipType: "QuestAtPlace",
        evidenceType: "Heuristic",
        confidence: 0.72,
        sourceNoteId: sessionRes.body.id,
        snippetText: questSuggestion.snippetText,
      })
      .expect(200);

    // 3. Quest detail page shows seeded content, session reference, relationships
    const detailRes = await request(app)
      .get(`/api/teams/${teamId}/notes/${questRes.body.id}`)
      .expect(200);

    expect(detailRes.body.content).toContain("## First seen");
    expect(detailRes.body.referencesIn).toHaveLength(1);
    expect(detailRes.body.referencesIn[0].sourceNoteId).toBe(sessionRes.body.id);
    expect(detailRes.body.referencesIn[0].sourceNoteTitle).toBe("Session C");

    const relationshipTypes = detailRes.body.relationships.map(
      (r: { relationshipType: string }) => r.relationshipType
    );
    expect(relationshipTypes).toContain("QuestHasNPC");
    expect(relationshipTypes).toContain("QuestAtPlace");
  });

  // PRD-048 FR-1b/FR-2: detail references include session date + author, sorted by recency
  it("returns session references ordered by session date with author names", async () => {
    const entityRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({ title: "Kettle", noteType: "npc" })
      .expect(200);

    const olderSession = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({
        title: "Old Session",
        noteType: "session_log",
        content: "Kettle waved.",
        sessionDate: "2026-01-05T00:00:00.000Z",
      })
      .expect(200);
    const newerSession = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({
        title: "New Session",
        noteType: "session_log",
        content: "Kettle nodded.",
        sessionDate: "2026-06-20T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .post(`/api/teams/${teamId}/notes/${entityRes.body.id}/backlinks`)
      .send({ sourceNoteId: olderSession.body.id, textSnippet: "Kettle waved." })
      .expect(200);
    await request(app)
      .post(`/api/teams/${teamId}/notes/${entityRes.body.id}/backlinks`)
      .send({ sourceNoteId: newerSession.body.id, textSnippet: "Kettle nodded." })
      .expect(200);

    const detailRes = await request(app)
      .get(`/api/teams/${teamId}/notes/${entityRes.body.id}`)
      .expect(200);

    expect(detailRes.body.referencesIn).toHaveLength(2);
    // Most recent session first
    expect(detailRes.body.referencesIn[0].sourceNoteTitle).toBe("New Session");
    expect(detailRes.body.referencesIn[1].sourceNoteTitle).toBe("Old Session");
    expect(detailRes.body.referencesIn[0].sourceNoteSessionDate).toBeTruthy();
    // Author name resolved from team membership
    expect(typeof detailRes.body.referencesIn[0].createdByName).toBe("string");
  });
});
