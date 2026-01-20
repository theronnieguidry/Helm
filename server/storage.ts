import {
  teams, Team, InsertTeam,
  teamMembers, TeamMember, InsertTeamMember,
  invites, Invite, InsertInvite,
  notes, Note, InsertNote,
  gameSessions, GameSession, InsertGameSession,
  availability, Availability, InsertAvailability,
  diceRolls, DiceRoll, InsertDiceRoll,
  backlinks, Backlink, InsertBacklink,
  userAvailability, UserAvailability, InsertUserAvailability,
  sessionOverrides, SessionOverride, InsertSessionOverride,
  importRuns, ImportRun, InsertImportRun, ImportRunStatus,
  noteImportSnapshots, NoteImportSnapshot, InsertNoteImportSnapshot,
  // PRD-016: AI Enrichment
  enrichmentRuns, EnrichmentRun, InsertEnrichmentRun, EnrichmentStatus,
  noteClassifications, NoteClassification, InsertNoteClassification, ClassificationStatus,
  noteRelationships, NoteRelationship, InsertNoteRelationship,
  // PRD-043: AI Cache
  aiCacheEntries, AICacheEntry, InsertAICacheEntry, AICacheStats,
  users
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, lt, sql, inArray, count as drizzleCount } from "drizzle-orm";

