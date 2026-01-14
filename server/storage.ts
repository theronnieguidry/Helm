import {
  teams, Team, InsertTeam,
  teamMembers, TeamMember, InsertTeamMember,
  invites, Invite, InsertInvite,
  notes, Note, InsertNote,
  gameSessions, GameSession, InsertGameSession,
  availability, Availability, InsertAvailability,
  diceRolls, DiceRoll, InsertDiceRoll,
  backlinks, Backlink, InsertBacklink,
  users
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte } from "drizzle-orm";

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
  updateTeamMember(id: string, data: { characterName?: string | null; characterType1?: string | null; characterType2?: string | null; characterDescription?: string | null }): Promise<TeamMember>;
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

  // Game Sessions
  getSessions(teamId: string): Promise<GameSession[]>;
  getSession(id: string): Promise<GameSession | undefined>;
  createSession(session: InsertGameSession): Promise<GameSession>;
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

  async updateTeamMember(id: string, data: { characterName?: string | null; characterType1?: string | null; characterType2?: string | null; characterDescription?: string | null }): Promise<TeamMember> {
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
}

export const storage = new DatabaseStorage();
