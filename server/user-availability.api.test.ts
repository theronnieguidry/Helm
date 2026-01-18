import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, createTestUser, type TestUser } from './test/setup';
import { MemoryStorage } from './test/memory-storage';
import type { Express } from 'express';
import type { Server } from 'http';

describe('User Availability API (PRD-009)', () => {
  let app: Express;
  let server: Server;
  let storage: MemoryStorage;
  let testUser: TestUser;
  let teamId: string;

  beforeEach(async () => {
    testUser = createTestUser({ id: 'user-1' });
    storage = new MemoryStorage();
    storage.setUser({
      id: testUser.id,
      email: testUser.email,
      firstName: testUser.firstName ?? null,
      lastName: testUser.lastName ?? null,
      profileImageUrl: null,
      timezone: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await createTestApp({
      storage,
      authenticatedUser: testUser,
    });
    app = result.app;
    server = result.server;

    // Create a team for testing
    const teamRes = await request(app)
      .post('/api/teams')
      .send({ name: 'Test Team', teamType: 'dnd' });
    teamId = teamRes.body.id;
  });

  afterEach(() => {
    server.close();
  });

  describe('GET /api/teams/:teamId/user-availability', () => {
    it('should return availability for date range', async () => {
      // Create some availability first
      await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        });

      const res = await request(app)
        .get(`/api/teams/${teamId}/user-availability`)
        .query({ startDate: '2024-03-01', endDate: '2024-03-31' })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].startTime).toBe('19:00');
      expect(res.body[0].endTime).toBe('23:00');
    });

    it('should return empty array when no availability in range', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/user-availability`)
        .query({ startDate: '2024-01-01', endDate: '2024-01-31' })
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should require startDate and endDate query parameters', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/user-availability`)
        .expect(400);

      expect(res.body.message).toBe('startDate and endDate query parameters are required');
    });

    it('should reject non-members', async () => {
      // Create another user who is not a member
      const otherUser = createTestUser({ id: 'user-2' });
      storage.setUser({
        id: otherUser.id,
        email: otherUser.email,
        firstName: otherUser.firstName ?? null,
        lastName: otherUser.lastName ?? null,
        profileImageUrl: null,
        timezone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const otherResult = await createTestApp({
        storage,
        authenticatedUser: otherUser,
      });

      const res = await request(otherResult.app)
        .get(`/api/teams/${teamId}/user-availability`)
        .query({ startDate: '2024-03-01', endDate: '2024-03-31' })
        .expect(403);

      expect(res.body.message).toBe('Not a team member');
      otherResult.server.close();
    });
  });

  describe('POST /api/teams/:teamId/user-availability', () => {
    it('should create availability', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        })
        .expect(200);

      expect(res.body.teamId).toBe(teamId);
      expect(res.body.userId).toBe(testUser.id);
      expect(res.body.startTime).toBe('19:00');
      expect(res.body.endTime).toBe('23:00');
      expect(res.body.id).toBeDefined();
    });

    it('should reject invalid time format', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '25:00',  // Invalid hour
          endTime: '23:00',
        })
        .expect(400);

      expect(res.body.message).toBe('Invalid time format. Use HH:MM');
    });

    it('should reject invalid endTime format', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:60',  // Invalid minutes
        })
        .expect(400);

      expect(res.body.message).toBe('Invalid time format. Use HH:MM');
    });

    it('should reject duplicate availability for same date', async () => {
      // Create first availability
      await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        })
        .expect(200);

      // Try to create another for the same date
      const res = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '20:00',
          endTime: '22:00',
        })
        .expect(409);

      expect(res.body.message).toBe('Availability already exists for this date. Use PATCH to update.');
    });

    it('should reject non-members', async () => {
      const otherUser = createTestUser({ id: 'user-2' });
      storage.setUser({
        id: otherUser.id,
        email: otherUser.email,
        firstName: otherUser.firstName ?? null,
        lastName: otherUser.lastName ?? null,
        profileImageUrl: null,
        timezone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const otherResult = await createTestApp({
        storage,
        authenticatedUser: otherUser,
      });

      const res = await request(otherResult.app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        })
        .expect(403);

      expect(res.body.message).toBe('Not a team member');
      otherResult.server.close();
    });
  });

  describe('PATCH /api/teams/:teamId/user-availability/:id', () => {
    it('should update availability', async () => {
      // Create availability first
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        });

      const availabilityId = createRes.body.id;

      const res = await request(app)
        .patch(`/api/teams/${teamId}/user-availability/${availabilityId}`)
        .send({
          startTime: '18:00',
          endTime: '22:00',
        })
        .expect(200);

      expect(res.body.startTime).toBe('18:00');
      expect(res.body.endTime).toBe('22:00');
    });

    it('should allow partial update (only startTime)', async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        });

      const availabilityId = createRes.body.id;

      const res = await request(app)
        .patch(`/api/teams/${teamId}/user-availability/${availabilityId}`)
        .send({
          startTime: '18:00',
        })
        .expect(200);

      expect(res.body.startTime).toBe('18:00');
      expect(res.body.endTime).toBe('23:00');
    });

    it('should reject invalid time format', async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        });

      const availabilityId = createRes.body.id;

      const res = await request(app)
        .patch(`/api/teams/${teamId}/user-availability/${availabilityId}`)
        .send({
          startTime: 'invalid',
        })
        .expect(400);

      expect(res.body.message).toBe('Invalid startTime format. Use HH:MM');
    });
  });

  describe('DELETE /api/teams/:teamId/user-availability/:id', () => {
    it('should delete availability', async () => {
      // Create availability first
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        });

      const availabilityId = createRes.body.id;

      await request(app)
        .delete(`/api/teams/${teamId}/user-availability/${availabilityId}`)
        .expect(200);

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/teams/${teamId}/user-availability`)
        .query({ startDate: '2024-03-01', endDate: '2024-03-31' });

      expect(getRes.body).toEqual([]);
    });

    it('should reject non-members', async () => {
      // Create availability first
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/user-availability`)
        .send({
          date: '2024-03-15',
          startTime: '19:00',
          endTime: '23:00',
        });

      const availabilityId = createRes.body.id;

      // Create another user who is not a member
      const otherUser = createTestUser({ id: 'user-2' });
      storage.setUser({
        id: otherUser.id,
        email: otherUser.email,
        firstName: otherUser.firstName ?? null,
        lastName: otherUser.lastName ?? null,
        profileImageUrl: null,
        timezone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const otherResult = await createTestApp({
        storage,
        authenticatedUser: otherUser,
      });

      const res = await request(otherResult.app)
        .delete(`/api/teams/${teamId}/user-availability/${availabilityId}`)
        .expect(403);

      expect(res.body.message).toBe('Not a team member');
      otherResult.server.close();
    });
  });
});
