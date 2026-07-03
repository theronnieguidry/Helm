import { detectEntities, matchEntitiesToNotes, type DetectedEntity, type EntityType } from "./entity-detection";
import { findProximitySuggestions } from "./proximity-suggestions";
import type { Note, NoteType, RelationshipType } from "./schema";
import {
  canonicalizeSourceBlockId,
  computeSourceContentHash,
  computeStableHash,
  normalizeContentForHash,
} from "./text-hash";

export type CleanupSuggestionMode = "baseline" | "ai";

export interface CleanupMatchNote {
  id: string;
  title: string;
  noteType: NoteType;
}

export interface CleanupExistingEntityMatch {
  entityId: string;
  notes: CleanupMatchNote[];
}

export type ConfidenceBucket = "HIGH" | "REVIEW" | "LOW";

export interface CleanupRelationshipSuggestion {
  id: string;
  fromEntityId: string;
  fromEntityText: string;
  toEntityId: string;
  toEntityText: string;
  fromNoteId: string | null;
  toNoteId: string | null;
  relationshipType: Exclude<RelationshipType, "None">;
  evidenceType: "Mention";
  confidence: number;
  confidenceBucket: ConfidenceBucket;
  snippetText: string;
  sourceBlockId: string;
  requiresResolution: boolean;
}

export interface CleanupQuestSuggestion {
  id: string;
  proposedQuestTitle: string;
  snippetText: string;
  startOffset: number;
  endOffset: number;
  existingQuestMatches: CleanupMatchNote[];
  suggestedNpcNoteId: string | null;
  suggestedAreaNoteId: string | null;
}

export interface CleanupSuggestionsResponse {
  sourceContentHash: string;
  generatedAt: string;
  entities: DetectedEntity[];
  existingMatches: CleanupExistingEntityMatch[];
  relationshipSuggestions: CleanupRelationshipSuggestion[];
  questSuggestions: CleanupQuestSuggestion[];
}

export interface BuildCleanupSuggestionsInput {
  content: string;
  existingNotes: Note[];
  includeLow: boolean;
  mode: CleanupSuggestionMode;
}

/**
 * PRD-048 FR-4: seed content for entities created from session mentions so new
 * entity pages are never blank. Only intended for use when content is empty.
 */
export function buildFirstSeenSeed(sessionLabel: string, snippet: string): string {
  const trimmed = snippet.trim();
  const truncated = trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
  return `## First seen\n- Session ${sessionLabel}: "${truncated}"`;
}

const QUEST_ACTION_PATTERNS = [
  /\b(Find|Defeat|Retrieve|Rescue|Discover|Destroy|Recover|Investigate|Escort)\s+the\s+([A-Za-z][^.!?\n]{2,90})/g,
  /\b(Find|Defeat|Retrieve|Rescue|Discover|Destroy|Recover|Investigate|Escort)\s+([A-Z][A-Za-z0-9' -]{2,90})/g,
];

function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return slug || "entity";
}

function confidenceValue(level: "high" | "medium" | "low"): number {
  if (level === "high") return 0.85;
  if (level === "medium") return 0.72;
  return 0.58;
}

export function confidenceBucket(confidence: number): ConfidenceBucket {
  if (confidence >= 0.8) return "HIGH";
  if (confidence >= 0.65) return "REVIEW";
  return "LOW";
}

function isAreaType(noteType: string): boolean {
  return noteType === "area" || noteType === "poi";
}

function isNpcType(noteType: string): boolean {
  return noteType === "npc" || noteType === "character";
}

function inferredTypeFromEntity(entityType: EntityType): NoteType {
  if (entityType === "quest") return "quest";
  if (entityType === "place") return "area";
  return "npc";
}

export function inferRelationshipTypeForNoteTypes(
  fromType: string,
  toType: string,
): { relationshipType: Exclude<RelationshipType, "None">; swap: boolean } {
  if (fromType === "quest" && isNpcType(toType)) {
    return { relationshipType: "QuestHasNPC", swap: false };
  }
  if (toType === "quest" && isNpcType(fromType)) {
    return { relationshipType: "QuestHasNPC", swap: true };
  }
  if (fromType === "quest" && isAreaType(toType)) {
    return { relationshipType: "QuestAtPlace", swap: false };
  }
  if (toType === "quest" && isAreaType(fromType)) {
    return { relationshipType: "QuestAtPlace", swap: true };
  }
  if (isNpcType(fromType) && isAreaType(toType)) {
    return { relationshipType: "NPCInPlace", swap: false };
  }
  if (isNpcType(toType) && isAreaType(fromType)) {
    return { relationshipType: "NPCInPlace", swap: true };
  }

  return { relationshipType: "Related", swap: false };
}

function sentenceWindow(content: string, index: number): string {
  const start = Math.max(0, index - 200);
  const end = Math.min(content.length, index + 200);
  const slice = content.slice(start, end).trim();
  return slice.length > 240 ? `${slice.slice(0, 237)}...` : slice;
}

function deterministicEntities(content: string): DetectedEntity[] {
  const entities = detectEntities(content);
  const sorted = [...entities].sort((a, b) => {
    const aStart = a.mentions[0]?.startOffset ?? 0;
    const bStart = b.mentions[0]?.startOffset ?? 0;
    if (aStart !== bStart) return aStart - bStart;
    const textCmp = a.normalizedText.localeCompare(b.normalizedText);
    if (textCmp !== 0) return textCmp;
    return a.type.localeCompare(b.type);
  });

  const counts = new Map<string, number>();
  return sorted.map((entity) => {
    const key = `${entity.normalizedText}:${entity.type}`;
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);
    return {
      ...entity,
      id: `entity:${toSlug(entity.normalizedText)}:${count}`,
      mentions: [...entity.mentions],
    };
  });
}

