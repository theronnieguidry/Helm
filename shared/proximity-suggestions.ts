/**
 * Proximity Suggestions for Entity Relationships (PRD-006)
 *
 * Analyzes entity mentions in content to suggest related entities
 * based on their proximity within the same content blocks.
 */

import type { DetectedEntity, EntityMention } from "./entity-detection";

export interface ProximitySuggestion {
  entityId: string;
  entityText: string;
  relatedEntities: Array<{
    entityId: string;
    entityText: string;
    distance: number;
    confidence: "high" | "medium" | "low";
    context: string;
  }>;
}

export interface ExistingNote {
  id: string;
  title: string;
  noteType: string;
}

// Distance thresholds for confidence levels (in characters)
const PROXIMITY_THRESHOLDS = {
  high: 100, // Within 100 characters
  medium: 300, // Within 300 characters
  low: 600, // Within 600 characters
};

/**
 * Calculate the character distance between two mentions.
 */
function calculateDistance(mention1: EntityMention, mention2: EntityMention): number {
  // If mentions are in different blocks, return a large distance
  if (mention1.blockId !== mention2.blockId && mention1.blockId && mention2.blockId) {
    return Number.MAX_SAFE_INTEGER;
  }

  // Calculate the minimum distance between the two mentions
  const start1 = mention1.startOffset;
  const end1 = mention1.endOffset;
  const start2 = mention2.startOffset;
  const end2 = mention2.endOffset;

  // Check for overlap
  if (start1 <= end2 && start2 <= end1) {
    return 0;
  }

  // Calculate gap between mentions
  if (end1 < start2) {
    return start2 - end1;
  } else {
    return start1 - end2;
  }
}

/**
 * Get confidence level based on distance.
 */
function getConfidenceFromDistance(distance: number): "high" | "medium" | "low" | null {
  if (distance <= PROXIMITY_THRESHOLDS.high) {
    return "high";
  } else if (distance <= PROXIMITY_THRESHOLDS.medium) {
    return "medium";
  } else if (distance <= PROXIMITY_THRESHOLDS.low) {
    return "low";
  }
  return null;
}

/**
 * Extract context around a mention from the original text.
 */
function extractContext(
  content: string,
  mention: EntityMention,
  contextLength: number = 50
): string {
  const start = Math.max(0, mention.startOffset - contextLength);
  const end = Math.min(content.length, mention.endOffset + contextLength);

  let context = content.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) {
    context = "..." + context;
  }
  if (end < content.length) {
    context = context + "...";
  }

  return context;
}

/**
 * Find proximity suggestions for a set of detected entities.
 *
 * @param entities - Array of detected entities with their mentions
 * @param contentMap - Map of blockId to content string (for context extraction)
 * @returns Array of proximity suggestions
 */
export function findProximitySuggestions(
  entities: DetectedEntity[],
  contentMap: Map<string, string> | string
): ProximitySuggestion[] {
  const suggestions: ProximitySuggestion[] = [];

  // Convert single string to map
  const contentLookup: Map<string, string> =
    typeof contentMap === "string"
      ? new Map([["default", contentMap]])
      : contentMap;

  // Compare each entity with all others
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const relatedEntities: ProximitySuggestion["relatedEntities"] = [];

    for (let j = 0; j < entities.length; j++) {
      if (i === j) continue; // Skip self-comparison

      const otherEntity = entities[j];

      // Find minimum distance between any pair of mentions
      let minDistance = Number.MAX_SAFE_INTEGER;
      let closestMentions: [EntityMention, EntityMention] | null = null;

      for (const mention1 of entity.mentions) {
        for (const mention2 of otherEntity.mentions) {
          const distance = calculateDistance(mention1, mention2);
          if (distance < minDistance) {
            minDistance = distance;
            closestMentions = [mention1, mention2];
          }
        }
      }

      const confidence = getConfidenceFromDistance(minDistance);

      if (confidence && closestMentions) {
        // Extract context from the appropriate content block
        const blockId = closestMentions[0].blockId || "default";
        const content = contentLookup.get(blockId) || "";

        relatedEntities.push({
          entityId: otherEntity.id,
          entityText: otherEntity.text,
          distance: minDistance,
          confidence,
          context: extractContext(content, closestMentions[0]),
        });
      }
    }

    // Only include entities that have related entities
    if (relatedEntities.length > 0) {
      // Sort by distance (closest first)
      relatedEntities.sort((a, b) => a.distance - b.distance);

      suggestions.push({
        entityId: entity.id,
        entityText: entity.text,
        relatedEntities,
      });
    }
  }

  return suggestions;
}

/**
 * Suggest potential links between detected entities and existing notes.
 */
export function suggestEntityLinks(
  entities: DetectedEntity[],
  existingNotes: ExistingNote[]
): Map<string, ExistingNote[]> {
  const suggestions = new Map<string, ExistingNote[]>();

  for (const entity of entities) {
    const normalizedEntityText = entity.normalizedText.toLowerCase();
    const matchingNotes: ExistingNote[] = [];

    for (const note of existingNotes) {
      const normalizedTitle = note.title.toLowerCase();

      // Exact match
      if (normalizedTitle === normalizedEntityText) {
        matchingNotes.push(note);
        continue;
      }

      // Partial match (entity text is contained in note title or vice versa)
      if (
        normalizedTitle.includes(normalizedEntityText) ||
        normalizedEntityText.includes(normalizedTitle)
      ) {
        matchingNotes.push(note);
        continue;
      }

      // Word-level match (any word matches)
      const entityWords = normalizedEntityText.split(/\s+/);
      const titleWords = normalizedTitle.split(/\s+/);

      for (const entityWord of entityWords) {
        if (entityWord.length > 3 && titleWords.some((tw) => tw === entityWord)) {
          matchingNotes.push(note);
          break;
        }
      }
    }

    if (matchingNotes.length > 0) {
      suggestions.set(entity.id, matchingNotes);
    }
  }

  return suggestions;
}

/**
 * Group entities by their type for organized display.
 */
export function groupEntitiesByType(
  entities: DetectedEntity[]
): Map<string, DetectedEntity[]> {
  const groups = new Map<string, DetectedEntity[]>();

  for (const entity of entities) {
    const type = entity.type;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(entity);
  }

  return groups;
}

/**
 * Calculate relationship strength between two entities based on
 * their co-occurrence frequency and proximity.
 */
export function calculateRelationshipStrength(
  entity1: DetectedEntity,
  entity2: DetectedEntity,
  contentMap: Map<string, string> | string
): number {
  let totalScore = 0;

  // Co-occurrence in same blocks
  const entity1Blocks = new Set(entity1.mentions.map((m) => m.blockId || "default"));
  const entity2Blocks = new Set(entity2.mentions.map((m) => m.blockId || "default"));
  const sharedBlocks = [...entity1Blocks].filter((b) => entity2Blocks.has(b));
  totalScore += sharedBlocks.length * 10;

  // Proximity score
  for (const mention1 of entity1.mentions) {
    for (const mention2 of entity2.mentions) {
      const distance = calculateDistance(mention1, mention2);
      if (distance <= PROXIMITY_THRESHOLDS.high) {
        totalScore += 5;
      } else if (distance <= PROXIMITY_THRESHOLDS.medium) {
        totalScore += 3;
      } else if (distance <= PROXIMITY_THRESHOLDS.low) {
        totalScore += 1;
      }
    }
  }

  // Frequency bonus
  totalScore += Math.min(entity1.frequency, entity2.frequency);

  return totalScore;
}
