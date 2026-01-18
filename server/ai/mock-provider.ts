/**
 * PRD-016: Mock AI Provider
 *
 * Mock implementation of AIProvider for testing purposes.
 * Allows setting predetermined responses for deterministic test behavior.
 */

import type {
  AIProvider,
  NoteForClassification,
  ClassificationResult,
  NoteWithClassification,
  RelationshipResult,
} from "./ai-provider";
import type { InferredEntityType, RelationshipType, EvidenceType } from "@shared/schema";

export class MockAIProvider implements AIProvider {
  private mockClassifications: Map<string, ClassificationResult> = new Map();
  private mockRelationships: RelationshipResult[] = [];
  private defaultConfidence = 0.75;

  /**
   * Set a mock classification result for a specific note
   */
  setMockClassification(noteId: string, result: Partial<ClassificationResult>): void {
    this.mockClassifications.set(noteId, {
      noteId,
      inferredType: result.inferredType ?? "Note",
      confidence: result.confidence ?? this.defaultConfidence,
      explanation: result.explanation ?? "Mock classification",
      extractedEntities: result.extractedEntities ?? [],
    });
  }

  /**
   * Set mock relationship results
   */
  setMockRelationships(relationships: RelationshipResult[]): void {
    this.mockRelationships = relationships;
  }

  /**
   * Add a single mock relationship
   */
  addMockRelationship(relationship: Partial<RelationshipResult> & { fromNoteId: string; toNoteId: string }): void {
    this.mockRelationships.push({
      fromNoteId: relationship.fromNoteId,
      toNoteId: relationship.toNoteId,
      relationshipType: relationship.relationshipType ?? "Related",
      confidence: relationship.confidence ?? this.defaultConfidence,
      evidenceSnippet: relationship.evidenceSnippet ?? "Mock evidence",
      evidenceType: relationship.evidenceType ?? "Heuristic",
    });
  }

  /**
   * Set the default confidence level for auto-generated classifications
   */
  setDefaultConfidence(confidence: number): void {
    this.defaultConfidence = confidence;
  }

  /**
   * Clear all mock data
   */
  clear(): void {
    this.mockClassifications.clear();
    this.mockRelationships = [];
  }

  async classifyNotes(notes: NoteForClassification[]): Promise<ClassificationResult[]> {
    return notes.map((note) => {
      // Return mock if set
      const mock = this.mockClassifications.get(note.id);
      if (mock) {
        return mock;
      }

      // Generate a reasonable default based on title heuristics
      return this.generateDefaultClassification(note);
    });
  }

  async extractRelationships(_notes: NoteWithClassification[]): Promise<RelationshipResult[]> {
    return this.mockRelationships;
  }

  /**
   * Generate a default classification based on simple title heuristics.
   * This allows tests to work without explicitly setting every mock.
   */
  private generateDefaultClassification(note: NoteForClassification): ClassificationResult {
    const title = note.title.toLowerCase();
    const content = note.content.toLowerCase();

    // Simple heuristics for default classification
    let inferredType: InferredEntityType = "Note";
    let confidence = this.defaultConfidence;
    let explanation = "Default mock classification";

    // Person indicators
    const personIndicators = [
      "lord", "lady", "king", "queen", "prince", "princess",
      "captain", "commander", "chief", "elder", "master",
      "dr.", "doctor", "professor", "sir", "dame",
    ];
    if (personIndicators.some((ind) => title.includes(ind)) ||
        title.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/)) { // Two capitalized words
      inferredType = "Person";
      explanation = "Title contains person indicator";
      confidence = 0.80;
    }

    // Place indicators
    const placeIndicators = [
      "city", "town", "village", "castle", "tower", "dungeon",
      "forest", "mountain", "river", "lake", "ocean", "sea",
      "tavern", "inn", "temple", "shrine", "guild", "academy",
      "kingdom", "empire", "realm", "lands of",
    ];
    if (placeIndicators.some((ind) => title.includes(ind))) {
      inferredType = "Place";
      explanation = "Title contains place indicator";
      confidence = 0.85;
    }

    // Quest indicators
    const questIndicators = [
      "quest", "mission", "task", "find the", "defeat the",
      "rescue", "retrieve", "discover", "investigate",
      "kill the", "destroy the", "save the",
    ];
    if (questIndicators.some((ind) => title.includes(ind) || content.includes(ind))) {
      inferredType = "Quest";
      explanation = "Title/content contains quest indicator";
      confidence = 0.75;
    }

    // Session log indicators
    const sessionIndicators = [
      "session", "episode", "chapter", "part",
      "game night", "recap", "summary",
    ];
    if (sessionIndicators.some((ind) => title.includes(ind))) {
      inferredType = "SessionLog";
      explanation = "Title contains session log indicator";
      confidence = 0.90;
    }

    // Extract simple entity names (capitalized words)
    const extractedEntities = this.extractSimpleEntities(content);

    return {
      noteId: note.id,
      inferredType,
      confidence,
      explanation,
      extractedEntities,
    };
  }

  private extractSimpleEntities(content: string): string[] {
    // Simple extraction: find capitalized words that aren't at sentence starts
    const entities: string[] = [];
    const words = content.split(/\s+/);

    for (let i = 1; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z]/g, "");
      if (word.length > 2 && word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) {
        // Check if previous word doesn't end with sentence-ending punctuation
        const prevWord = words[i - 1];
        if (!prevWord.match(/[.!?]$/)) {
          if (!entities.includes(word)) {
            entities.push(word);
          }
        }
      }
    }

    return entities.slice(0, 10); // Limit to 10 entities
  }
}
