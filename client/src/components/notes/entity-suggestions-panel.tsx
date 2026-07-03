import { useState, useMemo, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Check,
  ExternalLink,
  Zap,
  Wand2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEntityDetection } from "@/hooks/use-entity-detection";
import { useSuggestionPersistence } from "@/hooks/use-suggestion-persistence";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { EntitySuggestionCard, ENTITY_TO_NOTE_TYPE } from "./entity-suggestion-card";
import { ProximityAssociations } from "./proximity-associations";
import {
  RelationshipSuggestionsSection,
  type RelationshipSuggestionStatus,
} from "./relationship-suggestions-section";
import {
  QuestPromotionSection,
  type QuestSuggestionStatus,
} from "./quest-promotion-section";
import type { Note, NoteType, Team } from "@shared/schema";
import type { DetectedEntity, EntityType } from "@shared/entity-detection";
import { matchEntitiesToNotes } from "@shared/entity-detection";
import { findProximitySuggestions, type ProximitySuggestion } from "@shared/proximity-suggestions";
import {
  buildFirstSeenSeed,
  inferRelationshipTypeForNoteTypes,
  type CleanupQuestSuggestion,
  type CleanupRelationshipSuggestion,
  type CleanupSuggestionsResponse,
} from "@shared/cleanup-suggestions";

interface EntitySuggestionsPanelProps {
  team: Team;
  sessionDate: string;
  content: string;
  sessionNote?: Note | null; // PRD-034: Changed from sessionNoteId to pass full note
  memberAiEnabled: boolean; // PRD-028
  onNoteCreated: (note: Note) => void;
  onOpenNote?: (noteId: string) => void;
}

