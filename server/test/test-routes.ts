import type { Express, RequestHandler } from "express";
import type { IStorage } from "../storage";
import { TEAM_TYPE_DICE_MODE, type TeamType, type AvailabilityStatus } from "@shared/schema";

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

      const team = await storage.updateTeam(id, req.body);
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

  app.get("/api/teams/:teamId/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const notes = await storage.getNotes(teamId);
      const filtered = notes.filter(n => !n.isPrivate || n.authorId === userId);
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.post("/api/teams/:teamId/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { title, content, noteType, isPrivate, questStatus, contentBlocks, sessionDate, linkedNoteIds } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const note = await storage.createNote({
        teamId,
        authorId: userId,
        title,
        content,
        noteType,
        isPrivate,
        questStatus,
        contentBlocks,
        sessionDate: sessionDate ? new Date(sessionDate) : undefined,
        linkedNoteIds,
      });
      res.json(note);
    } catch (error) {
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  app.patch("/api/teams/:teamId/notes/:noteId", isAuthenticated, async (req: any, res) => {
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

      if (note.authorId !== userId && member.role !== "dm") {
        return res.status(403).json({ message: "Can only edit your own notes" });
      }

      const updated = await storage.updateNote(noteId, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  app.delete("/api/teams/:teamId/notes/:noteId", isAuthenticated, async (req: any, res) => {
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

      if (note.authorId !== userId && member.role !== "dm") {
        return res.status(403).json({ message: "Can only delete your own notes" });
      }

      await storage.deleteNote(noteId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  app.get("/api/teams/:teamId/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const sessions = await storage.getSessions(teamId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.post("/api/teams/:teamId/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { scheduledAt } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Only admin can create sessions" });
      }

      const session = await storage.createSession({
        teamId,
        scheduledAt: new Date(scheduledAt),
      });
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  app.get("/api/teams/:teamId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const availability = await storage.getAvailability(teamId);
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.post("/api/teams/:teamId/sessions/:sessionId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, sessionId } = req.params;
      const { status } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const validStatuses: AvailabilityStatus[] = ["available", "maybe", "busy"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const availability = await storage.upsertAvailability({
        sessionId,
        userId,
        status,
      });
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to update availability" });
    }
  });

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
      res.json(backlinks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch backlinks" });
    }
  });

  app.post("/api/teams/:teamId/notes/:noteId/backlinks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;
      const { sourceNoteId, sourceBlockId, textSnippet } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
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

      const backlink = await storage.createBacklink({
        sourceNoteId,
        sourceBlockId,
        targetNoteId: noteId,
        textSnippet,
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
      res.json(outgoingLinks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch outgoing links" });
    }
  });
}
