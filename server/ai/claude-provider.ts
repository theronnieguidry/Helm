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

const BATCH_SIZE = 10;
const RATE_LIMIT_DELAY_MS = 150; // Increased from 50ms to avoid rate limiting

export class ClaudeAIProvider implements AIProvider {
  private client: Anthropic;
  private model = "claude-3-haiku-20240307";

  constructor(apiKey?: string) {
    // Anthropic SDK auto-reads ANTHROPIC_API_KEY from env if not provided
    this.client = new Anthropic({ apiKey });
  }

  async classifyNotes(notes: NoteForClassification[], onProgress?: ProgressCallback, options?: ClassificationOptions): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    const batches = this.chunkArray(notes, BATCH_SIZE);
    const total = notes.length;
    let processed = 0;

    // PRD-040: Track classified types from previous batches for context
    const classifiedContext = new Map<string, string[]>([
      ["NPC", []],
      ["Area", []],
      ["Quest", []],
      ["Character", []],
      ["SessionLog", []],
      ["Note", []],
    ]);

    for (const batch of batches) {
      // PRD-035: Report progress before processing batch
      if (onProgress) {
        const firstNoteTitle = batch[0]?.title || "notes";
        onProgress(processed, total, firstNoteTitle);
      }

      // PRD-040: Pass context from previous batches and PC names
      const batchResults = await this.classifyBatch(batch, classifiedContext, options?.playerCharacterNames);

      // PRD-040: Update context with this batch's results for subsequent batches
      for (const result of batchResults) {
        const note = batch.find(n => n.id === result.noteId);
        if (note && result.confidence >= 0.70) {
          const list = classifiedContext.get(result.inferredType);
          if (list && list.length < 15) { // Limit to 15 per category to avoid prompt bloat
            list.push(note.title);
          }
        }
      }

      results.push(...batchResults);
      processed += batch.length;

      // Rate limiting between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(RATE_LIMIT_DELAY_MS);
      }
    }

    // PRD-035: Report final progress
    if (onProgress) {
      onProgress(total, total);
    }

    return results;
  }

  private async classifyBatch(
    notes: NoteForClassification[],
    priorContext?: Map<string, string[]>,
    pcNames?: string[]
  ): Promise<ClassificationResult[]> {
    // PRD-040: Build dynamic system prompt with context and PC names
    const systemPrompt = this.buildClassificationSystemPrompt(priorContext, pcNames);
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

  /**
   * PRD-040: Build system prompt with optional context and PC names
   */
  private buildClassificationSystemPrompt(priorContext?: Map<string, string[]>, pcNames?: string[]): string {
    let prompt = `You are a TTRPG (tabletop roleplaying game) campaign note classifier. Analyze notes from a game master's campaign wiki and classify them.

## Categories
- Character: A player character (PC) controlled by players
- NPC: A non-player character, deity, or named individual (NOT a PC)
- Area: A location, city, building, region, landmark, or geographic feature
- Quest: A task, mission, objective, or storyline to pursue
- SessionLog: A record or summary of a game session that happened
- Note: General reference, rules, world lore, or uncategorizable content

## Title Patterns (strong signals)
- "The [X] District/Square/Inn/Temple/Cathedral/University" → Area (0.90+)
- Single capitalized name like "Kettle" or "Simon" → likely NPC (0.85+)
- Starts with verb: "Find/Visit/Talk to/Meet with/Check" → Quest (0.85+)
- Contains "Session" or date format → SessionLog (0.90+)
- Descriptive phrase about a person → NPC (0.80+)

## Link Patterns (use linkedTitles field)
- Many links to places/NPCs → likely SessionLog or Quest
- Few/no links + descriptive content → likely entity definition (NPC/Area)
- Only links to structural notes (Scene, Places, Done, To do) → index Note
- Note that is mostly markdown links → Note (index page)

## Content Length Patterns (use contentLength field)
- "stub" (<50 chars): Placeholder or empty, classify based on title alone
- "short" (<200 chars): Brief entity description, likely NPC/Area/Note
- "medium" (200-800 chars): Detailed description, check content carefully
- "long" (800+ chars): Narrative content, often SessionLog or detailed Quest

## Confidence Scoring
- 0.90+: Clear category from title pattern or obvious content
- 0.70-0.89: Strong indicators but some ambiguity
- 0.50-0.69: Weak signals, needs human review
- Below 0.50: Very uncertain, mark as Note`;

    // PRD-040: Add PC names context if provided
    if (pcNames && pcNames.length > 0) {
      prompt += `

## Player Characters (PCs) in this campaign
The following are player characters - classify notes primarily about them as "Character":
${pcNames.map(n => `- ${n}`).join('\n')}

All other named individuals should be classified as "NPC".`;
    }

    // PRD-040: Add prior batch context if available
    if (priorContext && this.hasClassifiedContext(priorContext)) {
      prompt += `

## Previously Classified Notes (for context)
This import has already classified some notes. Use this context to identify references:`;
      for (const [type, titles] of priorContext) {
        if (titles.length > 0) {
          prompt += `\n- ${type}s: ${titles.join(", ")}`;
        }
      }
      prompt += `\nIf a note mentions one of these already-classified names, consider that context.`;
    }

    prompt += `

Also extract entity names mentioned (NPCs, locations, quest names).

Output valid JSON only. No markdown, no explanation outside the JSON.`;

    return prompt;
  }

  /**
   * PRD-040: Check if there's any context from prior batches
   */
  private hasClassifiedContext(context: Map<string, string[]>): boolean {
    for (const titles of context.values()) {
      if (titles.length > 0) return true;
    }
    return false;
  }

  private buildClassificationPrompt(notes: NoteForClassification[]): string {
    // PRD-040: Add content length category as classification signal
    const getContentCategory = (len: number) =>
      len < 50 ? 'stub' : len < 200 ? 'short' : len < 800 ? 'medium' : 'long';

    const notesJson = notes.map((note) => ({
      id: note.id,
      title: note.title,
      content: note.content.slice(0, 2000), // Truncate long content
      currentType: note.currentType,
      linkedTitles: note.existingLinks.slice(0, 10), // Limit links
      contentLength: getContentCategory(note.content.length), // stub/short/medium/long
    }));

    return `Classify the following notes. Return a JSON array with one object per note:

\`\`\`json
[
  {
    "noteId": "string",
    "inferredType": "Character" | "NPC" | "Area" | "Quest" | "SessionLog" | "Note",
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
    let rawText: string | undefined;
    try {
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }
      rawText = textBlock.text;

      // PRD-033: Use robust JSON extraction
      let jsonStr = this.extractJsonFromResponse(rawText);

      // Try parsing, with repair on failure
      let parsed: Array<{
        noteId: string;
        inferredType: string;
        confidence: number;
        explanation: string;
        extractedEntities: string[];
      }>;

      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Attempt repair and retry
        const repaired = this.repairJson(jsonStr);
        parsed = JSON.parse(repaired);
      }

      // Map response to results, validating types
      const validTypes: InferredEntityType[] = ["Character", "NPC", "Area", "Quest", "SessionLog", "Note"];

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
      if (rawText) {
        console.error("Raw response text (first 500 chars):", rawText.slice(0, 500));
      }
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

  async extractRelationships(notes: NoteWithClassification[], onProgress?: ProgressCallback): Promise<RelationshipResult[]> {
    if (notes.length < 2) {
      return [];
    }

    const results: RelationshipResult[] = [];
    const batches = this.chunkArray(notes, BATCH_SIZE);
    const total = notes.length;
    let processed = 0;

    for (const batch of batches) {
      // PRD-035: Report progress before processing batch
      if (onProgress) {
        const firstNoteTitle = batch[0]?.title || "notes";
        onProgress(processed, total, firstNoteTitle);
      }

      const batchResults = await this.extractRelationshipsBatch(batch, notes);
      results.push(...batchResults);
      processed += batch.length;

      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(RATE_LIMIT_DELAY_MS);
      }
    }

    // PRD-035: Report final progress
    if (onProgress) {
      onProgress(total, total);
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

    // PRD-040: Group notes by type for clearer context
    const groupedContext = this.groupNotesByType(allNotes);

    const batchData = batch.map((note) => ({
      id: note.id,
      title: note.title,
      type: note.inferredType,
      content: note.content.slice(0, 1500),
      links: note.internalLinks.slice(0, 10),
    }));

    const userPrompt = `Find relationships between these notes:

Available notes by category:
${groupedContext}

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
    let rawText: string | undefined;
    try {
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return [];
      }
      rawText = textBlock.text;

      // PRD-033: Use robust JSON extraction
      let jsonStr = this.extractJsonFromResponse(rawText);

      // Try parsing, with repair on failure
      let parsed: Array<{
        fromNoteId: string;
        toNoteId: string;
        relationshipType: string;
        confidence: number;
        evidenceSnippet: string;
        evidenceType: string;
      }>;

      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Attempt repair and retry
        const repaired = this.repairJson(jsonStr);
        parsed = JSON.parse(repaired);
      }

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
      if (rawText) {
        console.error("Raw response text (first 500 chars):", rawText.slice(0, 500));
      }
      return [];
    }
  }

  /**
   * PRD-040: Group notes by type for clearer relationship context
   */
  private groupNotesByType(notes: NoteWithClassification[]): string {
    const groups: Record<string, string[]> = {
      "NPC": [],
      "Character": [],
      "Area": [],
      "Quest": [],
      "SessionLog": [],
      "Note": [],
    };

    for (const note of notes) {
      const group = groups[note.inferredType];
      if (group) {
        group.push(`${note.title} (id: ${note.id})`);
      }
    }

    return Object.entries(groups)
      .filter(([_, titles]) => titles.length > 0)
      .map(([type, titles]) => `${type}s:\n  - ${titles.join("\n  - ")}`)
      .join("\n\n");
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

  /**
   * PRD-033: Robust JSON extraction from LLM responses
   * Handles text preambles, markdown code blocks, and raw JSON
   */
  private extractJsonFromResponse(text: string): string {
    const trimmed = text.trim();

    // Strategy 1: Extract from markdown code block
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Strategy 2: Find JSON array/object boundaries
    // Handle text preambles like "Here is the result: [...]"
    const jsonStartArray = trimmed.indexOf('[');
    const jsonStartObject = trimmed.indexOf('{');

    if (jsonStartArray === -1 && jsonStartObject === -1) {
      throw new Error('No JSON structure found in response');
    }

    const jsonStart = jsonStartArray === -1 ? jsonStartObject :
                      jsonStartObject === -1 ? jsonStartArray :
                      Math.min(jsonStartArray, jsonStartObject);

    // Find matching closing bracket (handling nesting)
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = jsonStart; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '[' || char === '{') depth++;
      if (char === ']' || char === '}') depth--;

      if (depth === 0) {
        return trimmed.slice(jsonStart, i + 1);
      }
    }

    // If we get here, JSON is incomplete - return what we found
    return trimmed.slice(jsonStart);
  }

  /**
   * PRD-033: Repair common JSON issues from LLM responses
   */
  private repairJson(jsonStr: string): string {
    let repaired = jsonStr;

    // Fix unescaped quotes in string values FIRST (before other repairs)
    repaired = this.repairUnescapedQuotes(repaired);

    // Fix trailing commas before closing brackets
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    // Fix missing commas between properties (heuristic)
    // "value"\n  "key" -> "value",\n  "key"
    repaired = repaired.replace(/("|\d|true|false|null)\s*\n(\s*")/g, '$1,\n$2');

    return repaired;
  }

  /**
   * PRD-033: Repair unescaped quotes inside JSON string values.
   * Uses contextual heuristics to distinguish structural quotes from embedded quotes.
   */
  private repairUnescapedQuotes(jsonStr: string): string {
    const result: string[] = [];
    let inString = false;
    let i = 0;

    while (i < jsonStr.length) {
      const char = jsonStr[i];

      // Handle already-escaped characters - pass through unchanged
      if (char === '\\' && i + 1 < jsonStr.length) {
        result.push(char, jsonStr[i + 1]);
        i += 2;
        continue;
      }

      // PRD-033: Escape literal control characters inside strings
      // JSON doesn't allow raw newlines, tabs, or carriage returns in string values
      if (inString) {
        if (char === '\n') {
          result.push('\\n');
          i++;
          continue;
        }
        if (char === '\r') {
          result.push('\\r');
          i++;
          continue;
        }
        if (char === '\t') {
          result.push('\\t');
          i++;
          continue;
        }
      }

      // Not a quote - just append
      if (char !== '"') {
        result.push(char);
        i++;
        continue;
      }

      // Quote handling: determine if structural or embedded
      if (!inString) {
        // We're outside a string - treat any quote as a structural opener
        // (Missing comma scenarios will be handled by other repairs)
        inString = true;
        result.push('"');
      } else {
        // We're inside a string, seeing a quote
        const after = this.getFollowingNonWhitespace(jsonStr, i);
        if (this.isValidStringCloser(after)) {
          // Valid closer - close the string
          inString = false;
          result.push('"');
        } else {
          // Not followed by structural char - this is an embedded quote
          result.push('\\"');
        }
      }
      i++;
    }

    return result.join('');
  }

  /**
   * Get the first non-whitespace character after the given position
   */
  private getFollowingNonWhitespace(str: string, pos: number): string {
    for (let i = pos + 1; i < str.length; i++) {
      if (!/\s/.test(str[i])) return str[i];
    }
    return '';
  }

  /**
   * Check if a character is a valid context after closing a JSON string
   * (before } ] : , or at end of input)
   */
  private isValidStringCloser(after: string): boolean {
    return after === '' || ['}', ']', ':', ','].includes(after);
  }

  // PRD-026: Entity Extraction Implementation

  async extractEntities(content: string, existingNotes?: NoteReference[]): Promise<EntityExtractionResult> {
    if (!content.trim()) {
      return { entities: [], relationships: [] };
    }

    const systemPrompt = this.buildEntityExtractionSystemPrompt(existingNotes);
    const userPrompt = this.buildEntityExtractionUserPrompt(content);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      return this.parseEntityExtractionResponse(response);
    } catch (error) {
      console.error("Claude entity extraction error:", error);
      return { entities: [], relationships: [] };
    }
  }

  private buildEntityExtractionSystemPrompt(existingNotes?: NoteReference[]): string {
    let prompt = `You are analyzing TTRPG (tabletop roleplaying game) session notes to extract entities and relationships.

## Entity Types
- npc: Named characters, deities, historical figures, or any named individual (not player characters)
- place: Locations, regions, buildings, geographic features, cities, towns, landmarks
- quest: Missions, tasks, objectives, storylines the players might pursue
- item: Named artifacts, weapons, magical items, significant objects
- faction: Organizations, groups, guilds, kingdoms, armies, cults

## Guidelines
1. **Titled References**: "the Captain", "the Baron" likely refer to previously mentioned titled entities - merge them
2. **Possessives**: "Duke's son" means the Duke entity exists
3. **Context Matters**: "Iron" could be a blacksmith name or a material - use narrative context
4. **Relationship Types**: Common relationships include "son of", "member of", "located in", "rules", "works for", "enemy of"
5. **Confidence Scoring**:
   - 0.90+: Explicit names with clear type (e.g., "Baron Chilton" = npc, "Misty Vale" = place)
   - 0.70-0.89: Strong contextual indicators (e.g., "the blacksmith" in a town context)
   - 0.50-0.69: Inferred from weak signals
   - Below 0.50: Don't include
6. **Deduplication**: If the same entity appears multiple times (e.g., "Captain Garner" and "the Captain"), report once with the full name

## Important
- Extract ALL named entities, not just the main characters
- Count mentions accurately (how many times each entity is referenced)
- Only report relationships you're confident about
- Output valid JSON only. No markdown code fences, no explanation outside the JSON.`;

    if (existingNotes && existingNotes.length > 0) {
      prompt += `\n\n## Existing Notes (try to match entities to these)
${JSON.stringify(existingNotes.slice(0, 50).map(n => ({ id: n.id, title: n.title, type: n.noteType })), null, 2)}`;
    }

    return prompt;
  }

  private buildEntityExtractionUserPrompt(content: string): string {
    // Truncate very long content while keeping context
    const truncatedContent = content.length > 8000 ? content.slice(0, 8000) + "..." : content;

    return `Extract all entities and their relationships from this session note content:

---
${truncatedContent}
---

Return a JSON object with this exact structure:
{
  "entities": [
    {
      "name": "Entity Name",
      "type": "npc" | "place" | "quest" | "item" | "faction",
      "confidence": 0.0-1.0,
      "mentions": number,
      "context": "brief description of who/what this is",
      "matchedNoteId": "note-id or null if no match"
    }
  ],
  "relationships": [
    {
      "entity1": "Entity Name 1",
      "entity2": "Entity Name 2",
      "relationship": "description of relationship",
      "confidence": 0.0-1.0
    }
  ]
}`;
  }

  private parseEntityExtractionResponse(response: Anthropic.Message): EntityExtractionResult {
    let rawText: string | undefined;
    try {
      const textBlock = response.content.find((block: { type: string }) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }
      rawText = textBlock.text;

      // PRD-033: Use robust JSON extraction
      let jsonStr = this.extractJsonFromResponse(rawText);

      // Try parsing, with repair on failure
      let parsed: {
        entities: Array<{
          name: string;
          type: string;
          confidence: number;
          mentions: number;
          context?: string;
          matchedNoteId?: string | null;
        }>;
        relationships: Array<{
          entity1: string;
          entity2: string;
          relationship: string;
          confidence: number;
        }>;
      };

      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Attempt repair and retry
        const repaired = this.repairJson(jsonStr);
        parsed = JSON.parse(repaired);
      }

      // Validate and normalize entity types
      const validTypes = ["npc", "place", "quest", "item", "faction"] as const;

      const entities: ExtractedEntity[] = (parsed.entities || [])
        .filter(e => e.name && e.type && e.confidence >= 0.5)
        .map(e => ({
          name: e.name,
          type: validTypes.includes(e.type as typeof validTypes[number])
            ? (e.type as ExtractedEntity["type"])
            : "npc",
          confidence: Math.max(0, Math.min(1, e.confidence)),
          mentions: Math.max(1, e.mentions || 1),
          context: e.context || undefined,
          matchedNoteId: e.matchedNoteId || undefined,
        }));

      const relationships: EntityRelationship[] = (parsed.relationships || [])
        .filter(r => r.entity1 && r.entity2 && r.relationship && r.confidence >= 0.5)
        .map(r => ({
          entity1: r.entity1,
          entity2: r.entity2,
          relationship: r.relationship,
          confidence: Math.max(0, Math.min(1, r.confidence)),
        }));

      return { entities, relationships };
    } catch (error) {
      console.error("Failed to parse entity extraction response:", error);
      if (rawText) {
        console.error("Raw response text (first 500 chars):", rawText.slice(0, 500));
      }
      return { entities: [], relationships: [] };
    }
  }
}
