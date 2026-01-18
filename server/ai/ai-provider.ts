/**
 * PRD-016: AI Provider Interface
 *
 * Abstraction layer for AI services used in note classification
 * and relationship extraction during import enrichment.
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
   * @returns Classification results for each note
   */
  classifyNotes(notes: NoteForClassification[]): Promise<ClassificationResult[]>;

  /**
   * Extract relationships between notes based on their content
   * @param notes Notes with their classifications
   * @returns Detected relationships between notes
   */
  extractRelationships(notes: NoteWithClassification[]): Promise<RelationshipResult[]>;
}

/**
 * Confidence thresholds used across the enrichment system
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.80,      // Auto-approvable in bulk
  REVIEW: 0.65,    // Marked as "Needs review"
  LOW: 0.50,       // Flagged as low confidence
} as const;
