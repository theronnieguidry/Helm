import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import AdmZip from "adm-zip";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { TEAM_TYPE_DICE_MODE, SESSION_STATUSES, type TeamType, type AvailabilityStatus, type SessionStatus, type NoteType, type QuestStatus, type ImportVisibility, type ImportRunStats } from "@shared/schema";
import { generateSessionCandidates } from "@shared/recurrence";
import {
  processNuclinoExport,
  resolveNuclinoLinks,
  type NuclinoPage,
  type PageClassification,
  type ImportSummary,
  type CollectionInfo,
} from "@shared/nuclino-parser";

// PRD-015: Multer config for ZIP file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" || file.mimetype === "application/x-zip-compressed" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only ZIP files are allowed"));
    }
  },
});

// PRD-015: In-memory cache for import plans (15-minute TTL)
interface ImportPlan {
  teamId: string;
  pages: NuclinoPage[];
  collections: Map<string, CollectionInfo>;
  classifications: Map<string, PageClassification>;
  summary: ImportSummary;
  createdAt: Date;
}
const importPlanCache = new Map<string, ImportPlan>();

// Clean up expired import plans (older than 15 minutes)
function cleanupExpiredPlans() {
  const now = Date.now();
  const TTL = 15 * 60 * 1000; // 15 minutes
  for (const [id, plan] of Array.from(importPlanCache.entries())) {
    if (now - plan.createdAt.getTime() > TTL) {
      importPlanCache.delete(id);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredPlans, 5 * 60 * 1000);

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

  // Get backlinks for a note (PRD-005)
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
      console.error("Error fetching backlinks:", error);
      res.status(500).json({ message: "Failed to fetch backlinks" });
    }
  });

  // Create backlink (PRD-005)
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
      console.error("Error creating backlink:", error);
      res.status(500).json({ message: "Failed to create backlink" });
    }
  });

  // Delete backlink (PRD-005)
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
      console.error("Error deleting backlink:", error);
      res.status(500).json({ message: "Failed to delete backlink" });
    }
  });

  // Get outgoing links from a note (PRD-005)
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
      console.error("Error fetching outgoing links:", error);
      res.status(500).json({ message: "Failed to fetch outgoing links" });
    }
  });

  // PRD-015: Nuclino Import - Parse ZIP and generate import plan
  app.post("/api/teams/:teamId/imports/nuclino/parse", isAuthenticated, upload.single("zipFile"), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No ZIP file provided" });
      }

      // Extract ZIP contents
      const zip = new AdmZip(req.file.buffer);
      const zipEntries = zip.getEntries();

      // Filter for .md files and extract content
      const mdEntries = zipEntries
        .filter(entry => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".md"))
        .map(entry => ({
          filename: entry.entryName,
          content: entry.getData().toString("utf8"),
          lastModified: entry.header.time ? new Date(entry.header.time) : undefined,
        }));

      if (mdEntries.length === 0) {
        return res.status(400).json({ message: "ZIP file contains no .md files" });
      }

      // Process the export
      const { pages, collections, classifications, summary } = processNuclinoExport(mdEntries);

      // Generate unique import plan ID
      const importPlanId = `${teamId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Store in cache
      importPlanCache.set(importPlanId, {
        teamId,
        pages,
        collections,
        classifications,
        summary,
        createdAt: new Date(),
      });

      // Build page preview list
      const pagesList = pages.map(page => {
        const classification = classifications.get(page.sourcePageId);
        return {
          sourcePageId: page.sourcePageId,
          title: page.title,
          noteType: classification?.noteType || "note",
          questStatus: classification?.questStatus,
          isEmpty: page.isEmpty,
        };
      });

      res.json({
        importPlanId,
        summary,
        pages: pagesList,
      });
    } catch (error) {
      console.error("Error parsing Nuclino ZIP:", error);
      res.status(500).json({ message: "Failed to parse Nuclino export" });
    }
  });

  // PRD-015: Nuclino Import - Commit import plan (updated for PRD-015A)
  app.post("/api/teams/:teamId/imports/nuclino/commit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { importPlanId, options } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // Retrieve import plan from cache
      const plan = importPlanCache.get(importPlanId);
      if (!plan) {
        return res.status(404).json({ message: "Import plan not found or expired" });
      }

      if (plan.teamId !== teamId) {
        return res.status(403).json({ message: "Import plan belongs to a different team" });
      }

      const importEmptyPages = options?.importEmptyPages !== false;
      const defaultVisibility: ImportVisibility = options?.defaultVisibility || "private";
      const isPrivate = defaultVisibility === "private";
      const pagesToImport = plan.pages.filter(p => importEmptyPages || !p.isEmpty);

      // PRD-015A: Create import run record FIRST
      const importRun = await storage.createImportRun({
        teamId,
        sourceSystem: "NUCLINO",
        createdByUserId: userId,
        status: "completed",
        options: {
          importEmptyPages,
          defaultVisibility,
        },
        stats: null, // Will update at end
      });

      // First pass: Create all notes to get their IDs
      const sourcePageIdToNoteId = new Map<string, string>();
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let linksResolved = 0;
      const warnings: string[] = [];

      for (const page of pagesToImport) {
        const classification = plan.classifications.get(page.sourcePageId);
        const noteType = (classification?.noteType || "note") as NoteType;
        const questStatus = classification?.questStatus as QuestStatus | undefined;

        try {
          // PRD-015A: Check if existing note for snapshot
          const existingNote = await storage.findNoteBySourceId(teamId, "NUCLINO", page.sourcePageId);

          if (existingNote) {
            // PRD-015A FR-6: Create snapshot before updating
            await storage.createNoteImportSnapshot({
              noteId: existingNote.id,
              importRunId: importRun.id,
              previousTitle: existingNote.title,
              previousContent: existingNote.content,
              previousNoteType: existingNote.noteType,
              previousQuestStatus: existingNote.questStatus,
              previousContentMarkdown: existingNote.contentMarkdown,
              previousContentMarkdownResolved: existingNote.contentMarkdownResolved,
              previousIsPrivate: existingNote.isPrivate,
            });

            // Update existing note with new fields
            const updatedNote = await storage.updateNote(existingNote.id, {
              title: page.title,
              content: page.content,
              noteType,
              questStatus: questStatus ?? null,
              contentMarkdown: page.contentRaw,
              contentMarkdownResolved: page.content,
              importRunId: importRun.id,
              updatedByUserId: userId,
              isPrivate,
            });

            sourcePageIdToNoteId.set(page.sourcePageId, updatedNote.id);
            updated++;
          } else {
            // Create new note with PRD-015A fields
            const newNote = await storage.createNote({
              teamId,
              authorId: userId,
              title: page.title,
              content: page.content,
              noteType,
              questStatus: questStatus ?? null,
              sourceSystem: "NUCLINO",
              sourcePageId: page.sourcePageId,
              contentMarkdown: page.contentRaw,
              contentMarkdownResolved: page.content,
              importRunId: importRun.id,
              createdByUserId: userId,
              updatedByUserId: userId,
              isPrivate,
            });

            sourcePageIdToNoteId.set(page.sourcePageId, newNote.id);
            created++;
          }
        } catch (err) {
          console.error(`Error importing page ${page.title}:`, err);
          warnings.push(`Failed to import: ${page.title}`);
          skipped++;
        }
      }

      // Second pass: Resolve links and update content
      for (const page of pagesToImport) {
        const noteId = sourcePageIdToNoteId.get(page.sourcePageId);
        if (!noteId) continue;

        const { resolved, unresolvedLinks } = resolveNuclinoLinks(page.content, sourcePageIdToNoteId);

        // Update note with resolved content
        await storage.updateNote(noteId, {
          contentMarkdownResolved: resolved,
        });

        // Track unresolved links as warnings
        for (const linkText of unresolvedLinks) {
          warnings.push(`Unresolved link in "${page.title}": ${linkText}`);
        }

        // Create note_links (backlinks) for resolved links
        for (const link of page.links) {
          const targetNoteId = sourcePageIdToNoteId.get(link.targetPageId);
          if (targetNoteId && targetNoteId !== noteId) {
            try {
              await storage.createBacklink({
                sourceNoteId: noteId,
                targetNoteId,
                textSnippet: link.text,
              });
              linksResolved++;
            } catch (err) {
              // Ignore duplicate backlink errors
            }
          }
        }
      }

      // PRD-015A: Update import run with final stats
      const stats: ImportRunStats = {
        totalPagesDetected: plan.summary.totalPages,
        notesCreated: created,
        notesUpdated: updated,
        notesSkipped: skipped,
        emptyPagesImported: importEmptyPages ? plan.summary.emptyPages : 0,
        linksResolved,
        warningsCount: warnings.length,
      };
      await storage.updateImportRun(importRun.id, { stats });

      // Clean up the import plan from cache
      importPlanCache.delete(importPlanId);

      res.json({
        importRunId: importRun.id,
        created,
        updated,
        skipped,
        warnings: warnings.slice(0, 50), // Limit warnings to 50
      });
    } catch (error) {
      console.error("Error committing Nuclino import:", error);
      res.status(500).json({ message: "Failed to commit import" });
    }
  });

  // PRD-015A: List import runs for a team
  app.get("/api/teams/:teamId/imports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const importRuns = await storage.getImportRuns(teamId);

      // Filter out deleted imports and add importer name
      const activeRuns = importRuns.filter(r => r.status !== "deleted");
      const runsWithUsers = await Promise.all(
        activeRuns.map(async (run) => {
          const user = await storage.getUser(run.createdByUserId);
          return {
            ...run,
            importerName: user
              ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
              : "Unknown",
          };
        })
      );

      res.json(runsWithUsers);
    } catch (error) {
      console.error("Error fetching import runs:", error);
      res.status(500).json({ message: "Failed to fetch import runs" });
    }
  });

  // PRD-015A: Get import run details
  app.get("/api/teams/:teamId/imports/:importId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, importId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const importRun = await storage.getImportRun(importId);
      if (!importRun || importRun.teamId !== teamId) {
        return res.status(404).json({ message: "Import run not found" });
      }

      // Get notes created by this import
      const notes = await storage.getNotesByImportRun(importId);

      // Get importer name
      const user = await storage.getUser(importRun.createdByUserId);

      res.json({
        ...importRun,
        importerName: user
          ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
          : "Unknown",
        notes: notes.map(n => ({ id: n.id, title: n.title, noteType: n.noteType })),
      });
    } catch (error) {
      console.error("Error fetching import run:", error);
      res.status(500).json({ message: "Failed to fetch import run" });
    }
  });

  // PRD-015A: Delete/rollback import run
  app.delete("/api/teams/:teamId/imports/:importId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, importId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const importRun = await storage.getImportRun(importId);
      if (!importRun || importRun.teamId !== teamId) {
        return res.status(404).json({ message: "Import run not found" });
      }

      // Permission check: importer can delete own, DM can delete any
      const isDM = member.role === "dm";
      const isOwner = importRun.createdByUserId === userId;

      if (!isDM && !isOwner) {
        return res.status(403).json({ message: "Not authorized to delete this import" });
      }

      // PRD-015A FR-6: Restore updated notes from snapshots
      const snapshots = await storage.getSnapshotsByImportRun(importId);
      for (const snapshot of snapshots) {
        await storage.restoreNoteFromSnapshot(snapshot.id);
      }

      // Delete notes that were CREATED by this import (not updated)
      // Notes with snapshots were updated, so we already restored them above
      const snapshotNoteIds = new Set(snapshots.map(s => s.noteId));
      const notesToDelete = (await storage.getNotesByImportRun(importId))
        .filter(n => !snapshotNoteIds.has(n.id));

      for (const note of notesToDelete) {
        await storage.deleteNote(note.id);
      }

      // Delete snapshots
      await storage.deleteSnapshotsByImportRun(importId);

      // Mark import run as deleted
      await storage.updateImportRunStatus(importId, "deleted");

      res.json({
        message: "Import rolled back successfully",
        notesDeleted: notesToDelete.length,
        notesRestored: snapshots.length,
      });
    } catch (error) {
      console.error("Error deleting import run:", error);
      res.status(500).json({ message: "Failed to delete import run" });
    }
  });

  // PRD-016: Trigger AI enrichment for an import
  app.post("/api/teams/:teamId/imports/:importId/enrich", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, importId } = req.params;
      const { overrideExistingClassifications = false } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const importRun = await storage.getImportRun(importId);
      if (!importRun || importRun.teamId !== teamId) {
        return res.status(404).json({ message: "Import run not found" });
      }

      // Check if enrichment already exists
      const existingEnrichment = await storage.getEnrichmentRunByImportId(importId);
      if (existingEnrichment && existingEnrichment.status !== "failed") {
        return res.status(400).json({
          message: "Enrichment already exists for this import",
          enrichmentRunId: existingEnrichment.id,
          status: existingEnrichment.status,
        });
      }

      // Create enrichment run
      const enrichmentRun = await storage.createEnrichmentRun({
        importRunId: importId,
        teamId,
        createdByUserId: userId,
        status: "pending",
      });

      // Import the worker dynamically to avoid circular dependencies
      const { enqueueEnrichment } = await import("./jobs/enrichment-worker");

      // Enqueue the enrichment job
      enqueueEnrichment({
        enrichmentRunId: enrichmentRun.id,
        importRunId: importId,
        teamId,
        overrideExisting: overrideExistingClassifications,
      });

      res.json({
        enrichmentRunId: enrichmentRun.id,
        status: "pending",
      });
    } catch (error) {
      console.error("Error triggering enrichment:", error);
      res.status(500).json({ message: "Failed to trigger enrichment" });
    }
  });

  // PRD-016: Get enrichment run status and results
  app.get("/api/teams/:teamId/enrichments/:enrichmentRunId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, enrichmentRunId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const enrichmentRun = await storage.getEnrichmentRun(enrichmentRunId);
      if (!enrichmentRun || enrichmentRun.teamId !== teamId) {
        return res.status(404).json({ message: "Enrichment run not found" });
      }

      // Get classifications and relationships
      const classifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRunId);
      const relationships = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRunId);

      // Enrich classifications with note titles
      const enrichedClassifications = await Promise.all(
        classifications.map(async (c) => {
          const note = await storage.getNote(c.noteId);
          return {
            ...c,
            noteTitle: note?.title || "Unknown",
          };
        })
      );

      // Enrich relationships with note titles
      const enrichedRelationships = await Promise.all(
        relationships.map(async (r) => {
          const fromNote = await storage.getNote(r.fromNoteId);
          const toNote = await storage.getNote(r.toNoteId);
          return {
            ...r,
            fromNoteTitle: fromNote?.title || "Unknown",
            toNoteTitle: toNote?.title || "Unknown",
          };
        })
      );

      res.json({
        ...enrichmentRun,
        classifications: enrichedClassifications,
        relationships: enrichedRelationships,
      });
    } catch (error) {
      console.error("Error fetching enrichment run:", error);
      res.status(500).json({ message: "Failed to fetch enrichment run" });
    }
  });

  // PRD-016: Update classification status (approve/reject)
  app.patch("/api/teams/:teamId/classifications/:classificationId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, classificationId } = req.params;
      const { status } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // Get classification to verify team ownership
      const classifications = await Promise.all(
        (await storage.getNoteClassificationsByEnrichmentRun("")).map(async (c) => {
          const enrichmentRun = await storage.getEnrichmentRun(c.enrichmentRunId);
          return { ...c, teamId: enrichmentRun?.teamId };
        })
      );

      const classification = classifications.find(
        (c) => c.id === classificationId && c.teamId === teamId
      );

      if (!classification) {
        // Try to get it directly by looking up the note
        const allEnrichmentRuns = await Promise.all(
          (await storage.getImportRuns(teamId)).map((ir) =>
            storage.getEnrichmentRunByImportId(ir.id)
          )
        );

        let found = false;
        for (const er of allEnrichmentRuns) {
          if (!er) continue;
          const erClassifications = await storage.getNoteClassificationsByEnrichmentRun(er.id);
          if (erClassifications.some((c) => c.id === classificationId)) {
            found = true;
            break;
          }
        }

        if (!found) {
          return res.status(404).json({ message: "Classification not found" });
        }
      }

      const updated = await storage.updateNoteClassificationStatus(classificationId, status, userId);

      // If approved, update the note's type
      if (status === "approved") {
        const noteTypeMap: Record<string, string> = {
          Person: "person",
          Place: "place",
          Quest: "quest",
          SessionLog: "session_log",
          Note: "note",
        };
        const newNoteType = noteTypeMap[updated.inferredType] || "note";
        await storage.updateNote(updated.noteId, { noteType: newNoteType as NoteType });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating classification:", error);
      res.status(500).json({ message: "Failed to update classification" });
    }
  });

  // PRD-016: Bulk approve classifications
  app.post("/api/teams/:teamId/enrichments/:enrichmentRunId/classifications/bulk-approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, enrichmentRunId } = req.params;
      const { classificationIds, approveHighConfidence, threshold = 0.80 } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const enrichmentRun = await storage.getEnrichmentRun(enrichmentRunId);
      if (!enrichmentRun || enrichmentRun.teamId !== teamId) {
        return res.status(404).json({ message: "Enrichment run not found" });
      }

      let idsToApprove: string[] = [];

      if (approveHighConfidence) {
        // Get all high-confidence classifications
        const classifications = await storage.getNoteClassificationsByEnrichmentRun(enrichmentRunId);
        idsToApprove = classifications
          .filter((c) => c.status === "pending" && c.confidence >= threshold)
          .map((c) => c.id);
      } else if (classificationIds && Array.isArray(classificationIds)) {
        idsToApprove = classificationIds;
      }

      let approved = 0;
      for (const id of idsToApprove) {
        const updated = await storage.updateNoteClassificationStatus(id, "approved", userId);
        // Update note type
        const noteTypeMap: Record<string, string> = {
          Person: "person",
          Place: "place",
          Quest: "quest",
          SessionLog: "session_log",
          Note: "note",
        };
        const newNoteType = noteTypeMap[updated.inferredType] || "note";
        await storage.updateNote(updated.noteId, { noteType: newNoteType as NoteType });
        approved++;
      }

      res.json({ approved });
    } catch (error) {
      console.error("Error bulk approving classifications:", error);
      res.status(500).json({ message: "Failed to bulk approve classifications" });
    }
  });

  // PRD-016: Update relationship status (approve/reject)
  app.patch("/api/teams/:teamId/relationships/:relationshipId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, relationshipId } = req.params;
      const { status } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // Verify relationship belongs to this team by checking enrichment run
      const allEnrichmentRuns = await Promise.all(
        (await storage.getImportRuns(teamId)).map((ir) =>
          storage.getEnrichmentRunByImportId(ir.id)
        )
      );

      let found = false;
      for (const er of allEnrichmentRuns) {
        if (!er) continue;
        const erRelationships = await storage.getNoteRelationshipsByEnrichmentRun(er.id);
        if (erRelationships.some((r) => r.id === relationshipId)) {
          found = true;
          break;
        }
      }

      if (!found) {
        return res.status(404).json({ message: "Relationship not found" });
      }

      const updated = await storage.updateNoteRelationshipStatus(relationshipId, status, userId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating relationship:", error);
      res.status(500).json({ message: "Failed to update relationship" });
    }
  });

  // PRD-016: Bulk approve relationships
  app.post("/api/teams/:teamId/enrichments/:enrichmentRunId/relationships/bulk-approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, enrichmentRunId } = req.params;
      const { relationshipIds, approveHighConfidence, threshold = 0.80 } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const enrichmentRun = await storage.getEnrichmentRun(enrichmentRunId);
      if (!enrichmentRun || enrichmentRun.teamId !== teamId) {
        return res.status(404).json({ message: "Enrichment run not found" });
      }

      let idsToApprove: string[] = [];

      if (approveHighConfidence) {
        const relationships = await storage.getNoteRelationshipsByEnrichmentRun(enrichmentRunId);
        idsToApprove = relationships
          .filter((r) => r.status === "pending" && r.confidence >= threshold)
          .map((r) => r.id);
      } else if (relationshipIds && Array.isArray(relationshipIds)) {
        idsToApprove = relationshipIds;
      }

      let approved = 0;
      for (const id of idsToApprove) {
        await storage.updateNoteRelationshipStatus(id, "approved", userId);
        approved++;
      }

      res.json({ approved });
    } catch (error) {
      console.error("Error bulk approving relationships:", error);
      res.status(500).json({ message: "Failed to bulk approve relationships" });
    }
  });

  // PRD-016: Delete/undo enrichment run
  app.delete("/api/teams/:teamId/enrichments/:enrichmentRunId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, enrichmentRunId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const enrichmentRun = await storage.getEnrichmentRun(enrichmentRunId);
      if (!enrichmentRun || enrichmentRun.teamId !== teamId) {
        return res.status(404).json({ message: "Enrichment run not found" });
      }

      // Delete classifications and relationships
      await storage.deleteClassificationsByEnrichmentRun(enrichmentRunId);
      await storage.deleteRelationshipsByEnrichmentRun(enrichmentRunId);

      // Mark enrichment run as failed/deleted
      await storage.updateEnrichmentRunStatus(enrichmentRunId, "failed");

      res.json({ message: "Enrichment run deleted successfully" });
    } catch (error) {
      console.error("Error deleting enrichment run:", error);
      res.status(500).json({ message: "Failed to delete enrichment run" });
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
