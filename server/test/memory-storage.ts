import type { IStorage } from "../storage";
import {
  TEAM_TYPES, DICE_MODES, RECURRENCE_FREQUENCIES, NOTE_TYPES, AVAILABILITY_STATUS,
  type Team, type InsertTeam,
  type TeamMember, type InsertTeamMember,
  type Invite, type InsertInvite,
  type Note, type InsertNote,
  type GameSession, type InsertGameSession,
  type Availability, type InsertAvailability,
  type DiceRoll, type InsertDiceRoll,
  type User,
  type TeamType,
  type DiceMode,
  type RecurrenceFrequency,
  type NoteType,
  type AvailabilityStatus,
} from "@shared/schema";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function validateTeamType(value: string): TeamType {
  if (!TEAM_TYPES.includes(value as TeamType)) {
    throw new Error(`Invalid team type: ${value}`);
  }
  return value as TeamType;
}

function validateDiceMode(value: string): DiceMode {
  if (!DICE_MODES.includes(value as DiceMode)) {
    throw new Error(`Invalid dice mode: ${value}`);
  }
  return value as DiceMode;
}

function validateRecurrenceFrequency(value: string | null | undefined): RecurrenceFrequency | null {
  if (value === null || value === undefined) return null;
  if (!RECURRENCE_FREQUENCIES.includes(value as RecurrenceFrequency)) {
    throw new Error(`Invalid recurrence frequency: ${value}`);
  }
  return value as RecurrenceFrequency;
}

function validateNoteType(value: string): NoteType {
  if (!NOTE_TYPES.includes(value as NoteType)) {
    throw new Error(`Invalid note type: ${value}`);
  }
  return value as NoteType;
}

function validateAvailabilityStatus(value: string): AvailabilityStatus {
  if (!AVAILABILITY_STATUS.includes(value as AvailabilityStatus)) {
    throw new Error(`Invalid availability status: ${value}`);
  }
  return value as AvailabilityStatus;
}

