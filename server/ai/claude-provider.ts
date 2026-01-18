/**
 * PRD-016: Claude AI Provider
 *
 * Implementation of AIProvider using Anthropic's Claude API.
 * Uses claude-3-5-haiku for cost-effective classification.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  NoteForClassification,
  ClassificationResult,
  NoteWithClassification,
  RelationshipResult,
} from "./ai-provider";
import type { InferredEntityType, RelationshipType, EvidenceType } from "@shared/schema";

const BATCH_SIZE = 10;
const RATE_LIMIT_DELAY_MS = 150; // Increased from 50ms to avoid rate limiting

export class ClaudeAIProvider implements AIProvider {
  private client: Anthropic;
  private model = "claude-3-5-haiku-20241022";

  constructor(apiKey?: string) {
    // Anthropic SDK auto-reads ANTHROPIC_API_KEY from env if not provided
    this.client = new Anthropic({ apiKey });
  }

  async classifyNotes(notes: NoteForClassification[]): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    const batches = this.chunkArray(notes, BATCH_SIZE);

    for (const batch of batches) {
      const batchResults = await this.classifyBatch(batch);
      results.push(...batchResults);

      // Rate limiting between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(RATE_LIMIT_DELAY_MS);
      }
    }

    return results;
  }

  private async classifyBatch(notes: NoteForClassification[]): Promise<ClassificationResult[]> {
    const systemPrompt = `You are a TTRPG (tabletop roleplaying game) campaign note classifier. Your job is to analyze notes from a game master's campaign wiki and classify them into categories.

For each note, determine the most appropriate category:
- Person: An NPC (non-player character), deity, historical figure, or any named individual
- Place: A location, city, building, region, landmark, or geographic feature
- Quest: A task, mission, objective, or storyline the players might pursue
- SessionLog: A record or summary of a game session that already happened
- Note: General reference material, rules, world lore, or uncategorizable content

Be conservative with confidence scores:
- 0.90+: Very clear category (e.g., "The City of Ironforge" is clearly a Place)
- 0.70-0.89: Strong indicators but some ambiguity
- 0.50-0.69: Weak signals, needs human review
- Below 0.50: Very uncertain, should be marked as Note

Also extract any entity names mentioned in the content (NPCs, places, quest names).

Output valid JSON only. No markdown, no explanation outside the JSON.`;

    const userPrompt = this.buildClassificationPrompt(notes);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      return this.parseClassificationResponse(response, notes);
    } catch (error) {
      console.error("Claude classification error:", error);
      // Return default classifications on error
      return notes.map((note) => ({
        noteId: note.id,
        inferredType: "Note" as InferredEntityType,
        confidence: 0.5,
        explanation: "Classification failed due to API error",
        extractedEntities: [],
      }));
    }
  }

  private buildClassificationPrompt(notes: NoteForClassification[]): string {
    const notesJson = notes.map((note) => ({
      id: note.id,
      title: note.title,
      content: note.content.slice(0, 2000), // Truncate long content
      currentType: note.currentType,
      linkedTitles: note.existingLinks.slice(0, 10), // Limit links
    }));

    return `Classify the following notes. Return a JSON array with one object per note:

\`\`\`json
[
  {
    "noteId": "string",
    "inferredType": "Person" | "Place" | "Quest" | "SessionLog" | "Note",
    "confidence": 0.0-1.0,
    "explanation": "brief reason for classification",
    "extractedEntities": ["entity1", "entity2"]
  }
]
\`\`\`

Notes to classify:
${JSON.stringify(notesJson, null, 2)}`;
  }

  private parseClassificationResponse(
    response: Anthropic.Message,
    notes: NoteForClassification[]
  ): ClassificationResult[] {
    try {
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = textBlock.text.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr) as Array<{
        noteId: string;
        inferredType: string;
        confidence: number;
        explanation: string;
        extractedEntities: string[];
      }>;

      // Map response to results, validating types
      const validTypes: InferredEntityType[] = ["Person", "Place", "Quest", "SessionLog", "Note"];

      return parsed.map((item) => ({
        noteId: item.noteId,
        inferredType: validTypes.includes(item.inferredType as InferredEntityType)
          ? (item.inferredType as InferredEntityType)
          : "Note",
        confidence: Math.max(0, Math.min(1, item.confidence)),
        explanation: item.explanation || "",
        extractedEntities: item.extractedEntities || [],
      }));
    } catch (error) {
      console.error("Failed to parse classification response:", error);
      // Return default classifications
      return notes.map((note) => ({
        noteId: note.id,
        inferredType: "Note" as InferredEntityType,
        confidence: 0.5,
        explanation: "Failed to parse AI response",
        extractedEntities: [],
      }));
    }
  }

  async extractRelationships(notes: NoteWithClassification[]): Promise<RelationshipResult[]> {
    if (notes.length < 2) {
      return [];
    }

    const results: RelationshipResult[] = [];
    const batches = this.chunkArray(notes, BATCH_SIZE);

    for (const batch of batches) {
      const batchResults = await this.extractRelationshipsBatch(batch, notes);
      results.push(...batchResults);

      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(RATE_LIMIT_DELAY_MS);
      }
    }

    // Deduplicate relationships
    return this.deduplicateRelationships(results);
  }

  private async extractRelationshipsBatch(
    batch: NoteWithClassification[],
    allNotes: NoteWithClassification[]
  ): Promise<RelationshipResult[]> {
    const systemPrompt = `You are analyzing TTRPG campaign notes to find relationships between entities.

Relationship types:
- QuestHasNPC: A quest involves or mentions an NPC
- QuestAtPlace: A quest takes place at or involves a location
- NPCInPlace: An NPC is associated with or located at a place
- Related: General connection between entities

Evidence types:
- Link: There's an explicit link between the notes
- Mention: One note mentions the other by name
- Heuristic: Inferred from context (e.g., "the blacksmith" in a city note likely refers to an NPC)

Only report relationships with reasonable confidence. Don't force connections.

Output valid JSON only. No markdown, no explanation outside the JSON.`;

    const notesContext = allNotes.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.inferredType,
    }));

    const batchData = batch.map((note) => ({
      id: note.id,
      title: note.title,
      type: note.inferredType,
      content: note.content.slice(0, 1500),
      links: note.internalLinks.slice(0, 10),
    }));

    const userPrompt = `Find relationships between these notes:

Available notes in the system:
${JSON.stringify(notesContext, null, 2)}

Notes to analyze (find their relationships to other notes):
${JSON.stringify(batchData, null, 2)}

Return a JSON array of relationships:
\`\`\`json
[
  {
    "fromNoteId": "string",
    "toNoteId": "string",
    "relationshipType": "QuestHasNPC" | "QuestAtPlace" | "NPCInPlace" | "Related",
    "confidence": 0.0-1.0,
    "evidenceSnippet": "quoted text or description",
    "evidenceType": "Link" | "Mention" | "Heuristic"
  }
]
\`\`\``;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      return this.parseRelationshipResponse(response);
    } catch (error) {
      console.error("Claude relationship extraction error:", error);
      return [];
    }
  }

  private parseRelationshipResponse(response: Anthropic.Message): RelationshipResult[] {
    try {
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return [];
      }

      let jsonStr = textBlock.text.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr) as Array<{
        fromNoteId: string;
        toNoteId: string;
        relationshipType: string;
        confidence: number;
        evidenceSnippet: string;
        evidenceType: string;
      }>;

      const validRelTypes: RelationshipType[] = ["QuestHasNPC", "QuestAtPlace", "NPCInPlace", "Related"];
      const validEvidenceTypes: EvidenceType[] = ["Link", "Mention", "Heuristic"];

      return parsed
        .filter(
          (item) =>
            item.fromNoteId &&
            item.toNoteId &&
            item.fromNoteId !== item.toNoteId
        )
        .map((item) => ({
          fromNoteId: item.fromNoteId,
          toNoteId: item.toNoteId,
          relationshipType: validRelTypes.includes(item.relationshipType as RelationshipType)
            ? (item.relationshipType as RelationshipType)
            : "Related",
          confidence: Math.max(0, Math.min(1, item.confidence)),
          evidenceSnippet: item.evidenceSnippet || "",
          evidenceType: validEvidenceTypes.includes(item.evidenceType as EvidenceType)
            ? (item.evidenceType as EvidenceType)
            : "Heuristic",
        }));
    } catch (error) {
      console.error("Failed to parse relationship response:", error);
      return [];
    }
  }

  private deduplicateRelationships(relationships: RelationshipResult[]): RelationshipResult[] {
    const seen = new Set<string>();
    return relationships.filter((rel) => {
      // Create a canonical key for bidirectional deduplication
      const ids = [rel.fromNoteId, rel.toNoteId].sort();
      const key = `${ids[0]}-${ids[1]}-${rel.relationshipType}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