import type { User } from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  updateUserTimezone(id: string, timezone: string): Promise<User>;

  // Teams
  getTeams(userId: string): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team>;
  deleteTeam(id: string): Promise<void>;

  // Team Members
  getTeamMembers(teamId: string): Promise<(TeamMember & { user?: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null; email?: string | null } })[]>;
  getTeamMember(teamId: string, userId: string): Promise<TeamMember | undefined>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, data: { characterName?: string | null; characterType1?: string | null; characterType2?: string | null; characterDescription?: string | null; aiEnabled?: boolean; aiEnabledAt?: Date | null }): Promise<TeamMember>;
  deleteTeamMember(id: string): Promise<void>;

  // Invites
  getInvites(teamId: string): Promise<Invite[]>;
  getInviteByCode(code: string): Promise<Invite | undefined>;
  createInvite(invite: InsertInvite): Promise<Invite>;
  deleteInvite(id: string): Promise<void>;

  // Notes
  getNotes(teamId: string): Promise<Note[]>;
  getNote(id: string): Promise<Note | undefined>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: string, data: Partial<InsertNote>): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  getSessionLogs(teamId: string): Promise<Note[]>;
  // PRD-019: Find session by date for today's session editor
  findSessionByDate(teamId: string, date: Date): Promise<Note | undefined>;
  // PRD-015: Import methods
  findNoteBySourceId(teamId: string, sourceSystem: string, sourcePageId: string): Promise<Note | undefined>;
  upsertImportedNote(note: InsertNote): Promise<{ note: Note; created: boolean }>;

  // Game Sessions
  getSessions(teamId: string): Promise<GameSession[]>;
  getSession(id: string): Promise<GameSession | undefined>;
  createSession(session: InsertGameSession): Promise<GameSession>;
  updateSession(id: string, data: Partial<InsertGameSession>): Promise<GameSession>; // PRD-010
  deleteSession(id: string): Promise<void>;

  // Availability
  getAvailability(teamId: string): Promise<Availability[]>;
  getSessionAvailability(sessionId: string): Promise<Availability[]>;
  upsertAvailability(data: InsertAvailability): Promise<Availability>;

  // Dice Rolls
  getDiceRolls(teamId: string): Promise<DiceRoll[]>;
  createDiceRoll(roll: InsertDiceRoll): Promise<DiceRoll>;

  // Backlinks (PRD-005)
  getBacklinks(targetNoteId: string): Promise<Backlink[]>;
  getOutgoingLinks(sourceNoteId: string): Promise<Backlink[]>;
  createBacklink(backlink: InsertBacklink): Promise<Backlink>;
  deleteBacklink(id: string): Promise<void>;
  deleteBacklinksBySource(sourceNoteId: string): Promise<void>;
  deleteBacklinksByTarget(targetNoteId: string): Promise<void>;

  // User Availability (PRD-009)
  getUserAvailability(teamId: string, startDate: Date, endDate: Date): Promise<UserAvailability[]>;
  getUserAvailabilityByDate(teamId: string, userId: string, date: Date): Promise<UserAvailability | undefined>;
  createUserAvailability(data: InsertUserAvailability): Promise<UserAvailability>;
  updateUserAvailability(id: string, data: Partial<InsertUserAvailability>): Promise<UserAvailability>;
  deleteUserAvailability(id: string): Promise<void>;

  // Session Overrides (PRD-010A)
  getSessionOverrides(teamId: string): Promise<SessionOverride[]>;
  getSessionOverride(teamId: string, occurrenceKey: string): Promise<SessionOverride | undefined>;
  upsertSessionOverride(data: InsertSessionOverride): Promise<SessionOverride>;
  deleteSessionOverride(id: string): Promise<void>;

  // Import Runs (PRD-015A)
  getImportRuns(teamId: string): Promise<ImportRun[]>;
  getImportRun(id: string): Promise<ImportRun | undefined>;
  createImportRun(importRun: InsertImportRun): Promise<ImportRun>;
  updateImportRun(id: string, data: Partial<InsertImportRun>): Promise<ImportRun>;
  updateImportRunStatus(id: string, status: ImportRunStatus): Promise<ImportRun>;

  // Notes by import run (PRD-015A)
  getNotesByImportRun(importRunId: string): Promise<Note[]>;
  deleteNotesByImportRun(importRunId: string): Promise<number>;

  // Note Import Snapshots (PRD-015A FR-6)
  createNoteImportSnapshot(snapshot: InsertNoteImportSnapshot): Promise<NoteImportSnapshot>;
  getSnapshotsByImportRun(importRunId: string): Promise<NoteImportSnapshot[]>;
  restoreNoteFromSnapshot(snapshotId: string): Promise<Note>;
  deleteSnapshotsByImportRun(importRunId: string): Promise<void>;

  // PRD-016: Enrichment Runs
  createEnrichmentRun(run: InsertEnrichmentRun): Promise<EnrichmentRun>;
  getEnrichmentRun(id: string): Promise<EnrichmentRun | undefined>;
  getEnrichmentRunByImportId(importRunId: string): Promise<EnrichmentRun | undefined>;
  updateEnrichmentRun(id: string, data: Partial<InsertEnrichmentRun>): Promise<EnrichmentRun>;
  updateEnrichmentRunStatus(id: string, status: EnrichmentStatus): Promise<EnrichmentRun>;

  // PRD-016: Note Classifications
  createNoteClassification(classification: InsertNoteClassification): Promise<NoteClassification>;
  getNoteClassificationsByEnrichmentRun(enrichmentRunId: string): Promise<NoteClassification[]>;
  getNoteClassification(noteId: string): Promise<NoteClassification | undefined>;
  updateNoteClassificationStatus(id: string, status: ClassificationStatus, userId: string): Promise<NoteClassification>;
  bulkUpdateClassificationStatus(ids: string[], status: ClassificationStatus, userId: string): Promise<number>;
  deleteClassificationsByEnrichmentRun(enrichmentRunId: string): Promise<void>;

  // PRD-016: Note Relationships
  createNoteRelationship(relationship: InsertNoteRelationship): Promise<NoteRelationship>;
  getNoteRelationshipsByEnrichmentRun(enrichmentRunId: string): Promise<NoteRelationship[]>;
  getRelationshipsForNote(noteId: string): Promise<NoteRelationship[]>;
  updateNoteRelationshipStatus(id: string, status: ClassificationStatus, userId: string): Promise<NoteRelationship>;
  bulkUpdateRelationshipStatus(ids: string[], status: ClassificationStatus, userId: string): Promise<number>;
  deleteRelationshipsByEnrichmentRun(enrichmentRunId: string): Promise<void>;

  // PRD-037: Low-confidence classifications review
  getPendingLowConfidenceClassifications(teamId: string): Promise<NeedsReviewItem[]>;

  // PRD-043: AI Cache
  getAICacheEntry(
    cacheType: string,
    contentHash: string,
    algorithmVersion: string,
    contextHash?: string,
    teamId?: string
  ): Promise<AICacheEntry | null>;
  setAICacheEntry(entry: InsertAICacheEntry): Promise<AICacheEntry>;
  getAICacheEntriesBatch(
    cacheType: string,
    contentHashes: string[],
    algorithmVersion: string,
    contextHash?: string,
    teamId?: string
  ): Promise<AICacheEntry[]>;
  incrementAICacheHitCount(id: string): Promise<void>;
  deleteAICacheByVersion(operationType: string, version: string): Promise<number>;
  deleteAICacheByTeam(teamId: string): Promise<number>;
  deleteExpiredAICacheEntries(): Promise<number>;
  getAICacheStats(): Promise<AICacheStats>;
}

