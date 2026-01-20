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
  ClassificationOptions,
  NoteWithClassification,
  RelationshipResult,
  NoteReference,
  ExtractedEntity,
  EntityRelationship,
  EntityExtractionResult,
  ProgressCallback,
} from "./ai-provider";
import type { InferredEntityType, RelationshipType, EvidenceType } from "@shared/schema";

export class MockAIProvider implements AIProvider {
  private mockClassifications: Map<string, ClassificationResult> = new Map();
  private mockRelationships: RelationshipResult[] = [];
  private mockEntityExtraction: EntityExtractionResult | null = null;
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
   * PRD-026: Set mock entity extraction result
   */
  setMockEntityExtraction(result: EntityExtractionResult): void {
    this.mockEntityExtraction = result;
  }

  /**
   * PRD-026: Add a mock entity to the extraction result
   */
  addMockEntity(entity: Partial<ExtractedEntity> & { name: string }): void {
    if (!this.mockEntityExtraction) {
      this.mockEntityExtraction = { entities: [], relationships: [] };
    }
    this.mockEntityExtraction.entities.push({
      name: entity.name,
      type: entity.type ?? "npc",
      confidence: entity.confidence ?? this.defaultConfidence,
      mentions: entity.mentions ?? 1,
      context: entity.context,
      matchedNoteId: entity.matchedNoteId,
    });
  }

  /**
   * PRD-026: Add a mock entity relationship
   */
  addMockEntityRelationship(relationship: Partial<EntityRelationship> & { entity1: string; entity2: string }): void {
    if (!this.mockEntityExtraction) {
      this.mockEntityExtraction = { entities: [], relationships: [] };
    }
    this.mockEntityExtraction.relationships.push({
      entity1: relationship.entity1,
      entity2: relationship.entity2,
      relationship: relationship.relationship ?? "related to",
      confidence: relationship.confidence ?? this.defaultConfidence,
    });
  }

  /**
   * Clear all mock data
   */
  clear(): void {
    this.mockClassifications.clear();
    this.mockRelationships = [];
    this.mockEntityExtraction = null;
  }

  async classifyNotes(
    notes: NoteForClassification[],
    _onProgress?: ProgressCallback,
    _options?: ClassificationOptions
  ): Promise<ClassificationResult[]> {
    // Note: Mock provider ignores options for simplicity
    // Tests can use setMockClassification for specific behavior
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
      inferredType = "NPC";
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
      inferredType = "Area";
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

  // PRD-026: Entity Extraction

  async extractEntities(content: string, existingNotes?: NoteReference[]): Promise<EntityExtractionResult> {
    // Return mock if set
    if (this.mockEntityExtraction) {
      return this.mockEntityExtraction;
    }

    // Generate default extraction from content
    return this.generateDefaultEntityExtraction(content, existingNotes);
  }

  private generateDefaultEntityExtraction(content: string, existingNotes?: NoteReference[]): EntityExtractionResult {
    const entities: ExtractedEntity[] = [];
    const relationships: EntityRelationship[] = [];

    // Simple heuristic extraction for testing
    const entityNames = this.extractSimpleEntities(content);

    for (const name of entityNames) {
      // Try to match to existing notes
      let matchedNoteId: string | undefined;
      if (existingNotes) {
        const match = existingNotes.find(
          n => n.title.toLowerCase().includes(name.toLowerCase())
        );
        if (match) {
          matchedNoteId = match.id;
        }
      }

      entities.push({
        name,
        type: "npc", // Default to npc for simple extraction
        confidence: this.defaultConfidence,
        mentions: 1,
        context: undefined,
        matchedNoteId,
      });
    }

    // Extract simple place indicators
    const placeIndicators = ["castle", "tower", "city", "town", "forest", "river", "tavern", "inn"];
    const lowerContent = content.toLowerCase();
    for (const indicator of placeIndicators) {
      const regex = new RegExp(`([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\s+${indicator}`, "gi");
      const matches = content.match(regex);
      if (matches) {
        for (const match of matches) {
          if (!entities.some(e => e.name.toLowerCase() === match.toLowerCase())) {
            entities.push({
              name: match,
              type: "place",
              confidence: 0.80,
              mentions: 1,
              context: undefined,
              matchedNoteId: undefined,
            });
          }
        }
      }
    }

    return { entities, relationships };
  }
}
