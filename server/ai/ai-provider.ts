/**
 * PRD-016: AI Provider Interface
 * PRD-026: Entity Extraction Extension
 *
 * Abstraction layer for AI services used in note classification,
 * relationship extraction during import enrichment, and entity extraction.
 */

import type { InferredEntityType, RelationshipType, EvidenceType } from "@shared/schema";

/**
 * Input structure for note classification
 */
export interface NoteForClassification {
  id: string;
  title: string;
  content: string;
  currentType: string;
  existingLinks: string[]; // Titles of linked notes
}

/**
 * PRD-040: Options for AI classification
 */
export interface ClassificationOptions {
  /** Player character names - notes about these should be classified as "Character" instead of "NPC" */
  playerCharacterNames?: string[];
}

/**
 * Result of AI classification for a single note
 */
export interface ClassificationResult {
  noteId: string;
  inferredType: InferredEntityType;
  confidence: number; // 0.0 - 1.0
  explanation: string;
  extractedEntities: string[];
}

/**
 * Input structure for relationship extraction
 */
export interface NoteWithClassification {
  id: string;
  title: string;
  content: string;
  inferredType: InferredEntityType;
  internalLinks: Array<{ targetNoteId: string; linkText: string }>;
}

/**
 * Result of AI relationship extraction
 */
export interface RelationshipResult {
  fromNoteId: string;
  toNoteId: string;
  relationshipType: RelationshipType;
  confidence: number; // 0.0 - 1.0
  evidenceSnippet: string;
  evidenceType: EvidenceType;
}

/**
 * AI Provider Interface
 *
 * Implementations should handle batching, rate limiting, and error recovery internally.
 */
export interface AIProvider {
  /**
   * Classify a batch of notes into entity types (Person, Place, Quest, etc.)
   * @param notes Notes to classify
   * @param onProgress PRD-035: Optional callback for progress updates
   * @param options PRD-040: Optional classification options (PC names, etc.)
   * @returns Classification results for each note
   */
  classifyNotes(notes: NoteForClassification[], onProgress?: ProgressCallback, options?: ClassificationOptions): Promise<ClassificationResult[]>;

  /**
   * Extract relationships between notes based on their content
   * @param notes Notes with their classifications
   * @param onProgress PRD-035: Optional callback for progress updates
   * @returns Detected relationships between notes
   */
  extractRelationships(notes: NoteWithClassification[], onProgress?: ProgressCallback): Promise<RelationshipResult[]>;

  /**
   * PRD-026: Extract entities from session content using AI
   * @param content The session log text content
   * @param existingNotes Optional existing notes for matching
   * @returns Extracted entities and their relationships
   */
  extractEntities(content: string, existingNotes?: NoteReference[]): Promise<EntityExtractionResult>;
}

/**
 * Confidence thresholds used across the enrichment system
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.80,      // Auto-approvable in bulk
  REVIEW: 0.65,    // Marked as "Needs review"
  LOW: 0.50,       // Flagged as low confidence
} as const;

/**
 * PRD-035: Progress callback for tracking long-running operations
 */
export type ProgressCallback = (current: number, total: number, currentItem?: string) => void;

// PRD-026: Entity Extraction Types

/**
 * Reference to an existing note for context during extraction
 */
export interface NoteReference {
  id: string;
  title: string;
  noteType: string;
}

/**
 * Entity extracted by AI from session content
 */
export interface ExtractedEntity {
  name: string;
  type: "npc" | "place" | "quest" | "item" | "faction";
  confidence: number;
  mentions: number;
  context?: string;
  matchedNoteId?: string;
}

/**
 * Relationship between entities detected by AI
 */
export interface EntityRelationship {
  entity1: string;
  entity2: string;
  relationship: string;
  confidence: number;
}

/**
 * Result of AI entity extraction
 */
export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  relationships: EntityRelationship[];
}
