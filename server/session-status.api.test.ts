import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, createTestUser, type TestUser } from './test/setup';
import { MemoryStorage } from './test/memory-storage';
import type { Express } from 'express';
import type { Server } from 'http';

describe('Session Status API (PRD-010)', () => {
  let app: Express;
  let server: Server;
  let storage: MemoryStorage;
  let dmUser: TestUser;
  let teamId: string;
  let sessionId: string;

  beforeEach(async () => {
    dmUser = createTestUser({ id: 'dm-user' });
    storage = new MemoryStorage();
    storage.setUser({
      id: dmUser.id,
      email: dmUser.email,
      firstName: dmUser.firstName ?? null,
      lastName: dmUser.lastName ?? null,
      profileImageUrl: null,
      timezone: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await createTestApp({
      storage,
      authenticatedUser: dmUser,
    });
    app = result.app;
    server = result.server;

    // Create a team
    const teamRes = await request(app)
      .post('/api/teams')
      .send({ name: 'Test Team', teamType: 'dnd' });
    teamId = teamRes.body.id;

    // Create a session
    const futureDate = new Date(Date.now() + 86400000); // Tomorrow
    const sessionRes = await request(app)
      .post(`/api/teams/${teamId}/sessions`)
      .send({ scheduledAt: futureDate.toISOString() });
    sessionId = sessionRes.body.id;
  });

  afterEach(() => {
    server.close();
  });

  describe('PATCH /api/teams/:teamId/sessions/:sessionId', () => {
    it('should allow DM to cancel a session', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamId}/sessions/${sessionId}`)
        .send({ status: 'canceled' })
        .expect(200);

      expect(res.body.status).toBe('canceled');
      expect(res.body.id).toBe(sessionId);
    });

    it('should allow DM to reinstate a canceled session', async () => {
      // First cancel the session
      await request(app)
        .patch(`/api/teams/${teamId}/sessions/${sessionId}`)
        .send({ status: 'canceled' })
        .expect(200);

      // Then reinstate it
      const res = await request(app)
        .patch(`/api/teams/${teamId}/sessions/${sessionId}`)
        .send({ status: 'scheduled' })
        .expect(200);

      expect(res.body.status).toBe('scheduled');
    });

    it('should reject non-DM from updating session status', async () => {
      // Create a member user (not DM)
      const memberUser = createTestUser({ id: 'member-user' });
      storage.setUser({
        id: memberUser.id,
        email: memberUser.email,
        firstName: memberUser.firstName ?? null,
        lastName: memberUser.lastName ?? null,
        profileImageUrl: null,
        timezone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Add member to team (need to use invite code)
      const inviteRes = await request(app)
        .post(`/api/teams/${teamId}/invites`)
        .expect(200);
      const inviteCode = inviteRes.body.code;

      // Create app for member user
      const memberResult = await createTestApp({
        storage,
        authenticatedUser: memberUser,
      });

      // Join team with invite code
      await request(memberResult.app)
        .post(`/api/invites/${inviteCode}/join`)
        .expect(200);

      // Try to update session status as member
      const res = await request(memberResult.app)
        .patch(`/api/teams/${teamId}/sessions/${sessionId}`)
        .send({ status: 'canceled' })
        .expect(403);

      expect(res.body.message).toBe('Not authorized - DM only');
      memberResult.server.close();
    });

    it('should reject invalid status values', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamId}/sessions/${sessionId}`)
        .send({ status: 'invalid' })
        .expect(400);

      expect(res.body.message).toContain('Invalid status');
    });

    it('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamId}/sessions/non-existent-id`)
        .send({ status: 'canceled' })
        .expect(404);

      expect(res.body.message).toBe('Session not found');
    });

    it('should reject session from different team', async () => {
      // Create another team
      const otherTeamRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Other Team', teamType: 'dnd' });
      const otherTeamId = otherTeamRes.body.id;

      // Try to update session using other team's ID
      const res = await request(app)
        .patch(`/api/teams/${otherTeamId}/sessions/${sessionId}`)
        .send({ status: 'canceled' })
        .expect(404);

      expect(res.body.message).toBe('Session not found');
    });
  });

  describe('Session creation with default status', () => {
    it('should create session with default status of scheduled', async () => {
      const futureDate = new Date(Date.now() + 172800000); // Day after tomorrow
      const res = await request(app)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: futureDate.toISOString() })
        .expect(200);

      expect(res.body.status).toBe('scheduled');
    });
  });

  describe('Session retrieval includes status', () => {
    it('should include status in session list', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/sessions`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].status).toBe('scheduled');
    });

    it('should show canceled status after canceling', async () => {
      // Cancel the session
      await request(app)
        .patch(`/api/teams/${teamId}/sessions/${sessionId}`)
        .send({ status: 'canceled' })
        .expect(200);

      // Fetch sessions and verify
      const res = await request(app)
        .get(`/api/teams/${teamId}/sessions`)
        .expect(200);

      const canceledSession = res.body.find((s: { id: string }) => s.id === sessionId);
      expect(canceledSession.status).toBe('canceled');
    });
  });
});
