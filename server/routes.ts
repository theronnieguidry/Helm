import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import AdmZip from "adm-zip";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import {
  TEAM_TYPE_DICE_MODE,
  SESSION_STATUSES,
  RELATIONSHIP_TYPES,
  EVIDENCE_TYPES,
  type TeamType,
  type AvailabilityStatus,
  type SessionStatus,
  type NoteType,
  type QuestStatus,
  type ImportVisibility,
  type ImportRunStats,
  type RelationshipType,
  type EvidenceType,
} from "@shared/schema";
import { generateSessionCandidates } from "@shared/recurrence";
import {
  processNuclinoExport,
  resolveNuclinoLinks,
  summarizeNuclinoLinks,
  isCollectionPage,
  type NuclinoPage,
  type PageClassification,
  type ImportSummary,
  type CollectionInfo,
} from "@shared/nuclino-parser";
import { buildCleanupSuggestions, inferRelationshipTypeForNoteTypes, type CleanupSuggestionMode } from "@shared/cleanup-suggestions";
import { canonicalizeSourceBlockId } from "@shared/text-hash";
import type {
  AIPreviewResponse,
  BaselineClassification,
  AIClassification,
  AIRelationship,
  BaselineSummary,
  AIEnhancedSummary,
} from "@shared/ai-preview-types";
import { areTypesEquivalent, mapNoteTypeToInferredType } from "@shared/ai-preview-types";
import {
  ENABLE_CLEANUP_SUGGESTIONS_ENDPOINT,
  ENABLE_ENTITY_DETAIL_ENDPOINT,
  ENABLE_NUCLINO_LINK_EVIDENCE,
} from "./feature-flags";
import { canViewNote, filterVisibleNotes } from "./note-visibility";

// PRD-050 FR-3: explicit Nuclino links are high-confidence evidence.
const NUCLINO_LINK_EVIDENCE_CONFIDENCE = 0.9;

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

// PRD-030: In-memory cache for AI preview results (5-minute TTL)
interface AIPreviewCache {
  teamId: string;
  importPlanId: string;
  response: AIPreviewResponse;
  createdAt: Date;
}
const aiPreviewCache = new Map<string, AIPreviewCache>();

// Clean up expired AI previews (older than 5 minutes)
function cleanupExpiredAIPreviews() {
  const now = Date.now();
  const TTL = 5 * 60 * 1000; // 5 minutes
  for (const [id, preview] of Array.from(aiPreviewCache.entries())) {
    if (now - preview.createdAt.getTime() > TTL) {
      aiPreviewCache.delete(id);
    }
  }
}

// Run AI preview cleanup every 2 minutes
setInterval(cleanupExpiredAIPreviews, 2 * 60 * 1000);

// PRD-035: In-memory progress tracking for long-running operations
export interface ImportProgress {
  operationId: string;
  phase: 'classifying' | 'relationships' | 'creating' | 'linking' | 'complete';
  current: number;
  total: number;
  currentItem?: string;
  startedAt: number;
}
const importProgressCache = new Map<string, ImportProgress>();

// Clean up stale progress entries (older than 10 minutes)
function cleanupExpiredProgress() {
  const now = Date.now();
  const TTL = 10 * 60 * 1000; // 10 minutes
  for (const [id, progress] of Array.from(importProgressCache.entries())) {
    if (now - progress.startedAt > TTL) {
      importProgressCache.delete(id);
    }
  }
}

// Run progress cleanup every 5 minutes
setInterval(cleanupExpiredProgress, 5 * 60 * 1000);

// PRD-035: Helper to update progress
export function updateImportProgress(
  operationId: string,
  phase: ImportProgress['phase'],
  current: number,
  total: number,
  currentItem?: string
) {
  const existing = importProgressCache.get(operationId);
  importProgressCache.set(operationId, {
    operationId,
    phase,
    current,
    total,
    currentItem,
    startedAt: existing?.startedAt || Date.now(),
  });
}

const RELATIONSHIP_TYPE_SET = new Set<RelationshipType>(RELATIONSHIP_TYPES);
const EVIDENCE_TYPE_SET = new Set<EvidenceType>(EVIDENCE_TYPES);

