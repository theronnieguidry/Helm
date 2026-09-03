import type { Express, RequestHandler } from "express";
import type { IStorage } from "../storage";
import {
  TEAM_TYPE_DICE_MODE,
  SESSION_STATUSES,
  RELATIONSHIP_TYPES,
  EVIDENCE_TYPES,
  type TeamType,
  type AvailabilityStatus,
  type SessionStatus,
  type NoteType,
  type RelationshipType,
  type EvidenceType,
} from "@shared/schema";
import { generateSessionCandidates } from "@shared/recurrence";
import { buildCleanupSuggestions, type CleanupSuggestionMode } from "@shared/cleanup-suggestions";
import { canonicalizeSourceBlockId } from "@shared/text-hash";
import { canViewNote, filterVisibleNotes } from "../note-visibility";
import {
  makeListNotesHandler,
  makeTodaySessionHandler,
  makeNeedsReviewHandler,
  makeCreateNoteHandler,
  makeUpdateNoteHandler,
  makeDeleteNoteHandler,
} from "../notes-handlers";
import {
  makeGetSessionsHandler,
  makeCreateSessionHandler,
  makeUpdateSessionStatusHandler,
  makeGetLegacyAvailabilityHandler,
  makeUpsertLegacyAvailabilityHandler,
  makeGetUserAvailabilityHandler,
  makeCreateUserAvailabilityHandler,
  makeUpdateUserAvailabilityHandler,
  makeDeleteUserAvailabilityHandler,
  makeSessionCandidatesHandler,
  makeUpsertSessionOverrideHandler,
  makeGetSessionOverridesHandler,
  makeDeleteSessionOverrideHandler,
} from "../scheduling-handlers";
import {
  makePushPublicKeyHandler,
  makeSavePushSubscriptionHandler,
  makeDeletePushSubscriptionHandler,
  makeListNotificationsHandler,
  makeMarkNotificationsReadHandler,
  makeUpdateNotificationPrefsHandler,
} from "../notification-handlers";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function rollDice(sides: number, count: number): number[] {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides) + 1);
  }
  return results;
}

const RELATIONSHIP_TYPE_SET = new Set<RelationshipType>(RELATIONSHIP_TYPES);
const EVIDENCE_TYPE_SET = new Set<EvidenceType>(EVIDENCE_TYPES);

function getSessionContent(note: { content?: string | null; contentBlocks?: Array<{ content: string }> | null }): string {
  if (note.content && note.content.trim().length > 0) {
    return note.content;
  }
  if (Array.isArray(note.contentBlocks) && note.contentBlocks.length > 0) {
    return note.contentBlocks.map((b) => b.content || "").join("\n\n").trim();
  }
  return "";
}

