/**
 * Shared scheduling API handlers (audit S8).
 *
 * The notes surface learned this the hard way (P2-3): production routes.ts
 * and test-routes.ts re-implementing the same handlers separately is how the
 * privacy leak, the sessionDate coercion bug, and the idempotency divergence
 * happened. The scheduling surface had the same disease — e.g. availability
 * status was validated ONLY in the test router. These factories are the
 * single implementation registered by BOTH routers.
 *
 * They also close the audit's authorization holes (S6):
 *  - user-availability PATCH/DELETE used to accept any row id from any team
 *    member — now the row must belong to this team AND this user;
 *  - session-override DELETE used to accept any override id — now team-scoped;
 *  - legacy session availability now checks the session belongs to the team
 *    and validates status in production, not just in tests.
 */
import type { Request, Response } from "express";
import type { IStorage } from "./storage";
import {
  SESSION_STATUSES,
  AVAILABILITY_STATUS,
  USER_AVAILABILITY_STATUS,
  type SessionStatus,
  type AvailabilityStatus,
  type UserAvailabilityStatus,
} from "@shared/schema";
import { generateSessionCandidates } from "@shared/recurrence";
import { normalizeAvailabilityDate } from "@shared/scheduling";

type AnyRequest = Request & { user: { claims: { sub: string } } };

function getUserId(req: Request): string {
  return (req as AnyRequest).user.claims.sub;
}

const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

// --- Game sessions (manual one-offs) ---------------------------------------

export function makeGetSessionsHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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
  };
}

export function makeCreateSessionHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;
      // Explicit allow-list — the old production route spread req.body raw (S7)
      const { scheduledAt, notes, isOverride } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Only admin can create sessions" });
      }

      const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
      if (!scheduledDate || isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ message: "A valid scheduledAt is required" });
      }

      const session = await storage.createSession({
        teamId,
        scheduledAt: scheduledDate,
        notes: typeof notes === "string" ? notes : null,
        isOverride: isOverride === undefined ? true : !!isOverride,
      });
      res.json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  };
}

export function makeUpdateSessionStatusHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId, sessionId } = req.params;
      const { status } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized - DM only" });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.teamId !== teamId) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (!SESSION_STATUSES.includes(status as SessionStatus)) {
        return res.status(400).json({ message: "Invalid status. Must be 'scheduled' or 'canceled'" });
      }

      const updated = await storage.updateSession(sessionId, { status });
      res.json(updated);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ message: "Failed to update session" });
    }
  };
}

// --- Legacy per-session availability (manual sessions only) ----------------

export function makeGetLegacyAvailabilityHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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
  };
}

export function makeUpsertLegacyAvailabilityHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId, sessionId } = req.params;
      const { status } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // S8: this validation used to exist only in the test router
      if (!AVAILABILITY_STATUS.includes(status as AvailabilityStatus)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      // S6: the session must actually belong to this team
      const session = await storage.getSession(sessionId);
      if (!session || session.teamId !== teamId) {
        return res.status(404).json({ message: "Session not found" });
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
  };
}

// --- User availability (PRD-009, date-based) -------------------------------

export function makeGetUserAvailabilityHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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
  };
}

export function makeCreateUserAvailabilityHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;
      const { date, startTime, endTime, status } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // Stage 2 (audit S1): a response is either an available window or an
      // explicit "unavailable" — silence stays reserved for "hasn't responded"
      const responseStatus: UserAvailabilityStatus =
        status === undefined ? "available" : status;
      if (!USER_AVAILABILITY_STATUS.includes(responseStatus)) {
        return res.status(400).json({ message: "Invalid status. Must be 'available' or 'unavailable'" });
      }

      if (responseStatus === "available") {
        // Validate time format (HH:MM)
        if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
          return res.status(400).json({ message: "Invalid time format. Use HH:MM" });
        }
      }

      const normalizedDate = normalizeAvailabilityDate(date);

      // Check for existing availability on this date
      const existingAvailability = await storage.getUserAvailabilityByDate(teamId, userId, normalizedDate);
      if (existingAvailability) {
        return res.status(409).json({ message: "Availability already exists for this date. Use PATCH to update." });
      }

      const availability = await storage.createUserAvailability({
        teamId,
        userId,
        date: normalizedDate,
        status: responseStatus,
        startTime: responseStatus === "available" ? startTime : null,
        endTime: responseStatus === "available" ? endTime : null,
      });

      res.json(availability);
    } catch (error) {
      console.error("Error creating user availability:", error);
      res.status(500).json({ message: "Failed to create user availability" });
    }
  };
}