function getSessionContent(note: {
  content?: string | null;
  contentBlocks?: Array<{ content: string }> | null;
}): string {
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

// PRD-043: Lazy-loaded AI cache instance for routes
let routesAICache: import("./ai/ai-cache").AICache | null = null;
async function getRoutesAICache() {
  if (!routesAICache) {
    const { createAICache } = await import("./ai/ai-cache");
    routesAICache = createAICache(storage);
  }
  return routesAICache;
}

// PRD-043: Classify notes with caching for AI preview
// Checks cache first, only sends uncached notes to AI provider,
// then stores fresh results in cache (awaited to ensure persistence)
async function classifyNotesWithCacheForPreview(
  notes: Array<{ id: string; title: string; content: string; currentType: string; existingLinks: string[] }>,
  provider: import("./ai").AIProvider,
  teamId: string,
  pcNames: string[],
  progressCallback?: (current: number, total: number, currentItem?: string) => void
): Promise<import("./ai").ClassificationResult[]> {
  if (notes.length === 0) {
    return [];
  }

  const cache = await getRoutesAICache();

  // Phase 1: Check cache for all notes
  const cachedResults = await cache.getClassificationsBatch(notes, pcNames, teamId);
  const uncachedNotes = notes.filter((n) => !cachedResults.has(n.id));

  // Log cache statistics (always log to help debug cache issues)
  const cacheHits = notes.length - uncachedNotes.length;
  console.log(`AI Preview Cache: ${cacheHits}/${notes.length} classification cache hits for team ${teamId}`);
  if (cacheHits === 0 && notes.length > 0) {
    console.log(`AI Preview Cache DEBUG: No classification cache hits. Cache lookup returned empty for ${notes.length} notes.`);
  }

  // Phase 2: Classify uncached notes
  let freshResults: import("./ai").ClassificationResult[] = [];
  if (uncachedNotes.length > 0) {
    // Adjust progress to account for cached items
    const adjustedCallback = progressCallback
      ? (current: number, total: number, item?: string) => {
          // Add cached items to progress
          progressCallback(cacheHits + current, notes.length, item);
        }
      : undefined;

    freshResults = await provider.classifyNotes(uncachedNotes, adjustedCallback, {
      playerCharacterNames: pcNames,
    });

    // Phase 3: Store fresh results in cache (AWAITED to ensure persistence)
    const cacheWrites: Promise<void>[] = [];
    for (const result of freshResults) {
      const note = uncachedNotes.find((n) => n.id === result.noteId);
      if (note) {
        cacheWrites.push(
          cache.setClassification(note, pcNames, result, teamId).catch((err) => {
            console.error("Failed to cache classification:", err);
          })
        );
      }
    }
    // Wait for all cache writes to complete
    await Promise.all(cacheWrites);
    console.log(`AI Preview Cache: Wrote ${freshResults.length} classification entries to cache for team ${teamId}`);
  } else if (progressCallback) {
    // All cached - report full progress immediately
    progressCallback(notes.length, notes.length, 'All classifications loaded from cache');
  }

  // Merge cached and fresh results, maintaining original order
  return notes.map((n) => {
    const cached = cachedResults.get(n.id);
    if (cached) return cached;
    const fresh = freshResults.find((r) => r.noteId === n.id);
    if (fresh) return fresh;
    // Should not happen, but fallback
    return {
      noteId: n.id,
      inferredType: "Note" as const,
      confidence: 0,
      explanation: "Classification failed",
      extractedEntities: [],
    };
  });
}

// PRD-043: Extract relationships with caching for AI preview
// Checks cache for previously analyzed note pairs, only sends uncached pairs to AI,
// then stores fresh results in cache (awaited to ensure persistence)
async function extractRelationshipsWithCacheForPreview(
  notes: Array<{
    id: string;
    title: string;
    content: string;
    inferredType: import("@shared/schema").InferredEntityType;
    internalLinks: Array<{ targetNoteId: string; linkText: string }>;
  }>,
  provider: import("./ai").AIProvider,
  teamId: string,
  progressCallback?: (current: number, total: number, currentItem?: string) => void
): Promise<import("./ai").RelationshipResult[]> {
  if (notes.length < 2) {
    return [];
  }

  const cache = await getRoutesAICache();

  // Phase 1: Check cache for all note pairs
  // Generate all unique pairs and check cache
  const cachedRelationships: import("./ai").RelationshipResult[] = [];
  const checkedPairs = new Set<string>();
  const uncachedPairs: Array<{ noteA: typeof notes[0]; noteB: typeof notes[0]; pairKey: string }> = [];
  let cacheHitCount = 0;

  // Create a map for quick note lookup
  const noteMap = new Map(notes.map(n => [n.id, n]));

  // Check each pair in the cache
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const noteA = notes[i];
      const noteB = notes[j];
      const pairKey = [noteA.id, noteB.id].sort().join('::');

      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);

      // Check cache for this pair
      const cached = await cache.getRelationship(noteA, noteB, teamId);
      if (cached) {
        cacheHitCount++;
        // Only add to results if it's a real relationship (not "None")
        if (cached.relationshipType !== "None") {
          cachedRelationships.push(cached);
        }
        // Either way, it's a cache hit - don't re-analyze
      } else {
        // This pair needs analysis
        uncachedPairs.push({ noteA, noteB, pairKey });
      }
    }
  }

  // Log cache statistics (always log to help debug cache issues)
  const totalPairs = checkedPairs.size;
  console.log(`AI Preview Cache: ${cacheHitCount}/${totalPairs} relationship cache hits for team ${teamId} (${uncachedPairs.length} pairs need analysis)`);
  if (cacheHitCount === 0 && totalPairs > 0) {
    console.log(`AI Preview Cache DEBUG: No relationship cache hits. Checked ${totalPairs} pairs.`);
  }

  // Phase 2: Extract relationships for uncached pairs
  let freshResults: import("./ai").RelationshipResult[] = [];

  if (uncachedPairs.length > 0) {
    // Get unique notes that need relationship analysis
    const uncachedNoteIds = new Set<string>();
    for (const { noteA, noteB } of uncachedPairs) {
      uncachedNoteIds.add(noteA.id);
      uncachedNoteIds.add(noteB.id);
    }
    const uncachedNotes = notes.filter(n => uncachedNoteIds.has(n.id));

    // Adjust progress callback
    const adjustedCallback = progressCallback
      ? (current: number, total: number, item?: string) => {
          progressCallback(current, total, item);
        }
      : undefined;

    freshResults = await provider.extractRelationships(uncachedNotes, adjustedCallback);

    // Phase 3: Store fresh results in cache AND cache "no relationship" for pairs without results
    const cacheWrites: Promise<void>[] = [];

    // Create a set of pairs that have relationships
    const pairsWithRelationships = new Set<string>();
    for (const result of freshResults) {
      const pairKey = [result.fromNoteId, result.toNoteId].sort().join('::');
      pairsWithRelationships.add(pairKey);

      const fromNote = noteMap.get(result.fromNoteId);
      const toNote = noteMap.get(result.toNoteId);
      if (fromNote && toNote) {
        cacheWrites.push(
          cache.setRelationship(fromNote, toNote, result, teamId).catch((err) => {
            console.error("Failed to cache relationship:", err);
          })
        );
      }
    }

    // Cache "no relationship" for pairs that were analyzed but had no relationship
    let noRelationshipCount = 0;
    for (const { noteA, noteB, pairKey } of uncachedPairs) {
      if (!pairsWithRelationships.has(pairKey)) {
        // This pair was analyzed but no relationship was found - cache that fact
        const noRelationshipResult: import("./ai").RelationshipResult = {
          fromNoteId: noteA.id,
          toNoteId: noteB.id,
          relationshipType: "None",
          confidence: 1.0,
          evidenceSnippet: "",
          evidenceType: "Analyzed",
        };
        cacheWrites.push(
          cache.setRelationship(noteA, noteB, noRelationshipResult, teamId).catch((err) => {
            console.error("Failed to cache no-relationship:", err);
          })
        );
        noRelationshipCount++;
      }
    }

    // Wait for all cache writes to complete
    await Promise.all(cacheWrites);
    console.log(`AI Preview Cache: Wrote ${freshResults.length} relationships + ${noRelationshipCount} no-relationship markers to cache for team ${teamId}`);
  } else if (progressCallback) {
    // All cached or not enough notes - report complete
    progressCallback(notes.length, notes.length, 'Relationships loaded from cache');
  }

  // Merge cached and fresh results, deduplicating by pair
  const allResults = [...cachedRelationships, ...freshResults];
  const seenPairs = new Set<string>();
  const deduplicatedResults: import("./ai").RelationshipResult[] = [];

  for (const result of allResults) {
    const pairKey = [result.fromNoteId, result.toNoteId].sort().join('::');
    if (!seenPairs.has(pairKey)) {
      seenPairs.add(pairKey);
      deduplicatedResults.push(result);
    }
  }

  return deduplicatedResults;
}

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

  // Update team member (character info + AI settings)
  app.patch("/api/teams/:teamId/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, memberId } = req.params;
      const { characterName, characterType1, characterType2, characterDescription, aiEnabled, aiEnabledAt } = req.body;

      // User can only update their own info (or DM can update any)
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

      // Only allow updating own info or if user is DM
      if (targetMember.userId !== userId && currentMember.role !== "dm") {
        return res.status(403).json({ message: "Not authorized to update this member" });
      }

      // PRD-028: Build update object with character and AI fields
      const updateData: {
        characterName?: string | null;
        characterType1?: string | null;
        characterType2?: string | null;
        characterDescription?: string | null;
        aiEnabled?: boolean;
        aiEnabledAt?: Date | null;
      } = {};

      // Only include fields that were provided in the request
      if (characterName !== undefined) updateData.characterName = characterName ?? null;
      if (characterType1 !== undefined) updateData.characterType1 = characterType1 ?? null;
      if (characterType2 !== undefined) updateData.characterType2 = characterType2 ?? null;
      if (characterDescription !== undefined) updateData.characterDescription = characterDescription ?? null;
      if (aiEnabled !== undefined) updateData.aiEnabled = aiEnabled;
      if (aiEnabledAt !== undefined) updateData.aiEnabledAt = aiEnabledAt ? new Date(aiEnabledAt) : null;

      const updated = await storage.updateTeamMember(memberId, updateData);

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
      // P0-1 (F0/F48): never ship other authors' private notes to members
      res.json(filterVisibleNotes(notes, userId, member.role));
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  // PRD-019: Get today's session note
  app.get("/api/teams/:teamId/notes/today-session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const todaySession = await storage.findSessionByDate(teamId, new Date());
      res.json(todaySession ?? null);
    } catch (error) {
      console.error("Error fetching today's session:", error);
      res.status(500).json({ message: "Failed to fetch today's session" });
    }
  });

  // PRD-037: Get notes needing review (low-confidence AI classifications)
  app.get("/api/teams/:teamId/notes/needs-review", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  });

  // PRD-048: Single note detail endpoint with references and relationships
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

      if (!ENABLE_ENTITY_DETAIL_ENDPOINT) {
        return res.json(note);
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

      const relatedNotes = await Promise.all(
        Array.from(relatedNoteIds).map(async (id) => {
          const related = await storage.getNote(id);
          return related ? [id, related] as const : null;
        }),
      );

      const relatedNoteMap = new Map<string, NonNullable<Awaited<ReturnType<typeof storage.getNote>>>>();
      for (const entry of relatedNotes) {
        if (entry) {
          relatedNoteMap.set(entry[0], entry[1]);
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
          const sourceNote = relatedNoteMap.get(reference.sourceNoteId);
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
        const targetNote = relatedNoteMap.get(reference.targetNoteId);
        const targetVisible = targetNote ? canViewNote(targetNote, userId, member.role) : false;
        return {
          ...reference,
          targetNoteTitle: targetVisible ? targetNote?.title ?? null : null,
          targetNoteType: targetVisible ? targetNote?.noteType ?? null : null,
          targetNoteIsPrivate: targetNote?.isPrivate ?? false,
        };
      });

      const normalizedRelationships = relationships.map((relationship) => {
        const fromNote = relatedNoteMap.get(relationship.fromNoteId);
        const toNote = relatedNoteMap.get(relationship.toNoteId);
        const sourceNote = relationship.sourceNoteId ? relatedNoteMap.get(relationship.sourceNoteId) : undefined;

        const fromVisible = fromNote ? canViewNote(fromNote, userId, member.role) : false;
        const toVisible = toNote ? canViewNote(toNote, userId, member.role) : false;
        const sourceVisible = sourceNote ? canViewNote(sourceNote, userId, member.role) : true;

        return {
          ...relationship,
          evidenceSnippet: sourceVisible
            ? relationship.evidenceSnippet
            : "Referenced in a private note",
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
      console.error("Error fetching note detail:", error);
      res.status(500).json({ message: "Failed to fetch note detail" });
    }
  });

  // PRD-049: Computed cleanup suggestions endpoint (GET for refresh semantics)
  app.get("/api/teams/:teamId/session-logs/:noteId/cleanup-suggestions", isAuthenticated, async (req: any, res) => {
    try {
      if (!ENABLE_CLEANUP_SUGGESTIONS_ENDPOINT) {
        return res.status(404).json({ message: "Cleanup suggestions are disabled" });
      }

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
      const content = getSessionContent(sessionNote);

      const suggestions = buildCleanupSuggestions({
        content,
        existingNotes: visibleNotes,
        includeLow,
        mode,
      });

      res.json(suggestions);
    } catch (error) {
      console.error("Error computing cleanup suggestions:", error);
      res.status(500).json({ message: "Failed to compute cleanup suggestions" });
    }
  });

  // PRD-049: Optional POST variant for draft-aware suggestions (idempotent compute)
  app.post("/api/teams/:teamId/session-logs/:noteId/cleanup-suggestions", isAuthenticated, async (req: any, res) => {
    try {
      if (!ENABLE_CLEANUP_SUGGESTIONS_ENDPOINT) {
        return res.status(404).json({ message: "Cleanup suggestions are disabled" });
      }

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
      const content = requestContent ?? getSessionContent(sessionNote);

      const suggestions = buildCleanupSuggestions({
        content,
        existingNotes: visibleNotes,
        includeLow,
        mode,
      });

      res.json(suggestions);
    } catch (error) {
      console.error("Error computing cleanup suggestions:", error);
      res.status(500).json({ message: "Failed to compute cleanup suggestions" });
    }
  });

  // Create note
  app.post("/api/teams/:teamId/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      // PRD-034: Accept importRunId for suggestion-created entities to enable cascade delete
      const { title, content, noteType, isPrivate, questStatus, contentBlocks, sessionDate, linkedNoteIds, importRunId } = req.body;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // For session_log type, check if one already exists for the given date (idempotency)
      if (noteType === "session_log" && sessionDate) {
        const existing = await storage.findSessionByDate(teamId, new Date(sessionDate));
        if (existing) {
          // P0-1 (F9): don't leak another author's private session content
          if (!canViewNote(existing, userId, member.role)) {
            return res.status(409).json({ message: "A private session already exists for this date" });
          }
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
        questStatus,
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

      const updateData = {
        ...req.body,
        sessionDate: req.body.sessionDate ? new Date(req.body.sessionDate) : req.body.sessionDate,
      };

      const note = await storage.updateNote(noteId, updateData);
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
      console.error("Error fetching backlinks:", error);
      res.status(500).json({ message: "Failed to fetch backlinks" });
    }
  });

  // Create backlink (PRD-005)
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

      // PRD-047: Backlink dedupe upsert by (sourceNoteId, targetNoteId, sourceBlockId)
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
      console.error("Error fetching outgoing links:", error);
      res.status(500).json({ message: "Failed to fetch outgoing links" });
    }
  });

  // PRD-047/049: Create relationship edge with required provenance/evidence
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

      // Idempotent create: return existing edge for the same provenance tuple.
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
      console.error("Error creating relationship:", error);
      res.status(500).json({ message: "Failed to create relationship" });
    }
  });

  // PRD-047/049: Delete relationship edge
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
      console.error("Error deleting relationship:", error);
      res.status(500).json({ message: "Failed to delete relationship" });
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

      // PRD-040: Fetch team member character names for PC detection
      const teamMembers = await storage.getTeamMembers(teamId);
      const detectedPCNames = teamMembers
        .map(m => m.characterName)
        .filter((name): name is string => !!name);
      const partyMemberNames = new Set(detectedPCNames.map(n => n.toLowerCase()));

      // Process the export with party member names for PC detection
      const { pages, collections, classifications, summary } = processNuclinoExport(mdEntries, partyMemberNames);
      const linkStats = summarizeNuclinoLinks(pages);

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
        linkStats,
        pages: pagesList,
        detectedPCNames, // PRD-040: Return detected PC names for UI
      });
    } catch (error) {
      console.error("Error parsing Nuclino ZIP:", error);
      res.status(500).json({ message: "Failed to parse Nuclino export" });
    }
  });

  // PRD-015: Nuclino Import - Commit import plan (updated for PRD-015A, PRD-030)
  app.post("/api/teams/:teamId/imports/nuclino/commit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { importPlanId, options, useAIClassifications, aiPreviewId } = req.body;

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

      // PRD-030: Retrieve AI preview if using AI classifications
      let aiPreview: AIPreviewCache | undefined;
      if (useAIClassifications && aiPreviewId) {
        aiPreview = aiPreviewCache.get(aiPreviewId);
        if (!aiPreview || aiPreview.teamId !== teamId || aiPreview.importPlanId !== importPlanId) {
          return res.status(404).json({ message: "AI preview not found or expired" });
        }
      }

      // PRD-042: Support granular empty page exclusion with backward compatibility
      let excludedEmptyPageIds: Set<string>;
      let importEmptyPages: boolean;

      if (options?.excludedEmptyPageIds && Array.isArray(options.excludedEmptyPageIds)) {
        // New format: explicit list of empty page IDs to exclude
        excludedEmptyPageIds = new Set(options.excludedEmptyPageIds);
        // Derive importEmptyPages for record-keeping: true if no pages are excluded
        importEmptyPages = excludedEmptyPageIds.size === 0;
      } else {
        // Legacy format: boolean importEmptyPages (defaults to true)
        importEmptyPages = options?.importEmptyPages !== false;
        excludedEmptyPageIds = importEmptyPages
          ? new Set()
          : new Set(plan.pages.filter(p => p.isEmpty).map(p => p.sourcePageId));
      }
      const defaultVisibility: ImportVisibility = options?.defaultVisibility || "private";
      const isPrivate = defaultVisibility === "private";
      const pagesToImport = plan.pages.filter(p => !p.isEmpty || !excludedEmptyPageIds.has(p.sourcePageId));

      // PRD-035: Use client-provided operation ID or generate one for progress tracking
      const commitOperationId = req.body.operationId || `commit-${teamId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const totalPages = pagesToImport.length;

      // PRD-030: Build AI classification map for quick lookup
      const aiClassificationMap = new Map<string, { inferredType: string; confidence: number; explanation: string; extractedEntities: string[] }>();
      if (aiPreview) {
        for (const aiClass of aiPreview.response.aiEnhanced.classifications) {
          aiClassificationMap.set(aiClass.sourcePageId, {
            inferredType: aiClass.inferredType,
            confidence: aiClass.confidence,
            explanation: aiClass.explanation,
            extractedEntities: aiClass.extractedEntities,
          });
        }
      }

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
      const noteTypeByNoteId = new Map<string, NoteType>();
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let linksResolved = 0;
      const warnings: string[] = [];

      // PRD-035: Initialize progress for creating phase
      updateImportProgress(commitOperationId, 'creating', 0, totalPages, 'Starting import...');

      let processedCount = 0;
      for (const page of pagesToImport) {
        // PRD-035: Update progress
        updateImportProgress(commitOperationId, 'creating', processedCount, totalPages, page.title);
        const classification = plan.classifications.get(page.sourcePageId);

        // PRD-030: Use AI classification if available, otherwise fall back to baseline
        const aiClass = aiClassificationMap.get(page.sourcePageId);
        let noteType: NoteType;
        if (aiClass && useAIClassifications) {
          // Map AI inferred type to note type
          const typeMapping: Record<string, NoteType> = {
            "Character": "character",
            "NPC": "npc",
            "Area": "poi",
            "Quest": "quest",
            "SessionLog": "session_log",
            "Note": "note",
          };
          noteType = typeMapping[aiClass.inferredType] || "note";
        } else {
          noteType = (classification?.noteType || "note") as NoteType;
        }
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
            noteTypeByNoteId.set(updatedNote.id, noteType);
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
            noteTypeByNoteId.set(newNote.id, noteType);
            created++;
          }
        } catch (err) {
          console.error(`Error importing page ${page.title}:`, err);
          warnings.push(`Failed to import: ${page.title}`);
          skipped++;
        }
        processedCount++;
      }

      // PRD-035: Update progress for linking phase
      updateImportProgress(commitOperationId, 'linking', 0, totalPages, 'Resolving links...');

      // Second pass: Resolve links and update content
      let linkedCount = 0;
      for (const page of pagesToImport) {
        const noteId = sourcePageIdToNoteId.get(page.sourcePageId);
        if (!noteId) {
          linkedCount++;
          continue;
        }

        // PRD-035: Update progress
        updateImportProgress(commitOperationId, 'linking', linkedCount, totalPages, page.title);

        const { resolved, unresolvedLinks } = resolveNuclinoLinks(page.content, sourcePageIdToNoteId);

        // Update note with resolved content
        await storage.updateNote(noteId, {
          contentMarkdownResolved: resolved,
        });

        // Track unresolved links as warnings
        for (const linkText of unresolvedLinks) {
          warnings.push(`Unresolved link in "${page.title}": ${linkText}`);
        }

        // PRD-050: Store explicit Nuclino links as relationship evidence (or backlinks when flag disabled).
        for (const link of page.links) {
          const targetNoteId = sourcePageIdToNoteId.get(link.targetPageId);
          if (targetNoteId && targetNoteId !== noteId) {
            try {
              const sourceBlockId = canonicalizeSourceBlockId(
                undefined,
                `${link.text}|${link.fullMatch}`,
                null,
                null,
              );

              // PRD-050 FR-3: snippet is the markdown line containing the link.
              const evidenceSnippet = (link.lineSnippet || link.text).slice(0, 500);

              if (ENABLE_NUCLINO_LINK_EVIDENCE) {
                const fromType = noteTypeByNoteId.get(noteId) || "note";
                const toType = noteTypeByNoteId.get(targetNoteId) || "note";
                const inferred = inferRelationshipTypeForNoteTypes(fromType, toType);
                // Honor the canonical direction (e.g. NPC page linking a Quest
                // stores QuestHasNPC from the quest to the NPC).
                const relationshipFromNoteId = inferred.swap ? targetNoteId : noteId;
                const relationshipToNoteId = inferred.swap ? noteId : targetNoteId;

                const existingRelationships = await storage.getRelationshipsForNote(noteId);
                const existingRelationship = existingRelationships.find(
                  (relationship) =>
                    relationship.fromNoteId === relationshipFromNoteId &&
                    relationship.toNoteId === relationshipToNoteId &&
                    relationship.relationshipType === inferred.relationshipType &&
                    relationship.sourceNoteId === noteId &&
                    (relationship.sourceBlockId || "") === sourceBlockId,
                );

                if (!existingRelationship) {
                  await storage.createNoteRelationship({
                    enrichmentRunId: null,
                    fromNoteId: relationshipFromNoteId,
                    toNoteId: relationshipToNoteId,
                    createdByUserId: userId,
                    sourceNoteId: noteId,
                    sourceBlockId,
                    relationshipType: inferred.relationshipType,
                    confidence: NUCLINO_LINK_EVIDENCE_CONFIDENCE,
                    evidenceSnippet,
                    evidenceType: "Link",
                    status: "approved",
                    approvedByUserId: userId,
                  });
                }
              } else {
                const existingBacklinks = await storage.getBacklinks(targetNoteId);
                const existingBacklink = existingBacklinks.find(
                  (backlink) =>
                    backlink.sourceNoteId === noteId &&
                    (backlink.sourceBlockId || "") === sourceBlockId,
                );

                if (existingBacklink) {
                  await storage.updateBacklink(existingBacklink.id, {
                    sourceBlockId,
                    textSnippet: evidenceSnippet,
                    evidenceType: "Link",
                    confidence: NUCLINO_LINK_EVIDENCE_CONFIDENCE,
                  });
                } else {
                  await storage.createBacklink({
                    sourceNoteId: noteId,
                    sourceBlockId,
                    targetNoteId,
                    createdByUserId: userId,
                    textSnippet: evidenceSnippet,
                    evidenceType: "Link",
                    confidence: NUCLINO_LINK_EVIDENCE_CONFIDENCE,
                  });
                }
              }

              linksResolved++;
            } catch (err) {
              // Continue import on relationship/backlink evidence write errors.
            }
          }
        }
        linkedCount++;
      }

      // PRD-035: Mark progress as complete
      updateImportProgress(commitOperationId, 'complete', totalPages, totalPages, 'Import complete');

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

      // PRD-030: If using AI classifications, create enrichment run and store results
      let enrichmentRunId: string | null = null;
      if (aiPreview && useAIClassifications) {
        // Import CONFIDENCE_THRESHOLDS for counting
        const { CONFIDENCE_THRESHOLDS } = await import("./ai");

        // Create enrichment run record
        const enrichmentRun = await storage.createEnrichmentRun({
          importRunId: importRun.id,
          teamId,
          createdByUserId: userId,
          status: "completed",
        });
        enrichmentRunId = enrichmentRun.id;

        // Store AI classifications as pending
        let classificationsCreated = 0;
        let highConfidenceCount = 0;
        let lowConfidenceCount = 0;

        for (const aiClass of aiPreview.response.aiEnhanced.classifications) {
          const noteId = sourcePageIdToNoteId.get(aiClass.sourcePageId);
          if (noteId) {
            await storage.createNoteClassification({
              noteId,
              enrichmentRunId: enrichmentRun.id,
              inferredType: aiClass.inferredType as import("@shared/schema").InferredEntityType,
              confidence: aiClass.confidence,
              explanation: aiClass.explanation,
              extractedEntities: aiClass.extractedEntities,
              status: "pending",
            });
            classificationsCreated++;

            if (aiClass.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
              highConfidenceCount++;
            } else if (aiClass.confidence < CONFIDENCE_THRESHOLDS.REVIEW) {
              lowConfidenceCount++;
            }
          }
        }

        // Store AI relationships as pending
        let relationshipsFound = 0;
        for (const rel of aiPreview.response.aiEnhanced.relationships) {
          const fromNoteId = sourcePageIdToNoteId.get(rel.fromPageId);
          const toNoteId = sourcePageIdToNoteId.get(rel.toPageId);

          if (fromNoteId && toNoteId) {
            await storage.createNoteRelationship({
              enrichmentRunId: enrichmentRun.id,
              fromNoteId,
              toNoteId,
              relationshipType: rel.relationshipType,
              confidence: rel.confidence,
              evidenceSnippet: rel.evidenceSnippet,
              evidenceType: rel.evidenceType,
              status: "pending",
            });
            relationshipsFound++;
          }
        }

        // Update enrichment run with totals
        const userReviewRequired = aiPreview.response.aiEnhanced.classifications.filter(
          c => c.confidence < CONFIDENCE_THRESHOLDS.REVIEW
        ).length + aiPreview.response.aiEnhanced.relationships.filter(
          r => r.confidence < CONFIDENCE_THRESHOLDS.REVIEW
        ).length;

        await storage.updateEnrichmentRun(enrichmentRun.id, {
          totals: {
            notesProcessed: pagesToImport.length,
            classificationsCreated,
            relationshipsFound,
            highConfidenceCount,
            lowConfidenceCount,
            userReviewRequired,
          },
        });

        // Clean up AI preview cache
        aiPreviewCache.delete(aiPreviewId);
      }

      // Clean up the import plan from cache
      importPlanCache.delete(importPlanId);

      res.json({
        importRunId: importRun.id,
        enrichmentRunId,
        operationId: commitOperationId, // PRD-035: Include operation ID for progress tracking
        created,
        updated,
        skipped,
        warnings: warnings.slice(0, 50), // Limit warnings to 50
        aiEnhanced: !!aiPreview,
      });
    } catch (error) {
      console.error("Error committing Nuclino import:", error);
      res.status(500).json({ message: "Failed to commit import" });
    }
  });

  // PRD-030: AI-enhanced import preview (dry run)
  app.post("/api/teams/:teamId/imports/nuclino/ai-preview", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { importPlanId, aiOptions } = req.body; // PRD-040: Accept aiOptions

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // FR-1: Check if AI features are enabled for this member
      if (!member.aiEnabled) {
        return res.status(403).json({
          message: "AI features require a subscription",
          code: "AI_SUBSCRIPTION_REQUIRED"
        });
      }

      // Retrieve import plan from cache
      const plan = importPlanCache.get(importPlanId);
      if (!plan) {
        return res.status(404).json({ message: "Import plan not found or expired" });
      }

      if (plan.teamId !== teamId) {
        return res.status(403).json({ message: "Import plan belongs to a different team" });
      }

      // Check if API key is available
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          message: "AI service is not configured",
          code: "AI_NOT_CONFIGURED"
        });
      }

      // PRD-040: Build PC names list from team members and user-provided options
      const teamMembers = await storage.getTeamMembers(teamId);
      const teamPCNames = teamMembers
        .map(m => m.characterName)
        .filter((name): name is string => !!name);
      const allPCNames = [
        ...teamPCNames,
        ...(aiOptions?.playerCharacterNames || [])
      ].filter((name, index, arr) => arr.indexOf(name) === index); // Deduplicate

      // PRD-035: Use client-provided operation ID or generate one for progress tracking
      const operationId = req.body.operationId || `ai-preview-${teamId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Build baseline classifications from import plan
      const baselineClassifications: BaselineClassification[] = plan.pages.map(page => {
        const classification = plan.classifications.get(page.sourcePageId);
        return {
          sourcePageId: page.sourcePageId,
          title: page.title,
          noteType: (classification?.noteType || "note") as NoteType,
          questStatus: classification?.questStatus as QuestStatus | undefined,
          isEmpty: page.isEmpty,
        };
      });

      // Build baseline summary from import plan
      const baselineSummary: BaselineSummary = {
        total: plan.summary.totalPages,
        characters: plan.summary.characters,
        npcs: plan.summary.npcs,
        pois: plan.summary.pois,
        questsOpen: plan.summary.questsOpen,
        questsDone: plan.summary.questsDone,
        notes: plan.summary.notes,
        empty: plan.summary.emptyPages,
      };

      // PRD-040: Pre-classify collection/index pages before sending to AI
      const preClassifiedPages = new Map<string, AIClassification>();
      const pagesForAI: NuclinoPage[] = [];

      for (const page of plan.pages) {
        if (page.isEmpty) continue;

        // Check if page is an index/collection page (mostly links)
        if (isCollectionPage(page.content, page.links)) {
          preClassifiedPages.set(page.sourcePageId, {
            sourcePageId: page.sourcePageId,
            title: page.title,
            inferredType: "Note",
            confidence: 0.85,
            explanation: "Index/navigation page containing primarily links to other notes",
            extractedEntities: [],
          });
        } else {
          pagesForAI.push(page);
        }
      }

      // Prepare notes for AI classification (using page content)
      const notesForClassification = pagesForAI.map(page => ({
        id: page.sourcePageId, // Use sourcePageId as temporary ID
        title: page.title,
        content: page.content || page.contentRaw || "",
        currentType: plan.classifications.get(page.sourcePageId)?.noteType || "note",
        existingLinks: page.links.map(l => l.text),
      }));

      // Dynamically import AI provider
      const { createAIProvider, CONFIDENCE_THRESHOLDS } = await import("./ai");
      const provider = createAIProvider();

      // PRD-035: Initialize progress tracking
      const totalClassificationNotes = notesForClassification.length;
      updateImportProgress(operationId, 'classifying', 0, totalClassificationNotes, 'Starting classification...');

      // PRD-043: Phase 1: Classify notes with AI (with caching)
      const classificationResults = await classifyNotesWithCacheForPreview(
        notesForClassification,
        provider,
        teamId,
        allPCNames,
        (current, total, currentItem) => {
          updateImportProgress(operationId, 'classifying', current, total, currentItem);
        }
      );

      // Build a map for quick lookup
      const classificationMap = new Map(
        classificationResults.map(r => [r.noteId, r])
      );

      // Build AI classifications (PRD-040: merge pre-classified index pages)
      const aiClassifications: AIClassification[] = plan.pages.map(page => {
        // PRD-040: Check if this was a pre-classified collection/index page
        const preClassified = preClassifiedPages.get(page.sourcePageId);
        if (preClassified) {
          return preClassified;
        }

        const aiResult = classificationMap.get(page.sourcePageId);
        const baselineType = plan.classifications.get(page.sourcePageId)?.noteType || "note";

        if (aiResult) {
          return {
            sourcePageId: page.sourcePageId,
            title: page.title,
            inferredType: aiResult.inferredType,
            confidence: aiResult.confidence,
            explanation: aiResult.explanation,
            extractedEntities: aiResult.extractedEntities,
          };
        } else {
          // For empty pages or pages not sent to AI, use baseline mapping
          return {
            sourcePageId: page.sourcePageId,
            title: page.title,
            inferredType: mapNoteTypeToInferredType(baselineType as NoteType),
            confidence: 0.5, // Low confidence for non-AI results
            explanation: "Not analyzed by AI (empty page)",
            extractedEntities: [],
          };
        }
      });

      // Phase 2: Extract relationships between pages
      const notesWithClassifications = plan.pages
        .filter(page => !page.isEmpty)
        .map(page => {
          const aiResult = classificationMap.get(page.sourcePageId);
          const baselineType = plan.classifications.get(page.sourcePageId)?.noteType || "note";

          return {
            id: page.sourcePageId,
            title: page.title,
            content: page.content || page.contentRaw || "",
            inferredType: (aiResult?.inferredType || mapNoteTypeToInferredType(baselineType as NoteType)) as import("@shared/schema").InferredEntityType,
            internalLinks: page.links.map(l => ({
              targetNoteId: l.targetPageId,
              linkText: l.text,
            })),
          };
        });

      // PRD-035: Update progress for relationship extraction phase
      updateImportProgress(operationId, 'relationships', 0, notesWithClassifications.length, 'Analyzing relationships...');

      // PRD-043: Phase 2: Extract relationships with caching
      const relationshipResults = await extractRelationshipsWithCacheForPreview(
        notesWithClassifications,
        provider,
        teamId,
        (current, total, currentItem) => {
          updateImportProgress(operationId, 'relationships', current, total, currentItem);
        }
      );

      // PRD-035: Mark progress as complete
      updateImportProgress(operationId, 'complete', notesWithClassifications.length, notesWithClassifications.length, 'Analysis complete');

      // Build title map for relationships
      const titleMap = new Map(plan.pages.map(p => [p.sourcePageId, p.title]));

      // Build AI relationships
      const aiRelationships: AIRelationship[] = relationshipResults.map(r => ({
        fromPageId: r.fromNoteId,
        fromTitle: titleMap.get(r.fromNoteId) || "Unknown",
        toPageId: r.toNoteId,
        toTitle: titleMap.get(r.toNoteId) || "Unknown",
        relationshipType: r.relationshipType,
        confidence: r.confidence,
        evidenceSnippet: r.evidenceSnippet,
        evidenceType: r.evidenceType,
      }));

      // Calculate AI summary
      const aiSummary: AIEnhancedSummary = {
        total: plan.summary.totalPages,
        npcs: aiClassifications.filter(c => c.inferredType === "NPC").length,
        areas: aiClassifications.filter(c => c.inferredType === "Area").length,
        quests: aiClassifications.filter(c => c.inferredType === "Quest").length,
        characters: aiClassifications.filter(c => c.inferredType === "Character").length,
        sessionLogs: aiClassifications.filter(c => c.inferredType === "SessionLog").length,
        notes: aiClassifications.filter(c => c.inferredType === "Note").length,
        relationshipsTotal: aiRelationships.length,
        relationshipsHigh: aiRelationships.filter(r => r.confidence >= CONFIDENCE_THRESHOLDS.HIGH).length,
        relationshipsMedium: aiRelationships.filter(r => r.confidence >= CONFIDENCE_THRESHOLDS.REVIEW && r.confidence < CONFIDENCE_THRESHOLDS.HIGH).length,
        relationshipsLow: aiRelationships.filter(r => r.confidence >= CONFIDENCE_THRESHOLDS.LOW && r.confidence < CONFIDENCE_THRESHOLDS.REVIEW).length,
      };

      // Calculate diff stats
      let changedCount = 0;
      let upgradedCount = 0;

      for (const aiClass of aiClassifications) {
        const baseline = baselineClassifications.find(b => b.sourcePageId === aiClass.sourcePageId);
        if (baseline) {
          if (areTypesEquivalent(baseline.noteType, aiClass.inferredType)) {
            // AI confirms baseline - count as upgraded
            upgradedCount++;
          } else {
            // AI differs from baseline - count as changed
            changedCount++;
          }
        }
      }

      // Generate preview ID
      const previewId = `ai-preview-${teamId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Build response
      const response: AIPreviewResponse = {
        previewId,
        operationId, // PRD-035: Include operation ID for progress tracking
        baseline: {
          summary: baselineSummary,
          classifications: baselineClassifications,
        },
        aiEnhanced: {
          summary: aiSummary,
          classifications: aiClassifications,
          relationships: aiRelationships,
        },
        diff: {
          changedCount,
          upgradedCount,
          totalPages: plan.summary.totalPages,
        },
      };

      // Cache the preview result
      aiPreviewCache.set(previewId, {
        teamId,
        importPlanId,
        response,
        createdAt: new Date(),
      });

      res.json(response);
    } catch (error) {
      console.error("Error generating AI preview:", error);
      res.status(500).json({ message: "Failed to generate AI preview" });
    }
  });

  // PRD-035: Get import progress for a specific operation
  app.get("/api/teams/:teamId/imports/progress/:operationId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, operationId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const progress = importProgressCache.get(operationId);
      if (!progress) {
        return res.status(404).json({ message: "Progress not found" });
      }

      res.json(progress);
    } catch (error) {
      console.error("Error fetching import progress:", error);
      res.status(500).json({ message: "Failed to fetch progress" });
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

      // PRD-028: Check if AI features are enabled for this member
      if (!member.aiEnabled) {
        return res.status(403).json({
          message: "AI features require a subscription",
          code: "AI_SUBSCRIPTION_REQUIRED"
        });
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
      const { status, overrideType } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      // PRD-038: Validate overrideType if provided
      // PRD-045: Added POI as valid manual reclassify option
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

      // If approved, update the note's type
      // PRD-038: Use overrideType if provided, otherwise use inferredType
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
          Character: "character",
          NPC: "npc",
          Area: "area",
          POI: "poi",
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

  // PRD-026: Extract entities from session content using AI
  app.post("/api/teams/:teamId/extract-entities", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { content } = req.body;

      // Verify team membership
      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      // PRD-028: Check if AI features are enabled for this member
      if (!member.aiEnabled) {
        return res.status(403).json({
          message: "AI features require a subscription",
          code: "AI_SUBSCRIPTION_REQUIRED"
        });
      }

      // Validate content
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ message: "Content is required" });
      }

      // Check for API key availability
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      // Get existing notes for matching
      const existingNotes = await storage.getNotes(teamId);
      const noteReferences = existingNotes.map(n => ({
        id: n.id,
        title: n.title,
        noteType: n.noteType,
      }));

      // Import the AI provider dynamically to avoid issues when API key is not set
      const { ClaudeAIProvider } = await import("./ai/claude-provider");
      const aiProvider = new ClaudeAIProvider();

      const result = await aiProvider.extractEntities(content, noteReferences);

      res.json(result);
    } catch (error) {
      console.error("Error extracting entities:", error);
      res.status(500).json({ message: "Failed to extract entities" });
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

  // PRD-043: AI Cache management is handled via CLI script (scripts/ai-cache-admin.ts)
  // NOT exposed over HTTP for security reasons in published app

  return httpServer;
}
