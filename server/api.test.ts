import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, createTestUser, type TestUser } from './test/setup';
import { MemoryStorage } from './test/memory-storage';
import type { Express } from 'express';
import type { Server } from 'http';

describe('API Integration Tests', () => {
  let app: Express;
  let server: Server;
  let storage: MemoryStorage;
  let testUser: TestUser;

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
  });

  afterEach(() => {
    server.close();
  });

  describe('Authentication Guard', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const unauthResult = await createTestApp({
        storage,
        authenticatedUser: null,
      });
      
      const res = await request(unauthResult.app)
        .get('/api/teams')
        .expect(401);
      
      expect(res.body.message).toBe('Unauthorized');
      unauthResult.server.close();
    });

    it('should allow authenticated requests', async () => {
      const res = await request(app)
        .get('/api/teams')
        .expect(200);
      
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Teams CRUD', () => {
    it('should create a team with invite', async () => {
      const res = await request(app)
        .post('/api/teams')
        .send({
          name: 'Test Gaming Group',
          teamType: 'dnd',
        })
        .expect(200);

      expect(res.body.name).toBe('Test Gaming Group');
      expect(res.body.teamType).toBe('dnd');
      expect(res.body.diceMode).toBe('polyhedral');
      expect(res.body.ownerId).toBe(testUser.id);
      expect(res.body.invite).toBeDefined();
      expect(res.body.invite.code).toHaveLength(6);
    });

    it('should get user teams', async () => {
      await request(app)
        .post('/api/teams')
        .send({ name: 'Team 1', teamType: 'dnd' });
      
      await request(app)
        .post('/api/teams')
        .send({ name: 'Team 2', teamType: 'vampire' });

      const res = await request(app)
        .get('/api/teams')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body.map((t: any) => t.name)).toContain('Team 1');
      expect(res.body.map((t: any) => t.name)).toContain('Team 2');
    });

    it('should get single team by id when member', async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Test Team', teamType: 'pathfinder_2e' });
      
      const teamId = createRes.body.id;
      
      const res = await request(app)
        .get(`/api/teams/${teamId}`)
        .expect(200);

      expect(res.body.name).toBe('Test Team');
      expect(res.body.teamType).toBe('pathfinder_2e');
    });

    it('should update team as admin', async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Original Name', teamType: 'werewolf' });
      
      const teamId = createRes.body.id;
      
      const res = await request(app)
        .patch(`/api/teams/${teamId}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Name');
    });

    it('should delete team as owner', async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'To Delete', teamType: 'other' });
      
      const teamId = createRes.body.id;
      
      await request(app)
        .delete(`/api/teams/${teamId}`)
        .expect(200);

      const getRes = await request(app)
        .get('/api/teams')
        .expect(200);

      expect(getRes.body).toHaveLength(0);
    });

    it('should set correct dice mode based on team type', async () => {
      const dndRes = await request(app)
        .post('/api/teams')
        .send({ name: 'D&D', teamType: 'dnd' });
      expect(dndRes.body.diceMode).toBe('polyhedral');

      const vampireRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Vampire', teamType: 'vampire' });
      expect(vampireRes.body.diceMode).toBe('d10_pool');

      const otherRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Book Club', teamType: 'other' });
      expect(otherRes.body.diceMode).toBe('disabled');
    });
  });

  describe('Member Management', () => {
    let teamId: string;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Test Team', teamType: 'dnd' });
      teamId = createRes.body.id;
    });

    it('should get team members', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/members`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].userId).toBe(testUser.id);
      expect(res.body[0].role).toBe('dm');
    });

    it('should reject non-members from viewing members', async () => {
      const otherUser = createTestUser({ id: 'other-user' });
      const otherResult = await createTestApp({
        storage,
        authenticatedUser: otherUser,
      });

      const res = await request(otherResult.app)
        .get(`/api/teams/${teamId}/members`)
        .expect(403);

      expect(res.body.message).toBe('Not a team member');
      otherResult.server.close();
    });
  });

  describe('Invite System', () => {
    let teamId: string;
    let inviteCode: string;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Test Team', teamType: 'dnd' });
      teamId = createRes.body.id;
      inviteCode = createRes.body.invite.code;
    });

    it('should get active invites', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/invites`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].code).toBe(inviteCode);
    });

    it('should create new invite as admin', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/invites`)
        .expect(200);

      expect(res.body.code).toHaveLength(6);
      expect(res.body.teamId).toBe(teamId);
    });

    it('should allow joining with valid invite code', async () => {
      const otherUser = createTestUser({ id: 'new-user' });
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
        .post(`/api/invites/${inviteCode}/join`)
        .expect(200);

      expect(res.body.team.id).toBe(teamId);
      expect(res.body.member.userId).toBe(otherUser.id);
      expect(res.body.member.role).toBe('member');

      otherResult.server.close();
    });

    it('should reject invalid invite code', async () => {
      const res = await request(app)
        .post('/api/invites/INVALID/join')
        .expect(404);

      expect(res.body.message).toBe('Invite not found');
    });

    it('should reject already members', async () => {
      const res = await request(app)
        .post(`/api/invites/${inviteCode}/join`)
        .expect(400);

      expect(res.body.message).toBe('Already a member');
    });

    it('should reject expired invites', async () => {
      const otherUser = createTestUser({ id: 'new-user-2' });
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
      
      const invite = await storage.getInviteByCode(inviteCode);
      if (invite) {
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 1);
        (invite as any).expiresAt = expiredDate;
      }

      const otherResult = await createTestApp({
        storage,
        authenticatedUser: otherUser,
      });

      const res = await request(otherResult.app)
        .post(`/api/invites/${inviteCode}/join`)
        .expect(400);

      expect(res.body.message).toBe('Invite has expired');
      otherResult.server.close();
    });
  });

  describe('Notes System', () => {
    let teamId: string;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Test Team', teamType: 'dnd' });
      teamId = createRes.body.id;
    });

    it('should create a note', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({
          title: 'Test Note',
          content: 'Some content here',
          noteType: 'location',
          isPrivate: false,
        })
        .expect(200);

      expect(res.body.title).toBe('Test Note');
      expect(res.body.content).toBe('Some content here');
      expect(res.body.noteType).toBe('location');
      expect(res.body.authorId).toBe(testUser.id);
    });

    it('should get team notes', async () => {
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: 'Note 1', noteType: 'character' });
      
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: 'Note 2', noteType: 'quest' });

      const res = await request(app)
        .get(`/api/teams/${teamId}/notes`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should update own note', async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: 'Original', noteType: 'npc' });
      
      const noteId = createRes.body.id;

      const res = await request(app)
        .patch(`/api/teams/${teamId}/notes/${noteId}`)
        .send({ title: 'Updated', content: 'New content' })
        .expect(200);

      expect(res.body.title).toBe('Updated');
      expect(res.body.content).toBe('New content');
    });

    it('should delete own note', async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: 'To Delete', noteType: 'poi' });
      
      const noteId = createRes.body.id;

      await request(app)
        .delete(`/api/teams/${teamId}/notes/${noteId}`)
        .expect(200);

      const getRes = await request(app)
        .get(`/api/teams/${teamId}/notes`)
        .expect(200);

      expect(getRes.body).toHaveLength(0);
    });

    it('should filter private notes by author', async () => {
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: 'Public Note', noteType: 'location', isPrivate: false });
      
      await request(app)
        .post(`/api/teams/${teamId}/notes`)
        .send({ title: 'Private Note', noteType: 'character', isPrivate: true });

      const otherUser = createTestUser({ id: 'other-member' });
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
      await storage.createTeamMember({
        teamId,
        userId: otherUser.id,
        role: 'member',
      });

      const otherResult = await createTestApp({
        storage,
        authenticatedUser: otherUser,
      });

      const res = await request(otherResult.app)
        .get(`/api/teams/${teamId}/notes`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Public Note');

      otherResult.server.close();
    });
  });

  describe('Sessions and Availability', () => {
    let teamId: string;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Test Team', teamType: 'dnd' });
      teamId = createRes.body.id;
    });

    it('should create a session as admin', async () => {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 7);

      const res = await request(app)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: scheduledAt.toISOString() })
        .expect(200);

      expect(res.body.teamId).toBe(teamId);
      expect(new Date(res.body.scheduledAt)).toEqual(scheduledAt);
    });

    it('should get team sessions', async () => {
      const date1 = new Date();
      date1.setDate(date1.getDate() + 7);
      const date2 = new Date();
      date2.setDate(date2.getDate() + 14);

      await request(app)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: date1.toISOString() });
      
      await request(app)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: date2.toISOString() });

      const res = await request(app)
        .get(`/api/teams/${teamId}/sessions`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should set availability for a session', async () => {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 7);

      const sessionRes = await request(app)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: scheduledAt.toISOString() });
      
      const sessionId = sessionRes.body.id;

      const res = await request(app)
        .post(`/api/teams/${teamId}/sessions/${sessionId}/availability`)
        .send({ status: 'available' })
        .expect(200);

      expect(res.body.status).toBe('available');
      expect(res.body.userId).toBe(testUser.id);
    });

    it('should update availability (upsert)', async () => {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 7);

      const sessionRes = await request(app)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: scheduledAt.toISOString() });
      
      const sessionId = sessionRes.body.id;

      await request(app)
        .post(`/api/teams/${teamId}/sessions/${sessionId}/availability`)
        .send({ status: 'available' });

      const res = await request(app)
        .post(`/api/teams/${teamId}/sessions/${sessionId}/availability`)
        .send({ status: 'busy' })
        .expect(200);

      expect(res.body.status).toBe('busy');
    });

    it('should reject invalid availability status', async () => {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 7);

      const sessionRes = await request(app)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: scheduledAt.toISOString() });
      
      const sessionId = sessionRes.body.id;

      const res = await request(app)
        .post(`/api/teams/${teamId}/sessions/${sessionId}/availability`)
        .send({ status: 'invalid' })
        .expect(400);

      expect(res.body.message).toBe('Invalid status');
    });

    it('should get team availability', async () => {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 7);

      const sessionRes = await request(app)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: scheduledAt.toISOString() });
      
      const sessionId = sessionRes.body.id;

      await request(app)
        .post(`/api/teams/${teamId}/sessions/${sessionId}/availability`)
        .send({ status: 'maybe' });

      const res = await request(app)
        .get(`/api/teams/${teamId}/availability`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('maybe');
    });
  });

  describe('Dice Rolls', () => {
    let teamId: string;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'D&D Campaign', teamType: 'dnd' });
      teamId = createRes.body.id;
    });

    it('should create a dice roll', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/dice-rolls`)
        .send({
          diceType: 'd20',
          count: 1,
          modifier: 5,
          isShared: true,
        })
        .expect(200);

      expect(res.body.diceType).toBe('d20');
      expect(res.body.count).toBe(1);
      expect(res.body.modifier).toBe(5);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0]).toBeGreaterThanOrEqual(1);
      expect(res.body.results[0]).toBeLessThanOrEqual(20);
      expect(res.body.total).toBe(res.body.results[0] + 5);
    });

    it('should get dice roll history', async () => {
      await request(app)
        .post(`/api/teams/${teamId}/dice-rolls`)
        .send({ diceType: 'd20', count: 1 });
      
      await request(app)
        .post(`/api/teams/${teamId}/dice-rolls`)
        .send({ diceType: 'd6', count: 2 });

      const res = await request(app)
        .get(`/api/teams/${teamId}/dice-rolls`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should roll multiple dice', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/dice-rolls`)
        .send({ diceType: 'd6', count: 4, modifier: 3 })
        .expect(200);

      expect(res.body.results).toHaveLength(4);
      res.body.results.forEach((r: number) => {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      });
      const sum = res.body.results.reduce((a: number, b: number) => a + b, 0);
      expect(res.body.total).toBe(sum + 3);
    });

    it('should handle d10_pool for WoD teams', async () => {
      const wodRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Vampire Chronicle', teamType: 'vampire' });
      const wodTeamId = wodRes.body.id;

      const res = await request(app)
        .post(`/api/teams/${wodTeamId}/dice-rolls`)
        .send({ diceType: 'd10_pool', count: 5 })
        .expect(200);

      expect(res.body.diceType).toBe('d10_pool');
      expect(res.body.results).toHaveLength(5);
      res.body.results.forEach((r: number) => {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('Role-Based Access Control', () => {
    let teamId: string;
    let memberUser: TestUser;
    let memberApp: Express;
    let memberServer: Server;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/teams')
        .send({ name: 'Test Team', teamType: 'dnd' });
      teamId = createRes.body.id;
      const inviteCode = createRes.body.invite.code;

      memberUser = createTestUser({ id: 'member-user' });
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

      const memberResult = await createTestApp({
        storage,
        authenticatedUser: memberUser,
      });
      memberApp = memberResult.app;
      memberServer = memberResult.server;

      await request(memberApp)
        .post(`/api/invites/${inviteCode}/join`);
    });

    afterEach(() => {
      memberServer.close();
    });

    it('should allow member to view team', async () => {
      const res = await request(memberApp)
        .get(`/api/teams/${teamId}`)
        .expect(200);

      expect(res.body.name).toBe('Test Team');
    });

    it('should reject member from updating team', async () => {
      const res = await request(memberApp)
        .patch(`/api/teams/${teamId}`)
        .send({ name: 'Hacked Name' })
        .expect(403);

      expect(res.body.message).toBe('Only admin can update team');
    });

    it('should reject member from deleting team', async () => {
      const res = await request(memberApp)
        .delete(`/api/teams/${teamId}`)
        .expect(403);

      expect(res.body.message).toBe('Only owner can delete team');
    });

    it('should reject member from creating invites', async () => {
      const res = await request(memberApp)
        .post(`/api/teams/${teamId}/invites`)
        .expect(403);

      expect(res.body.message).toBe('Only admin can create invites');
    });

    it('should reject member from creating sessions', async () => {
      const res = await request(memberApp)
        .post(`/api/teams/${teamId}/sessions`)
        .send({ scheduledAt: new Date().toISOString() })
        .expect(403);

      expect(res.body.message).toBe('Only admin can create sessions');
    });

    it('should reject member from removing other members', async () => {
      const members = await request(app)
        .get(`/api/teams/${teamId}/members`)
        .expect(200);

      const adminMember = members.body.find((m: any) => m.role === 'dm');

      const res = await request(memberApp)
        .delete(`/api/teams/${teamId}/members/${adminMember.id}`)
        .expect(403);

      expect(res.body.message).toBe('Only admin can remove members');
    });
  });

  describe('Timezone Management', () => {
    it('should update user timezone', async () => {
      const res = await request(app)
        .patch('/api/user/timezone')
        .send({ timezone: 'America/New_York' })
        .expect(200);

      expect(res.body.timezone).toBe('America/New_York');
    });

    it('should reject missing timezone', async () => {
      const res = await request(app)
        .patch('/api/user/timezone')
        .send({})
        .expect(400);

      expect(res.body.message).toBe('Timezone is required');
    });

    it('should reject invalid timezone type', async () => {
      const res = await request(app)
        .patch('/api/user/timezone')
        .send({ timezone: 123 })
        .expect(400);

      expect(res.body.message).toBe('Timezone is required');
    });
  });
});