function buildEntityMatches(
  entities: DetectedEntity[],
  existingNotes: Note[],
): {
  existingMatches: CleanupExistingEntityMatch[];
  notesByEntityId: Map<string, CleanupMatchNote[]>;
} {
  const sortedNotes = [...existingNotes]
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

  const matchMap = matchEntitiesToNotes(
    entities,
    sortedNotes.map((note) => ({ id: note.id, title: note.title, noteType: note.noteType })),
  );

  const notesByEntityId = new Map<string, CleanupMatchNote[]>();
  const existingMatches: CleanupExistingEntityMatch[] = [];

  for (const entity of entities) {
    const matchedIds = matchMap.get(entity.id) || [];
    if (matchedIds.length === 0) continue;

    const matchedNotes = sortedNotes
      .filter((note) => matchedIds.includes(note.id))
      .map((note) => ({ id: note.id, title: note.title, noteType: note.noteType }));

    if (matchedNotes.length === 0) continue;

    notesByEntityId.set(entity.id, matchedNotes);
    existingMatches.push({
      entityId: entity.id,
      notes: matchedNotes,
    });
  }

  return { existingMatches, notesByEntityId };
}

function buildRelationshipSuggestions(
  content: string,
  entities: DetectedEntity[],
  notesByEntityId: Map<string, CleanupMatchNote[]>,
  includeLow: boolean,
): CleanupRelationshipSuggestion[] {
  const suggestions = findProximitySuggestions(entities, content);
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const bestByPair = new Map<string, CleanupRelationshipSuggestion>();

  for (const source of suggestions) {
    const sourceEntity = entityById.get(source.entityId);
    if (!sourceEntity) continue;

    for (const related of source.relatedEntities) {
      const targetEntity = entityById.get(related.entityId);
      if (!targetEntity) continue;

      const pairKey = [sourceEntity.id, targetEntity.id].sort().join("|");
      const score = confidenceValue(related.confidence);
      if (!includeLow && score < 0.65) continue;

      const sourceNote = notesByEntityId.get(sourceEntity.id)?.[0] || null;
      const targetNote = notesByEntityId.get(targetEntity.id)?.[0] || null;

      const fromType = sourceNote?.noteType || inferredTypeFromEntity(sourceEntity.type);
      const toType = targetNote?.noteType || inferredTypeFromEntity(targetEntity.type);
      const inferred = inferRelationshipTypeForNoteTypes(fromType, toType);

      let fromEntity = sourceEntity;
      let toEntity = targetEntity;
      let fromNoteId = sourceNote?.id || null;
      let toNoteId = targetNote?.id || null;

      if (inferred.swap) {
        fromEntity = targetEntity;
        toEntity = sourceEntity;
        fromNoteId = targetNote?.id || null;
        toNoteId = sourceNote?.id || null;
      }

      if (
        inferred.relationshipType === "Related" &&
        fromNoteId &&
        toNoteId &&
        fromNoteId.localeCompare(toNoteId) > 0
      ) {
        [fromEntity, toEntity] = [toEntity, fromEntity];
        [fromNoteId, toNoteId] = [toNoteId, fromNoteId];
      }

      const snippetText = related.context.length > 240
        ? `${related.context.slice(0, 237)}...`
        : related.context;

      const candidate: CleanupRelationshipSuggestion = {
        id: `rel:${computeStableHash(`${pairKey}|${inferred.relationshipType}`)}`,
        fromEntityId: fromEntity.id,
        fromEntityText: fromEntity.text,
        toEntityId: toEntity.id,
        toEntityText: toEntity.text,
        fromNoteId,
        toNoteId,
        relationshipType: inferred.relationshipType,
        evidenceType: "Mention",
        confidence: score,
        confidenceBucket: confidenceBucket(score),
        snippetText,
        sourceBlockId: canonicalizeSourceBlockId(undefined, snippetText, null, null),
        requiresResolution: !(fromNoteId && toNoteId),
      };

      const existing = bestByPair.get(pairKey);
      if (!existing || candidate.confidence > existing.confidence) {
        bestByPair.set(pairKey, candidate);
      }
    }
  }

  return Array.from(bestByPair.values()).sort(
    (a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id),
  );
}

