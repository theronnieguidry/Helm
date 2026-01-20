/**
 * PRD-016: Enrichment Worker
 * PRD-043: AI Cache Integration
 *
 * Background job processor for AI enrichment of imported notes.
 * Processes enrichment runs asynchronously to keep imports fast.
 * Uses caching to avoid redundant API calls for unchanged content.
 */

import { storage } from "../storage";
import { createAIProvider, type AIProvider, type NoteForClassification, type NoteWithClassification, type ClassificationResult, CONFIDENCE_THRESHOLDS } from "../ai";
import { createAICache, type AICache } from "../ai/ai-cache";
import type { Note, EnrichmentRunTotals } from "@shared/schema";

interface EnrichmentJob {
  enrichmentRunId: string;
  importRunId: string;
  teamId: string;
  overrideExisting: boolean;
}

// Simple in-process job queue
const jobQueue: EnrichmentJob[] = [];
let isProcessing = false;
let aiProvider: AIProvider | null = null;
let aiCache: AICache | null = null;

/**
 * Get or create the AI provider instance
 */
function getAIProvider(): AIProvider {
  if (!aiProvider) {
    aiProvider = createAIProvider();
  }
  return aiProvider;
}

/**
 * PRD-043: Get or create the AI cache instance
 */
function getAICache(): AICache {
  if (!aiCache) {
    aiCache = createAICache(storage);
  }
  return aiCache;
}

/**
 * Enqueue an enrichment job for processing
 */
export function enqueueEnrichment(job: EnrichmentJob): void {
  jobQueue.push(job);
  processNextJob();
}

/**
 * Get the current queue length (for monitoring)
 */
export function getQueueLength(): number {
  return jobQueue.length;
}

/**
 * Check if currently processing
 */
export function isWorkerBusy(): boolean {
  return isProcessing;
}

/**
 * Process the next job in the queue
 */
async function processNextJob(): Promise<void> {
  if (isProcessing || jobQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const job = jobQueue.shift()!;

  try {
    await processEnrichment(job);
  } catch (error) {
    console.error("Enrichment job failed:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await storage.updateEnrichmentRun(job.enrichmentRunId, {
      status: "failed",
      errorMessage,
    });
    await storage.updateEnrichmentRunStatus(job.enrichmentRunId, "failed");
  }

  isProcessing = false;
  processNextJob();
}

/**
 * Main enrichment processing logic
 */
async function processEnrichment(job: EnrichmentJob): Promise<void> {
  const { enrichmentRunId, importRunId, overrideExisting } = job;

  // Update status to running
  await storage.updateEnrichmentRunStatus(enrichmentRunId, "running");

  // Get notes from the import run
  const notes = await storage.getNotesByImportRun(importRunId);

  if (notes.length === 0) {
    await storage.updateEnrichmentRun(enrichmentRunId, {
      status: "completed",
      totals: {
        notesProcessed: 0,
        classificationsCreated: 0,
        relationshipsFound: 0,
        highConfidenceCount: 0,
        lowConfidenceCount: 0,
        userReviewRequired: 0,
      },
    });
    await storage.updateEnrichmentRunStatus(enrichmentRunId, "completed");
    return;
  }

  const provider = getAIProvider();
  const cache = getAICache();

  // Phase 1: Classify notes (with caching)
  const notesForClassification = prepareNotesForClassification(notes, overrideExisting);
  const classificationResults = await classifyNotesWithCache(
    notesForClassification,
    provider,
    cache,
    job.teamId,
    [] // PC names - could be enhanced to pass from team settings
  );

  // Store classification results
  let classificationsCreated = 0;
  let highConfidenceCount = 0;
  let lowConfidenceCount = 0;

  for (const result of classificationResults) {
    await storage.createNoteClassification({
      noteId: result.noteId,
      enrichmentRunId,
      inferredType: result.inferredType,
      confidence: result.confidence,
      explanation: result.explanation,
      extractedEntities: result.extractedEntities,
      status: "pending",
    });
    classificationsCreated++;

    if (result.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
      highConfidenceCount++;
    } else if (result.confidence < CONFIDENCE_THRESHOLDS.REVIEW) {
      lowConfidenceCount++;
    }
  }

  // Phase 2: Extract relationships
  const notesWithClassifications = prepareNotesForRelationships(notes, classificationResults);
  const relationshipResults = await provider.extractRelationships(notesWithClassifications);

  // Store relationship results
  let relationshipsFound = 0;

  for (const result of relationshipResults) {
    // Verify both notes exist
    const fromNote = notes.find((n) => n.id === result.fromNoteId);
    const toNote = notes.find((n) => n.id === result.toNoteId);

    if (fromNote && toNote) {
      await storage.createNoteRelationship({
        enrichmentRunId,
        fromNoteId: result.fromNoteId,
        toNoteId: result.toNoteId,
        relationshipType: result.relationshipType,
        confidence: result.confidence,
        evidenceSnippet: result.evidenceSnippet,
        evidenceType: result.evidenceType,
        status: "pending",
      });
      relationshipsFound++;

      if (result.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
        highConfidenceCount++;
      } else if (result.confidence < CONFIDENCE_THRESHOLDS.REVIEW) {
        lowConfidenceCount++;
      }
    }
  }

  // Calculate user review required (items below review threshold)
  const userReviewRequired = classificationResults.filter(
    (r) => r.confidence < CONFIDENCE_THRESHOLDS.REVIEW
  ).length + relationshipResults.filter(
    (r) => r.confidence < CONFIDENCE_THRESHOLDS.REVIEW
  ).length;

  // Update enrichment run with totals
  const totals: EnrichmentRunTotals = {
    notesProcessed: notes.length,
    classificationsCreated,
    relationshipsFound,
    highConfidenceCount,
    lowConfidenceCount,
    userReviewRequired,
  };

  await storage.updateEnrichmentRun(enrichmentRunId, {
    totals,
    status: "completed",
  });
  await storage.updateEnrichmentRunStatus(enrichmentRunId, "completed");
}

