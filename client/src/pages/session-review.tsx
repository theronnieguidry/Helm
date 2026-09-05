import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  ArrowLeft,
  BookOpen,
  User,
  MapPin,
  ScrollText,
  Link2,
  Plus,
  Check,
  CheckCircle,
  X,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEntityDetection } from "@/hooks/use-entity-detection";
import { useSuggestionPersistence } from "@/hooks/use-suggestion-persistence";
import { format } from "date-fns";
import { SelectableContent } from "@/components/selectable-content";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Note, NoteType, Team } from "@shared/schema";
import { NOTE_TYPES } from "@shared/schema";
import {
  matchEntitiesToNotes,
  type DetectedEntity,
  type EntityType,
} from "@shared/entity-detection";
import { findProximitySuggestions, type ProximitySuggestion } from "@shared/proximity-suggestions";
import { inferRelationshipTypeForNoteTypes } from "@shared/cleanup-suggestions";

interface SessionReviewPageProps {
  team: Team;
}

const ENTITY_TYPE_ICONS: Record<EntityType, typeof User> = {
  npc: User,
  place: MapPin,
  quest: ScrollText,
};

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  npc: "bg-green-500/10 text-green-500 border-green-500/20",
  place: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  quest: "bg-red-500/10 text-red-500 border-red-500/20",
};

const ENTITY_TYPE_NOTE_TYPE: Record<EntityType, NoteType> = {
  npc: "npc",
  place: "poi",
  quest: "quest",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-gray-500",
};