function buildQuestSuggestions(
  content: string,
  existingNotes: Note[],
  entities: DetectedEntity[],
  notesByEntityId: Map<string, CleanupMatchNote[]>,
): CleanupQuestSuggestion[] {
  const suggestions: CleanupQuestSuggestion[] = [];
  const seenTitles = new Set<string>();

  const npcMatches: Array<{ noteId: string; position: number }> = [];
  const areaMatches: Array<{ noteId: string; position: number }> = [];

  for (const entity of entities) {
    const note = notesByEntityId.get(entity.id)?.[0];
    if (!note) continue;
    const firstMention = entity.mentions[0]?.startOffset ?? 0;

    if (isNpcType(note.noteType)) {
      npcMatches.push({ noteId: note.id, position: firstMention });
    } else if (isAreaType(note.noteType)) {
      areaMatches.push({ noteId: note.id, position: firstMention });
    }
  }

  for (const pattern of QUEST_ACTION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = null;

    while ((match = pattern.exec(content)) !== null) {
      const verb = match[1].trim();
      const subject = match[2].trim().replace(/[.,;:!?]+$/, "");
      const title = `${verb} ${subject}`.replace(/\s+/g, " ").trim();
      const titleKey = title.toLowerCase();
      if (!title || seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;
      const snippetText = sentenceWindow(content, startOffset);

      const existingQuestMatches = existingNotes
        .filter((note) => note.noteType === "quest")
        .filter((note) => {
          const normalizedTitle = note.title.toLowerCase();
          return normalizedTitle.includes(titleKey) || titleKey.includes(normalizedTitle);
        })
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
        .slice(0, 5)
        .map((note) => ({ id: note.id, title: note.title, noteType: note.noteType }));

      const nearestByPosition = (items: Array<{ noteId: string; position: number }>): string | null => {
        if (items.length === 0) return null;
        const nearest = [...items].sort(
          (a, b) => Math.abs(a.position - startOffset) - Math.abs(b.position - startOffset),
        )[0];
        return nearest?.noteId || null;
      };

      suggestions.push({
        id: `quest:${computeStableHash(`${title}|${startOffset}|${endOffset}`)}`,
        proposedQuestTitle: title,
        snippetText,
        startOffset,
        endOffset,
        existingQuestMatches,
        suggestedNpcNoteId: nearestByPosition(npcMatches),
        suggestedAreaNoteId: nearestByPosition(areaMatches),
      });
    }
  }

  return suggestions.sort((a, b) => a.startOffset - b.startOffset || a.id.localeCompare(b.id));
}

export function buildCleanupSuggestions(
  input: BuildCleanupSuggestionsInput,
): CleanupSuggestionsResponse {
  const normalizedContent = normalizeContentForHash(input.content || "");
  const entities = deterministicEntities(normalizedContent);
  const { existingMatches, notesByEntityId } = buildEntityMatches(entities, input.existingNotes);
  const relationshipSuggestions = buildRelationshipSuggestions(
    normalizedContent,
    entities,
    notesByEntityId,
    input.includeLow,
  );

  // The current implementation is deterministic heuristics; mode is reserved for AI variants.
  const questSuggestions = buildQuestSuggestions(
    normalizedContent,
    input.existingNotes,
    entities,
    notesByEntityId,
  );

  return {
    sourceContentHash: computeSourceContentHash(normalizedContent),
    generatedAt: new Date().toISOString(),
    entities,
    existingMatches,
    relationshipSuggestions,
    questSuggestions,
  };
}
