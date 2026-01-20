import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, createTestUser, type TestUser } from './test/setup';
import { MemoryStorage } from './test/memory-storage';
import type { Express } from 'express';
import type { Server } from 'http';
import type { Team, Note, EnrichmentRun, ImportRun } from '@shared/schema';

describe('Needs Review API (PRD-037)', () => {
  let app: Express;
  let server: Server;
  let storage: MemoryStorage;
  let testUser: TestUser;
  let team: Team;
  let importRun: ImportRun;
  let enrichmentRun: EnrichmentRun;

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

    // Create a team
    const teamRes = await request(app)
      .post('/api/teams')
      .send({ name: 'Test Team', teamType: 'dnd' });
    team = teamRes.body;

    // Create an import run
    importRun = await storage.createImportRun({
      teamId: team.id,
      sourceSystem: 'NUCLINO',
      createdByUserId: testUser.id,
      status: 'completed',
      options: { importEmptyPages: true, defaultVisibility: 'private' },
      stats: {
        totalPagesDetected: 5,
        notesCreated: 5,
        notesUpdated: 0,
        notesSkipped: 0,
        emptyPagesImported: 0,
        linksResolved: 0,
        warningsCount: 0,
      },
    });

    // Create an enrichment run
    enrichmentRun = await storage.createEnrichmentRun({
      importRunId: importRun.id,
      teamId: team.id,
      createdByUserId: testUser.id,
      status: 'completed',
      totals: {
        notesProcessed: 5,
        classificationsCreated: 5,
        relationshipsFound: 0,
        highConfidenceCount: 2,
        lowConfidenceCount: 3,
        userReviewRequired: 3,
      },
    });
  });

  afterEach(() => {
    server.close();
  });

  describe('GET /api/teams/:teamId/notes/needs-review', () => {
    it('should return empty array when no low-confidence classifications exist', async () => {
      const res = await request(app)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.count).toBe(0);
    });

    it('should return low-confidence pending classifications', async () => {
      // Create a note
      const noteRes = await request(app)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: 'Test NPC', noteType: 'npc', content: 'A mysterious stranger' });
      const note: Note = noteRes.body;

      // Create a low-confidence classification
      await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: 'NPC',
        confidence: 0.45, // Below 0.65 threshold
        explanation: 'Uncertain classification',
        extractedEntities: [],
        status: 'pending',
      });

      const res = await request(app)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.count).toBe(1);
      expect(res.body.items[0].noteId).toBe(note.id);
      expect(res.body.items[0].noteTitle).toBe('Test NPC');
      expect(res.body.items[0].inferredType).toBe('NPC');
      expect(res.body.items[0].confidence).toBe(0.45);
    });

    it('should not include high-confidence classifications', async () => {
      // Create a note
      const noteRes = await request(app)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: 'High Conf Note', noteType: 'npc', content: 'Definitely an NPC' });
      const note: Note = noteRes.body;

      // Create a high-confidence classification (>= 0.65)
      await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: 'NPC',
        confidence: 0.85,
        explanation: 'Confident classification',
        extractedEntities: [],
        status: 'pending',
      });

      const res = await request(app)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    it('should not include approved classifications', async () => {
      // Create a note
      const noteRes = await request(app)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: 'Approved Note', noteType: 'npc', content: 'Already reviewed' });
      const note: Note = noteRes.body;

      // Create a low-confidence but approved classification
      const classification = await storage.createNoteClassification({
        noteId: note.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: 'NPC',
        confidence: 0.45,
        explanation: 'Low confidence but approved',
        extractedEntities: [],
        status: 'pending',
      });

      // Approve it
      await storage.updateNoteClassificationStatus(classification.id, 'approved', testUser.id);

      const res = await request(app)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    it('should sort by confidence ascending (lowest first)', async () => {
      // Create notes with different confidence levels
      const note1Res = await request(app)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: 'Medium Low', noteType: 'npc', content: '' });
      const note1: Note = note1Res.body;

      const note2Res = await request(app)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: 'Very Low', noteType: 'npc', content: '' });
      const note2: Note = note2Res.body;

      const note3Res = await request(app)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: 'Borderline', noteType: 'npc', content: '' });
      const note3: Note = note3Res.body;

      await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: 'NPC',
        confidence: 0.55, // Medium low
        explanation: '',
        extractedEntities: [],
        status: 'pending',
      });

      await storage.createNoteClassification({
        noteId: note2.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: 'Area',
        confidence: 0.30, // Very low
        explanation: '',
        extractedEntities: [],
        status: 'pending',
      });

      await storage.createNoteClassification({
        noteId: note3.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: 'Quest',
        confidence: 0.64, // Just below threshold
        explanation: '',
        extractedEntities: [],
        status: 'pending',
      });

      const res = await request(app)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res.body.items).toHaveLength(3);
      expect(res.body.items[0].confidence).toBe(0.30);
      expect(res.body.items[1].confidence).toBe(0.55);
      expect(res.body.items[2].confidence).toBe(0.64);
    });

    it('should reject non-members', async () => {
      // Create another user who is not a member
      const otherUser = createTestUser({ id: 'user-2', email: 'other@test.com' });
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
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(403);

      expect(res.body.message).toBe('Not a team member');
      otherResult.server.close();
    });

    it('should only return classifications for the specified team', async () => {
      // Create another team
      const team2Res = await request(app)
        .post('/api/teams')
        .send({ name: 'Other Team', teamType: 'vampire' });
      const team2: Team = team2Res.body;

      // Create notes in both teams
      const note1Res = await request(app)
        .post(`/api/teams/${team.id}/notes`)
        .send({ title: 'Team 1 Note', noteType: 'npc', content: '' });
      const note1: Note = note1Res.body;

      const note2Res = await request(app)
        .post(`/api/teams/${team2.id}/notes`)
        .send({ title: 'Team 2 Note', noteType: 'npc', content: '' });
      const note2: Note = note2Res.body;

      // Create low-confidence classifications for both
      await storage.createNoteClassification({
        noteId: note1.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: 'NPC',
        confidence: 0.40,
        explanation: '',
        extractedEntities: [],
        status: 'pending',
      });

      await storage.createNoteClassification({
        noteId: note2.id,
        enrichmentRunId: enrichmentRun.id,
        inferredType: 'NPC',
        confidence: 0.35,
        explanation: '',
        extractedEntities: [],
        status: 'pending',
      });

      // Query team 1
      const res1 = await request(app)
        .get(`/api/teams/${team.id}/notes/needs-review`)
        .expect(200);

      expect(res1.body.items).toHaveLength(1);
      expect(res1.body.items[0].noteTitle).toBe('Team 1 Note');

      // Query team 2
      const res2 = await request(app)
        .get(`/api/teams/${team2.id}/notes/needs-review`)
        .expect(200);

      expect(res2.body.items).toHaveLength(1);
      expect(res2.body.items[0].noteTitle).toBe('Team 2 Note');
    });
  });
});
