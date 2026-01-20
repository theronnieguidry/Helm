import type { IStorage, NeedsReviewItem } from "../storage";
import {
  TEAM_TYPES, DICE_MODES, RECURRENCE_FREQUENCIES, NOTE_TYPES, AVAILABILITY_STATUS, QUEST_STATUSES, SESSION_STATUSES, IMPORT_RUN_STATUSES,
  ENRICHMENT_STATUSES, CLASSIFICATION_STATUSES, INFERRED_ENTITY_TYPES, RELATIONSHIP_TYPES, EVIDENCE_TYPES,
  type Team, type InsertTeam,
  type TeamMember, type InsertTeamMember,
  type Invite, type InsertInvite,
  type Note, type InsertNote,
  type GameSession, type InsertGameSession,
  type Availability, type InsertAvailability,
  type DiceRoll, type InsertDiceRoll,
  type Backlink, type InsertBacklink,
  type UserAvailability, type InsertUserAvailability,
  type SessionOverride, type InsertSessionOverride,
  type ImportRun, type InsertImportRun, type ImportRunStatus,
  type NoteImportSnapshot, type InsertNoteImportSnapshot,
  type ImportRunOptions, type ImportRunStats,
  // PRD-016: AI Enrichment types
  type EnrichmentRun, type InsertEnrichmentRun, type EnrichmentStatus,
  type NoteClassification, type InsertNoteClassification, type ClassificationStatus,
  type NoteRelationship, type InsertNoteRelationship,
  type InferredEntityType, type RelationshipType, type EvidenceType,
  type EnrichmentRunTotals,
  // PRD-043: AI Cache types
  type AICacheEntry, type InsertAICacheEntry, type AICacheStats, type AICacheType,
  type User,
  type TeamType,
  type DiceMode,
  type RecurrenceFrequency,
  type NoteType,
  type AvailabilityStatus,
  type QuestStatus,
  type ContentBlock,
  type SessionStatus,
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

function validateQuestStatus(value: string | null | undefined): QuestStatus | null {
  if (value === null || value === undefined) return null;
  if (!QUEST_STATUSES.includes(value as QuestStatus)) {
    throw new Error(`Invalid quest status: ${value}`);
  }
  return value as QuestStatus;
}

function validateSessionStatus(value: string | null | undefined): SessionStatus {
  if (value === null || value === undefined) return "scheduled";
  if (!SESSION_STATUSES.includes(value as SessionStatus)) {
    throw new Error(`Invalid session status: ${value}`);
  }
  return value as SessionStatus;
}

function validateImportRunStatus(value: string | null | undefined): ImportRunStatus {
  if (value === null || value === undefined) return "completed";
  if (!IMPORT_RUN_STATUSES.includes(value as ImportRunStatus)) {
    throw new Error(`Invalid import run status: ${value}`);
  }
  return value as ImportRunStatus;
}

// PRD-016: Validation functions for AI Enrichment
function validateEnrichmentStatus(value: string | null | undefined): EnrichmentStatus {
  if (value === null || value === undefined) return "pending";
  if (!ENRICHMENT_STATUSES.includes(value as EnrichmentStatus)) {
    throw new Error(`Invalid enrichment status: ${value}`);
  }
  return value as EnrichmentStatus;
}

function validateClassificationStatus(value: string | null | undefined): ClassificationStatus {
  if (value === null || value === undefined) return "pending";
  if (!CLASSIFICATION_STATUSES.includes(value as ClassificationStatus)) {
    throw new Error(`Invalid classification status: ${value}`);
  }
  return value as ClassificationStatus;
}

function validateInferredEntityType(value: string): InferredEntityType {
  if (!INFERRED_ENTITY_TYPES.includes(value as InferredEntityType)) {
    throw new Error(`Invalid inferred entity type: ${value}`);
  }
  return value as InferredEntityType;
}

function validateRelationshipType(value: string): RelationshipType {
  if (!RELATIONSHIP_TYPES.includes(value as RelationshipType)) {
    throw new Error(`Invalid relationship type: ${value}`);
  }
  return value as RelationshipType;
}

function validateEvidenceType(value: string): EvidenceType {
  if (!EVIDENCE_TYPES.includes(value as EvidenceType)) {
    throw new Error(`Invalid evidence type: ${value}`);
  }
  return value as EvidenceType;
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
  private backlinks: Map<string, Backlink> = new Map();
  private userAvailabilityMap: Map<string, UserAvailability> = new Map();
  private sessionOverridesMap: Map<string, SessionOverride> = new Map();
  private importRunsMap: Map<string, ImportRun> = new Map();
  private noteImportSnapshotsMap: Map<string, NoteImportSnapshot> = new Map();
  // PRD-016: AI Enrichment
  private enrichmentRunsMap: Map<string, EnrichmentRun> = new Map();
  private noteClassificationsMap: Map<string, NoteClassification> = new Map();
  private noteRelationshipsMap: Map<string, NoteRelationship> = new Map();
  // PRD-043: AI Cache
  private aiCacheEntriesMap: Map<string, AICacheEntry> = new Map();

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
      defaultSessionDurationMinutes: 180,
      // PRD-027: AI Features paywall
      aiEnabled: team.aiEnabled ?? false,
      aiEnabledAt: team.aiEnabledAt ?? null,
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
      // PRD-028: Per-member AI features
      aiEnabled: member.aiEnabled ?? false,
      aiEnabledAt: member.aiEnabledAt ?? null,
      joinedAt: new Date(),
    };
    this.teamMembers.set(id, newMember);
    return newMember;
  }

  async updateTeamMember(id: string, data: { characterName?: string | null; characterType1?: string | null; characterType2?: string | null; characterDescription?: string | null; aiEnabled?: boolean; aiEnabledAt?: Date | null }): Promise<TeamMember> {
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
    // For quests, use provided status or default to 'lead'. For non-quests, always null.
    const questStatus = noteType === "quest"
      ? validateQuestStatus(note.questStatus) ?? "lead"
      : null;

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
      // PRD-001: Session log fields
      sessionDate: note.sessionDate ? new Date(note.sessionDate) : null,
      contentBlocks: (note.contentBlocks as ContentBlock[]) ?? null,
      // PRD-004: Quest status
      questStatus,
      // PRD-015: Import tracking fields
      sourceSystem: note.sourceSystem ?? null,
      sourcePageId: note.sourcePageId ?? null,
      contentMarkdown: note.contentMarkdown ?? null,
      contentMarkdownResolved: note.contentMarkdownResolved ?? null,
      // PRD-015A: Attribution and import run tracking
      importRunId: note.importRunId ?? null,
      createdByUserId: note.createdByUserId ?? null,
      updatedByUserId: note.updatedByUserId ?? null,
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
    // Also delete any backlinks referencing this note
    for (const [backlinkId, backlink] of Array.from(this.backlinks.entries())) {
      if (backlink.sourceNoteId === id || backlink.targetNoteId === id) {
        this.backlinks.delete(backlinkId);
      }
    }
    this.notes.delete(id);
  }

  async getSessionLogs(teamId: string): Promise<Note[]> {
    return Array.from(this.notes.values())
      .filter(n => n.teamId === teamId && n.noteType === "session_log")
      .sort((a, b) => {
        const dateA = a.sessionDate?.getTime() ?? 0;
        const dateB = b.sessionDate?.getTime() ?? 0;
        return dateB - dateA;
      });
  }

  // PRD-019: Find session by date for today's session editor
  async findSessionByDate(teamId: string, date: Date): Promise<Note | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return Array.from(this.notes.values()).find(
      n => n.teamId === teamId &&
        n.noteType === "session_log" &&
        n.sessionDate &&
        n.sessionDate >= startOfDay &&
        n.sessionDate <= endOfDay
    );
  }

  // PRD-015: Import methods
  async findNoteBySourceId(teamId: string, sourceSystem: string, sourcePageId: string): Promise<Note | undefined> {
    return Array.from(this.notes.values()).find(
      n => n.teamId === teamId && n.sourceSystem === sourceSystem && n.sourcePageId === sourcePageId
    );
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
    const status = validateSessionStatus(session.status);
    const newSession: GameSession = {
      id,
      teamId: session.teamId,
      scheduledAt: session.scheduledAt,
      isOverride: session.isOverride ?? false,
      notes: session.notes ?? null,
      status,
      createdAt: new Date(),
    };
    this.sessions.set(id, newSession);
    return newSession;
  }

  async updateSession(id: string, data: Partial<InsertGameSession>): Promise<GameSession> {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Session not found");
    const updated: GameSession = { ...session, ...data } as GameSession;
    this.sessions.set(id, updated);
    return updated;
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

  // Backlinks (PRD-005)
  async getBacklinks(targetNoteId: string): Promise<Backlink[]> {
    return Array.from(this.backlinks.values())
      .filter(b => b.targetNoteId === targetNoteId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getOutgoingLinks(sourceNoteId: string): Promise<Backlink[]> {
    return Array.from(this.backlinks.values())
      .filter(b => b.sourceNoteId === sourceNoteId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async createBacklink(backlink: InsertBacklink): Promise<Backlink> {
    const id = generateId();
    const newBacklink: Backlink = {
      id,
      sourceNoteId: backlink.sourceNoteId,
      sourceBlockId: backlink.sourceBlockId ?? null,
      targetNoteId: backlink.targetNoteId,
      textSnippet: backlink.textSnippet ?? null,
      createdAt: new Date(),
    };
    this.backlinks.set(id, newBacklink);
    return newBacklink;
  }

  async deleteBacklink(id: string): Promise<void> {
    this.backlinks.delete(id);
  }

  async deleteBacklinksBySource(sourceNoteId: string): Promise<void> {
    for (const [id, backlink] of Array.from(this.backlinks.entries())) {
      if (backlink.sourceNoteId === sourceNoteId) {
        this.backlinks.delete(id);
      }
    }
  }

  async deleteBacklinksByTarget(targetNoteId: string): Promise<void> {
    for (const [id, backlink] of Array.from(this.backlinks.entries())) {
      if (backlink.targetNoteId === targetNoteId) {
        this.backlinks.delete(id);
      }
    }
  }

  // User Availability (PRD-009)
  async getUserAvailability(teamId: string, startDate: Date, endDate: Date): Promise<UserAvailability[]> {
    return Array.from(this.userAvailabilityMap.values())
      .filter(ua => {
        const uaDate = new Date(ua.date);
        return ua.teamId === teamId && uaDate >= startDate && uaDate <= endDate;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getUserAvailabilityByDate(teamId: string, userId: string, date: Date): Promise<UserAvailability | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return Array.from(this.userAvailabilityMap.values()).find(ua => {
      const uaDate = new Date(ua.date);
      return ua.teamId === teamId &&
             ua.userId === userId &&
             uaDate >= startOfDay &&
             uaDate <= endOfDay;
    });
  }

  async createUserAvailability(data: InsertUserAvailability): Promise<UserAvailability> {
    const id = generateId();
    const newUserAvailability: UserAvailability = {
      id,
      teamId: data.teamId,
      userId: data.userId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.userAvailabilityMap.set(id, newUserAvailability);
    return newUserAvailability;
  }

  async updateUserAvailability(id: string, data: Partial<InsertUserAvailability>): Promise<UserAvailability> {
    const existing = this.userAvailabilityMap.get(id);
    if (!existing) throw new Error("User availability not found");
    const updated: UserAvailability = { ...existing, ...data, updatedAt: new Date() };
    this.userAvailabilityMap.set(id, updated);
    return updated;
  }

  async deleteUserAvailability(id: string): Promise<void> {
    this.userAvailabilityMap.delete(id);
  }

  // Session Overrides (PRD-010A)
  async getSessionOverrides(teamId: string): Promise<SessionOverride[]> {
    return Array.from(this.sessionOverridesMap.values())
      .filter(so => so.teamId === teamId)
      .sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey));
  }

  async getSessionOverride(teamId: string, occurrenceKey: string): Promise<SessionOverride | undefined> {
    return Array.from(this.sessionOverridesMap.values()).find(
      so => so.teamId === teamId && so.occurrenceKey === occurrenceKey
    );
  }

  async upsertSessionOverride(data: InsertSessionOverride): Promise<SessionOverride> {
    const status = validateSessionStatus(data.status);
    const existing = await this.getSessionOverride(data.teamId, data.occurrenceKey);

    if (existing) {
      const updated: SessionOverride = {
        ...existing,
        status,
        scheduledAtOverride: data.scheduledAtOverride ?? null,
        updatedBy: data.updatedBy,
        updatedAt: new Date(),
      };
      this.sessionOverridesMap.set(existing.id, updated);
      return updated;
    }

    const id = generateId();
    const newOverride: SessionOverride = {
      id,
      teamId: data.teamId,
      occurrenceKey: data.occurrenceKey,
      status,
      scheduledAtOverride: data.scheduledAtOverride ?? null,
      updatedBy: data.updatedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessionOverridesMap.set(id, newOverride);
    return newOverride;
  }

  async deleteSessionOverride(id: string): Promise<void> {
    this.sessionOverridesMap.delete(id);
  }

  // Import Runs (PRD-015A)
  async getImportRuns(teamId: string): Promise<ImportRun[]> {
    return Array.from(this.importRunsMap.values())
      .filter(r => r.teamId === teamId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getImportRun(id: string): Promise<ImportRun | undefined> {
    return this.importRunsMap.get(id);
  }

  async createImportRun(importRun: InsertImportRun): Promise<ImportRun> {
    const id = generateId();
    const status = validateImportRunStatus(importRun.status);
    const newRun: ImportRun = {
      id,
      teamId: importRun.teamId,
      sourceSystem: importRun.sourceSystem,
      createdByUserId: importRun.createdByUserId,
      status,
      options: importRun.options as ImportRunOptions ?? null,
      stats: importRun.stats as ImportRunStats ?? null,
      createdAt: new Date(),
    };
    this.importRunsMap.set(id, newRun);
    return newRun;
  }

  async updateImportRun(id: string, data: Partial<InsertImportRun>): Promise<ImportRun> {
    const run = this.importRunsMap.get(id);
    if (!run) throw new Error("Import run not found");
    const updated: ImportRun = { ...run, ...data } as ImportRun;
    this.importRunsMap.set(id, updated);
    return updated;
  }

  async updateImportRunStatus(id: string, status: ImportRunStatus): Promise<ImportRun> {
    const run = this.importRunsMap.get(id);
    if (!run) throw new Error("Import run not found");
    const updated = { ...run, status };
    this.importRunsMap.set(id, updated);
    return updated;
  }

  // Notes by import run (PRD-015A)
  async getNotesByImportRun(importRunId: string): Promise<Note[]> {
    return Array.from(this.notes.values())
      .filter(n => n.importRunId === importRunId);
  }

  async deleteNotesByImportRun(importRunId: string): Promise<number> {
    const notesToDelete = await this.getNotesByImportRun(importRunId);
    for (const note of notesToDelete) {
      await this.deleteNote(note.id);
    }
    return notesToDelete.length;
  }

  // Note Import Snapshots (PRD-015A FR-6)
  async createNoteImportSnapshot(snapshot: InsertNoteImportSnapshot): Promise<NoteImportSnapshot> {
    const id = generateId();
    const newSnapshot: NoteImportSnapshot = {
      id,
      noteId: snapshot.noteId,
      importRunId: snapshot.importRunId,
      previousTitle: snapshot.previousTitle,
      previousContent: snapshot.previousContent ?? null,
      previousNoteType: snapshot.previousNoteType as NoteType,
      previousQuestStatus: snapshot.previousQuestStatus as QuestStatus ?? null,
      previousContentMarkdown: snapshot.previousContentMarkdown ?? null,
      previousContentMarkdownResolved: snapshot.previousContentMarkdownResolved ?? null,
      previousIsPrivate: snapshot.previousIsPrivate ?? null,
      createdAt: new Date(),
    };
    this.noteImportSnapshotsMap.set(id, newSnapshot);
    return newSnapshot;
  }

  async getSnapshotsByImportRun(importRunId: string): Promise<NoteImportSnapshot[]> {
    return Array.from(this.noteImportSnapshotsMap.values())
      .filter(s => s.importRunId === importRunId);
  }

  async restoreNoteFromSnapshot(snapshotId: string): Promise<Note> {
    const snapshot = this.noteImportSnapshotsMap.get(snapshotId);
    if (!snapshot) throw new Error("Snapshot not found");

    return await this.updateNote(snapshot.noteId, {
      title: snapshot.previousTitle,
      content: snapshot.previousContent,
      noteType: snapshot.previousNoteType,
      questStatus: snapshot.previousQuestStatus,
      contentMarkdown: snapshot.previousContentMarkdown,
      contentMarkdownResolved: snapshot.previousContentMarkdownResolved,
      isPrivate: snapshot.previousIsPrivate,
      importRunId: null,
    });
  }

  async deleteSnapshotsByImportRun(importRunId: string): Promise<void> {
    for (const [id, snapshot] of Array.from(this.noteImportSnapshotsMap.entries())) {
      if (snapshot.importRunId === importRunId) {
        this.noteImportSnapshotsMap.delete(id);
      }
    }
  }

  // PRD-016: Enrichment Runs
  async createEnrichmentRun(run: InsertEnrichmentRun): Promise<EnrichmentRun> {
    const id = generateId();
    const status = validateEnrichmentStatus(run.status);
    const newRun: EnrichmentRun = {
      id,
      importRunId: run.importRunId,
      teamId: run.teamId,
      createdByUserId: run.createdByUserId,
      status,
      totals: run.totals as EnrichmentRunTotals ?? null,
      errorMessage: run.errorMessage ?? null,
      startedAt: run.startedAt ?? null,
      completedAt: run.completedAt ?? null,
      createdAt: new Date(),
    };
    this.enrichmentRunsMap.set(id, newRun);
    return newRun;
  }

  async getEnrichmentRun(id: string): Promise<EnrichmentRun | undefined> {
    return this.enrichmentRunsMap.get(id);
  }

  async getEnrichmentRunByImportId(importRunId: string): Promise<EnrichmentRun | undefined> {
    return Array.from(this.enrichmentRunsMap.values())
      .filter(r => r.importRunId === importRunId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];
  }

  async updateEnrichmentRun(id: string, data: Partial<InsertEnrichmentRun>): Promise<EnrichmentRun> {
    const run = this.enrichmentRunsMap.get(id);
    if (!run) throw new Error("Enrichment run not found");
    const updated: EnrichmentRun = { ...run, ...data } as EnrichmentRun;
    this.enrichmentRunsMap.set(id, updated);
    return updated;
  }

  async updateEnrichmentRunStatus(id: string, status: EnrichmentStatus): Promise<EnrichmentRun> {
    const run = this.enrichmentRunsMap.get(id);
    if (!run) throw new Error("Enrichment run not found");
    const updates: Partial<EnrichmentRun> = { status };
    if (status === "running") {
      updates.startedAt = new Date();
    } else if (status === "completed" || status === "failed") {
      updates.completedAt = new Date();
    }
    const updated = { ...run, ...updates };
    this.enrichmentRunsMap.set(id, updated);
    return updated;
  }

  // PRD-016: Note Classifications
  async createNoteClassification(classification: InsertNoteClassification): Promise<NoteClassification> {
    const id = generateId();
    const status = validateClassificationStatus(classification.status);
    const inferredType = validateInferredEntityType(classification.inferredType);
    const newClassification: NoteClassification = {
      id,
      noteId: classification.noteId,
      enrichmentRunId: classification.enrichmentRunId,
      inferredType,
      confidence: classification.confidence,
      explanation: classification.explanation ?? null,
      extractedEntities: classification.extractedEntities as string[] ?? null,
      status,
      approvedByUserId: classification.approvedByUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.noteClassificationsMap.set(id, newClassification);
    return newClassification;
  }

  async getNoteClassificationsByEnrichmentRun(enrichmentRunId: string): Promise<NoteClassification[]> {
    return Array.from(this.noteClassificationsMap.values())
      .filter(c => c.enrichmentRunId === enrichmentRunId)
      .sort((a, b) => b.confidence - a.confidence);
  }

  async getNoteClassification(noteId: string): Promise<NoteClassification | undefined> {
    return Array.from(this.noteClassificationsMap.values())
      .filter(c => c.noteId === noteId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];
  }

  async updateNoteClassificationStatus(id: string, status: ClassificationStatus, userId: string): Promise<NoteClassification> {
    const classification = this.noteClassificationsMap.get(id);
    if (!classification) throw new Error("Classification not found");
    const updated: NoteClassification = {
      ...classification,
      status,
      approvedByUserId: status === "approved" ? userId : null,
      updatedAt: new Date(),
    };
    this.noteClassificationsMap.set(id, updated);
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
    for (const [id, classification] of Array.from(this.noteClassificationsMap.entries())) {
      if (classification.enrichmentRunId === enrichmentRunId) {
        this.noteClassificationsMap.delete(id);
      }
    }
  }

  // PRD-016: Note Relationships
  async createNoteRelationship(relationship: InsertNoteRelationship): Promise<NoteRelationship> {
    const id = generateId();
    const status = validateClassificationStatus(relationship.status);
    const relationshipType = validateRelationshipType(relationship.relationshipType);
    const evidenceType = validateEvidenceType(relationship.evidenceType);
    const newRelationship: NoteRelationship = {
      id,
      enrichmentRunId: relationship.enrichmentRunId,
      fromNoteId: relationship.fromNoteId,
      toNoteId: relationship.toNoteId,
      relationshipType,
      confidence: relationship.confidence,
      evidenceSnippet: relationship.evidenceSnippet ?? null,
      evidenceType,
      status,
      approvedByUserId: relationship.approvedByUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.noteRelationshipsMap.set(id, newRelationship);
    return newRelationship;
  }

  async getNoteRelationshipsByEnrichmentRun(enrichmentRunId: string): Promise<NoteRelationship[]> {
    return Array.from(this.noteRelationshipsMap.values())
      .filter(r => r.enrichmentRunId === enrichmentRunId)
      .sort((a, b) => b.confidence - a.confidence);
  }

  async getRelationshipsForNote(noteId: string): Promise<NoteRelationship[]> {
    return Array.from(this.noteRelationshipsMap.values())
      .filter(r => r.fromNoteId === noteId || r.toNoteId === noteId);
  }

  async updateNoteRelationshipStatus(id: string, status: ClassificationStatus, userId: string): Promise<NoteRelationship> {
    const relationship = this.noteRelationshipsMap.get(id);
    if (!relationship) throw new Error("Relationship not found");
    const updated: NoteRelationship = {
      ...relationship,
      status,
      approvedByUserId: status === "approved" ? userId : null,
      updatedAt: new Date(),
    };
    this.noteRelationshipsMap.set(id, updated);
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
    for (const [id, relationship] of Array.from(this.noteRelationshipsMap.entries())) {
      if (relationship.enrichmentRunId === enrichmentRunId) {
        this.noteRelationshipsMap.delete(id);
      }
    }
  }

  // PRD-037: Get pending low-confidence classifications for review
  async getPendingLowConfidenceClassifications(teamId: string): Promise<NeedsReviewItem[]> {
    const CONFIDENCE_THRESHOLD = 0.65;
    const results: NeedsReviewItem[] = [];

    for (const classification of Array.from(this.noteClassificationsMap.values())) {
      if (classification.status !== "pending" || classification.confidence >= CONFIDENCE_THRESHOLD) {
        continue;
      }
      const note = this.notes.get(classification.noteId);
      if (!note || note.teamId !== teamId) {
        continue;
      }
      results.push({
        classificationId: classification.id,
        noteId: classification.noteId,
        noteTitle: note.title,
        inferredType: classification.inferredType,
        confidence: classification.confidence,
        explanation: classification.explanation,
      });
    }

    // Sort by confidence ascending (lowest first)
    return results.sort((a, b) => a.confidence - b.confidence);
  }

  // PRD-043: AI Cache methods
  async getAICacheEntry(
    cacheType: string,
    contentHash: string,
    algorithmVersion: string,
    contextHash?: string,
    teamId?: string
  ): Promise<AICacheEntry | null> {
    for (const entry of Array.from(this.aiCacheEntriesMap.values())) {
      if (
        entry.cacheType === cacheType &&
        entry.contentHash === contentHash &&
        entry.algorithmVersion === algorithmVersion &&
        (contextHash === undefined || entry.contextHash === contextHash) &&
        (teamId === undefined || entry.teamId === teamId)
      ) {
        return entry;
      }
    }
    return null;
  }

  async setAICacheEntry(entry: InsertAICacheEntry): Promise<AICacheEntry> {
    // Check for existing entry with same key
    const existing = await this.getAICacheEntry(
      entry.cacheType,
      entry.contentHash,
      entry.algorithmVersion,
      entry.contextHash ?? undefined,
      entry.teamId
    );

    if (existing) {
      const updated: AICacheEntry = {
        ...existing,
        result: entry.result,
        modelId: entry.modelId,
        tokensSaved: entry.tokensSaved ?? null,
        expiresAt: entry.expiresAt ?? null,
      };
      this.aiCacheEntriesMap.set(existing.id, updated);
      return updated;
    }

    const id = generateId();
    const newEntry: AICacheEntry = {
      id,
      cacheType: entry.cacheType as AICacheType,
      contentHash: entry.contentHash,
      algorithmVersion: entry.algorithmVersion,
      contextHash: entry.contextHash ?? null,
      teamId: entry.teamId,
      result: entry.result,
      modelId: entry.modelId,
      tokensSaved: entry.tokensSaved ?? null,
      hitCount: 0,
      createdAt: new Date(),
      lastHitAt: null,
      expiresAt: entry.expiresAt ?? null,
    };
    this.aiCacheEntriesMap.set(id, newEntry);
    return newEntry;
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

    return Array.from(this.aiCacheEntriesMap.values()).filter(entry =>
      entry.cacheType === cacheType &&
      contentHashes.includes(entry.contentHash) &&
      entry.algorithmVersion === algorithmVersion &&
      (contextHash === undefined || entry.contextHash === contextHash) &&
      (teamId === undefined || entry.teamId === teamId)
    );
  }

  async incrementAICacheHitCount(id: string): Promise<void> {
    const entry = this.aiCacheEntriesMap.get(id);
    if (entry) {
      const updated = {
        ...entry,
        hitCount: (entry.hitCount || 0) + 1,
        lastHitAt: new Date(),
      };
      this.aiCacheEntriesMap.set(id, updated);
    }
  }

  async deleteAICacheByVersion(operationType: string, version: string): Promise<number> {
    let count = 0;
    for (const [id, entry] of Array.from(this.aiCacheEntriesMap.entries())) {
      if (entry.cacheType === operationType && entry.algorithmVersion === version) {
        this.aiCacheEntriesMap.delete(id);
        count++;
      }
    }
    return count;
  }

  async deleteAICacheByTeam(teamId: string): Promise<number> {
    let count = 0;
    for (const [id, entry] of Array.from(this.aiCacheEntriesMap.entries())) {
      if (entry.teamId === teamId) {
        this.aiCacheEntriesMap.delete(id);
        count++;
      }
    }
    return count;
  }

  async deleteExpiredAICacheEntries(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [id, entry] of Array.from(this.aiCacheEntriesMap.entries())) {
      if (entry.expiresAt && new Date(entry.expiresAt) < now) {
        this.aiCacheEntriesMap.delete(id);
        count++;
      }
    }
    return count;
  }

  async getAICacheStats(): Promise<AICacheStats> {
    const allEntries = Array.from(this.aiCacheEntriesMap.values());

    const classificationCount = allEntries.filter(e => e.cacheType === "classification").length;
    const relationshipCount = allEntries.filter(e => e.cacheType === "relationship").length;
    const totalHits = allEntries.reduce((sum, e) => sum + (e.hitCount || 0), 0);

    const sortedByCreated = [...allEntries].sort(
      (a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
    );
    const oldestEntry = sortedByCreated[0]?.createdAt || null;
    const newestEntry = sortedByCreated[sortedByCreated.length - 1]?.createdAt || null;

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

  clear(): void {
    this.users.clear();
    this.teams.clear();
    this.teamMembers.clear();
    this.invites.clear();
    this.notes.clear();
    this.sessions.clear();
    this.availabilityMap.clear();
    this.diceRolls.clear();
    this.backlinks.clear();
    this.userAvailabilityMap.clear();
    this.sessionOverridesMap.clear();
    this.importRunsMap.clear();
    this.noteImportSnapshotsMap.clear();
    // PRD-016: AI Enrichment
    this.enrichmentRunsMap.clear();
    this.noteClassificationsMap.clear();
    this.noteRelationshipsMap.clear();
    // PRD-043: AI Cache
    this.aiCacheEntriesMap.clear();
  }
}
