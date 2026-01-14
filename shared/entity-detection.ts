/**
 * Entity Detection for Session Logs (PRD-002)
 *
 * Client-side pattern detection for identifying potential entities in session log content.
 * Detects proper nouns, titles, and common TTRPG naming patterns.
 */

export type EntityType = "person" | "place" | "quest";

export interface EntityMention {
  blockId?: string;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface DetectedEntity {
  id: string;
  type: EntityType;
  text: string;
  normalizedText: string;
  confidence: "high" | "medium" | "low";
  mentions: EntityMention[];
  frequency: number;
}

// Common words to exclude from entity detection
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
  "used", "i", "you", "he", "she", "it", "we", "they", "what", "which",
  "who", "whom", "this", "that", "these", "those", "am", "your", "his",
  "her", "its", "our", "their", "if", "then", "else", "when", "where",
  "why", "how", "all", "each", "every", "both", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "also", "now", "here", "there",
  "about", "after", "before", "during", "into", "through", "between",
  "while", "until", "unless", "because", "although", "though", "since",
]);

// Common TTRPG action words that shouldn't be entities
const ACTION_WORDS = new Set([
  "attack", "cast", "roll", "move", "jump", "run", "walk", "fight",
  "kill", "defeat", "escape", "search", "find", "discover", "explore",
  "enter", "leave", "return", "travel", "arrive", "depart", "meet",
  "speak", "talk", "ask", "answer", "say", "tell", "hear", "see",
  "look", "watch", "wait", "rest", "sleep", "wake", "eat", "drink",
  "buy", "sell", "trade", "give", "take", "steal", "hide", "sneak",
]);

// Titles that indicate a person
const PERSON_TITLES = [
  "lord", "lady", "sir", "dame", "king", "queen", "prince", "princess",
  "duke", "duchess", "count", "countess", "baron", "baroness", "captain",
  "commander", "general", "master", "mistress", "father", "mother",
  "brother", "sister", "elder", "high", "grand", "chief", "great",
];

// Words that indicate a place
const PLACE_INDICATORS = [
  "city", "town", "village", "kingdom", "realm", "land", "forest",
  "mountain", "river", "lake", "sea", "ocean", "island", "cave",
  "dungeon", "castle", "tower", "temple", "shrine", "tavern", "inn",
  "shop", "market", "road", "path", "bridge", "gate", "wall", "ruins",
];

// Patterns for detecting entities
const PERSON_PATTERNS = [
  // "Lord/Lady/Sir X" patterns
  /\b(Lord|Lady|Sir|Dame|King|Queen|Prince|Princess|Duke|Duchess|Count|Countess|Baron|Baroness|Captain|Commander|General|Master|Mistress|Father|Mother|Brother|Sister|Elder|High|Grand|Chief)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  // "X the Y" patterns (e.g., "Ragnar the Bold")
  /\b([A-Z][a-z]+)\s+the\s+([A-Z][a-z]+)/g,
];

