/**
 * Review Mode API tests (P2-5 / gap F19+F21, PRD-003 FR-5).
 *
 * Covers the reviewedAt flag on session logs:
 * - PATCH sets and clears it, and it round-trips on GET
 * - unrelated PATCHes (title/content) leave it untouched
 * - a non-author member cannot set it on another author's private session
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { createTestApp, createTestUser } from "./test/setup";
import { MemoryStorage } from "./test/memory-storage";

describe("Review Mode API (PRD-003 FR-5)", () => {
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

  it("sets and clears reviewedAt via PATCH, round-tripping on GET", async () => {
    const sessionRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({
        title: "Session 1",
        noteType: "session_log",
        content: "Met Lord Blackwood.",
      })
      .expect(200);
    const noteId = sessionRes.body.id;
    // Fresh session logs start unreviewed
    expect(sessionRes.body.reviewedAt ?? null).toBeNull();

    // Set the flag
    const reviewedAt = "2026-07-06T12:00:00.000Z";
    const patchRes = await request(app)
      .patch(`/api/teams/${teamId}/notes/${noteId}`)
      .send({ reviewedAt })
      .expect(200);
    expect(new Date(patchRes.body.reviewedAt).toISOString()).toBe(reviewedAt);

    // Round-trips on GET
    const getRes = await request(app)
      .get(`/api/teams/${teamId}/notes/${noteId}`)
      .expect(200);
    expect(new Date(getRes.body.reviewedAt).toISOString()).toBe(reviewedAt);

    // Clear the flag (un-mark)
    const clearRes = await request(app)
      .patch(`/api/teams/${teamId}/notes/${noteId}`)
      .send({ reviewedAt: null })
      .expect(200);
    expect(clearRes.body.reviewedAt ?? null).toBeNull();

    const getAfterClear = await request(app)
      .get(`/api/teams/${teamId}/notes/${noteId}`)
      .expect(200);
    expect(getAfterClear.body.reviewedAt ?? null).toBeNull();
  });

  it("preserves reviewedAt across unrelated PATCHes (title/content)", async () => {
    const sessionRes = await request(app)
      .post(`/api/teams/${teamId}/notes`)
      .send({
        title: "Session 2",
        noteType: "session_log",
        content: "Original content.",
      })
      .expect(200);
    const noteId = sessionRes.body.id;

    const reviewedAt = "2026-07-06T09:30:00.000Z";
    await request(app)
      .patch(`/api/teams/${teamId}/notes/${noteId}`)
      .send({ reviewedAt })
      .expect(200);

    // PATCH other fields without mentioning reviewedAt
    const patchRes = await request(app)
      .patch(`/api/teams/${teamId}/notes/${noteId}`)
      .send({ title: "Session 2 — renamed", content: "Updated content." })
      .expect(200);
    expect(patchRes.body.title).toBe("Session 2 — renamed");
    expect(patchRes.body.content).toBe("Updated content.");
    expect(new Date(patchRes.body.reviewedAt).toISOString()).toBe(reviewedAt);

    const getRes = await request(app)
      .get(`/api/teams/${teamId}/notes/${noteId}`)
      .expect(200);
    expect(new Date(getRes.body.reviewedAt).toISOString()).toBe(reviewedAt);
  });

  it("rejects a non-author member setting reviewedAt on another author's private session", async () => {
    const author = createTestUser({ id: "user-author" });
    const otherMember = createTestUser({ id: "user-other" });
    storage.setUser(author);
    storage.setUser(otherMember);
    await storage.createTeamMember({ teamId, userId: author.id, role: "member" });
    await storage.createTeamMember({ teamId, userId: otherMember.id, role: "member" });

    const privateSession = await storage.createNote({
      teamId,
      authorId: author.id,
      title: "Private Session",
      noteType: "session_log",
      isPrivate: true,
      content: "Secret plans.",
    });

    // Actual behavior (asserted deliberately): the shared PATCH handler checks
    // edit authorization (author or DM) before any visibility guard, so a
    // non-author member gets 403 — not the 404 the read-side visibility guard
    // returns. This matches PATCH behavior for every other field (title,
    // content, ...); the note's existence is only revealed to team members.
    const otherApp = await createTestApp({ storage, authenticatedUser: otherMember });
    const res = await request(otherApp.app)
      .patch(`/api/teams/${teamId}/notes/${privateSession.id}`)
      .send({ reviewedAt: "2026-07-06T12:00:00.000Z" })
      .expect(403);
    otherApp.server.close();
    expect(res.body.message).toMatch(/not authorized/i);

    // And the flag was not set
    const stored = await storage.getNote(privateSession.id);
    expect(stored?.reviewedAt ?? null).toBeNull();

    // The author themselves can set it
    const authorApp = await createTestApp({ storage, authenticatedUser: author });
    const okRes = await request(authorApp.app)
      .patch(`/api/teams/${teamId}/notes/${privateSession.id}`)
      .send({ reviewedAt: "2026-07-06T12:00:00.000Z" })
      .expect(200);
    authorApp.server.close();
    expect(new Date(okRes.body.reviewedAt).toISOString()).toBe(
      "2026-07-06T12:00:00.000Z"
    );
  });
});