export function EntitySuggestionsPanel({
  team,
  sessionDate,
  content,
  sessionNote,
  memberAiEnabled,
  onNoteCreated,
  onOpenNote,
}: EntitySuggestionsPanelProps) {
  // PRD-034: Derive sessionNoteId and importRunId from the session note
  const sessionNoteId = sessionNote?.id;
  const sourceImportRunId = sessionNote?.importRunId;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedAssociations, setSelectedAssociations] = useState<Set<string>>(
    new Set()
  );
  const [bulkAcceptOpen, setBulkAcceptOpen] = useState(false);
  const [linkedExistingEntities, setLinkedExistingEntities] = useState<Set<string>>(
    new Set()
  );
  // PRD-047 FR-2/FR-3: track created backlinks so we can show evidence and undo.
  const [linkedBacklinks, setLinkedBacklinks] = useState<
    Map<string, { backlinkId: string; snippet: string }>
  >(new Map());
  // PRD-049: full cleanup suggestions response (relationships + quest promotion)
  const [cleanupData, setCleanupData] = useState<CleanupSuggestionsResponse | null>(null);
  const [relationshipStatus, setRelationshipStatus] = useState<
    Map<string, RelationshipSuggestionStatus>
  >(new Map());
  const [questStatus, setQuestStatus] = useState<Map<string, QuestSuggestionStatus>>(
    new Map()
  );
  const [pendingRelationshipId, setPendingRelationshipId] = useState<string | null>(null);
  const [pendingQuestId, setPendingQuestId] = useState<string | null>(null);

  // PRD-026: AI-enhanced entities
  const [aiEntities, setAiEntities] = useState<DetectedEntity[]>([]);
  const [aiRelationships, setAiRelationships] = useState<Array<{
    entity1: string;
    entity2: string;
    relationship: string;
    confidence: number;
  }>>([]);

  // Fetch all notes for matching
  const { data: allNotes = [] } = useQuery<Note[]>({
    queryKey: ["/api/teams", team.id, "notes"],
    enabled: !!team.id,
  });

  // Entity detection with debounce
  const {
    entities: detectedEntities,
    isLoading: isDetecting,
    error: detectionError,
  } = useEntityDetection({
    content,
    minConfidence: "low",
    debounceMs: 750,
    enabled: content.length > 10,
  });

  // Session persistence
  const persistence = useSuggestionPersistence({
    teamId: team.id,
    sessionDate,
    enabled: true,
  });

  // PRD-026: AI Cleanup mutation
  const aiCleanupMutation = useMutation({
    mutationFn: async () => {
      const response = sessionNoteId
        ? await apiRequest(
            "POST",
            `/api/teams/${team.id}/session-logs/${sessionNoteId}/cleanup-suggestions`,
            {
              content,
              mode: "ai",
              includeLow: true,
            }
          )
        : await apiRequest(
            "POST",
            `/api/teams/${team.id}/extract-entities`,
            { content }
          );
      return response.json();
    },
    onSuccess: (data: CleanupSuggestionsResponse | {
      entities: Array<{
        name: string;
        type: "npc" | "place" | "quest" | "item" | "faction";
        confidence: number;
        mentions: number;
        context?: string;
        matchedNoteId?: string;
      }>;
      relationships: Array<{
        entity1: string;
        entity2: string;
        relationship: string;
        confidence: number;
      }>;
    }) => {
      if ("relationshipSuggestions" in data) {
        setAiEntities(data.entities);
        setCleanupData(data);
        setAiRelationships(
          data.relationshipSuggestions.map((relationship) => ({
            entity1: relationship.fromEntityText,
            entity2: relationship.toEntityText,
            relationship: relationship.relationshipType,
            confidence: relationship.confidence,
          }))
        );

        toast({
          title: "AI Cleanup Complete",
          description: `Found ${data.entities.length} entities, ${data.relationshipSuggestions.length} relationships, and ${data.questSuggestions.length} quest suggestions.`,
        });
        return;
      }

      // Convert AI entities to DetectedEntity format
      const converted: DetectedEntity[] = data.entities.map((e, idx) => ({
        id: `ai-${idx}-${e.name.toLowerCase().replace(/\s+/g, "-")}`,
        type: (e.type === "item" || e.type === "faction" ? "npc" : e.type) as EntityType,
        text: e.name,
        normalizedText: e.name.toLowerCase(),
        confidence: e.confidence >= 0.8 ? "high" : e.confidence >= 0.6 ? "medium" : "low",
        mentions: [{
          startOffset: 0,
          endOffset: e.name.length,
          text: e.name,
        }],
        frequency: e.mentions,
      }));

      setAiEntities(converted);
      setAiRelationships(data.relationships);

      toast({
        title: "AI Cleanup Complete",
        description: `Found ${data.entities.length} entities and ${data.relationships.length} relationships.`,
      });
    },
    onError: (error: Error & { message?: string }) => {
      // Check for subscription error
      if (error.message?.includes("AI_SUBSCRIPTION_REQUIRED") || error.message?.includes("subscription")) {
        toast({
          title: "AI Features Unavailable",
          description: "AI features require a subscription. Enable in team settings.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "AI Cleanup Failed",
          description: error.message || "Failed to extract entities with AI.",
          variant: "destructive",
        });
      }
    },
  });

  // PRD-026: Merge pattern and AI entities
  const mergedEntities = useMemo(() => {
    if (aiEntities.length === 0) return detectedEntities;

    const merged = new Map<string, DetectedEntity>();

    // Add pattern entities first
    for (const entity of detectedEntities) {
      merged.set(entity.normalizedText, entity);
    }

    // Merge or add AI entities
    for (const aiEntity of aiEntities) {
      const existing = merged.get(aiEntity.normalizedText);
      if (existing) {
        // Upgrade confidence if AI is more confident
        if (aiEntity.confidence === "high" && existing.confidence !== "high") {
          existing.confidence = "high";
        }
      } else {
        // New entity from AI
        merged.set(aiEntity.normalizedText, aiEntity);
      }
    }

    return Array.from(merged.values());
  }, [detectedEntities, aiEntities]);

  // Match entities to existing notes
  const entityMatches = useMemo(() => {
    if (!allNotes.length) return new Map<string, string[]>();
    const notesForMatching = allNotes.map((n) => ({
      id: n.id,
      title: n.title,
      noteType: n.noteType,
    }));
    return matchEntitiesToNotes(mergedEntities, notesForMatching);
  }, [mergedEntities, allNotes]);

  // Compute proximity suggestions
  const proximitySuggestions = useMemo(() => {
    if (detectedEntities.length === 0) return new Map<string, ProximitySuggestion>();

    const contentMap = new Map<string, string>();
    contentMap.set("default", content);

    const suggestions = findProximitySuggestions(detectedEntities, contentMap);
    return new Map(suggestions.map((s) => [s.entityId, s]));
  }, [content, detectedEntities]);

  // Filter visible entities (not dismissed, not created)
  const visibleEntities = useMemo(() => {
    return mergedEntities.filter((entity) => {
      if (persistence.isDismissed(entity.id)) return false;
      return true;
    });
  }, [mergedEntities, persistence]);

  // Separate new entities from matched entities
  const newEntities = useMemo(() => {
    return visibleEntities.filter(
      (e) => !entityMatches.has(e.id) && !persistence.isCreated(e.id)
    );
  }, [visibleEntities, entityMatches, persistence]);

  const matchedEntities = useMemo(() => {
    return visibleEntities.filter((e) => entityMatches.has(e.id));
  }, [visibleEntities, entityMatches]);

  // High confidence entities for bulk accept
  const highConfidenceEntities = useMemo(() => {
    return newEntities.filter((e) => e.confidence === "high");
  }, [newEntities]);

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      content: string;
      noteType: NoteType;
      linkedNoteIds?: string[];
      importRunId?: string | null; // PRD-034: Track import origin
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/teams/${team.id}/notes`,
        data
      );
      return response.json();
    },
    onSuccess: (newNote: Note) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", team.id, "notes"],
      });
      onNoteCreated(newNote);
    },
  });

  // Create backlink mutation
  const createBacklinkMutation = useMutation({
    mutationFn: async (data: {
      targetNoteId: string;
      sourceNoteId: string;
      textSnippet: string;
      sourceBlockId?: string;
      startOffset?: number;
      endOffset?: number;
      evidenceType?: "Link" | "Mention" | "Heuristic";
      confidence?: number;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/teams/${team.id}/notes/${data.targetNoteId}/backlinks`,
        {
          sourceNoteId: data.sourceNoteId,
          textSnippet: data.textSnippet,
          sourceBlockId: data.sourceBlockId,
          startOffset: data.startOffset,
          endOffset: data.endOffset,
          evidenceType: data.evidenceType,
          confidence: data.confidence,
        }
      );
      return response.json();
    },
  });

  // PRD-047 FR-3: undo removes the backlink created by Link
  const deleteBacklinkMutation = useMutation({
    mutationFn: async (backlinkId: string) => {
      await apiRequest(
        "DELETE",
        `/api/teams/${team.id}/backlinks/${backlinkId}`
      );
    },
  });

  const createRelationshipMutation = useMutation({
    mutationFn: async (data: {
      fromNoteId: string;
      toNoteId: string;
      relationshipType: "QuestHasNPC" | "QuestAtPlace" | "NPCInPlace" | "Related";
      evidenceType: "Link" | "Mention" | "Heuristic";
      confidence: number;
      sourceNoteId: string;
      snippetText: string;
      sourceBlockId?: string;
      startOffset?: number;
      endOffset?: number;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/teams/${team.id}/relationships`,
        data
      );
      return response.json();
    },
  });

  // PRD-047: capture a bounded evidence window around a mention (±200 chars)
  const extractEvidenceSnippet = useCallback(
    (
      mention: { startOffset: number; endOffset: number; text: string } | undefined,
      fallback: string
    ): string => {
      if (!mention || !content) return fallback;
      const start = Math.max(0, mention.startOffset - 200);
      const end = Math.min(content.length, mention.endOffset + 200);
      const snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
      return snippet || fallback;
    },
    [content]
  );

  // PRD-049 FR-4: refresh suggestions after link/accept actions without a reload
  const refreshCleanupSuggestions = useCallback(() => {
    if (cleanupData && sessionNoteId && !aiCleanupMutation.isPending) {
      aiCleanupMutation.mutate();
    }
  }, [cleanupData, sessionNoteId, aiCleanupMutation]);

  // Handle accept action
  const handleAccept = useCallback(
    async (entity: DetectedEntity, noteType: NoteType) => {
      try {
        const mention = entity.mentions[0];

        // Create the note
        const linkedNoteIds = Array.from(selectedAssociations);
        const newNote = await createNoteMutation.mutateAsync({
          title: entity.text,
          // PRD-048 FR-4: seed content so new entity pages are never blank
          content: buildFirstSeenSeed(
            sessionDate,
            extractEvidenceSnippet(mention, entity.text)
          ),
          noteType,
          linkedNoteIds: linkedNoteIds.length > 0 ? linkedNoteIds : undefined,
          importRunId: sourceImportRunId, // PRD-034: Track import origin for cascade delete
        });

        // Create backlink from session to new note
        if (sessionNoteId) {
          await createBacklinkMutation.mutateAsync({
            targetNoteId: newNote.id,
            sourceNoteId: sessionNoteId,
            textSnippet: extractEvidenceSnippet(mention, entity.text),
            sourceBlockId: mention?.blockId,
            startOffset: mention?.startOffset,
            endOffset: mention?.endOffset,
            evidenceType: "Mention",
            confidence: 0.8,
          });
        }

        if (sessionNoteId && linkedNoteIds.length > 0) {
          for (const linkedNoteId of linkedNoteIds) {
            const linkedNote = allNotes.find((note) => note.id === linkedNoteId);
            if (!linkedNote) continue;

            const inferred = inferRelationshipTypeForNoteTypes(noteType, linkedNote.noteType);
            const fromNoteId = inferred.swap ? linkedNote.id : newNote.id;
            const toNoteId = inferred.swap ? newNote.id : linkedNote.id;

            await createRelationshipMutation.mutateAsync({
              fromNoteId,
              toNoteId,
              relationshipType: inferred.relationshipType,
              evidenceType: "Heuristic",
              confidence: 0.72,
              sourceNoteId: sessionNoteId,
              snippetText: mention?.text || entity.text,
              sourceBlockId: mention?.blockId,
              startOffset: mention?.startOffset,
              endOffset: mention?.endOffset,
            });
          }
        }

        // Mark as created
        persistence.markCreated(entity.id);

        // Reset selection
        setSelectedEntityId(null);
        setSelectedAssociations(new Set());

        toast({
          title: "Entity created",
          description: `${newNote.title} has been created.`,
        });

        // PRD-049 FR-4: newly created notes can resolve pending suggestions
        refreshCleanupSuggestions();
      } catch {
        toast({
          title: "Failed to create entity",
          variant: "destructive",
        });
      }
    },
    [
      selectedAssociations,
      sessionNoteId,
      sourceImportRunId, // PRD-034
      sessionDate,
      allNotes,
      createNoteMutation,
      createBacklinkMutation,
      createRelationshipMutation,
      persistence,
      toast,
      extractEvidenceSnippet,
      refreshCleanupSuggestions,
    ]
  );

  // Handle link to existing (PRD-047 FR-1: user-confirmed links are HIGH confidence)
  const handleLinkToExisting = useCallback(
    async (entity: DetectedEntity, noteId: string) => {
      if (!sessionNoteId) return;

      try {
        const mention = entity.mentions[0];
        const snippet = extractEvidenceSnippet(mention, entity.text);
        const backlink = await createBacklinkMutation.mutateAsync({
          targetNoteId: noteId,
          sourceNoteId: sessionNoteId,
          textSnippet: snippet,
          sourceBlockId: mention?.blockId,
          startOffset: mention?.startOffset,
          endOffset: mention?.endOffset,
          evidenceType: "Mention",
          confidence: 0.8,
        });

        persistence.markCreated(entity.id);
        setLinkedExistingEntities((prev) => new Set(prev).add(entity.id));
        // PRD-047 FR-2/FR-3: remember the backlink for inline evidence + undo
        if (backlink?.id) {
          setLinkedBacklinks((prev) =>
            new Map(prev).set(entity.id, { backlinkId: backlink.id, snippet })
          );
        }

        toast({
          title: "Entity linked",
          description: "Backlink created to existing note.",
        });

        // PRD-049 FR-4: linked entities can resolve pending relationship suggestions
        refreshCleanupSuggestions();
      } catch {
        toast({
          title: "Failed to link entity",
          variant: "destructive",
        });
      }
    },
    [
      sessionNoteId,
      createBacklinkMutation,
      persistence,
      toast,
      extractEvidenceSnippet,
      refreshCleanupSuggestions,
    ]
  );

  // PRD-047 FR-3: undo link removes the backlink and reverts the row
  const handleUndoLink = useCallback(
    async (entity: DetectedEntity) => {
      const linked = linkedBacklinks.get(entity.id);
      if (!linked) return;

      try {
        await deleteBacklinkMutation.mutateAsync(linked.backlinkId);

        persistence.unmarkCreated(entity.id);
        setLinkedExistingEntities((prev) => {
          const next = new Set(prev);
          next.delete(entity.id);
          return next;
        });
        setLinkedBacklinks((prev) => {
          const next = new Map(prev);
          next.delete(entity.id);
          return next;
        });

        toast({
          title: "Link removed",
          description: "The backlink has been deleted.",
        });
      } catch {
        toast({
          title: "Failed to undo link",
          variant: "destructive",
        });
      }
    },
    [linkedBacklinks, deleteBacklinkMutation, persistence, toast]
  );

  // PRD-049 FR-2: accepting a relationship suggestion persists it
  const handleAcceptRelationship = useCallback(
    async (suggestion: CleanupRelationshipSuggestion) => {
      if (!sessionNoteId || !suggestion.fromNoteId || !suggestion.toNoteId) return;

      setPendingRelationshipId(suggestion.id);
      try {
        await createRelationshipMutation.mutateAsync({
          fromNoteId: suggestion.fromNoteId,
          toNoteId: suggestion.toNoteId,
          relationshipType: suggestion.relationshipType,
          evidenceType: suggestion.evidenceType,
          confidence: suggestion.confidence,
          sourceNoteId: sessionNoteId,
          snippetText: suggestion.snippetText,
          sourceBlockId: suggestion.sourceBlockId,
        });

        setRelationshipStatus((prev) => new Map(prev).set(suggestion.id, "accepted"));
        toast({
          title: "Relationship saved",
          description: `${suggestion.fromEntityText} → ${suggestion.toEntityText}`,
        });
      } catch {
        toast({
          title: "Failed to save relationship",
          variant: "destructive",
        });
      } finally {
        setPendingRelationshipId(null);
      }
    },
    [sessionNoteId, createRelationshipMutation, toast]
  );

  const handleDismissRelationship = useCallback(
    (suggestion: CleanupRelationshipSuggestion) => {
      setRelationshipStatus((prev) => new Map(prev).set(suggestion.id, "dismissed"));
    },
    []
  );

  // PRD-049 FR-3: promote actionable text to a Quest note with auto-links
  const handleCreateQuest = useCallback(
    async (suggestion: CleanupQuestSuggestion) => {
      setPendingQuestId(suggestion.id);
      try {
        const questNote = await createNoteMutation.mutateAsync({
          title: suggestion.proposedQuestTitle,
          content: buildFirstSeenSeed(sessionDate, suggestion.snippetText),
          noteType: "quest",
          importRunId: sourceImportRunId,
        });

        if (sessionNoteId) {
          // Backlink from session → quest (Mention evidence)
          await createBacklinkMutation.mutateAsync({
            targetNoteId: questNote.id,
            sourceNoteId: sessionNoteId,
            textSnippet: suggestion.snippetText,
            startOffset: suggestion.startOffset,
            endOffset: suggestion.endOffset,
            evidenceType: "Mention",
            confidence: 0.8,
          });

          if (suggestion.suggestedNpcNoteId) {
            await createRelationshipMutation.mutateAsync({
              fromNoteId: questNote.id,
              toNoteId: suggestion.suggestedNpcNoteId,
              relationshipType: "QuestHasNPC",
              evidenceType: "Heuristic",
              confidence: 0.72,
              sourceNoteId: sessionNoteId,
              snippetText: suggestion.snippetText,
            });
          }

          if (suggestion.suggestedAreaNoteId) {
            await createRelationshipMutation.mutateAsync({
              fromNoteId: questNote.id,
              toNoteId: suggestion.suggestedAreaNoteId,
              relationshipType: "QuestAtPlace",
              evidenceType: "Heuristic",
              confidence: 0.72,
              sourceNoteId: sessionNoteId,
              snippetText: suggestion.snippetText,
            });
          }
        }

        setQuestStatus((prev) => new Map(prev).set(suggestion.id, "promoted"));
        toast({
          title: "Quest created",
          description: `${questNote.title} has been created and linked.`,
        });

        refreshCleanupSuggestions();
      } catch {
        toast({
          title: "Failed to create quest",
          variant: "destructive",
        });
      } finally {
        setPendingQuestId(null);
      }
    },
    [
      sessionNoteId,
      sessionDate,
      sourceImportRunId,
      createNoteMutation,
      createBacklinkMutation,
      createRelationshipMutation,
      toast,
      refreshCleanupSuggestions,
    ]
  );

  const handleLinkExistingQuest = useCallback(
    async (suggestion: CleanupQuestSuggestion, questNoteId: string) => {
      if (!sessionNoteId) return;

      setPendingQuestId(suggestion.id);
      try {
        await createBacklinkMutation.mutateAsync({
          targetNoteId: questNoteId,
          sourceNoteId: sessionNoteId,
          textSnippet: suggestion.snippetText,
          startOffset: suggestion.startOffset,
          endOffset: suggestion.endOffset,
          evidenceType: "Mention",
          confidence: 0.8,
        });

        setQuestStatus((prev) => new Map(prev).set(suggestion.id, "promoted"));
        toast({
          title: "Quest linked",
          description: "The session has been linked to the existing quest.",
        });
      } catch {
        toast({
          title: "Failed to link quest",
          variant: "destructive",
        });
      } finally {
        setPendingQuestId(null);
      }
    },
    [sessionNoteId, createBacklinkMutation, toast]
  );

  const handleDismissQuest = useCallback((suggestion: CleanupQuestSuggestion) => {
    setQuestStatus((prev) => new Map(prev).set(suggestion.id, "dismissed"));
  }, []);

  // Handle dismiss
  const handleDismiss = useCallback(
    (entityId: string) => {
      persistence.dismissEntity(entityId);
      if (selectedEntityId === entityId) {
        setSelectedEntityId(null);
      }
    },
    [persistence, selectedEntityId]
  );

  // Handle reclassify
  const handleReclassify = useCallback(
    (entityId: string, newType: NoteType) => {
      persistence.reclassifyEntity(entityId, newType);
    },
    [persistence]
  );

  // Handle entity selection
  const handleSelectEntity = useCallback(
    (entity: DetectedEntity) => {
      if (selectedEntityId === entity.id) {
        setSelectedEntityId(null);
        setSelectedAssociations(new Set());
      } else {
        setSelectedEntityId(entity.id);

        // Pre-select high confidence associations
        const suggestion = proximitySuggestions.get(entity.id);
        if (suggestion) {
          const highConfidenceIds = suggestion.relatedEntities
            .filter((r) => r.confidence === "high")
            .map((r) => {
              const matchingNoteIds = entityMatches.get(r.entityId) || [];
              return matchingNoteIds[0];
            })
            .filter(Boolean);
          setSelectedAssociations(new Set(highConfidenceIds));
        } else {
          setSelectedAssociations(new Set());
        }
      }
    },
    [selectedEntityId, proximitySuggestions, entityMatches]
  );

  // Toggle association
  const toggleAssociation = useCallback((noteId: string) => {
    setSelectedAssociations((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }, []);

  // Handle bulk accept
  const handleBulkAccept = useCallback(async () => {
    setBulkAcceptOpen(false);
    let created = 0;
    let linked = 0;

    for (const entity of highConfidenceEntities) {
      try {
        const mention = entity.mentions[0];
        const noteType =
          persistence.getReclassifiedType(entity.id) ||
          ENTITY_TO_NOTE_TYPE[entity.type];

        // Get high confidence associations for this entity
        const suggestion = proximitySuggestions.get(entity.id);
        const linkedNoteIds: string[] = [];
        if (suggestion) {
          suggestion.relatedEntities
            .filter((r) => r.confidence === "high")
            .forEach((r) => {
              const matchingNoteIds = entityMatches.get(r.entityId) || [];
              if (matchingNoteIds[0]) {
                linkedNoteIds.push(matchingNoteIds[0]);
                linked++;
              }
            });
        }

        const newNote = await createNoteMutation.mutateAsync({
          title: entity.text,
          // PRD-048 FR-4: seed content so new entity pages are never blank
          content: buildFirstSeenSeed(
            sessionDate,
            extractEvidenceSnippet(mention, entity.text)
          ),
          noteType,
          linkedNoteIds: linkedNoteIds.length > 0 ? linkedNoteIds : undefined,
          importRunId: sourceImportRunId, // PRD-034: Track import origin for cascade delete
        });

        if (sessionNoteId) {
          await createBacklinkMutation.mutateAsync({
            targetNoteId: newNote.id,
            sourceNoteId: sessionNoteId,
            textSnippet: extractEvidenceSnippet(mention, entity.text),
            sourceBlockId: mention?.blockId,
            startOffset: mention?.startOffset,
            endOffset: mention?.endOffset,
            evidenceType: "Mention",
            confidence: 0.8,
          });
        }

        if (sessionNoteId && linkedNoteIds.length > 0) {
          for (const linkedNoteId of linkedNoteIds) {
            const linkedNote = allNotes.find((note) => note.id === linkedNoteId);
            if (!linkedNote) continue;

            const inferred = inferRelationshipTypeForNoteTypes(noteType, linkedNote.noteType);
            const fromNoteId = inferred.swap ? linkedNote.id : newNote.id;
            const toNoteId = inferred.swap ? newNote.id : linkedNote.id;

            await createRelationshipMutation.mutateAsync({
              fromNoteId,
              toNoteId,
              relationshipType: inferred.relationshipType,
              evidenceType: "Heuristic",
              confidence: 0.72,
              sourceNoteId: sessionNoteId,
              snippetText: mention?.text || entity.text,
              sourceBlockId: mention?.blockId,
              startOffset: mention?.startOffset,
              endOffset: mention?.endOffset,
            });
          }
        }

        persistence.markCreated(entity.id);
        created++;
      } catch {
        // Continue with next entity on error
      }
    }

    toast({
      title: "Bulk accept complete",
      description: `Created ${created} entities with ${linked} relationships.`,
    });
  }, [
    highConfidenceEntities,
    persistence,
    proximitySuggestions,
    entityMatches,
    createNoteMutation,
    createBacklinkMutation,
    createRelationshipMutation,
    allNotes,
    sessionNoteId,
    sessionDate,
    sourceImportRunId, // PRD-034
    toast,
    extractEvidenceSnippet,
  ]);

  // Navigate to session review
  const handleReviewAll = useCallback(() => {
    if (sessionNoteId) {
      navigate(`/session-review/${sessionNoteId}`);
    }
  }, [sessionNoteId, navigate]);

  // Don't render if no content
  if (content.length < 10) {
    return null;
  }

  const totalCount = visibleEntities.length;
  const selectedEntity = visibleEntities.find((e) => e.id === selectedEntityId);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border-t mt-4 pt-4">
        {/* Header */}
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Entity Suggestions</span>
              {totalCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {totalCount}
                </Badge>
              )}
              {isDetecting && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 space-y-4">
            {/* Action buttons */}
            {(highConfidenceEntities.length >= 2 || sessionNoteId || memberAiEnabled) && (
              <div className="flex gap-2 flex-wrap">
                {highConfidenceEntities.length >= 2 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkAcceptOpen(true)}
                    className="text-xs"
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    Accept All High-Confidence ({highConfidenceEntities.length})
                  </Button>
                )}
                {sessionNoteId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReviewAll}
                    className="text-xs"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Review All
                  </Button>
                )}
                {/* PRD-028: AI Cleanup button - show if member has AI enabled */}
                {memberAiEnabled && content.length > 50 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => aiCleanupMutation.mutate()}
                    disabled={aiCleanupMutation.isPending}
                    className="text-xs"
                  >
                    {aiCleanupMutation.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3 mr-1" />
                    )}
                    AI Cleanup
                    {aiRelationships.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {aiRelationships.length} rel
                      </Badge>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Loading state */}
            {isDetecting && visibleEntities.length === 0 && (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">Detecting entities...</span>
              </div>
            )}

            {/* Error state */}
            {detectionError && (
              <p className="text-destructive text-sm text-center py-4">
                Failed to detect entities
              </p>
            )}

            {/* Empty state */}
            {!isDetecting && visibleEntities.length === 0 && !detectionError && (
              <p className="text-muted-foreground text-sm text-center py-4">
                {mergedEntities.length === 0
                  ? "No entities detected. Keep writing to see suggestions."
                  : "All suggestions reviewed!"}
              </p>
            )}

            {/* New entities */}
            {newEntities.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  New Entities
                </h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {newEntities.map((entity) => (
                    <div key={entity.id}>
                      <EntitySuggestionCard
                        entity={entity}
                        reclassifiedType={persistence.getReclassifiedType(
                          entity.id
                        )}
                        matchingNotes={[]}
                        isSelected={selectedEntityId === entity.id}
                        onSelect={() => handleSelectEntity(entity)}
                        onAccept={(noteType) => handleAccept(entity, noteType)}
                        onDismiss={() => handleDismiss(entity.id)}
                        onReclassify={(newType) =>
                          handleReclassify(entity.id, newType)
                        }
                        onLinkToExisting={() => {}}
                        onOpenNote={onOpenNote}
                      />
                      {selectedEntityId === entity.id && (
                        <ProximityAssociations
                          entityId={entity.id}
                          entityText={entity.text}
                          proximitySuggestions={proximitySuggestions}
                          existingNotes={allNotes}
                          entityMatches={entityMatches}
                          selectedAssociations={selectedAssociations}
                          onToggleAssociation={toggleAssociation}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Matched entities */}
            {matchedEntities.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Existing Entities
                </h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {matchedEntities.map((entity) => {
                    const matchingNoteIds = entityMatches.get(entity.id) || [];
                    const matchingNotes = allNotes.filter((n) =>
                      matchingNoteIds.includes(n.id)
                    );

                    return (
                      <EntitySuggestionCard
                        key={entity.id}
                        entity={entity}
                        reclassifiedType={persistence.getReclassifiedType(
                          entity.id
                        )}
                        matchingNotes={matchingNotes}
                        isSelected={selectedEntityId === entity.id}
                        isLinked={
                          linkedExistingEntities.has(entity.id) ||
                          persistence.isCreated(entity.id)
                        }
                        linkedSnippet={linkedBacklinks.get(entity.id)?.snippet}
                        onSelect={() => handleSelectEntity(entity)}
                        onAccept={(noteType) => handleAccept(entity, noteType)}
                        onDismiss={() => handleDismiss(entity.id)}
                        onReclassify={(newType) =>
                          handleReclassify(entity.id, newType)
                        }
                        onLinkToExisting={(noteId) =>
                          handleLinkToExisting(entity, noteId)
                        }
                        onUndoLink={
                          linkedBacklinks.has(entity.id)
                            ? () => handleUndoLink(entity)
                            : undefined
                        }
                        onOpenNote={onOpenNote}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* PRD-049 FR-1: relationship suggestions with Accept/Dismiss */}
            {cleanupData && (
              <RelationshipSuggestionsSection
                suggestions={cleanupData.relationshipSuggestions}
                statusById={relationshipStatus}
                pendingId={pendingRelationshipId}
                onAccept={handleAcceptRelationship}
                onDismiss={handleDismissRelationship}
              />
            )}

            {/* PRD-049 FR-3: quest promotion from actionable text */}
            {cleanupData && (
              <QuestPromotionSection
                suggestions={cleanupData.questSuggestions}
                statusById={questStatus}
                pendingId={pendingQuestId}
                onCreateQuest={handleCreateQuest}
                onLinkExistingQuest={handleLinkExistingQuest}
                onDismiss={handleDismissQuest}
              />
            )}
          </div>
        </CollapsibleContent>
      </div>

      {/* Bulk Accept Confirmation Dialog */}
      <AlertDialog open={bulkAcceptOpen} onOpenChange={setBulkAcceptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept All High-Confidence Entities?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create {highConfidenceEntities.length} new notes:
              <ul className="mt-2 list-disc list-inside">
                {highConfidenceEntities.map((e) => (
                  <li key={e.id} className="text-sm">
                    {e.text} ({persistence.getReclassifiedType(e.id) || ENTITY_TO_NOTE_TYPE[e.type]})
                  </li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAccept}>
              <Check className="h-4 w-4 mr-2" />
              Accept All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