const PLACE_PATTERNS = [
  // "The X" patterns for places (e.g., "The Silvermoon Tavern")
  /\bThe\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(City|Town|Village|Kingdom|Realm|Forest|Mountain|River|Lake|Cave|Dungeon|Castle|Tower|Temple|Shrine|Tavern|Inn|Ruins)/gi,
  // "City/Town/etc of X" patterns
  /\b(City|Town|Village|Kingdom|Realm|Forest|Mountain)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  // Place names with indicators
  /\b([A-Z][a-z]+(?:'s)?)\s+(City|Town|Village|Kingdom|Realm|Forest|Mountain|River|Lake|Cave|Dungeon|Castle|Tower|Temple|Shrine|Tavern|Inn|Ruins)/gi,
];

const QUEST_PATTERNS = [
  // Quest-related phrases
  /\b(Quest|Mission|Task|Hunt|Search|Journey)\s+(?:for|to|of)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
  // "Find/Defeat/Retrieve the X" patterns
  /\b(Find|Defeat|Retrieve|Rescue|Discover|Destroy|Recover)\s+the\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
];

// Proper noun pattern (capitalized words not at sentence start)
const PROPER_NOUN_PATTERN = /(?<=[.!?]\s+|^)([A-Z][a-z]+)|(?<=[a-z]\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;

function generateEntityId(): string {
  return `entity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}

function isActionWord(word: string): boolean {
  return ACTION_WORDS.has(word.toLowerCase());
}

interface PatternMatch {
  text: string;
  type: EntityType;
  confidence: "high" | "medium" | "low";
  startOffset: number;
  endOffset: number;
  blockId?: string;
}

function findPatternMatches(
  text: string,
  patterns: RegExp[],
  type: EntityType,
  confidence: "high" | "medium" | "low",
  blockId?: string
): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      matches.push({
        text: fullMatch,
        type,
        confidence,
        startOffset: match.index,
        endOffset: match.index + fullMatch.length,
        blockId,
      });
    }
  }

  return matches;
}

function findProperNouns(text: string, blockId?: string): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const words = text.split(/\s+/);
  let offset = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = word.replace(/[.,!?;:'"()[\]{}]/g, "");

    // Check if this is a capitalized word (potential proper noun)
    if (/^[A-Z][a-z]+$/.test(cleanWord) && !isStopWord(cleanWord) && !isActionWord(cleanWord)) {
      // Skip if it's at the start of a sentence (after period, or first word)
      const isAtSentenceStart = i === 0 || /[.!?]\s*$/.test(words.slice(0, i).join(" "));

      if (!isAtSentenceStart) {
        // Check if followed by more capitalized words (compound name)
        let fullName = cleanWord;
        let endIndex = i;

        while (endIndex + 1 < words.length) {
          const nextWord = words[endIndex + 1].replace(/[.,!?;:'"()[\]{}]/g, "");
          if (/^[A-Z][a-z]+$/.test(nextWord) && !isStopWord(nextWord)) {
            fullName += " " + nextWord;
            endIndex++;
          } else {
            break;
          }
        }

        const startOffset = text.indexOf(word, offset);
        const endOffset = startOffset + fullName.length;

        matches.push({
          text: fullName,
          type: guessEntityType(fullName),
          confidence: "low",
          startOffset,
          endOffset,
          blockId,
        });

        // Skip processed words
        i = endIndex;
      }
    }

    offset = text.indexOf(word, offset) + word.length;
  }

  return matches;
}

function guessEntityType(text: string): EntityType {
  const lowerText = text.toLowerCase();

  // Check for person indicators
  for (const title of PERSON_TITLES) {
    if (lowerText.startsWith(title + " ") || lowerText.includes(" " + title + " ")) {
      return "person";
    }
  }

  // Check for place indicators
  for (const indicator of PLACE_INDICATORS) {
    if (lowerText.includes(indicator)) {
      return "place";
    }
  }

  // Default to person for proper nouns
  return "person";
}

export interface ContentBlock {
  id: string;
  content: string;
}

/**
 * Detect potential entities in a text string or array of content blocks.
 */
export function detectEntities(
  content: string | ContentBlock[]
): DetectedEntity[] {
  const allMatches: PatternMatch[] = [];

  if (typeof content === "string") {
    // Single string content
    allMatches.push(
      ...findPatternMatches(content, PERSON_PATTERNS, "person", "high"),
      ...findPatternMatches(content, PLACE_PATTERNS, "place", "high"),
      ...findPatternMatches(content, QUEST_PATTERNS, "quest", "medium"),
      ...findProperNouns(content)
    );
  } else {
    // Array of content blocks
    for (const block of content) {
      allMatches.push(
        ...findPatternMatches(block.content, PERSON_PATTERNS, "person", "high", block.id),
        ...findPatternMatches(block.content, PLACE_PATTERNS, "place", "high", block.id),
        ...findPatternMatches(block.content, QUEST_PATTERNS, "quest", "medium", block.id),
        ...findProperNouns(block.content, block.id)
      );
    }
  }

  // Group matches by normalized text
  const entityMap = new Map<string, DetectedEntity>();

  for (const match of allMatches) {
    const normalized = normalizeText(match.text);

    if (entityMap.has(normalized)) {
      const existing = entityMap.get(normalized)!;
      existing.mentions.push({
        blockId: match.blockId,
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        text: match.text,
      });
      existing.frequency++;

      // Upgrade confidence if we find a higher confidence match
      if (match.confidence === "high" && existing.confidence !== "high") {
        existing.confidence = "high";
      } else if (match.confidence === "medium" && existing.confidence === "low") {
        existing.confidence = "medium";
      }
    } else {
      entityMap.set(normalized, {
        id: generateEntityId(),
        type: match.type,
        text: match.text,
        normalizedText: normalized,
        confidence: match.confidence,
        mentions: [
          {
            blockId: match.blockId,
            startOffset: match.startOffset,
            endOffset: match.endOffset,
            text: match.text,
          },
        ],
        frequency: 1,
      });
    }
  }

  // Convert to array and sort by frequency (higher first), then confidence
  const entities = Array.from(entityMap.values());

  entities.sort((a, b) => {
    // Sort by frequency first
    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }
    // Then by confidence
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
  });

  return entities;
}

/**
 * Filter entities by type.
 */
export function filterEntitiesByType(
  entities: DetectedEntity[],
  type: EntityType
): DetectedEntity[] {
  return entities.filter((e) => e.type === type);
}

/**
 * Filter entities by minimum confidence level.
 */
export function filterEntitiesByConfidence(
  entities: DetectedEntity[],
  minConfidence: "high" | "medium" | "low"
): DetectedEntity[] {
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  const minLevel = confidenceOrder[minConfidence];
  return entities.filter((e) => confidenceOrder[e.confidence] <= minLevel);
}

/**
 * Match detected entities against existing notes.
 */
export function matchEntitiesToNotes(
  entities: DetectedEntity[],
  existingNotes: Array<{ id: string; title: string; noteType: string }>
): Map<string, string[]> {
  const matches = new Map<string, string[]>();

  for (const entity of entities) {
    const normalizedEntity = entity.normalizedText;
    const matchingNotes: string[] = [];

    for (const note of existingNotes) {
      const normalizedTitle = normalizeText(note.title);

      // Check for exact match or substring match
      if (
        normalizedTitle === normalizedEntity ||
        normalizedTitle.includes(normalizedEntity) ||
        normalizedEntity.includes(normalizedTitle)
      ) {
        matchingNotes.push(note.id);
      }
    }

    if (matchingNotes.length > 0) {
      matches.set(entity.id, matchingNotes);
    }
  }

  return matches;
}
