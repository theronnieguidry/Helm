import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { TEAM_TYPE_DICE_MODE, SESSION_STATUSES, type TeamType, type AvailabilityStatus, type SessionStatus } from "@shared/schema";
import { generateSessionCandidates } from "@shared/recurrence";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // Get user's teams
  app.get("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teams = await storage.getTeams(userId);
      res.json(teams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Create team
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
      console.error("Error creating team:", error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  // Update team
  app.patch("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      const member = await storage.getTeamMember(id, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized" });
      }

      const team = await storage.updateTeam(id, req.body);
      res.json(team);
    } catch (error) {
      console.error("Error updating team:", error);
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  // Delete team
  app.delete("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      const member = await storage.getTeamMember(id, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteTeam(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Get team members
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
      console.error("Error fetching members:", error);
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  // Remove team member
  app.delete("/api/teams/:teamId/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, memberId } = req.params;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteTeamMember(memberId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // Update team member character info
  app.patch("/api/teams/:teamId/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, memberId } = req.params;
      const { characterName, characterType1, characterType2, characterDescription } = req.body;
      
      // User can only update their own character info (or DM can update any)
      const currentMember = await storage.getTeamMember(teamId, userId);
      if (!currentMember) {
        return res.status(403).json({ message: "Not a team member" });
      }
      
      // Get the target member to check if it's the user's own membership
      const members = await storage.getTeamMembers(teamId);
      const targetMember = members.find(m => m.id === memberId);
      if (!targetMember) {
        return res.status(404).json({ message: "Member not found" });
      }
      
      // Only allow updating own character info or if user is DM
      if (targetMember.userId !== userId && currentMember.role !== "dm") {
        return res.status(403).json({ message: "Not authorized to update this character" });
      }

      const updated = await storage.updateTeamMember(memberId, {
        characterName: characterName ?? null,
        characterType1: characterType1 ?? null,
        characterType2: characterType2 ?? null,
        characterDescription: characterDescription ?? null,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating member:", error);
      res.status(500).json({ message: "Failed to update member" });
    }
  });

  // Get invites
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
      console.error("Error fetching invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  // Create invite
  app.post("/api/teams/:teamId/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized" });
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
      console.error("Error creating invite:", error);
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  // Join team via invite
  app.post("/api/invites/:code/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { code } = req.params;
      
      const invite = await storage.getInviteByCode(code.toUpperCase());
      if (!invite) {
        return res.status(404).json({ message: "Invalid or expired invite code" });
      }

      const existingMember = await storage.getTeamMember(invite.teamId, userId);
      if (existingMember) {
        const team = await storage.getTeam(invite.teamId);
        return res.json({ teamId: invite.teamId, teamName: team?.name, alreadyMember: true });
      }

      await storage.createTeamMember({
        teamId: invite.teamId,
        userId,
        role: "member",
      });

      const team = await storage.getTeam(invite.teamId);
      res.json({ teamId: invite.teamId, teamName: team?.name });
    } catch (error) {
      console.error("Error joining team:", error);
      res.status(500).json({ message: "Failed to join team" });
    }
  });

  // Get notes
  app.get("/api/teams/:teamId/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const notes = await storage.getNotes(teamId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  // Create note
  app.post("/api/teams/:teamId/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const note = await storage.createNote({
        teamId,
        authorId: userId,
        ...req.body,
      });
      
      res.json(note);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  // Update note
  app.patch("/api/teams/:teamId/notes/:noteId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const existingNote = await storage.getNote(noteId);
      if (!existingNote || existingNote.teamId !== teamId) {
        return res.status(404).json({ message: "Note not found" });
      }

      if (existingNote.authorId !== userId && member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized to edit this note" });
      }

      const note = await storage.updateNote(noteId, req.body);
      res.json(note);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  // Delete note
  app.delete("/api/teams/:teamId/notes/:noteId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, noteId } = req.params;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const existingNote = await storage.getNote(noteId);
      if (!existingNote || existingNote.teamId !== teamId) {
        return res.status(404).json({ message: "Note not found" });
      }

      if (existingNote.authorId !== userId && member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized to delete this note" });
      }

      await storage.deleteNote(noteId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  // Get sessions
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
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // Create session
  app.post("/api/teams/:teamId/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized" });
      }

      const session = await storage.createSession({
        teamId,
        ...req.body,
      });
      
      res.json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  // Update session status (PRD-010)
  app.patch("/api/teams/:teamId/sessions/:sessionId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, sessionId } = req.params;
      const { status } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized - DM only" });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.teamId !== teamId) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (!["scheduled", "canceled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'scheduled' or 'canceled'" });
      }

      const updated = await storage.updateSession(sessionId, { status });
      res.json(updated);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ message: "Failed to update session" });
    }
  });

  // Get availability
  app.get("/api/teams/:teamId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const avail = await storage.getAvailability(teamId);
      res.json(avail);
    } catch (error) {
      console.error("Error fetching availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  // Update availability
  app.post("/api/teams/:teamId/sessions/:sessionId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, sessionId } = req.params;
      const { status } = req.body;
      
      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const avail = await storage.upsertAvailability({
        sessionId,
        userId,
        status: status as AvailabilityStatus,
      });
      
      res.json(avail);
    } catch (error) {
      console.error("Error updating availability:", error);
      res.status(500).json({ message: "Failed to update availability" });
    }
  });

  // Get dice rolls
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
      console.error("Error fetching dice rolls:", error);
      res.status(500).json({ message: "Failed to fetch dice rolls" });
    }
  });

  // Create dice roll
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
      console.error("Error creating dice roll:", error);
      res.status(500).json({ message: "Failed to create dice roll" });
    }
  });

  // Update user timezone
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
      console.error("Error updating user timezone:", error);
      res.status(500).json({ message: "Failed to update timezone" });
    }
  });

  // Get user profile
  app.get("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  // User Availability (PRD-009) - date-based personal availability
  app.get("/api/teams/:teamId/user-availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { startDate, endDate } = req.query;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate query parameters are required" });
      }

      const availability = await storage.getUserAvailability(
        teamId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      res.json(availability);
    } catch (error) {
      console.error("Error fetching user availability:", error);
      res.status(500).json({ message: "Failed to fetch user availability" });
    }
  });

  app.post("/api/teams/:teamId/user-availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { date, startTime, endTime } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return res.status(400).json({ message: "Invalid time format. Use HH:MM" });
      }

      // Check for existing availability on this date
      const existingAvailability = await storage.getUserAvailabilityByDate(teamId, userId, new Date(date));
      if (existingAvailability) {
        return res.status(409).json({ message: "Availability already exists for this date. Use PATCH to update." });
      }

      const availability = await storage.createUserAvailability({
        teamId,
        userId,
        date: new Date(date),
        startTime,
        endTime,
      });

      res.json(availability);
    } catch (error) {
      console.error("Error creating user availability:", error);
      res.status(500).json({ message: "Failed to create user availability" });
    }
  });

  app.patch("/api/teams/:teamId/user-availability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, id } = req.params;
      const { startTime, endTime } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // Validate time format if provided
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (startTime && !timeRegex.test(startTime)) {
        return res.status(400).json({ message: "Invalid startTime format. Use HH:MM" });
      }
      if (endTime && !timeRegex.test(endTime)) {
        return res.status(400).json({ message: "Invalid endTime format. Use HH:MM" });
      }

      const updateData: { startTime?: string; endTime?: string } = {};
      if (startTime) updateData.startTime = startTime;
      if (endTime) updateData.endTime = endTime;

      const availability = await storage.updateUserAvailability(id, updateData);
      res.json(availability);
    } catch (error) {
      console.error("Error updating user availability:", error);
      res.status(500).json({ message: "Failed to update user availability" });
    }
  });

  app.delete("/api/teams/:teamId/user-availability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, id } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      await storage.deleteUserAvailability(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user availability:", error);
      res.status(500).json({ message: "Failed to delete user availability" });
    }
  });

  // Session Candidates (PRD-010A) - auto-generated sessions from recurrence
  app.get("/api/teams/:teamId/session-candidates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { startDate, endDate } = req.query;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate query parameters are required" });
      }

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Get any overrides for this team
      const overrides = await storage.getSessionOverrides(teamId);

      // Generate candidates from recurrence settings
      const candidates = generateSessionCandidates(
        team,
        new Date(startDate as string),
        new Date(endDate as string),
        overrides
      );

      res.json({ candidates, overrides });
    } catch (error) {
      console.error("Error fetching session candidates:", error);
      res.status(500).json({ message: "Failed to fetch session candidates" });
    }
  });

  // Session Overrides (PRD-010A) - DM overrides for auto-generated sessions
  app.post("/api/teams/:teamId/session-overrides", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { occurrenceKey, status, scheduledAtOverride } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized - DM only" });
      }

      if (!occurrenceKey) {
        return res.status(400).json({ message: "occurrenceKey is required" });
      }

      // Validate status if provided
      if (status && !SESSION_STATUSES.includes(status as SessionStatus)) {
        return res.status(400).json({ message: "Invalid status. Must be 'scheduled' or 'canceled'" });
      }

      const override = await storage.upsertSessionOverride({
        teamId,
        occurrenceKey,
        status: status || "scheduled",
        scheduledAtOverride: scheduledAtOverride ? new Date(scheduledAtOverride) : null,
        updatedBy: userId,
      });

      res.json(override);
    } catch (error) {
      console.error("Error creating session override:", error);
      res.status(500).json({ message: "Failed to create session override" });
    }
  });

  // Get session overrides for a team (PRD-010A)
  app.get("/api/teams/:teamId/session-overrides", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const overrides = await storage.getSessionOverrides(teamId);
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching session overrides:", error);
      res.status(500).json({ message: "Failed to fetch session overrides" });
    }
  });

  // Delete session override (PRD-010A) - reinstates the session to default behavior
  app.delete("/api/teams/:teamId/session-overrides/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, id } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized - DM only" });
      }

      await storage.deleteSessionOverride(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting session override:", error);
      res.status(500).json({ message: "Failed to delete session override" });
    }
  });

  return httpServer;
}