// PRD-037: Type for needs-review items
export interface NeedsReviewItem {
  classificationId: string;
  noteId: string;
  noteTitle: string;
  inferredType: NoteClassification["inferredType"];
  confidence: number;
  explanation: string | null;
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserTimezone(id: string, timezone: string): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({ timezone, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  // Teams
  async getTeams(userId: string): Promise<Team[]> {
    const memberTeams = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
    
    if (memberTeams.length === 0) return [];
    
    const teamIds = memberTeams.map(m => m.teamId);
    const result = await db.select().from(teams);
    return result.filter(t => teamIds.includes(t.id));
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const [created] = await db.insert(teams).values(team).returning();
    return created;
  }

  async updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team> {
    const [updated] = await db.update(teams).set(data).where(eq(teams.id, id)).returning();
    return updated;
  }

  async deleteTeam(id: string): Promise<void> {
    await db.delete(diceRolls).where(eq(diceRolls.teamId, id));
    await db.delete(notes).where(eq(notes.teamId, id));
    
    const teamSessions = await db.select().from(gameSessions).where(eq(gameSessions.teamId, id));
    for (const session of teamSessions) {
      await db.delete(availability).where(eq(availability.sessionId, session.id));
    }
    await db.delete(gameSessions).where(eq(gameSessions.teamId, id));
    
    await db.delete(invites).where(eq(invites.teamId, id));
    await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
  }

  // Team Members
  async getTeamMembers(teamId: string): Promise<(TeamMember & { user?: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null; email?: string | null } })[]> {
    const members = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
    
    const result = [];
    for (const member of members) {
      const [user] = await db.select().from(users).where(eq(users.id, member.userId));
      result.push({
        ...member,
        user: user ? {
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          email: user.email,
        } : undefined
      });
    }
    return result;
  }

  async getTeamMember(teamId: string, userId: string): Promise<TeamMember | undefined> {
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    return member;
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const [created] = await db.insert(teamMembers).values(member).returning();
    return created;
  }

  async updateTeamMember(id: string, data: { characterName?: string | null; characterType1?: string | null; characterType2?: string | null; characterDescription?: string | null; aiEnabled?: boolean; aiEnabledAt?: Date | null }): Promise<TeamMember> {
    const [updated] = await db
      .update(teamMembers)
      .set(data)
      .where(eq(teamMembers.id, id))
      .returning();
    return updated;
  }

  async deleteTeamMember(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  // Invites
  async getInvites(teamId: string): Promise<Invite[]> {
    return await db
      .select()
      .from(invites)
      .where(and(eq(invites.teamId, teamId), gte(invites.expiresAt, new Date())))
      .orderBy(desc(invites.createdAt));
  }

  async getInviteByCode(code: string): Promise<Invite | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.code, code), gte(invites.expiresAt, new Date())));
    return invite;
  }

  async createInvite(invite: InsertInvite): Promise<Invite> {
    const code = invite.code || generateInviteCode();
    const [created] = await db.insert(invites).values({ ...invite, code }).returning();
    return created;
  }

  async deleteInvite(id: string): Promise<void> {
    await db.delete(invites).where(eq(invites.id, id));
  }

  // Notes
  async getNotes(teamId: string): Promise<Note[]> {
    return await db
      .select()
      .from(notes)
      .where(eq(notes.teamId, teamId))
      .orderBy(desc(notes.updatedAt));
  }

  async getNote(id: string): Promise<Note | undefined> {
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    return note;
  }

  async createNote(note: InsertNote): Promise<Note> {
    const [created] = await db.insert(notes).values(note).returning();
    return created;
  }

  async updateNote(id: string, data: Partial<InsertNote>): Promise<Note> {
    const [updated] = await db
      .update(notes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    return updated;
  }

  async deleteNote(id: string): Promise<void> {
    // Also delete any backlinks referencing this note
    await db.delete(backlinks).where(eq(backlinks.sourceNoteId, id));
    await db.delete(backlinks).where(eq(backlinks.targetNoteId, id));
    await db.delete(notes).where(eq(notes.id, id));
  }

  async getSessionLogs(teamId: string): Promise<Note[]> {
    return await db
      .select()
      .from(notes)
      .where(and(eq(notes.teamId, teamId), eq(notes.noteType, "session_log")))
      .orderBy(desc(notes.sessionDate));
  }

  // PRD-019: Find session by date for today's session editor
  async findSessionByDate(teamId: string, date: Date): Promise<Note | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [session] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.teamId, teamId),
          eq(notes.noteType, "session_log"),
          gte(notes.sessionDate, startOfDay),
          lte(notes.sessionDate, endOfDay)
        )
      )
      .limit(1);
    return session;
  }

  // PRD-015: Import methods
  async findNoteBySourceId(teamId: string, sourceSystem: string, sourcePageId: string): Promise<Note | undefined> {
    const [note] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.teamId, teamId),
          eq(notes.sourceSystem, sourceSystem),
          eq(notes.sourcePageId, sourcePageId)
        )
      );
    return note;
  }

  async upsertImportedNote(note: InsertNote): Promise<{ note: Note; created: boolean }> {
    // Check if note already exists with same source identifiers
    if (note.sourceSystem && note.sourcePageId) {
      const existing = await this.findNoteBySourceId(
        note.teamId,
        note.sourceSystem,
        note.sourcePageId
      );

      if (existing) {
        // Update existing note
        const updated = await this.updateNote(existing.id, {
          title: note.title,
          content: note.content,
          noteType: note.noteType,
          questStatus: note.questStatus,
          contentMarkdown: note.contentMarkdown,
          contentMarkdownResolved: note.contentMarkdownResolved,
          linkedNoteIds: note.linkedNoteIds,
        });
        return { note: updated, created: false };
      }
    }

    // Create new note
    const created = await this.createNote(note);
    return { note: created, created: true };
  }

  // Game Sessions
  async getSessions(teamId: string): Promise<GameSession[]> {
    return await db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.teamId, teamId))
      .orderBy(desc(gameSessions.scheduledAt));
  }

  async getSession(id: string): Promise<GameSession | undefined> {
    const [session] = await db.select().from(gameSessions).where(eq(gameSessions.id, id));
    return session;
  }

  async createSession(session: InsertGameSession): Promise<GameSession> {
    const [created] = await db.insert(gameSessions).values(session).returning();
    return created;
  }

  async updateSession(id: string, data: Partial<InsertGameSession>): Promise<GameSession> {
    const [updated] = await db
      .update(gameSessions)
      .set(data)
      .where(eq(gameSessions.id, id))
      .returning();
    return updated;
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(availability).where(eq(availability.sessionId, id));
    await db.delete(gameSessions).where(eq(gameSessions.id, id));
  }

  // Availability
  async getAvailability(teamId: string): Promise<Availability[]> {
    const sessions = await this.getSessions(teamId);
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) return [];
    
    const result = await db.select().from(availability);
    return result.filter(a => sessionIds.includes(a.sessionId));
  }

  async getSessionAvailability(sessionId: string): Promise<Availability[]> {
    return await db.select().from(availability).where(eq(availability.sessionId, sessionId));
  }

  async upsertAvailability(data: InsertAvailability): Promise<Availability> {
    const existing = await db
      .select()
      .from(availability)
      .where(and(
        eq(availability.sessionId, data.sessionId),
        eq(availability.userId, data.userId)
      ));
    
    if (existing.length > 0) {
      const [updated] = await db
        .update(availability)
        .set({ status: data.status })
        .where(eq(availability.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(availability).values(data).returning();
    return created;
  }

  // Dice Rolls
  async getDiceRolls(teamId: string): Promise<DiceRoll[]> {
    return await db
      .select()
      .from(diceRolls)
      .where(eq(diceRolls.teamId, teamId))
      .orderBy(desc(diceRolls.createdAt))
      .limit(100);
  }

  async createDiceRoll(roll: InsertDiceRoll): Promise<DiceRoll> {
    const [created] = await db.insert(diceRolls).values(roll).returning();
    return created;
  }

  // Backlinks (PRD-005)
  async getBacklinks(targetNoteId: string): Promise<Backlink[]> {
    return await db
      .select()
      .from(backlinks)
      .where(eq(backlinks.targetNoteId, targetNoteId))
      .orderBy(desc(backlinks.createdAt));
  }

  async getOutgoingLinks(sourceNoteId: string): Promise<Backlink[]> {
    return await db
      .select()
      .from(backlinks)
      .where(eq(backlinks.sourceNoteId, sourceNoteId))
      .orderBy(desc(backlinks.createdAt));
  }

  async createBacklink(backlink: InsertBacklink): Promise<Backlink> {
    const [created] = await db.insert(backlinks).values(backlink).returning();
    return created;
  }

  async deleteBacklink(id: string): Promise<void> {
    await db.delete(backlinks).where(eq(backlinks.id, id));
  }

  async deleteBacklinksBySource(sourceNoteId: string): Promise<void> {
    await db.delete(backlinks).where(eq(backlinks.sourceNoteId, sourceNoteId));
  }

  async deleteBacklinksByTarget(targetNoteId: string): Promise<void> {
    await db.delete(backlinks).where(eq(backlinks.targetNoteId, targetNoteId));
  }

  // User Availability (PRD-009)
  async getUserAvailability(teamId: string, startDate: Date, endDate: Date): Promise<UserAvailability[]> {
    return await db
      .select()
      .from(userAvailability)
      .where(
        and(
          eq(userAvailability.teamId, teamId),
          gte(userAvailability.date, startDate),
          lte(userAvailability.date, endDate)
        )
      )
      .orderBy(userAvailability.date);
  }

  async getUserAvailabilityByDate(teamId: string, userId: string, date: Date): Promise<UserAvailability | undefined> {
    // Normalize the date to start of day for comparison
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [result] = await db
      .select()
      .from(userAvailability)
      .where(
        and(
          eq(userAvailability.teamId, teamId),
          eq(userAvailability.userId, userId),
          gte(userAvailability.date, startOfDay),
          lte(userAvailability.date, endOfDay)
        )
      );
    return result;
  }

  async createUserAvailability(data: InsertUserAvailability): Promise<UserAvailability> {
    const [created] = await db.insert(userAvailability).values(data).returning();
    return created;
  }

  async updateUserAvailability(id: string, data: Partial<InsertUserAvailability>): Promise<UserAvailability> {
    const [updated] = await db
      .update(userAvailability)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userAvailability.id, id))
      .returning();
    return updated;
  }

  async deleteUserAvailability(id: string): Promise<void> {
    await db.delete(userAvailability).where(eq(userAvailability.id, id));
  }

  // Session Overrides (PRD-010A)
  async getSessionOverrides(teamId: string): Promise<SessionOverride[]> {
    return await db
      .select()
      .from(sessionOverrides)
      .where(eq(sessionOverrides.teamId, teamId))
      .orderBy(sessionOverrides.occurrenceKey);
  }

  async getSessionOverride(teamId: string, occurrenceKey: string): Promise<SessionOverride | undefined> {
    const [override] = await db
      .select()
      .from(sessionOverrides)
      .where(
        and(
          eq(sessionOverrides.teamId, teamId),
          eq(sessionOverrides.occurrenceKey, occurrenceKey)
        )
      );
    return override;
  }

  async upsertSessionOverride(data: InsertSessionOverride): Promise<SessionOverride> {
    // Check if override already exists for this team/occurrenceKey
    const existing = await this.getSessionOverride(data.teamId, data.occurrenceKey);

    if (existing) {
      const [updated] = await db
        .update(sessionOverrides)
        .set({
          status: data.status,
          scheduledAtOverride: data.scheduledAtOverride,
          updatedBy: data.updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(sessionOverrides.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(sessionOverrides).values(data).returning();
    return created;
  }

  async deleteSessionOverride(id: string): Promise<void> {
    await db.delete(sessionOverrides).where(eq(sessionOverrides.id, id));
  }

  // Import Runs (PRD-015A)
  async getImportRuns(teamId: string): Promise<ImportRun[]> {
    return await db
      .select()
      .from(importRuns)
      .where(eq(importRuns.teamId, teamId))
      .orderBy(desc(importRuns.createdAt));
  }

  async getImportRun(id: string): Promise<ImportRun | undefined> {
    const [run] = await db.select().from(importRuns).where(eq(importRuns.id, id));
    return run;
  }

  async createImportRun(importRun: InsertImportRun): Promise<ImportRun> {
    const [created] = await db.insert(importRuns).values(importRun).returning();
    return created;
  }

  async updateImportRun(id: string, data: Partial<InsertImportRun>): Promise<ImportRun> {
    const [updated] = await db
      .update(importRuns)
      .set(data as typeof importRuns.$inferInsert)
      .where(eq(importRuns.id, id))
      .returning();
    return updated;
  }

  async updateImportRunStatus(id: string, status: ImportRunStatus): Promise<ImportRun> {
    const [updated] = await db
      .update(importRuns)
      .set({ status })
      .where(eq(importRuns.id, id))
      .returning();
    return updated;
  }

  // Notes by import run (PRD-015A)
  async getNotesByImportRun(importRunId: string): Promise<Note[]> {
    return await db
      .select()
      .from(notes)
      .where(eq(notes.importRunId, importRunId));
  }

  async deleteNotesByImportRun(importRunId: string): Promise<number> {
    // Get all notes to delete their backlinks
    const notesToDelete = await this.getNotesByImportRun(importRunId);

    for (const note of notesToDelete) {
      await db.delete(backlinks).where(eq(backlinks.sourceNoteId, note.id));
      await db.delete(backlinks).where(eq(backlinks.targetNoteId, note.id));
    }

    const result = await db
      .delete(notes)
      .where(eq(notes.importRunId, importRunId))
      .returning();

    return result.length;
  }

  // Note Import Snapshots (PRD-015A FR-6)
  async createNoteImportSnapshot(snapshot: InsertNoteImportSnapshot): Promise<NoteImportSnapshot> {
    const [created] = await db.insert(noteImportSnapshots).values(snapshot as typeof noteImportSnapshots.$inferInsert).returning();
    return created;
  }

  async getSnapshotsByImportRun(importRunId: string): Promise<NoteImportSnapshot[]> {
    return await db
      .select()
      .from(noteImportSnapshots)
      .where(eq(noteImportSnapshots.importRunId, importRunId));
  }

  async restoreNoteFromSnapshot(snapshotId: string): Promise<Note> {
    const [snapshot] = await db
      .select()
      .from(noteImportSnapshots)
      .where(eq(noteImportSnapshots.id, snapshotId));

    if (!snapshot) throw new Error("Snapshot not found");

    const [restored] = await db
      .update(notes)
      .set({
        title: snapshot.previousTitle,
        content: snapshot.previousContent,
        noteType: snapshot.previousNoteType,
        questStatus: snapshot.previousQuestStatus,
        contentMarkdown: snapshot.previousContentMarkdown,
        contentMarkdownResolved: snapshot.previousContentMarkdownResolved,
        isPrivate: snapshot.previousIsPrivate,
        importRunId: null, // Clear import run reference
        updatedAt: new Date(),
      })
      .where(eq(notes.id, snapshot.noteId))
      .returning();

    return restored;
  }

  async deleteSnapshotsByImportRun(importRunId: string): Promise<void> {
    await db.delete(noteImportSnapshots).where(eq(noteImportSnapshots.importRunId, importRunId));
  }

  // PRD-016: Enrichment Runs
  async createEnrichmentRun(run: InsertEnrichmentRun): Promise<EnrichmentRun> {
    const [created] = await db.insert(enrichmentRuns).values(run as typeof enrichmentRuns.$inferInsert).returning();
    return created;
  }

  async getEnrichmentRun(id: string): Promise<EnrichmentRun | undefined> {
    const [run] = await db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, id));
    return run;
  }

  async getEnrichmentRunByImportId(importRunId: string): Promise<EnrichmentRun | undefined> {
    const [run] = await db
      .select()
      .from(enrichmentRuns)
      .where(eq(enrichmentRuns.importRunId, importRunId))
      .orderBy(desc(enrichmentRuns.createdAt))
      .limit(1);
    return run;
  }

  async updateEnrichmentRun(id: string, data: Partial<InsertEnrichmentRun>): Promise<EnrichmentRun> {
    const [updated] = await db
      .update(enrichmentRuns)
      .set(data as typeof enrichmentRuns.$inferInsert)
      .where(eq(enrichmentRuns.id, id))
      .returning();
    return updated;
  }

  async updateEnrichmentRunStatus(id: string, status: EnrichmentStatus): Promise<EnrichmentRun> {
    const updates: Partial<typeof enrichmentRuns.$inferInsert> = { status };
    if (status === "running") {
      updates.startedAt = new Date();
    } else if (status === "completed" || status === "failed") {
      updates.completedAt = new Date();
    }
    const [updated] = await db
      .update(enrichmentRuns)
      .set(updates)
      .where(eq(enrichmentRuns.id, id))
      .returning();
    return updated;
  }

  // PRD-016: Note Classifications
  async createNoteClassification(classification: InsertNoteClassification): Promise<NoteClassification> {
    const [created] = await db.insert(noteClassifications).values(classification as typeof noteClassifications.$inferInsert).returning();
    return created;
  }

  async getNoteClassificationsByEnrichmentRun(enrichmentRunId: string): Promise<NoteClassification[]> {
    return await db
      .select()
      .from(noteClassifications)
      .where(eq(noteClassifications.enrichmentRunId, enrichmentRunId))
      .orderBy(desc(noteClassifications.confidence));
  }

  async getNoteClassification(noteId: string): Promise<NoteClassification | undefined> {
    const [classification] = await db
      .select()
      .from(noteClassifications)
      .where(eq(noteClassifications.noteId, noteId))
      .orderBy(desc(noteClassifications.createdAt))
      .limit(1);
    return classification;
  }

  async updateNoteClassificationStatus(id: string, status: ClassificationStatus, userId: string): Promise<NoteClassification> {
    const [updated] = await db
      .update(noteClassifications)
      .set({
        status,
        approvedByUserId: status === "approved" ? userId : null,
        updatedAt: new Date(),
      })
      .where(eq(noteClassifications.id, id))
      .returning();
    return updated;
  }

  async bulkUpdateClassificationStatus(ids: string[], status: ClassificationStatus, userId: string): Promise<number> {
    let count = 0;
    for (const id of ids) {
      await this.updateNoteClassificationStatus(id, status, userId);
      count++;
    }
    return count;
  }

  async deleteClassificationsByEnrichmentRun(enrichmentRunId: string): Promise<void> {
    await db.delete(noteClassifications).where(eq(noteClassifications.enrichmentRunId, enrichmentRunId));
  }

  // PRD-016: Note Relationships
  async createNoteRelationship(relationship: InsertNoteRelationship): Promise<NoteRelationship> {
    const [created] = await db.insert(noteRelationships).values(relationship as typeof noteRelationships.$inferInsert).returning();
    return created;
  }

  async getNoteRelationshipsByEnrichmentRun(enrichmentRunId: string): Promise<NoteRelationship[]> {
    return await db
      .select()
      .from(noteRelationships)
      .where(eq(noteRelationships.enrichmentRunId, enrichmentRunId))
      .orderBy(desc(noteRelationships.confidence));
  }

  async getRelationshipsForNote(noteId: string): Promise<NoteRelationship[]> {
    const fromRelationships = await db
      .select()
      .from(noteRelationships)
      .where(eq(noteRelationships.fromNoteId, noteId));
    const toRelationships = await db
      .select()
      .from(noteRelationships)
      .where(eq(noteRelationships.toNoteId, noteId));
    return [...fromRelationships, ...toRelationships];
  }

  async updateNoteRelationshipStatus(id: string, status: ClassificationStatus, userId: string): Promise<NoteRelationship> {
    const [updated] = await db
      .update(noteRelationships)
      .set({
        status,
        approvedByUserId: status === "approved" ? userId : null,
        updatedAt: new Date(),
      })
      .where(eq(noteRelationships.id, id))
      .returning();
    return updated;
  }

  async bulkUpdateRelationshipStatus(ids: string[], status: ClassificationStatus, userId: string): Promise<number> {
    let count = 0;
    for (const id of ids) {
      await this.updateNoteRelationshipStatus(id, status, userId);
      count++;
    }
    return count;
  }

  async deleteRelationshipsByEnrichmentRun(enrichmentRunId: string): Promise<void> {
    await db.delete(noteRelationships).where(eq(noteRelationships.enrichmentRunId, enrichmentRunId));
  }

  // PRD-037: Get pending low-confidence classifications for review
  async getPendingLowConfidenceClassifications(teamId: string): Promise<NeedsReviewItem[]> {
    const CONFIDENCE_THRESHOLD = 0.65;
    const results = await db
      .select({
        classificationId: noteClassifications.id,
        noteId: noteClassifications.noteId,
        noteTitle: notes.title,
        inferredType: noteClassifications.inferredType,
        confidence: noteClassifications.confidence,
        explanation: noteClassifications.explanation,
      })
      .from(noteClassifications)
      .innerJoin(notes, eq(noteClassifications.noteId, notes.id))
      .where(
        and(
          eq(notes.teamId, teamId),
          eq(noteClassifications.status, "pending"),
          lt(noteClassifications.confidence, CONFIDENCE_THRESHOLD)
        )
      )
      .orderBy(noteClassifications.confidence);

    return results;
  }

  // PRD-043: AI Cache methods
  async getAICacheEntry(
    cacheType: string,
    contentHash: string,
    algorithmVersion: string,
    contextHash?: string,
    teamId?: string
  ): Promise<AICacheEntry | null> {
    const conditions = [
      eq(aiCacheEntries.cacheType, cacheType as "classification" | "relationship"),
      eq(aiCacheEntries.contentHash, contentHash),
      eq(aiCacheEntries.algorithmVersion, algorithmVersion),
    ];

    if (contextHash !== undefined) {
      conditions.push(eq(aiCacheEntries.contextHash, contextHash));
    }

    if (teamId !== undefined) {
      conditions.push(eq(aiCacheEntries.teamId, teamId));
    }

    const [entry] = await db
      .select()
      .from(aiCacheEntries)
      .where(and(...conditions))
      .limit(1);

    return entry || null;
  }

  async setAICacheEntry(entry: InsertAICacheEntry): Promise<AICacheEntry> {
    // Try to upsert - if entry with same key exists, update it
    const existing = await this.getAICacheEntry(
      entry.cacheType,
      entry.contentHash,
      entry.algorithmVersion,
      entry.contextHash ?? undefined,
      entry.teamId
    );

    if (existing) {
      const [updated] = await db
        .update(aiCacheEntries)
        .set({
          result: entry.result,
          modelId: entry.modelId,
          tokensSaved: entry.tokensSaved,
          expiresAt: entry.expiresAt,
        })
        .where(eq(aiCacheEntries.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(aiCacheEntries)
      .values(entry as typeof aiCacheEntries.$inferInsert)
      .returning();
    return created;
  }

  async getAICacheEntriesBatch(
    cacheType: string,
    contentHashes: string[],
    algorithmVersion: string,
    contextHash?: string,
    teamId?: string
  ): Promise<AICacheEntry[]> {
    if (contentHashes.length === 0) {
      return [];
    }

    const conditions = [
      eq(aiCacheEntries.cacheType, cacheType as "classification" | "relationship"),
      inArray(aiCacheEntries.contentHash, contentHashes),
      eq(aiCacheEntries.algorithmVersion, algorithmVersion),
    ];

    if (contextHash !== undefined) {
      conditions.push(eq(aiCacheEntries.contextHash, contextHash));
    }

    if (teamId !== undefined) {
      conditions.push(eq(aiCacheEntries.teamId, teamId));
    }

    return await db
      .select()
      .from(aiCacheEntries)
      .where(and(...conditions));
  }

  async incrementAICacheHitCount(id: string): Promise<void> {
    await db
      .update(aiCacheEntries)
      .set({
        hitCount: sql`COALESCE(${aiCacheEntries.hitCount}, 0) + 1`,
        lastHitAt: new Date(),
      })
      .where(eq(aiCacheEntries.id, id));
  }

  async deleteAICacheByVersion(operationType: string, version: string): Promise<number> {
    const result = await db
      .delete(aiCacheEntries)
      .where(
        and(
          eq(aiCacheEntries.cacheType, operationType as "classification" | "relationship"),
          eq(aiCacheEntries.algorithmVersion, version)
        )
      )
      .returning();
    return result.length;
  }

  async deleteAICacheByTeam(teamId: string): Promise<number> {
    const result = await db
      .delete(aiCacheEntries)
      .where(eq(aiCacheEntries.teamId, teamId))
      .returning();
    return result.length;
  }

  async deleteExpiredAICacheEntries(): Promise<number> {
    const result = await db
      .delete(aiCacheEntries)
      .where(lt(aiCacheEntries.expiresAt, new Date()))
      .returning();
    return result.length;
  }

  async getAICacheStats(): Promise<AICacheStats> {
    // Get total entries and counts by type
    const allEntries = await db.select().from(aiCacheEntries);

    const classificationCount = allEntries.filter(e => e.cacheType === "classification").length;
    const relationshipCount = allEntries.filter(e => e.cacheType === "relationship").length;
    const totalHits = allEntries.reduce((sum, e) => sum + (e.hitCount || 0), 0);

    // Get oldest and newest entries
    const sortedByCreated = [...allEntries].sort(
      (a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
    );
    const oldestEntry = sortedByCreated[0]?.createdAt || null;
    const newestEntry = sortedByCreated[sortedByCreated.length - 1]?.createdAt || null;

    // Count entries expiring within 7 days
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const entriesExpiringSoon = allEntries.filter(
      e => e.expiresAt && new Date(e.expiresAt) < sevenDaysFromNow
    ).length;

    return {
      totalEntries: allEntries.length,
      entriesByType: {
        classification: classificationCount,
        relationship: relationshipCount,
      },
      totalHits,
      oldestEntry,
      newestEntry,
      entriesExpiringSoon,
    };
  }
}

export const storage = new DatabaseStorage();
