/**
 * Entity Detection for Session Logs (PRD-002)
 *
 * Client-side pattern detection for identifying potential entities in session log content.
 * Detects proper nouns, titles, and common TTRPG naming patterns.
 */

export type EntityType = "npc" | "place" | "quest";

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
  "lieutenant", "sergeant", "corporal", "admiral", "colonel", "major",
];

// Words that indicate a place
const PLACE_INDICATORS = [
  "city", "town", "village", "kingdom", "realm", "land", "forest",
  "mountain", "river", "lake", "sea", "ocean", "island", "cave",
  "dungeon", "castle", "tower", "temple", "shrine", "tavern", "inn",
  "shop", "market", "road", "path", "bridge", "gate", "wall", "ruins",
  "vale", "valley", "landing", "harbor", "port", "keep", "stronghold",
  "fortress", "camp", "barony", "duchy", "county", "province", "region",
];

// Patterns for detecting entities
const PERSON_PATTERNS = [
  // "Lord/Lady/Sir X" patterns
  /\b(Lord|Lady|Sir|Dame|King|Queen|Prince|Princess|Duke|Duchess|Count|Countess|Baron|Baroness|Captain|Commander|General|Master|Mistress|Father|Mother|Brother|Sister|Elder|High|Grand|Chief|Lieutenant|Sergeant|Corporal|Admiral|Colonel|Major)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  // "X the Y" patterns (e.g., "Ragnar the Bold")
  /\b([A-Z][a-z]+)\s+the\s+([A-Z][a-z]+)/g,
];

