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
import type { Note, NoteType, Team } from "@shared/schema";
import type { DetectedEntity, EntityType } from "@shared/entity-detection";
import { matchEntitiesToNotes } from "@shared/entity-detection";
import { findProximitySuggestions, type ProximitySuggestion } from "@shared/proximity-suggestions";

interface EntitySuggestionsPanelProps {
  team: Team;
  sessionDate: string;
  content: string;
  sessionNote?: Note | null; // PRD-034: Changed from sessionNoteId to pass full note
  memberAiEnabled: boolean; // PRD-028
  onNoteCreated: (note: Note) => void;
}

export function EntitySuggestionsPanel({
  team,
  sessionDate,
  content,
  sessionNote,
  memberAiEnabled,
  onNoteCreated,
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
      const response = await apiRequest(
        "POST",
        `/api/teams/${team.id}/extract-entities`,
        { content }
      );
      return response.json();
    },
    onSuccess: (data: {
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
      if (persistence.isCreated(entity.id)) return false;
      return true;
    });
  }, [mergedEntities, persistence]);

  // Separate new entities from matched entities
  const newEntities = useMemo(() => {
    return visibleEntities.filter((e) => !entityMatches.has(e.id));
  }, [visibleEntities, entityMatches]);

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
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/teams/${team.id}/backlinks`,
        data
      );
      return response.json();
    },
  });

  // Handle accept action
  const handleAccept = useCallback(
    async (entity: DetectedEntity, noteType: NoteType) => {
      try {
        // Create the note
        const linkedNoteIds = Array.from(selectedAssociations);
        const newNote = await createNoteMutation.mutateAsync({
          title: entity.text,
          content: "",
          noteType,
          linkedNoteIds: linkedNoteIds.length > 0 ? linkedNoteIds : undefined,
          importRunId: sourceImportRunId, // PRD-034: Track import origin for cascade delete
        });

        // Create backlink from session to new note
        if (sessionNoteId) {
          await createBacklinkMutation.mutateAsync({
            targetNoteId: newNote.id,
            sourceNoteId: sessionNoteId,
            textSnippet: entity.mentions[0]?.text || entity.text,
          });
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
      createNoteMutation,
      createBacklinkMutation,
      persistence,
      toast,
    ]
  );

  // Handle link to existing
  const handleLinkToExisting = useCallback(
    async (entity: DetectedEntity, noteId: string) => {
      if (!sessionNoteId) return;

      try {
        await createBacklinkMutation.mutateAsync({
          targetNoteId: noteId,
          sourceNoteId: sessionNoteId,
          textSnippet: entity.mentions[0]?.text || entity.text,
        });

        persistence.markCreated(entity.id);

        toast({
          title: "Entity linked",
          description: "Backlink created to existing note.",
        });
      } catch {
        toast({
          title: "Failed to link entity",
          variant: "destructive",
        });
      }
    },
    [sessionNoteId, createBacklinkMutation, persistence, toast]
  );

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
          content: "",
          noteType,
          linkedNoteIds: linkedNoteIds.length > 0 ? linkedNoteIds : undefined,
          importRunId: sourceImportRunId, // PRD-034: Track import origin for cascade delete
        });

        if (sessionNoteId) {
          await createBacklinkMutation.mutateAsync({
            targetNoteId: newNote.id,
            sourceNoteId: sessionNoteId,
            textSnippet: entity.mentions[0]?.text || entity.text,
          });
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
    sessionNoteId,
    sourceImportRunId, // PRD-034
    toast,
  ]);

  // Navigate to session review
  const handleReviewAll = useCallback(() => {
    if (sessionNoteId) {
      navigate(`/notes/${sessionNoteId}/review`);
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
            {(highConfidenceEntities.length >= 2 || sessionNoteId || team.aiEnabled) && (
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
                        onSelect={() => handleSelectEntity(entity)}
                        onAccept={(noteType) => handleAccept(entity, noteType)}
                        onDismiss={() => handleDismiss(entity.id)}
                        onReclassify={(newType) =>
                          handleReclassify(entity.id, newType)
                        }
                        onLinkToExisting={(noteId) =>
                          handleLinkToExisting(entity, noteId)
                        }
                      />
                    );
                  })}
                </div>
              </div>
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