export default function SessionReviewPage({ team }: SessionReviewPageProps) {
  const params = useParams<{ noteId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [selectedEntity, setSelectedEntity] = useState<DetectedEntity | null>(
    null
  );
  // Gap F20 (PRD-003 FR-4): when the create dialog is opened from a text
  // selection there is no DetectedEntity, so we capture the selection's text
  // and (best-effort) offsets here so the created note can still be
  // backlinked to the session instead of being silently orphaned.
  const [pendingSelection, setPendingSelection] = useState<{
    text: string;
    blockId?: string;
    startOffset?: number;
    endOffset?: number;
  } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    title: "",
    content: "",
    noteType: "npc" as NoteType,
  });
  // Gap F18 (PRD-003): review progress must survive refresh. Persist
  // dismissed/linked state in localStorage keyed by the session's own date,
  // via the same hook the live editor panel uses.
  const [selectedAssociations, setSelectedAssociations] = useState<Set<string>>(
    new Set()
  );

  // Fetch the session log
  const { data: sessionLog, isLoading: isLoadingSession } = useQuery<Note>({
    queryKey: ["/api/teams", team.id, "notes", params.noteId],
    enabled: !!team.id && !!params.noteId,
  });

  // Fetch all notes for matching
  const { data: allNotes, isLoading: isLoadingNotes } = useQuery<Note[]>({
    queryKey: ["/api/teams", team.id, "notes"],
    enabled: !!team.id,
  });

  // Gap F19 (PRD-003 FR-5): mark/unmark the session log as reviewed via the
  // notes PATCH endpoint's reviewedAt field.
  const markReviewedMutation = useMutation({
    mutationFn: async (reviewedAt: string | null) => {
      const response = await apiRequest(
        "PATCH",
        `/api/teams/${team.id}/notes/${params.noteId}`,
        { reviewedAt }
      );
      return response.json();
    },
    onSuccess: (_note, reviewedAt) => {
      // Prefix-invalidates both the notes list and this session's detail query
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", team.id, "notes"],
      });
      toast({
        title: reviewedAt ? "Session marked as reviewed" : "Review mark removed",
        description: reviewedAt
          ? "This session log is now marked as reviewed."
          : "This session log is no longer marked as reviewed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update review status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const persistence = useSuggestionPersistence({
    teamId: team.id,
    sessionDate: sessionLog?.sessionDate
      ? format(new Date(sessionLog.sessionDate), "yyyy-MM-dd")
      : undefined,
    enabled: !!sessionLog,
  });
  const linkedEntities = persistence.created;
  const dismissedEntities = persistence.dismissed;

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (data: typeof createFormData & { linkedNoteIds?: string[] }) => {
      const response = await apiRequest(
        "POST",
        `/api/teams/${team.id}/notes`,
        data
      );
      return response.json();
    },
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", team.id, "notes"],
      });
      setIsCreateOpen(false);
      setCreateFormData({ title: "", content: "", noteType: "npc" });

      // Create backlink from session log to the new note
      if (sessionLog && selectedEntity) {
        const mention = selectedEntity.mentions[0];
        createBacklinkMutation.mutate({
          targetNoteId: newNote.id,
          sourceNoteId: sessionLog.id,
          textSnippet: mention?.text || selectedEntity.text,
          sourceBlockId: mention?.blockId,
          startOffset: mention?.startOffset,
          endOffset: mention?.endOffset,
          evidenceType: "Mention",
          confidence: 0.8,
        });

        if (selectedAssociations.size > 0) {
          const sourceType = newNote.noteType as NoteType;
          Array.from(selectedAssociations).forEach((linkedNoteId) => {
            const linkedNote = allNotes?.find((note) => note.id === linkedNoteId);
            if (!linkedNote) return;

            const inferred = inferRelationshipTypeForNoteTypes(sourceType, linkedNote.noteType);
            const fromNoteId = inferred.swap ? linkedNote.id : newNote.id;
            const toNoteId = inferred.swap ? newNote.id : linkedNote.id;

            createRelationshipMutation.mutate({
              fromNoteId,
              toNoteId,
              relationshipType: inferred.relationshipType,
              evidenceType: "Heuristic",
              confidence: 0.72,
              sourceNoteId: sessionLog.id,
              snippetText: mention?.text || selectedEntity.text,
              sourceBlockId: mention?.blockId,
              startOffset: mention?.startOffset,
              endOffset: mention?.endOffset,
            });
          });
        }
      } else if (sessionLog && pendingSelection) {
        // Gap F20 (PRD-003 FR-4): selection-created entities must link back
        // to the session too — previously this path was skipped entirely.
        createBacklinkMutation.mutate({
          targetNoteId: newNote.id,
          sourceNoteId: sessionLog.id,
          textSnippet: pendingSelection.text,
          sourceBlockId: pendingSelection.blockId,
          startOffset: pendingSelection.startOffset,
          endOffset: pendingSelection.endOffset,
          evidenceType: "Mention",
          confidence: 0.8,
        });
        setPendingSelection(null);
      }

      toast({
        title: "Entity created",
        description: `${newNote.title} has been created and linked.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create entity",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create backlink mutation
  const createBacklinkMutation = useMutation({
    mutationFn: async (data: {
      targetNoteId: string;
      sourceNoteId: string;
      textSnippet?: string;
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
    onSuccess: () => {
      if (selectedEntity) {
        persistence.markCreated(selectedEntity.id);
      }
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

  // Prepare content for entity detection
  const contentToAnalyze = useMemo(() => {
    if (!sessionLog) return null;
    return sessionLog.contentBlocks
      ? sessionLog.contentBlocks.map((b) => ({
          id: b.id,
          content: b.content,
        }))
      : sessionLog.content || null;
  }, [sessionLog]);

  // Detect entities from session log content using Web Worker
  const {
    entities: detectedEntities,
    isLoading: isDetectingEntities,
    error: detectionError,
  } = useEntityDetection({
    content: contentToAnalyze,
    minConfidence: "low",
    debounceMs: 500,
    enabled: !!sessionLog,
  });

  // Match entities to existing notes
  const entityMatches = useMemo(() => {
    if (!allNotes) return new Map<string, string[]>();
    const notesForMatching = allNotes.map((n) => ({
      id: n.id,
      title: n.title,
      noteType: n.noteType,
    }));
    return matchEntitiesToNotes(detectedEntities, notesForMatching);
  }, [detectedEntities, allNotes]);

  // Filter out linked and dismissed entities
  const activeEntities = useMemo(() => {
    return detectedEntities.filter(
      (e) =>
        !linkedEntities.has(e.id) &&
        !dismissedEntities.has(e.id) &&
        !entityMatches.has(e.id) // Already has matching notes
    );
  }, [detectedEntities, linkedEntities, dismissedEntities, entityMatches]);

  // Entities that already match existing notes
  const matchedEntities = useMemo(() => {
    return detectedEntities.filter((e) => entityMatches.has(e.id));
  }, [detectedEntities, entityMatches]);

  // Gap F29: completion/progress semantics.
  //
  // Every detected entity is actionable: "new" entities offer Create/Dismiss,
  // and matched entities offer a Link button (the one action the panel asks
  // the user to take on them). An entity counts as processed once it has been
  // linked (persistence.created) or dismissed; an unlinked match therefore
  // counts toward "remaining" rather than being silently excluded — which is
  // what previously made the numbers inconsistent and "Review Complete"
  // unreachable whenever any match existed. Counts intersect the persisted
  // sets with the currently-detected entity ids so stale localStorage entries
  // from earlier content can't inflate progress.
  const linkedCount = useMemo(
    () => detectedEntities.filter((e) => linkedEntities.has(e.id)).length,
    [detectedEntities, linkedEntities]
  );
  const dismissedCount = useMemo(
    () =>
      detectedEntities.filter(
        (e) => dismissedEntities.has(e.id) && !linkedEntities.has(e.id)
      ).length,
    [detectedEntities, dismissedEntities, linkedEntities]
  );
  const totalCount = detectedEntities.length;
  const processedCount = linkedCount + dismissedCount;
  const remainingCount = totalCount - processedCount;
  const isReviewComplete = totalCount > 0 && processedCount >= totalCount;

  // Compute proximity suggestions for all entities
  const proximitySuggestions = useMemo(() => {
    if (!sessionLog || detectedEntities.length === 0) return new Map<string, ProximitySuggestion>();

    // Build content map for context extraction
    const contentMap = new Map<string, string>();
    if (sessionLog.contentBlocks) {
      sessionLog.contentBlocks.forEach((block) => {
        contentMap.set(block.id, block.content);
      });
    } else if (sessionLog.content) {
      contentMap.set("default", sessionLog.content);
    }

    const suggestions = findProximitySuggestions(detectedEntities, contentMap);
    return new Map(suggestions.map((s) => [s.entityId, s]));
  }, [sessionLog, detectedEntities]);

  // Get proximity suggestions for the selected entity with existing note matches
  const selectedEntitySuggestions = useMemo(() => {
    if (!selectedEntity || !allNotes) return [];

    const suggestion = proximitySuggestions.get(selectedEntity.id);
    if (!suggestion) return [];

    // Find related entities that match existing notes
    return suggestion.relatedEntities
      .map((related) => {
        const relatedEntity = detectedEntities.find((e) => e.id === related.entityId);
        if (!relatedEntity) return null;

        const matchingNoteIds = entityMatches.get(related.entityId) || [];
        const matchingNotes = allNotes.filter((n) => matchingNoteIds.includes(n.id));

        if (matchingNotes.length === 0) return null;

        return {
          ...related,
          notes: matchingNotes,
        };
      })
      .filter(Boolean) as Array<{
        entityId: string;
        entityText: string;
        distance: number;
        confidence: "high" | "medium" | "low";
        context: string;
        notes: Note[];
      }>;
  }, [selectedEntity, proximitySuggestions, detectedEntities, entityMatches, allNotes]);

  const handleCreateEntity = (entity: DetectedEntity) => {
    setSelectedEntity(entity);
    setPendingSelection(null);
    setCreateFormData({
      title: entity.text,
      content: "",
      noteType: ENTITY_TYPE_NOTE_TYPE[entity.type],
    });
    // Pre-select high confidence associations
    const suggestion = proximitySuggestions.get(entity.id);
    if (suggestion) {
      const highConfidenceIds = suggestion.relatedEntities
        .filter((r) => r.confidence === "high")
        .map((r) => {
          const matchingNoteIds = entityMatches.get(r.entityId) || [];
          return matchingNoteIds[0]; // Take first matching note
        })
        .filter(Boolean);
      setSelectedAssociations(new Set(highConfidenceIds));
    } else {
      setSelectedAssociations(new Set());
    }
    setIsCreateOpen(true);
  };

  const handleLinkToExisting = (entity: DetectedEntity, noteId: string) => {
    if (!sessionLog) return;
    const mention = entity.mentions[0];

    createBacklinkMutation.mutate({
      targetNoteId: noteId,
      sourceNoteId: sessionLog.id,
      textSnippet: mention?.text || entity.text,
      sourceBlockId: mention?.blockId,
      startOffset: mention?.startOffset,
      endOffset: mention?.endOffset,
      evidenceType: "Mention",
      confidence: 0.8,
    });
    setSelectedEntity(entity);
  };

  // Handle creating entity from text selection (gap F20, PRD-003 FR-4)
  const handleCreateFromSelection = (text: string, type: EntityType) => {
    setCreateFormData({
      title: text,
      content: "",
      noteType: ENTITY_TYPE_NOTE_TYPE[type],
    });
    setSelectedEntity(null); // Not from detected entity
    // Locate the selected text in the session content (first occurrence) so
    // the backlink created after the note gets real offsets; if it can't be
    // found, fall back to a snippet-only backlink.
    let selection: {
      text: string;
      blockId?: string;
      startOffset?: number;
      endOffset?: number;
    } = { text };
    if (sessionLog?.contentBlocks && sessionLog.contentBlocks.length > 0) {
      for (const block of sessionLog.contentBlocks) {
        const idx = block.content.indexOf(text);
        if (idx >= 0) {
          selection = {
            text,
            blockId: block.id,
            startOffset: idx,
            endOffset: idx + text.length,
          };
          break;
        }
      }
    } else if (sessionLog?.content) {
      const idx = sessionLog.content.indexOf(text);
      if (idx >= 0) {
        selection = { text, startOffset: idx, endOffset: idx + text.length };
      }
    }
    setPendingSelection(selection);
    setSelectedAssociations(new Set()); // No proximity suggestions for manual selection
    setIsCreateOpen(true);
  };

  // Toggle association selection
  const toggleAssociation = (noteId: string) => {
    setSelectedAssociations((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const handleDismissEntity = (entityId: string) => {
    persistence.dismissEntity(entityId);
  };

  if (isLoadingSession || isLoadingNotes) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!sessionLog || sessionLog.noteType !== "session_log") {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">Session log not found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The requested session log could not be found.
            </p>
            <Button onClick={() => navigate("/notes")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Notes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/notes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-medium">Review Session</h1>
          <p className="text-muted-foreground">
            {sessionLog.title}
            {sessionLog.reviewedAt && (
              <span className="ml-2 text-xs text-green-600 dark:text-green-500">
                · Reviewed {format(new Date(sessionLog.reviewedAt), "MMM d, yyyy")}
              </span>
            )}
          </p>
        </div>
        {/* Gap F19 (PRD-003 FR-5): mark-reviewed action + visual state */}
        {sessionLog.reviewedAt ? (
          <Button
            variant="outline"
            onClick={() => markReviewedMutation.mutate(null)}
            disabled={markReviewedMutation.isPending}
            title="Click to un-mark as reviewed"
          >
            <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
            Reviewed ✓
          </Button>
        ) : (
          <Button
            onClick={() =>
              markReviewedMutation.mutate(new Date().toISOString())
            }
            disabled={markReviewedMutation.isPending}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Mark as Reviewed
          </Button>
        )}
      </div>

      <ResizablePanelGroup direction="horizontal" className="min-h-[600px]">
        <ResizablePanel defaultSize={60} minSize={40}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Session Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 overflow-auto max-h-[500px]">
              <SelectableContent onCreateEntity={handleCreateFromSelection}>
                {sessionLog.contentBlocks && sessionLog.contentBlocks.length > 0 ? (
                  sessionLog.contentBlocks.map((block, index) => (
                    <div key={block.id} className="p-3 bg-muted/50 rounded-lg mb-2 last:mb-0">
                      <p className="text-sm whitespace-pre-wrap select-text">{block.content}</p>
                    </div>
                  ))
                ) : sessionLog.content ? (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap select-text">{sessionLog.content}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No content in this session log.
                  </p>
                )}
              </SelectableContent>
            </CardContent>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={40} minSize={30}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Detected Entities
                </CardTitle>
                {totalCount > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {processedCount} / {totalCount} processed
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 overflow-auto max-h-[500px]">
              {isDetectingEntities ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Detecting entities...
                  </span>
                </div>
              ) : detectionError ? (
                <p className="text-destructive text-sm text-center py-8">
                  Failed to detect entities: {detectionError}
                </p>
              ) : detectedEntities.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                  No entities detected. Add content to your session log to detect
                  potential people, places, and quests.
                </p>
              ) : (
                <>
                  {activeEntities.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        New Entities
                      </h4>
                      {activeEntities.map((entity) => {
                        const Icon = ENTITY_TYPE_ICONS[entity.type];
                        return (
                          <div
                            key={entity.id}
                            className={`p-3 rounded-lg border ${ENTITY_TYPE_COLORS[entity.type]}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                <span className="font-medium">{entity.text}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div
                                  className={`w-2 h-2 rounded-full ${CONFIDENCE_COLORS[entity.confidence]}`}
                                  title={`${entity.confidence} confidence`}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <span className="capitalize">{entity.type}</span>
                              <span>·</span>
                              <span>{entity.frequency} mention(s)</span>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <Button
                                size="sm"
                                onClick={() => handleCreateEntity(entity)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Create
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDismissEntity(entity.id)}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Dismiss
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {matchedEntities.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Existing Entities
                      </h4>
                      {matchedEntities.map((entity) => {
                        const Icon = ENTITY_TYPE_ICONS[entity.type];
                        const matchingNoteIds = entityMatches.get(entity.id) || [];
                        const matchingNotes = allNotes?.filter((n) =>
                          matchingNoteIds.includes(n.id)
                        );
                        const isLinked = linkedEntities.has(entity.id);

                        return (
                          <div
                            key={entity.id}
                            className={`p-3 rounded-lg border ${
                              isLinked
                                ? "bg-green-500/5 border-green-500/20"
                                : ENTITY_TYPE_COLORS[entity.type]
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                <span className="font-medium">{entity.text}</span>
                                {isLinked && (
                                  <Check className="h-4 w-4 text-green-500" />
                                )}
                              </div>
                            </div>
                            {matchingNotes && matchingNotes.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {matchingNotes.map((note) => (
                                  <div
                                    key={note.id}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span className="truncate">{note.title}</span>
                                    {!isLinked && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7"
                                        onClick={() =>
                                          handleLinkToExisting(entity, note.id)
                                        }
                                      >
                                        <Link2 className="h-3 w-3 mr-1" />
                                        Link
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Progress summary (see F29 semantics comment above) */}
                  <div className="border-t pt-4 space-y-2">
                    {totalCount > 0 && (
                      <>
                        {/* Progress bar */}
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.round(
                                (Math.min(processedCount, totalCount) /
                                  totalCount) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{linkedCount} linked</span>
                          <span>{dismissedCount} dismissed</span>
                          <span>{remainingCount} remaining</span>
                        </div>
                        {isReviewComplete && (
                          <div className="text-center py-2">
                            <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
                            <p className="text-sm font-medium">Review Complete</p>
                            <p className="text-xs text-muted-foreground">
                              All entities have been processed
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Create Entity Dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setPendingSelection(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Entity</DialogTitle>
            <DialogDescription>
              Create a new note for this entity and link it to the session log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="entity-title">Title</Label>
              <Input
                id="entity-title"
                value={createFormData.title}
                onChange={(e) =>
                  setCreateFormData({ ...createFormData, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-type">Type</Label>
              <Select
                value={createFormData.noteType}
                onValueChange={(value: NoteType) =>
                  setCreateFormData({ ...createFormData, noteType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.filter((t) => t !== "session_log").map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() +
                        type.slice(1).replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-content">Description (optional)</Label>
              <Textarea
                id="entity-content"
                value={createFormData.content}
                onChange={(e) =>
                  setCreateFormData({ ...createFormData, content: e.target.value })
                }
                rows={3}
              />
            </div>
            {/* Proximity Suggestions */}
            {selectedEntitySuggestions.length > 0 && (
              <div className="space-y-2">
                <Label>Suggested Associations</Label>
                <p className="text-xs text-muted-foreground">
                  Entities mentioned nearby that might be related
                </p>
                <div className="space-y-2 max-h-32 overflow-auto">
                  {selectedEntitySuggestions.map((suggestion) =>
                    suggestion.notes.map((note) => (
                      <label
                        key={note.id}
                        className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAssociations.has(note.id)}
                          onChange={() => toggleAssociation(note.id)}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">
                            {note.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {suggestion.confidence} confidence
                          </span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                setPendingSelection(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createNoteMutation.mutate({
                  ...createFormData,
                  linkedNoteIds: Array.from(selectedAssociations),
                })
              }
              disabled={!createFormData.title.trim() || createNoteMutation.isPending}
            >
              {createNoteMutation.isPending ? "Creating..." : "Create & Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
