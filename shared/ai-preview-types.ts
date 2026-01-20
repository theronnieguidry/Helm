/**
 * PRD-030: AI Enhanced Import Diff Preview Types
 *
 * Shared types for the AI import preview feature that shows
 * a side-by-side comparison of baseline vs AI-enhanced classifications.
 */

import type { NoteType, QuestStatus, InferredEntityType, RelationshipType, EvidenceType } from "./schema";

/**
 * Baseline classification from nuclino-parser heuristics
 */
export interface BaselineClassification {
  sourcePageId: string;
  title: string;
  noteType: NoteType;
  questStatus?: QuestStatus;
  isEmpty: boolean;
}

/**
 * AI classification from Claude Haiku
 */
export interface AIClassification {
  sourcePageId: string;
  title: string;
  inferredType: InferredEntityType;
  confidence: number; // 0.0 - 1.0
  explanation: string;
  extractedEntities: string[];
}

/**
 * Relationship detected by AI between two pages
 */
export interface AIRelationship {
  fromPageId: string;
  fromTitle: string;
  toPageId: string;
  toTitle: string;
  relationshipType: RelationshipType;
  confidence: number; // 0.0 - 1.0
  evidenceSnippet: string;
  evidenceType: EvidenceType;
}

/**
 * Summary of baseline classification results
 */
export interface BaselineSummary {
  total: number;
  characters: number;
  npcs: number;
  pois: number;
  questsOpen: number;
  questsDone: number;
  notes: number;
  empty: number;
}

/**
 * Summary of AI-enhanced classification results
 */
export interface AIEnhancedSummary {
  total: number;
  npcs: number;
  areas: number;
  quests: number;
  characters: number;
  sessionLogs: number;
  notes: number;
  relationshipsTotal: number;
  relationshipsHigh: number;   // confidence >= 0.80
  relationshipsMedium: number; // confidence >= 0.65 && < 0.80
  relationshipsLow: number;    // confidence >= 0.50 && < 0.65
}

/**
 * Diff statistics comparing baseline to AI
 */
export interface DiffStats {
  changedCount: number;    // Pages where AI type differs from baseline
  upgradedCount: number;   // Pages where AI confirms baseline type
  totalPages: number;
}

/**
 * Full AI preview response
 */
export interface AIPreviewResponse {
  previewId: string;
  operationId?: string; // PRD-035: Operation ID for progress tracking
  baseline: {
    summary: BaselineSummary;
    classifications: BaselineClassification[];
  };
  aiEnhanced: {
    summary: AIEnhancedSummary;
    classifications: AIClassification[];
    relationships: AIRelationship[];
  };
  diff: DiffStats;
}

/**
 * PRD-040: AI classification options for import
 */
export interface ImportAIOptions {
  /** Player character names - notes about these should be classified as "Character" instead of "NPC" */
  playerCharacterNames?: string[];
}

/**
 * Request body for AI preview endpoint
 */
export interface AIPreviewRequest {
  importPlanId: string;
  operationId?: string; // PRD-035: Client-provided operation ID for progress tracking
  aiOptions?: ImportAIOptions; // PRD-040: AI classification options
}

/**
 * Request body for commit with AI classifications
 */
export interface AICommitRequest {
  importPlanId: string;
  options: {
    importEmptyPages: boolean;
    defaultVisibility: "private" | "team";
  };
  useAIClassifications?: boolean;
  aiPreviewId?: string;
}

/**
 * Confidence level categories
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Get confidence level from numeric value
 */
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.80) return "high";
  if (confidence >= 0.65) return "medium";
  return "low";
}

/**
 * Get confidence badge color class
 */
export function getConfidenceBadgeClass(confidence: number): string {
  const level = getConfidenceLevel(confidence);
  switch (level) {
    case "high": return "bg-green-500/10 text-green-600 border-green-500/20";
    case "medium": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    case "low": return "bg-red-500/10 text-red-600 border-red-500/20";
  }
}

/**
 * Map InferredEntityType to display-friendly NoteType
 * AI types map differently: Character -> character, NPC -> npc, Area -> poi, etc.
 */
export function mapInferredTypeToNoteType(inferredType: InferredEntityType): NoteType {
  switch (inferredType) {
    case "Character": return "character";
    case "NPC": return "npc";
    case "Area": return "poi";
    case "Quest": return "quest";
    case "SessionLog": return "session_log";
    case "Note": return "note";
    default: return "note";
  }
}

/**
 * Map NoteType to InferredEntityType for comparison
 */
export function mapNoteTypeToInferredType(noteType: NoteType): InferredEntityType {
  switch (noteType) {
    case "character": return "Character";
    case "npc": return "NPC";
    case "poi":
    case "area": return "Area";
    case "quest": return "Quest";
    case "session_log": return "SessionLog";
    case "note": return "Note";
    default: return "Note";
  }
}

/**
 * Check if baseline and AI types are equivalent
 */
export function areTypesEquivalent(baselineType: NoteType, aiType: InferredEntityType): boolean {
  const mappedBaseline = mapNoteTypeToInferredType(baselineType);
  return mappedBaseline === aiType;
}