export class MemoryStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();
  private teamMembers: Map<string, TeamMember> = new Map();
  private invites: Map<string, Invite> = new Map();
  private notes: Map<string, Note> = new Map();
  private sessions: Map<string, GameSession> = new Map();
  private availabilityMap: Map<string, Availability> = new Map();
  private diceRolls: Map<string, DiceRoll> = new Map();

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async updateUserTimezone(id: string, timezone: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    const updated = { ...user, timezone, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  setUser(user: User): void {
    this.users.set(user.id, user);
  }

  async getTeams(userId: string): Promise<Team[]> {
    const memberTeamIds = Array.from(this.teamMembers.values())
      .filter(m => m.userId === userId)
      .map(m => m.teamId);
    return Array.from(this.teams.values()).filter(t => memberTeamIds.includes(t.id));
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const id = generateId();
    const teamType = validateTeamType(team.teamType);
    const diceMode = validateDiceMode(team.diceMode ?? "polyhedral");
    const recurrenceFrequency = validateRecurrenceFrequency(team.recurrenceFrequency);
    
    const newTeam: Team = {
      id,
      name: team.name,
      teamType,
      diceMode,
      ownerId: team.ownerId,
      recurrenceFrequency,
      dayOfWeek: team.dayOfWeek ?? null,
      daysOfMonth: team.daysOfMonth as number[] ?? null,
      startTime: team.startTime ?? null,
      timezone: team.timezone ?? null,
      recurrenceAnchorDate: null,
      minAttendanceThreshold: 2,
      createdAt: new Date(),
    };
    this.teams.set(id, newTeam);
    return newTeam;
  }

  async updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team> {
    const team = this.teams.get(id);
    if (!team) throw new Error("Team not found");
    const updated = { ...team, ...data } as Team;
    this.teams.set(id, updated);
    return updated;
  }

  async deleteTeam(id: string): Promise<void> {
    this.teams.delete(id);
    for (const [memberId, member] of Array.from(this.teamMembers.entries())) {
      if (member.teamId === id) this.teamMembers.delete(memberId);
    }
    for (const [inviteId, invite] of Array.from(this.invites.entries())) {
      if (invite.teamId === id) this.invites.delete(inviteId);
    }
    for (const [noteId, note] of Array.from(this.notes.entries())) {
      if (note.teamId === id) this.notes.delete(noteId);
    }
    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      if (session.teamId === id) {
        for (const [availId, avail] of Array.from(this.availabilityMap.entries())) {
          if (avail.sessionId === sessionId) this.availabilityMap.delete(availId);
        }
        this.sessions.delete(sessionId);
      }
    }
    for (const [rollId, roll] of Array.from(this.diceRolls.entries())) {
      if (roll.teamId === id) this.diceRolls.delete(rollId);
    }
  }

  async getTeamMembers(teamId: string): Promise<(TeamMember & { user?: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null; email?: string | null } })[]> {
    const members = Array.from(this.teamMembers.values()).filter(m => m.teamId === teamId);
    return members.map(m => {
      const user = this.users.get(m.userId);
      return {
        ...m,
        user: user ? {
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          email: user.email,
        } : undefined,
      };
    });
  }

  async getTeamMember(teamId: string, userId: string): Promise<TeamMember | undefined> {
    return Array.from(this.teamMembers.values()).find(
      m => m.teamId === teamId && m.userId === userId
    );
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const id = generateId();
    const newMember: TeamMember = {
      id,
      teamId: member.teamId,
      userId: member.userId,
      role: member.role as "dm" | "member",
      characterName: member.characterName ?? null,
      characterType1: member.characterType1 ?? null,
      characterType2: member.characterType2 ?? null,
      characterDescription: member.characterDescription ?? null,
      joinedAt: new Date(),
    };
    this.teamMembers.set(id, newMember);
    return newMember;
  }

  async updateTeamMember(id: string, data: { characterName?: string | null; characterType1?: string | null; characterType2?: string | null; characterDescription?: string | null }): Promise<TeamMember> {
    const member = this.teamMembers.get(id);
    if (!member) throw new Error("Team member not found");
    const updated = { ...member, ...data };
    this.teamMembers.set(id, updated);
    return updated;
  }

  async deleteTeamMember(id: string): Promise<void> {
    this.teamMembers.delete(id);
  }

  async getInvites(teamId: string): Promise<Invite[]> {
    return Array.from(this.invites.values())
      .filter(i => i.teamId === teamId && i.expiresAt > new Date());
  }

  async getInviteByCode(code: string): Promise<Invite | undefined> {
    return Array.from(this.invites.values()).find(i => i.code === code);
  }

  async createInvite(invite: InsertInvite): Promise<Invite> {
    const id = generateId();
    const newInvite: Invite = {
      id,
      teamId: invite.teamId,
      code: invite.code,
      expiresAt: invite.expiresAt,
      createdAt: new Date(),
    };
    this.invites.set(id, newInvite);
    return newInvite;
  }

  async deleteInvite(id: string): Promise<void> {
    this.invites.delete(id);
  }

  async getNotes(teamId: string): Promise<Note[]> {
    return Array.from(this.notes.values())
      .filter(n => n.teamId === teamId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getNote(id: string): Promise<Note | undefined> {
    return this.notes.get(id);
  }

  async createNote(note: InsertNote): Promise<Note> {
    const id = generateId();
    const noteType = validateNoteType(note.noteType ?? "location");
    
    const newNote: Note = {
      id,
      teamId: note.teamId,
      authorId: note.authorId,
      title: note.title,
      content: note.content ?? null,
      noteType,
      isPrivate: note.isPrivate ?? false,
      parentNoteId: note.parentNoteId ?? null,
      linkedNoteIds: (note.linkedNoteIds as string[]) ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.notes.set(id, newNote);
    return newNote;
  }

  async updateNote(id: string, data: Partial<InsertNote>): Promise<Note> {
    const note = this.notes.get(id);
    if (!note) throw new Error("Note not found");
    const updated: Note = { ...note, ...data, updatedAt: new Date() } as Note;
    this.notes.set(id, updated);
    return updated;
  }

  async deleteNote(id: string): Promise<void> {
    this.notes.delete(id);
  }

  async getSessions(teamId: string): Promise<GameSession[]> {
    return Array.from(this.sessions.values())
      .filter(s => s.teamId === teamId)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }

  async getSession(id: string): Promise<GameSession | undefined> {
    return this.sessions.get(id);
  }

  async createSession(session: InsertGameSession): Promise<GameSession> {
    const id = generateId();
    const newSession: GameSession = {
      id,
      teamId: session.teamId,
      scheduledAt: session.scheduledAt,
      isOverride: session.isOverride ?? false,
      notes: session.notes ?? null,
      createdAt: new Date(),
    };
    this.sessions.set(id, newSession);
    return newSession;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
    for (const [availId, avail] of Array.from(this.availabilityMap.entries())) {
      if (avail.sessionId === id) this.availabilityMap.delete(availId);
    }
  }

  async getAvailability(teamId: string): Promise<Availability[]> {
    const teamSessionIds = Array.from(this.sessions.values())
      .filter(s => s.teamId === teamId)
      .map(s => s.id);
    return Array.from(this.availabilityMap.values())
      .filter(a => teamSessionIds.includes(a.sessionId));
  }

  async getSessionAvailability(sessionId: string): Promise<Availability[]> {
    return Array.from(this.availabilityMap.values()).filter(a => a.sessionId === sessionId);
  }

  async upsertAvailability(data: InsertAvailability): Promise<Availability> {
    const status = validateAvailabilityStatus(data.status);
    
    const existing = Array.from(this.availabilityMap.values()).find(
      a => a.sessionId === data.sessionId && a.userId === data.userId
    );
    if (existing) {
      const updated: Availability = { ...existing, status };
      this.availabilityMap.set(existing.id, updated);
      return updated;
    }
    const id = generateId();
    const newAvailability: Availability = {
      id,
      sessionId: data.sessionId,
      userId: data.userId,
      status,
      createdAt: new Date(),
    };
    this.availabilityMap.set(id, newAvailability);
    return newAvailability;
  }

  async getDiceRolls(teamId: string): Promise<DiceRoll[]> {
    return Array.from(this.diceRolls.values())
      .filter(r => r.teamId === teamId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async createDiceRoll(roll: InsertDiceRoll): Promise<DiceRoll> {
    const id = generateId();
    const newRoll: DiceRoll = {
      id,
      teamId: roll.teamId,
      userId: roll.userId,
      diceType: roll.diceType,
      count: roll.count ?? 1,
      modifier: roll.modifier ?? 0,
      results: roll.results as number[],
      total: roll.total,
      isShared: roll.isShared ?? false,
      createdAt: new Date(),
    };
    this.diceRolls.set(id, newRoll);
    return newRoll;
  }

  clear(): void {
    this.users.clear();
    this.teams.clear();
    this.teamMembers.clear();
    this.invites.clear();
    this.notes.clear();
    this.sessions.clear();
    this.availabilityMap.clear();
    this.diceRolls.clear();
  }
}