const PLACE_PATTERNS = [
  // "The X" patterns for places (e.g., "The Silvermoon Tavern")
  // Note: Using /g not /gi to preserve case-sensitivity for [A-Z][a-z]+ name matching
  /\bThe\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(City|Town|Village|Kingdom|Realm|Forest|Mountain|River|Lake|Cave|Dungeon|Castle|Tower|Temple|Shrine|Tavern|Inn|Ruins|Vale|Valley|Landing|Harbor|Port|Keep|Stronghold|Fortress|Camp|Barony|Duchy|County|Province|Region)/g,
  // "City/Town/etc of X" patterns
  /\b(City|Town|Village|Kingdom|Realm|Forest|Mountain|Vale|Valley|Barony|Duchy|County|Province|Region)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
  // Place names with indicators
  /\b([A-Z][a-z]+(?:'s)?)\s+(City|Town|Village|Kingdom|Realm|Forest|Mountain|River|Lake|Cave|Dungeon|Castle|Tower|Temple|Shrine|Tavern|Inn|Ruins|Vale|Valley|Landing|Harbor|Port|Keep|Stronghold|Fortress|Camp|Barony|Duchy|County|Province|Region)/g,
];

const QUEST_PATTERNS = [
  // Quest-related phrases
  // Note: Using /g not /gi to preserve case-sensitivity for [A-Z][a-z]+ name matching
  /\b(Quest|Mission|Task|Hunt|Search|Journey)\s+(?:for|to|of)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
  // "Find/Defeat/Retrieve the X" patterns
  /\b(Find|Defeat|Retrieve|Rescue|Discover|Destroy|Recover)\s+the\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
];

// Proper noun pattern (capitalized words not at sentence start)
const PROPER_NOUN_PATTERN = /(?<=[.!?]\s+|^)([A-Z][a-z]+)|(?<=[a-z]\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;

function generateEntityId(): string {
  return `entity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/['']s$/, "")   // Remove trailing possessive 's (handles both straight and curly quotes)
    .replace(/s['']$/, "s"); // Handle plural possessive (Joneses' -> joneses)
}

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}

function isActionWord(word: string): boolean {
  return ACTION_WORDS.has(word.toLowerCase());
}

// BUG-6 fix: Validate that text looks like a valid entity name
function isValidEntityName(text: string): boolean {
  const words = text.split(/\s+/);

  // Reject names longer than 5 words
  if (words.length > 5) {
    return false;
  }

  // Reject if contains sentence fragment indicators in the middle
  const fragmentIndicators = ["and", "or", "the", "is", "are", "was", "were", "of", "to", "in"];
  for (let i = 1; i < words.length - 1; i++) {
    if (fragmentIndicators.includes(words[i].toLowerCase())) {
      return false;
    }
  }

  return true;
}

// BUG-4 fix + PRD-025 BUG-2: Deduplicate entities where one is contained within another
function deduplicateContainedEntities(entities: DetectedEntity[]): DetectedEntity[] {
  // Sort by text length descending (longer entities first)
  const sorted = [...entities].sort((a, b) => b.text.length - a.text.length);
  const toRemove = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    if (toRemove.has(sorted[i].normalizedText)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      if (toRemove.has(sorted[j].normalizedText)) continue;

      const longer = sorted[i];
      const shorter = sorted[j];

      const shorterWords = shorter.normalizedText.split(/\s+/);
      const longerWords = longer.normalizedText.split(/\s+/);

      if (shorterWords.length >= longerWords.length) continue;

      // Check if shorter is a word-suffix of longer (e.g., "Garner" in "Captain Garner")
      const isSuffix = shorterWords.every((word, idx) =>
        longerWords[longerWords.length - shorterWords.length + idx] === word
      );

      // PRD-025 BUG-2: Also check if shorter is a word-prefix of longer (e.g., "Captain" in "Captain Garner")
      const isPrefix = shorterWords.every((word, idx) =>
        longerWords[idx] === word
      );

      if (isSuffix || isPrefix) {
        // Merge mentions from shorter into longer
        longer.mentions.push(...shorter.mentions);
        longer.frequency += shorter.frequency;

        // Upgrade confidence if needed
        if (shorter.confidence === "high" && longer.confidence !== "high") {
          longer.confidence = "high";
        } else if (shorter.confidence === "medium" && longer.confidence === "low") {
          longer.confidence = "medium";
        }

        toRemove.add(shorter.normalizedText);
      }
    }
  }

  return entities.filter(e => !toRemove.has(e.normalizedText));
}

// PRD-025 BUG-3: Merge article-prefixed title references (e.g., "the Baron" → "Baron Chilton")
function mergeArticleTitleReferences(entities: DetectedEntity[]): DetectedEntity[] {
  const toRemove = new Set<string>();

  // Find entities that are just titles (e.g., "captain", "baron", "duke")
  // or article+title (handled by normalization stripping "the ")
  const titleOnlyEntities = entities.filter(e =>
    PERSON_TITLES.includes(e.normalizedText)
  );

  // Find entities that have a title followed by a name (e.g., "captain garner", "baron chilton")
  const titledEntities = entities.filter(e =>
    PERSON_TITLES.some(title =>
      e.normalizedText.startsWith(title + " ") &&
      e.normalizedText.split(/\s+/).length >= 2
    )
  );

  for (const titleOnly of titleOnlyEntities) {
    // Find a titled entity that starts with this title
    const matchingFull = titledEntities.find(e =>
      e.normalizedText.startsWith(titleOnly.normalizedText + " ")
    );

    if (matchingFull) {
      // Merge mentions from title-only into the full titled entity
      matchingFull.mentions.push(...titleOnly.mentions);
      matchingFull.frequency += titleOnly.frequency;
      toRemove.add(titleOnly.normalizedText);
    }
  }

  return entities.filter(e => !toRemove.has(e.normalizedText));
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

  // PRD-025 BUG-1: Track sentence-start candidates for possible inclusion
  const sentenceStartCandidates: Map<string, { count: number; positions: number[] }> = new Map();

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Remove punctuation and possessive suffixes (BUG-7 related)
    const cleanWord = word
      .replace(/['']s$/g, "")  // Remove possessive 's first
      .replace(/[.,!?;:'"()[\]{}]/g, "");

    // Check if this is a capitalized word (potential proper noun)
    if (/^[A-Z][a-z]+$/.test(cleanWord) && !isStopWord(cleanWord) && !isActionWord(cleanWord)) {
      // Skip if it's at the start of a sentence (after period, or first word)
      const precedingText = words.slice(0, i).join(" ");
      const isAtSentenceStart = i === 0 || /[.!?]\s*$/.test(precedingText);
      // BUG-5 fix: Allow comma-separated list items
      const isAfterComma = i > 0 && /,\s*$/.test(precedingText);

      // PRD-025 BUG-1: Track sentence-start words for later consideration
      if (isAtSentenceStart && !isAfterComma) {
        const normalized = cleanWord.toLowerCase();
        const existing = sentenceStartCandidates.get(normalized) || { count: 0, positions: [] };
        existing.count++;
        existing.positions.push(i);
        sentenceStartCandidates.set(normalized, existing);
      }

      if (!isAtSentenceStart || isAfterComma) {
        // Check if followed by more capitalized words (compound name)
        let fullName = cleanWord;
        let endIndex = i;

        while (endIndex + 1 < words.length) {
          // Stop if current word ends a sentence or list item (BUG-1 fix + BUG-5 enhancement)
          const currentWord = words[endIndex];
          if (/[.!?,;]$/.test(currentWord)) {
            break;
          }

          const nextWord = words[endIndex + 1]
            .replace(/['']s$/g, "")  // Remove possessive 's first
            .replace(/[.,!?;:'"()[\]{}]/g, "");
          if (/^[A-Z][a-z]+$/.test(nextWord) && !isStopWord(nextWord)) {
            fullName += " " + nextWord;
            endIndex++;
          } else {
            break;
          }
        }

        const startOffset = text.indexOf(word, offset);
        const endOffset = startOffset + fullName.length;

        // BUG-6 fix: Only add valid entity names
        if (isValidEntityName(fullName)) {
          matches.push({
            text: fullName,
            type: guessEntityType(fullName),
            confidence: "low",
            startOffset,
            endOffset,
            blockId,
          });
        }

        // Skip processed words
        i = endIndex;
      }
    }

    offset = text.indexOf(word, offset) + word.length;
  }

  // PRD-025 BUG-1: Include sentence-start entities that appear multiple times
  for (const [candidate, data] of Array.from(sentenceStartCandidates)) {
    if (data.count >= 2) {
      // Entity appears at sentence start multiple times - likely a real entity
      const capitalizedName = candidate.charAt(0).toUpperCase() + candidate.slice(1);

      // Find the first occurrence's offset
      const firstPos = data.positions[0];
      const firstWord = words[firstPos];
      const startOffset = text.indexOf(firstWord);

      if (isValidEntityName(capitalizedName)) {
        matches.push({
          text: capitalizedName,
          type: guessEntityType(capitalizedName),
          confidence: "low",
          startOffset,
          endOffset: startOffset + capitalizedName.length,
          blockId,
        });
      }
    }
  }

  return matches;
}

function guessEntityType(text: string): EntityType {
  const lowerText = text.toLowerCase();

  // Check for NPC indicators (titles, etc.)
  for (const title of PERSON_TITLES) {
    if (lowerText.startsWith(title + " ") || lowerText.includes(" " + title + " ")) {
      return "npc";
    }
  }

  // Check for place indicators
  for (const indicator of PLACE_INDICATORS) {
    if (lowerText.includes(indicator)) {
      return "place";
    }
  }

  // Default to npc for proper nouns
  return "npc";
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
      ...findPatternMatches(content, PERSON_PATTERNS, "npc", "high"),
      ...findPatternMatches(content, PLACE_PATTERNS, "place", "high"),
      ...findPatternMatches(content, QUEST_PATTERNS, "quest", "medium"),
      ...findProperNouns(content)
    );
  } else {
    // Array of content blocks
    for (const block of content) {
      allMatches.push(
        ...findPatternMatches(block.content, PERSON_PATTERNS, "npc", "high", block.id),
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

  // Convert to array and deduplicate contained entities (BUG-4 fix)
  let entities = Array.from(entityMap.values());
  entities = deduplicateContainedEntities(entities);

  // PRD-025 BUG-3: Merge article-prefixed title references
  entities = mergeArticleTitleReferences(entities);

  // Sort by frequency (higher first), then confidence
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