/**
 * PRD-043: Classify notes with caching
 *
 * Checks cache first, only sends uncached notes to AI provider,
 * then stores fresh results in cache.
 */
async function classifyNotesWithCache(
  notes: NoteForClassification[],
  provider: AIProvider,
  cache: AICache,
  teamId: string,
  pcNames: string[]
): Promise<ClassificationResult[]> {
  if (notes.length === 0) {
    return [];
  }

  // Phase 1: Check cache for all notes
  const cachedResults = await cache.getClassificationsBatch(notes, pcNames, teamId);
  const uncachedNotes = notes.filter((n) => !cachedResults.has(n.id));

  // Log cache statistics
  const cacheHits = notes.length - uncachedNotes.length;
  if (cacheHits > 0) {
    console.log(`AI Cache: ${cacheHits}/${notes.length} classification cache hits for team ${teamId}`);
  }

  // Phase 2: Classify uncached notes
  let freshResults: ClassificationResult[] = [];
  if (uncachedNotes.length > 0) {
    freshResults = await provider.classifyNotes(uncachedNotes, undefined, {
      playerCharacterNames: pcNames,
    });

    // Phase 3: Store fresh results in cache (fire and forget)
    for (const result of freshResults) {
      const note = uncachedNotes.find((n) => n.id === result.noteId);
      if (note) {
        cache.setClassification(note, pcNames, result, teamId).catch((err) => {
          console.error("Failed to cache classification:", err);
        });
      }
    }
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

/**
 * Prepare notes for classification
 */
function prepareNotesForClassification(
  notes: Note[],
  overrideExisting: boolean
): NoteForClassification[] {
  return notes
    .filter((note) => {
      // Skip already-classified notes unless override is enabled
      if (!overrideExisting) {
        const isAlreadyTyped = ["character", "npc", "poi", "quest"].includes(note.noteType);
        if (isAlreadyTyped) {
          return false;
        }
      }
      return true;
    })
    .map((note) => ({
      id: note.id,
      title: note.title,
      content: note.content || note.contentMarkdown || "",
      currentType: note.noteType,
      existingLinks: (note.linkedNoteIds || []) as string[],
    }));
}

/**
 * Prepare notes for relationship extraction
 */
function prepareNotesForRelationships(
  notes: Note[],
  classificationResults: Array<{ noteId: string; inferredType: string }>
): NoteWithClassification[] {
  const classificationMap = new Map(
    classificationResults.map((r) => [r.noteId, r.inferredType])
  );

  return notes.map((note) => {
    // Use classification result or fall back to existing note type
    const inferredType = classificationMap.get(note.id) || mapNoteTypeToInferred(note.noteType);

    // Extract internal links from markdown content
    const internalLinks = extractInternalLinks(note, notes);

    return {
      id: note.id,
      title: note.title,
      content: note.content || note.contentMarkdown || "",
      inferredType: inferredType as import("@shared/schema").InferredEntityType,
      internalLinks,
    };
  });
}

/**
 * Map existing note types to inferred entity types
 */
function mapNoteTypeToInferred(noteType: string): string {
  const mapping: Record<string, string> = {
    character: "Character",
    npc: "NPC",
    area: "Area",
    poi: "Area", // POIs are a subtype of Areas
    quest: "Quest",
    session_log: "SessionLog",
    note: "Note",
  };
  return mapping[noteType] || "Note";
}

/**
 * Extract internal links from note content
 */
function extractInternalLinks(
  note: Note,
  allNotes: Note[]
): Array<{ targetNoteId: string; linkText: string }> {
  const links: Array<{ targetNoteId: string; linkText: string }> = [];
  const content = note.contentMarkdownResolved || note.contentMarkdown || note.content || "";

  // Match markdown links: [text](/notes/id) or [[Title]]
  const linkPattern = /\[([^\]]+)\]\(\/notes\/([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const [, linkText, noteId] = match;
    if (allNotes.some((n) => n.id === noteId)) {
      links.push({ targetNoteId: noteId, linkText });
    }
  }

  // Also check linkedNoteIds field
  if (note.linkedNoteIds) {
    for (const linkedId of note.linkedNoteIds as string[]) {
      if (!links.some((l) => l.targetNoteId === linkedId)) {
        const targetNote = allNotes.find((n) => n.id === linkedId);
        if (targetNote) {
          links.push({ targetNoteId: linkedId, linkText: targetNote.title });
        }
      }
    }
  }

  return links;
}

/**
 * For testing: set a custom AI provider
 */
export function setAIProvider(provider: AIProvider): void {
  aiProvider = provider;
}

/**
 * For testing: clear the job queue
 */
export function clearJobQueue(): void {
  jobQueue.length = 0;
  isProcessing = false;
}
