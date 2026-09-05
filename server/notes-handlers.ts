/**
 * Shared notes API handlers (gap P2-3).
 *
 * The privacy leak (F0), the sessionDate coercion bug (PRD-021), and the
 * idempotency divergence (PRD-023) all happened because server/routes.ts and
 * server/test/test-routes.ts re-implemented the same handlers separately.
 * These factories are the single implementation registered by BOTH routers,
 * making that divergence class structurally impossible for the notes surface.
 */
import type { Request, Response } from "express";
import type { IStorage } from "./storage";
import type { QuestStatus } from "@shared/schema";
import { filterVisibleNotes } from "./note-visibility";
import { reindexBacklinksForSource } from "./backlink-reindex";

type AnyRequest = Request & { user: { claims: { sub: string } } };

function getUserId(req: Request): string {
  return (req as AnyRequest).user.claims.sub;
}

export function makeListNotesHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const notes = await storage.getNotes(teamId);
      // P0-1 (F0/F48): never ship other authors' private notes to members
      res.json(filterVisibleNotes(notes, userId, member.role));
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  };
}

export function makeTodaySessionHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // M1: today's session is the *requesting user's* session — each member
      // keeps their own log, so nobody edits into another author's 403 wall.
      const todaySession = await storage.findSessionByDate(teamId, new Date(), userId);
      res.json(todaySession ?? null);
    } catch (error) {
      console.error("Error fetching today's session:", error);
      res.status(500).json({ message: "Failed to fetch today's session" });
    }
  };
}

export function makeNeedsReviewHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const items = await storage.getPendingLowConfidenceClassifications(teamId);
      // P0-1 (F81): don't expose private notes' titles/explanations to non-authors
      const teamNotes = await storage.getNotes(teamId);
      const visibleNoteIds = new Set(
        filterVisibleNotes(teamNotes, userId, member.role).map((note) => note.id),
      );
      const visibleItems = items.filter((item) => visibleNoteIds.has(item.noteId));
      res.json({ items: visibleItems, count: visibleItems.length });
    } catch (error) {
      console.error("Error fetching needs-review items:", error);
      res.status(500).json({ message: "Failed to fetch needs-review items" });
    }
  };
}

export function makeCreateNoteHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;
      // PRD-034: Accept importRunId for suggestion-created entities to enable cascade delete
      const { title, content, noteType, isPrivate, questStatus, contentBlocks, sessionDate, linkedNoteIds, importRunId } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // For session_log type, check if the author already has one for the given
      // date (idempotency). M1: scoped per author — another member's session for
      // the same day never blocks or leaks into this user's create.
      if (noteType === "session_log" && sessionDate) {
        const existing = await storage.findSessionByDate(teamId, new Date(sessionDate), userId);
        if (existing) {
          // Return existing session instead of creating duplicate
          return res.status(200).json(existing);
        }
      }

      const note = await storage.createNote({
        teamId,
        authorId: userId,
        title,
        content,
        noteType,
        isPrivate,
        // PRD-004 / gap F38: quests are proto-quests at capture time — default
        // to "lead" in the shared handler, not just the test storage.
        questStatus:
          noteType === "quest" ? ((questStatus as QuestStatus) ?? "lead") : questStatus,
        contentBlocks,
        sessionDate: sessionDate ? new Date(sessionDate) : undefined,
        linkedNoteIds,
        importRunId: importRunId || undefined, // PRD-034: Track import origin for cascade delete
      });

      res.json(note);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  };
}

export function makeUpdateNoteHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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

      // Explicit allow-list instead of spreading req.body — the enum/field
      // drift bug family (PRD-029/039/045) came from implicit field handling.
      const updateData: Record<string, unknown> = {};
      const body = req.body ?? {};
      for (const field of [
        "title",
        "content",
        "noteType",
        "isPrivate",
        "questStatus",
        "contentBlocks",
        "linkedNoteIds",
      ]) {
        if (field in body) updateData[field] = body[field];
      }
      if ("sessionDate" in body) {
        updateData.sessionDate = body.sessionDate ? new Date(body.sessionDate) : body.sessionDate;
      }
      // PRD-003 FR-5 (gap F19): mark-reviewed support
      if ("reviewedAt" in body) {
        updateData.reviewedAt = body.reviewedAt ? new Date(body.reviewedAt) : null;
      }

      const contentChanged =
        "content" in body &&
        typeof body.content === "string" &&
        body.content !== (existingNote.content ?? "");

      // M6: the imported-note view renders contentMarkdownResolved over content,
      // so an edit to an imported note must carry into the resolved markdown or
      // the edit silently disappears behind the stale render.
      if (contentChanged && existingNote.sourceSystem) {
        updateData.contentMarkdownResolved = body.content;
      }

      const note = await storage.updateNote(noteId, updateData);

      // P2-2 (F34, PRD-005 FR-4): content edits re-index backlinks sourced from
      // this note so evidence never goes stale. M7: skipped when content is
      // unchanged — no reason to churn offsets on title/status-only saves.
      if (contentChanged) {
        await reindexBacklinksForSource(storage, noteId, body.content).catch((err) => {
          console.error("Backlink re-index failed:", err);
        });
      }

      res.json(note);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ message: "Failed to update note" });
    }
  };
}

export function makeDeleteNoteHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
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
  };
}