function toSnippetPreview(snippet: string | null | undefined, fallback: string = "Referenced in a private note"): string {
  const trimmed = (snippet || "").trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseIncludeLow(raw: unknown): boolean {
  const normalized = String(raw ?? "0").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseSuggestionMode(raw: unknown): CleanupSuggestionMode {
  const normalized = String(raw ?? "baseline").trim().toLowerCase();
  return normalized === "ai" ? "ai" : "baseline";
}

export async function registerTestRoutes(
  app: Express,
  storage: IStorage,
  isAuthenticated: RequestHandler
): Promise<void> {
  app.get("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teams = await storage.getTeams(userId);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.post("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, teamType, diceMode, recurrenceFrequency, dayOfWeek, daysOfMonth, startTime, timezone } = req.body;

      const team = await storage.createTeam({
        name,
        teamType,
        diceMode: diceMode || TEAM_TYPE_DICE_MODE[teamType as TeamType],
        ownerId: userId,
        recurrenceFrequency,
        dayOfWeek,
        daysOfMonth,
        startTime,
        timezone,
      });

      await storage.createTeamMember({
        teamId: team.id,
        userId,
        role: "dm",
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const invite = await storage.createInvite({
        teamId: team.id,
        code: generateInviteCode(),
        expiresAt,
      });

      res.json({ ...team, invite });
    } catch (error) {
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  app.get("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const member = await storage.getTeamMember(id, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  app.patch("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const member = await storage.getTeamMember(id, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Only admin can update team" });
      }

      // Audit S7: same allow-list as production
      const body = req.body ?? {};
      const updateData: Record<string, unknown> = {};
      for (const field of [
        "name", "teamType", "diceMode", "recurrenceFrequency", "dayOfWeek",
        "daysOfMonth", "startTime", "timezone", "minAttendanceThreshold",
        "defaultSessionDurationMinutes",
      ]) {
        if (field in body) updateData[field] = body[field];
      }
      if ("recurrenceAnchorDate" in body) {
        updateData.recurrenceAnchorDate = body.recurrenceAnchorDate
          ? new Date(body.recurrenceAnchorDate)
          : null;
      }

      const team = await storage.updateTeam(id, updateData);
      res.json(team);
    } catch (error) {
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  app.delete("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const team = await storage.getTeam(id);
      if (!team || team.ownerId !== userId) {
        return res.status(403).json({ message: "Only owner can delete team" });
      }

      await storage.deleteTeam(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  app.get("/api/teams/:teamId/members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const members = await storage.getTeamMembers(teamId);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.delete("/api/teams/:teamId/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, memberId } = req.params;

      const requestingMember = await storage.getTeamMember(teamId, userId);
      if (!requestingMember || requestingMember.role !== "dm") {
        return res.status(403).json({ message: "Only admin can remove members" });
      }

      await storage.deleteTeamMember(memberId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  app.get("/api/teams/:teamId/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const invites = await storage.getInvites(teamId);
      res.json(invites);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  app.post("/api/teams/:teamId/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Only admin can create invites" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const invite = await storage.createInvite({
        teamId,
        code: generateInviteCode(),
        expiresAt,
      });
      res.json(invite);
    } catch (error) {
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  app.post("/api/invites/:code/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { code } = req.params;

      const invite = await storage.getInviteByCode(code);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }

      if (invite.expiresAt < new Date()) {
        return res.status(400).json({ message: "Invite has expired" });
      }

      const existingMember = await storage.getTeamMember(invite.teamId, userId);
      if (existingMember) {
        return res.status(400).json({ message: "Already a member" });
      }

      const member = await storage.createTeamMember({
        teamId: invite.teamId,
        userId,
        role: "member",
      });

      const team = await storage.getTeam(invite.teamId);
      res.json({ team, member });
    } catch (error) {
      res.status(500).json({ message: "Failed to join team" });
    }
  });

  app.get("/api/teams/:teamId/notes", isAuthenticated, makeListNotesHandler(storage));

  // PRD-019: Get today's session note
  app.get("/api/teams/:teamId/notes/today-session", isAuthenticated, makeTodaySessionHandler(storage));

  // PRD-037: Get notes needing review (low-confidence AI classifications)
  app.get("/api/teams/:teamId/notes/needs-review", isAuthenticated, makeNeedsReviewHandler(storage));

  // PRD-037/PRD-038: Approve/reject/reclassify a low-confidence classification
  // (mirrors production route in server/routes.ts, including the P0-1/F81 privacy guard)
  app.patch("/api/teams/:teamId/classifications/:classificationId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, classificationId } = req.params;
      const { status, overrideType } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const validTypes = ["Character", "NPC", "Area", "POI", "Quest", "SessionLog", "Note"];
      if (overrideType && !validTypes.includes(overrideType)) {
        return res.status(400).json({ message: "Invalid override type" });
      }

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // Get classification to verify team ownership (via this team's enrichment runs)
      const allEnrichmentRuns = await Promise.all(
        (await storage.getImportRuns(teamId)).map((ir) =>
          storage.getEnrichmentRunByImportId(ir.id)
        )
      );

      type StoredClassification = Awaited<ReturnType<typeof storage.getNoteClassificationsByEnrichmentRun>>[number];
      let classification: StoredClassification | undefined;
      for (const er of allEnrichmentRuns) {
        if (!er) continue;
        const erClassifications = await storage.getNoteClassificationsByEnrichmentRun(er.id);
        const match = erClassifications.find((c) => c.id === classificationId);
        if (match) {
          classification = match;
          break;
        }
      }

      if (!classification) {
        return res.status(404).json({ message: "Classification not found" });
      }

      // P0-1 (F81): members must not approve/reject/reclassify classifications
      // belonging to another author's private note. 404 to avoid confirming existence.
      const classifiedNote = await storage.getNote(classification.noteId);
      if (!classifiedNote || classifiedNote.teamId !== teamId || !canViewNote(classifiedNote, userId, member.role)) {
        return res.status(404).json({ message: "Classification not found" });
      }

      const updated = await storage.updateNoteClassificationStatus(classificationId, status, userId);

      // If approved, update the note's type (PRD-038: overrideType wins)
      if (status === "approved") {
        const noteTypeMap: Record<string, string> = {
          Character: "character",
          NPC: "npc",
          Area: "area",
          POI: "poi",
          Quest: "quest",
          SessionLog: "session_log",
          Note: "note",
        };
        const typeToUse = overrideType || updated.inferredType;
        const newNoteType = noteTypeMap[typeToUse] || "note";
        await storage.updateNote(updated.noteId, { noteType: newNoteType as NoteType });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update classification" });
    }
  });

  app.get("/api/teams/:teamId/notes/:noteId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const note = await storage.getNote(noteId);
      if (!note || note.teamId !== teamId) {
        return res.status(404).json({ message: "Note not found" });
      }

      if (!canViewNote(note, userId, member.role)) {
        return res.status(404).json({ message: "Note not found" });
      }

      const [referencesIn, referencesOut, relationships] = await Promise.all([
        storage.getBacklinks(noteId),
        storage.getOutgoingLinks(noteId),
        storage.getRelationshipsForNote(noteId),
      ]);

      const relatedNoteIds = new Set<string>();
      for (const ref of referencesIn) relatedNoteIds.add(ref.sourceNoteId);
      for (const ref of referencesOut) relatedNoteIds.add(ref.targetNoteId);
      for (const rel of relationships) {
        relatedNoteIds.add(rel.fromNoteId);
        relatedNoteIds.add(rel.toNoteId);
        if (rel.sourceNoteId) relatedNoteIds.add(rel.sourceNoteId);
      }

      const relatedNotes = await Promise.all(Array.from(relatedNoteIds).map((id) => storage.getNote(id)));
      const relatedById = new Map<string, NonNullable<Awaited<ReturnType<typeof storage.getNote>>>>();
      for (const related of relatedNotes) {
        if (related) {
          relatedById.set(related.id, related);
        }
      }

      // PRD-048 FR-1b: include author names for reference entries
      const teamMembersWithUsers = await storage.getTeamMembers(teamId);
      const memberNameByUserId = new Map<string, string>();
      for (const teamMember of teamMembersWithUsers) {
        const name = [teamMember.user?.firstName, teamMember.user?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        memberNameByUserId.set(teamMember.userId, name || teamMember.user?.email || "Unknown");
      }

      const normalizedReferencesIn = referencesIn
        .map((reference) => {
          const sourceNote = relatedById.get(reference.sourceNoteId);
          const sourceVisible = sourceNote ? canViewNote(sourceNote, userId, member.role) : false;
          return {
            ...reference,
            sourceNoteTitle: sourceVisible ? sourceNote?.title ?? null : null,
            sourceNoteType: sourceVisible ? sourceNote?.noteType ?? null : null,
            sourceNoteIsPrivate: sourceNote?.isPrivate ?? false,
            sourceNoteSessionDate: sourceVisible ? sourceNote?.sessionDate ?? null : null,
            createdByName: reference.createdByUserId
              ? memberNameByUserId.get(reference.createdByUserId) ?? null
              : null,
            textSnippet: sourceVisible ? reference.textSnippet : "Referenced in a private note",
            snippetPreview: sourceVisible
              ? toSnippetPreview(reference.textSnippet, "")
              : "Referenced in a private note",
          };
        })
        // PRD-048 FR-2: order by most recent session date, then creation time
        .sort((a, b) => {
          const aDate = a.sourceNoteSessionDate ?? a.createdAt;
          const bDate = b.sourceNoteSessionDate ?? b.createdAt;
          return new Date(bDate ?? 0).getTime() - new Date(aDate ?? 0).getTime();
        });

      const normalizedReferencesOut = referencesOut.map((reference) => {
        const targetNote = relatedById.get(reference.targetNoteId);
        const targetVisible = targetNote ? canViewNote(targetNote, userId, member.role) : false;
        return {
          ...reference,
          targetNoteTitle: targetVisible ? targetNote?.title ?? null : null,
          targetNoteType: targetVisible ? targetNote?.noteType ?? null : null,
          targetNoteIsPrivate: targetNote?.isPrivate ?? false,
        };
      });

      const normalizedRelationships = relationships.map((relationship) => {
        const fromNote = relatedById.get(relationship.fromNoteId);
        const toNote = relatedById.get(relationship.toNoteId);
        const sourceNote = relationship.sourceNoteId ? relatedById.get(relationship.sourceNoteId) : undefined;
        const sourceVisible = sourceNote ? canViewNote(sourceNote, userId, member.role) : true;
        const fromVisible = fromNote ? canViewNote(fromNote, userId, member.role) : false;
        const toVisible = toNote ? canViewNote(toNote, userId, member.role) : false;
        return {
          ...relationship,
          evidenceSnippet: sourceVisible ? relationship.evidenceSnippet : "Referenced in a private note",
          fromNote: fromVisible
            ? { id: fromNote?.id, title: fromNote?.title, noteType: fromNote?.noteType }
            : { id: relationship.fromNoteId, title: null, noteType: null, hidden: true },
          toNote: toVisible
            ? { id: toNote?.id, title: toNote?.title, noteType: toNote?.noteType }
            : { id: relationship.toNoteId, title: null, noteType: null, hidden: true },
        };
      });

      res.json({
        ...note,
        referencesIn: normalizedReferencesIn,
        referencesOut: normalizedReferencesOut,
        relationships: normalizedRelationships,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch note detail" });
    }
  });

  app.get("/api/teams/:teamId/session-logs/:noteId/cleanup-suggestions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;
      const mode = parseSuggestionMode(req.query.mode);
      const includeLow = parseIncludeLow(req.query.includeLow);

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const sessionNote = await storage.getNote(noteId);
      if (!sessionNote || sessionNote.teamId !== teamId || sessionNote.noteType !== "session_log") {
        return res.status(404).json({ message: "Session log not found" });
      }

      if (!canViewNote(sessionNote, userId, member.role)) {
        return res.status(404).json({ message: "Session log not found" });
      }

      const allNotes = await storage.getNotes(teamId);
      const visibleNotes = allNotes.filter((candidate) => canViewNote(candidate, userId, member.role));
      const suggestions = buildCleanupSuggestions({
        content: getSessionContent(sessionNote),
        existingNotes: visibleNotes,
        includeLow,
        mode,
      });

      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: "Failed to compute cleanup suggestions" });
    }
  });

  app.post("/api/teams/:teamId/session-logs/:noteId/cleanup-suggestions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;
      const mode = parseSuggestionMode(req.body?.mode);
      const includeLow = parseIncludeLow(req.body?.includeLow);

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const sessionNote = await storage.getNote(noteId);
      if (!sessionNote || sessionNote.teamId !== teamId || sessionNote.noteType !== "session_log") {
        return res.status(404).json({ message: "Session log not found" });
      }

      if (!canViewNote(sessionNote, userId, member.role)) {
        return res.status(404).json({ message: "Session log not found" });
      }

      const allNotes = await storage.getNotes(teamId);
      const visibleNotes = allNotes.filter((candidate) => canViewNote(candidate, userId, member.role));
      const requestContent = typeof req.body?.content === "string" ? req.body.content : undefined;
      const suggestions = buildCleanupSuggestions({
        content: requestContent ?? getSessionContent(sessionNote),
        existingNotes: visibleNotes,
        includeLow,
        mode,
      });

      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: "Failed to compute cleanup suggestions" });
    }
  });

  app.post("/api/teams/:teamId/notes", isAuthenticated, makeCreateNoteHandler(storage));

  app.patch("/api/teams/:teamId/notes/:noteId", isAuthenticated, makeUpdateNoteHandler(storage));

  app.delete("/api/teams/:teamId/notes/:noteId", isAuthenticated, makeDeleteNoteHandler(storage));

  // Scheduling routes: shared handlers registered by BOTH routers (audit S8)
  app.get("/api/teams/:teamId/sessions", isAuthenticated, makeGetSessionsHandler(storage));
  app.post("/api/teams/:teamId/sessions", isAuthenticated, makeCreateSessionHandler(storage));
  app.patch("/api/teams/:teamId/sessions/:sessionId", isAuthenticated, makeUpdateSessionStatusHandler(storage));
  app.get("/api/teams/:teamId/availability", isAuthenticated, makeGetLegacyAvailabilityHandler(storage));
  app.post("/api/teams/:teamId/sessions/:sessionId/availability", isAuthenticated, makeUpsertLegacyAvailabilityHandler(storage));

  app.get("/api/teams/:teamId/dice-rolls", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const rolls = await storage.getDiceRolls(teamId);
      res.json(rolls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dice rolls" });
    }
  });

  app.post("/api/teams/:teamId/dice-rolls", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { diceType, count, modifier, isShared } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      let sides: number;
      if (diceType === "d10_pool") {
        sides = 10;
      } else {
        const match = diceType.match(/d(\d+)/);
        sides = match ? parseInt(match[1]) : 20;
      }

      const results = rollDice(sides, count || 1);
      const total = results.reduce((a, b) => a + b, 0) + (modifier || 0);

      const roll = await storage.createDiceRoll({
        teamId,
        userId,
        diceType,
        count: count || 1,
        modifier: modifier || 0,
        results,
        total,
        isShared: isShared || false,
      });

      res.json(roll);
    } catch (error) {
      res.status(500).json({ message: "Failed to create dice roll" });
    }
  });

  app.patch("/api/user/timezone", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { timezone } = req.body;

      if (!timezone || typeof timezone !== "string") {
        return res.status(400).json({ message: "Timezone is required" });
      }

      const updatedUser = await storage.updateUserTimezone(userId, timezone);
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update timezone" });
    }
  });

  app.patch("/api/teams/:teamId/members/:memberId/character", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, memberId } = req.params;
      const { characterName, characterType1, characterType2, characterDescription } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const targetMember = Array.from(await storage.getTeamMembers(teamId)).find(m => m.id === memberId);
      if (!targetMember) {
        return res.status(404).json({ message: "Member not found" });
      }

      if (targetMember.userId !== userId && member.role !== "dm") {
        return res.status(403).json({ message: "Can only update your own character" });
      }

      const updated = await storage.updateTeamMember(memberId, {
        characterName,
        characterType1,
        characterType2,
        characterDescription,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update character" });
    }
  });

  // Backlinks API (PRD-005)
  app.get("/api/teams/:teamId/notes/:noteId/backlinks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const note = await storage.getNote(noteId);
      if (!note || note.teamId !== teamId) {
        return res.status(404).json({ message: "Note not found" });
      }

      const backlinks = await storage.getBacklinks(noteId);
      const sourceNotes = await Promise.all(
        backlinks.map(async (backlink) => storage.getNote(backlink.sourceNoteId)),
      );
      const sourceById = new Map<string, NonNullable<Awaited<ReturnType<typeof storage.getNote>>>>();
      for (const source of sourceNotes) {
        if (source) {
          sourceById.set(source.id, source);
        }
      }

      const normalized = backlinks.map((backlink) => {
        const sourceNote = sourceById.get(backlink.sourceNoteId);
        const sourceVisible = sourceNote ? canViewNote(sourceNote, userId, member.role) : false;
        return {
          ...backlink,
          textSnippet: sourceVisible ? backlink.textSnippet : "Referenced in a private note",
          snippetPreview: sourceVisible
            ? toSnippetPreview(backlink.textSnippet, "")
            : "Referenced in a private note",
        };
      });

      res.json(normalized);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch backlinks" });
    }
  });

  app.post("/api/teams/:teamId/notes/:noteId/backlinks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;
      const {
        sourceNoteId,
        sourceBlockId,
        textSnippet,
        startOffset,
        endOffset,
        evidenceType,
        confidence,
      } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      if (!sourceNoteId || typeof sourceNoteId !== "string") {
        return res.status(400).json({ message: "sourceNoteId is required" });
      }

      const parsedStartOffset = typeof startOffset === "number" ? startOffset : null;
      const parsedEndOffset = typeof endOffset === "number" ? endOffset : null;
      const normalizedSnippet = typeof textSnippet === "string" ? textSnippet.slice(0, 500) : "";

      if (!sourceBlockId && !normalizedSnippet && parsedStartOffset === null && parsedEndOffset === null) {
        return res.status(400).json({
          message: "sourceBlockId or snippet evidence (textSnippet/startOffset/endOffset) is required",
        });
      }

      const normalizedEvidenceType = (evidenceType ?? "Mention") as EvidenceType;
      if (!EVIDENCE_TYPE_SET.has(normalizedEvidenceType)) {
        return res.status(400).json({ message: "Invalid evidenceType" });
      }

      const normalizedConfidence = typeof confidence === "number" ? confidence : 0.8;
      if (normalizedConfidence < 0 || normalizedConfidence > 1) {
        return res.status(400).json({ message: "confidence must be between 0 and 1" });
      }

      // Verify target note exists and belongs to team
      const targetNote = await storage.getNote(noteId);
      if (!targetNote || targetNote.teamId !== teamId) {
        return res.status(404).json({ message: "Target note not found" });
      }

      // Verify source note exists and belongs to team
      const sourceNote = await storage.getNote(sourceNoteId);
      if (!sourceNote || sourceNote.teamId !== teamId) {
        return res.status(400).json({ message: "Source note not found" });
      }

      const normalizedSourceBlockId = canonicalizeSourceBlockId(
        sourceBlockId,
        normalizedSnippet,
        parsedStartOffset,
        parsedEndOffset,
      );

      const existingBacklinks = await storage.getBacklinks(noteId);
      const existing = existingBacklinks.find(
        (backlink) =>
          backlink.sourceNoteId === sourceNoteId &&
          (backlink.sourceBlockId || "") === normalizedSourceBlockId,
      );

      const backlink = existing
        ? await storage.updateBacklink(existing.id, {
            sourceBlockId: normalizedSourceBlockId,
            textSnippet: normalizedSnippet || null,
            startOffset: parsedStartOffset,
            endOffset: parsedEndOffset,
            evidenceType: normalizedEvidenceType,
            confidence: normalizedConfidence,
          })
        : await storage.createBacklink({
            sourceNoteId,
            sourceBlockId: normalizedSourceBlockId,
            targetNoteId: noteId,
            createdByUserId: userId,
            textSnippet: normalizedSnippet || null,
            startOffset: parsedStartOffset,
            endOffset: parsedEndOffset,
            evidenceType: normalizedEvidenceType,
            confidence: normalizedConfidence,
          });
      res.json(backlink);
    } catch (error) {
      res.status(500).json({ message: "Failed to create backlink" });
    }
  });

  app.delete("/api/teams/:teamId/backlinks/:backlinkId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, backlinkId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const backlink = await storage.getBacklink(backlinkId);
      if (!backlink) {
        return res.status(404).json({ message: "Backlink not found" });
      }

      const [sourceNote, targetNote] = await Promise.all([
        storage.getNote(backlink.sourceNoteId),
        storage.getNote(backlink.targetNoteId),
      ]);
      if (!sourceNote || !targetNote || sourceNote.teamId !== teamId || targetNote.teamId !== teamId) {
        return res.status(404).json({ message: "Backlink not found" });
      }

      const canDelete =
        member.role === "dm" ||
        backlink.createdByUserId === userId ||
        sourceNote.authorId === userId;
      if (!canDelete) {
        return res.status(403).json({ message: "Not authorized to delete this backlink" });
      }

      await storage.deleteBacklink(backlinkId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete backlink" });
    }
  });

  app.get("/api/teams/:teamId/notes/:noteId/outgoing-links", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const note = await storage.getNote(noteId);
      if (!note || note.teamId !== teamId) {
        return res.status(404).json({ message: "Note not found" });
      }

      const outgoingLinks = await storage.getOutgoingLinks(noteId);
      const targetNotes = await Promise.all(
        outgoingLinks.map(async (backlink) => storage.getNote(backlink.targetNoteId)),
      );
      const targetById = new Map<string, NonNullable<Awaited<ReturnType<typeof storage.getNote>>>>();
      for (const target of targetNotes) {
        if (target) {
          targetById.set(target.id, target);
        }
      }

      const normalized = outgoingLinks.map((backlink) => {
        const targetNote = targetById.get(backlink.targetNoteId);
        const targetVisible = targetNote ? canViewNote(targetNote, userId, member.role) : false;
        return {
          ...backlink,
          targetNoteTitle: targetVisible ? targetNote?.title ?? null : null,
          targetNoteType: targetVisible ? targetNote?.noteType ?? null : null,
        };
      });

      res.json(normalized);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch outgoing links" });
    }
  });

  app.post("/api/teams/:teamId/relationships", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const {
        fromNoteId,
        toNoteId,
        relationshipType,
        evidenceType,
        confidence,
        sourceNoteId,
        snippetText,
        snippetId,
        sourceBlockId,
        startOffset,
        endOffset,
      } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      if (!fromNoteId || !toNoteId || !relationshipType || !evidenceType || !sourceNoteId) {
        return res.status(400).json({
          message: "fromNoteId, toNoteId, relationshipType, evidenceType, and sourceNoteId are required",
        });
      }

      if (fromNoteId === toNoteId) {
        return res.status(400).json({ message: "fromNoteId and toNoteId must be different" });
      }

      if (!(snippetText || snippetId)) {
        return res.status(400).json({ message: "snippetText or snippetId is required" });
      }

      if (!RELATIONSHIP_TYPE_SET.has(relationshipType as RelationshipType) || relationshipType === "None") {
        return res.status(400).json({ message: "Invalid relationshipType" });
      }

      if (!EVIDENCE_TYPE_SET.has(evidenceType as EvidenceType) || evidenceType === "Analyzed") {
        return res.status(400).json({ message: "Invalid evidenceType" });
      }

      if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
        return res.status(400).json({ message: "confidence must be between 0 and 1" });
      }

      const [fromNote, toNote, sourceNote] = await Promise.all([
        storage.getNote(fromNoteId),
        storage.getNote(toNoteId),
        storage.getNote(sourceNoteId),
      ]);

      if (!fromNote || !toNote || !sourceNote) {
        return res.status(404).json({ message: "Note not found" });
      }
      if (fromNote.teamId !== teamId || toNote.teamId !== teamId || sourceNote.teamId !== teamId) {
        return res.status(404).json({ message: "Note not found" });
      }

      const normalizedSnippet = typeof snippetText === "string"
        ? snippetText.slice(0, 500)
        : `[snippet:${String(snippetId)}]`;
      const parsedStartOffset = typeof startOffset === "number" ? startOffset : null;
      const parsedEndOffset = typeof endOffset === "number" ? endOffset : null;
      const normalizedSourceBlockId = canonicalizeSourceBlockId(
        sourceBlockId,
        normalizedSnippet,
        parsedStartOffset,
        parsedEndOffset,
      );

      const existingForSource = await storage.getRelationshipsForNote(fromNoteId);
      const existing = existingForSource.find((relationship) =>
        relationship.fromNoteId === fromNoteId &&
        relationship.toNoteId === toNoteId &&
        relationship.relationshipType === relationshipType &&
        relationship.sourceNoteId === sourceNoteId &&
        (relationship.sourceBlockId || "") === normalizedSourceBlockId,
      );
      if (existing) {
        return res.json(existing);
      }

      const created = await storage.createNoteRelationship({
        enrichmentRunId: null,
        fromNoteId,
        toNoteId,
        createdByUserId: userId,
        sourceNoteId,
        sourceBlockId: normalizedSourceBlockId,
        relationshipType: relationshipType as RelationshipType,
        confidence,
        evidenceSnippet: normalizedSnippet,
        evidenceType: evidenceType as EvidenceType,
        status: "approved",
        approvedByUserId: userId,
      });

      res.json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create relationship" });
    }
  });

  app.delete("/api/teams/:teamId/relationships/:relationshipId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, relationshipId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const relationship = await storage.getNoteRelationship(relationshipId);
      if (!relationship) {
        return res.status(404).json({ message: "Relationship not found" });
      }

      const [fromNote, toNote] = await Promise.all([
        storage.getNote(relationship.fromNoteId),
        storage.getNote(relationship.toNoteId),
      ]);
      if (!fromNote || !toNote || fromNote.teamId !== teamId || toNote.teamId !== teamId) {
        return res.status(404).json({ message: "Relationship not found" });
      }

      const canDelete = member.role === "dm" || relationship.createdByUserId === userId;
      if (!canDelete) {
        return res.status(403).json({ message: "Not authorized to delete this relationship" });
      }

      await storage.deleteNoteRelationship(relationshipId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete relationship" });
    }
  });

  // User Availability (PRD-009) + Session Candidates/Overrides (PRD-010A):
  // shared handlers registered by BOTH routers (audit S8/S6)
  app.get("/api/teams/:teamId/user-availability", isAuthenticated, makeGetUserAvailabilityHandler(storage));
  app.post("/api/teams/:teamId/user-availability", isAuthenticated, makeCreateUserAvailabilityHandler(storage));
  app.patch("/api/teams/:teamId/user-availability/:id", isAuthenticated, makeUpdateUserAvailabilityHandler(storage));
  app.delete("/api/teams/:teamId/user-availability/:id", isAuthenticated, makeDeleteUserAvailabilityHandler(storage));
  app.get("/api/teams/:teamId/session-candidates", isAuthenticated, makeSessionCandidatesHandler(storage));
  app.post("/api/teams/:teamId/session-overrides", isAuthenticated, makeUpsertSessionOverrideHandler(storage));
  app.get("/api/teams/:teamId/session-overrides", isAuthenticated, makeGetSessionOverridesHandler(storage));
  app.delete("/api/teams/:teamId/session-overrides/:id", isAuthenticated, makeDeleteSessionOverrideHandler(storage));

  // Push + notifications (scheduling audit stage 3)
  app.get("/api/push/public-key", isAuthenticated, makePushPublicKeyHandler());
  app.post("/api/push/subscriptions", isAuthenticated, makeSavePushSubscriptionHandler(storage));
  app.delete("/api/push/subscriptions", isAuthenticated, makeDeletePushSubscriptionHandler(storage));
  app.get("/api/notifications", isAuthenticated, makeListNotificationsHandler(storage));
  app.post("/api/notifications/mark-read", isAuthenticated, makeMarkNotificationsReadHandler(storage));
  app.patch("/api/teams/:teamId/members/me/notification-prefs", isAuthenticated, makeUpdateNotificationPrefsHandler(storage));
}