/**
 * S6: shared guard — the row must exist, belong to this team, and belong to
 * the requesting user. Availability is personal; not even the DM edits it.
 */
async function loadOwnAvailabilityRow(
  storage: IStorage,
  teamId: string,
  rowId: string,
  userId: string,
  res: Response
) {
  const record = await storage.getUserAvailabilityById(rowId);
  if (!record || record.teamId !== teamId) {
    res.status(404).json({ message: "Availability not found" });
    return null;
  }
  if (record.userId !== userId) {
    res.status(403).json({ message: "Not authorized to modify another member's availability" });
    return null;
  }
  return record;
}

export function makeUpdateUserAvailabilityHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId, id } = req.params;
      const { startTime, endTime, status } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      if (status !== undefined && !USER_AVAILABILITY_STATUS.includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be 'available' or 'unavailable'" });
      }

      // Validate time format if provided
      if (startTime && !TIME_REGEX.test(startTime)) {
        return res.status(400).json({ message: "Invalid startTime format. Use HH:MM" });
      }
      if (endTime && !TIME_REGEX.test(endTime)) {
        return res.status(400).json({ message: "Invalid endTime format. Use HH:MM" });
      }

      const record = await loadOwnAvailabilityRow(storage, teamId, id, userId, res);
      if (!record) return;

      const updateData: {
        startTime?: string | null;
        endTime?: string | null;
        status?: UserAvailabilityStatus;
      } = {};
      if (startTime) updateData.startTime = startTime;
      if (endTime) updateData.endTime = endTime;

      if (status === "unavailable") {
        // Flipping to "can't make it" clears the window
        updateData.status = "unavailable";
        updateData.startTime = null;
        updateData.endTime = null;
      } else if (status === "available") {
        const effectiveStart = startTime || record.startTime;
        const effectiveEnd = endTime || record.endTime;
        if (!effectiveStart || !effectiveEnd) {
          return res.status(400).json({ message: "startTime and endTime are required when switching to available" });
        }
        updateData.status = "available";
        updateData.startTime = effectiveStart;
        updateData.endTime = effectiveEnd;
      }

      const availability = await storage.updateUserAvailability(id, updateData);
      res.json(availability);
    } catch (error) {
      console.error("Error updating user availability:", error);
      res.status(500).json({ message: "Failed to update user availability" });
    }
  };
}

export function makeDeleteUserAvailabilityHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId, id } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const record = await loadOwnAvailabilityRow(storage, teamId, id, userId, res);
      if (!record) return;

      await storage.deleteUserAvailability(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user availability:", error);
      res.status(500).json({ message: "Failed to delete user availability" });
    }
  };
}

// --- Session candidates + overrides (PRD-010A) -----------------------------

export function makeSessionCandidatesHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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

      const overrides = await storage.getSessionOverrides(teamId);
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
  };
}

export function makeUpsertSessionOverrideHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;
      const { occurrenceKey, status, scheduledAtOverride } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized - DM only" });
      }

      if (!occurrenceKey) {
        return res.status(400).json({ message: "occurrenceKey is required" });
      }

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
  };
}

export function makeGetSessionOverridesHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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
  };
}

export function makeDeleteSessionOverrideHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId, id } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member || member.role !== "dm") {
        return res.status(403).json({ message: "Not authorized - DM only" });
      }

      // S6: the override must belong to this team
      const override = await storage.getSessionOverrideById(id);
      if (!override || override.teamId !== teamId) {
        return res.status(404).json({ message: "Session override not found" });
      }

      await storage.deleteSessionOverride(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting session override:", error);
      res.status(500).json({ message: "Failed to delete session override" });
    }
  };
}
