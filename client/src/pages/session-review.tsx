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
  X,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Note, NoteType, Team } from "@shared/schema";
import { NOTE_TYPES } from "@shared/schema";
import {
  detectEntities,
  filterEntitiesByConfidence,
  matchEntitiesToNotes,
  type DetectedEntity,
  type EntityType,
} from "@shared/entity-detection";

interface SessionReviewPageProps {
  team: Team;
}

const ENTITY_TYPE_ICONS: Record<EntityType, typeof User> = {
  person: User,
  place: MapPin,
  quest: ScrollText,
};

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  person: "bg-green-500/10 text-green-500 border-green-500/20",
  place: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  quest: "bg-red-500/10 text-red-500 border-red-500/20",
};

const ENTITY_TYPE_NOTE_TYPE: Record<EntityType, NoteType> = {
  person: "npc",
  place: "location",
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    title: "",
    content: "",
    noteType: "npc" as NoteType,
  });
  const [linkedEntities, setLinkedEntities] = useState<Set<string>>(new Set());
  const [dismissedEntities, setDismissedEntities] = useState<Set<string>>(
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

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (data: typeof createFormData) => {
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
        createBacklinkMutation.mutate({
          targetNoteId: newNote.id,
          sourceNoteId: sessionLog.id,
          textSnippet: selectedEntity.mentions[0]?.text || selectedEntity.text,
        });
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
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/teams/${team.id}/notes/${data.targetNoteId}/backlinks`,
        {
          sourceNoteId: data.sourceNoteId,
          textSnippet: data.textSnippet,
        }
      );
      return response.json();
    },
    onSuccess: () => {
      if (selectedEntity) {
        setLinkedEntities((prev) => new Set(prev).add(selectedEntity.id));
      }
    },
  });

  // Detect entities from session log content
  const detectedEntities = useMemo(() => {
    if (!sessionLog) return [];

    const contentToAnalyze = sessionLog.contentBlocks
      ? sessionLog.contentBlocks.map((b) => ({
          id: b.id,
          content: b.content,
        }))
      : sessionLog.content || "";

    const entities = detectEntities(contentToAnalyze);
    return filterEntitiesByConfidence(entities, "low");
  }, [sessionLog]);

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

  const handleCreateEntity = (entity: DetectedEntity) => {
    setSelectedEntity(entity);
    setCreateFormData({
      title: entity.text,
      content: "",
      noteType: ENTITY_TYPE_NOTE_TYPE[entity.type],
    });
    setIsCreateOpen(true);
  };

  const handleLinkToExisting = (entity: DetectedEntity, noteId: string) => {
    if (!sessionLog) return;

    createBacklinkMutation.mutate({
      targetNoteId: noteId,
      sourceNoteId: sessionLog.id,
      textSnippet: entity.mentions[0]?.text || entity.text,
    });
    setSelectedEntity(entity);
  };

  const handleDismissEntity = (entityId: string) => {
    setDismissedEntities((prev) => new Set(prev).add(entityId));
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
        <div>
          <h1 className="text-2xl font-medium">Review Session</h1>
          <p className="text-muted-foreground">{sessionLog.title}</p>
        </div>
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
              {sessionLog.contentBlocks && sessionLog.contentBlocks.length > 0 ? (
                sessionLog.contentBlocks.map((block, index) => (
                  <div key={block.id} className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{block.content}</p>
                  </div>
                ))
              ) : sessionLog.content ? (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{sessionLog.content}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No content in this session log.
                </p>
              )}
            </CardContent>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={40} minSize={30}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Detected Entities
                {activeEntities.length > 0 && (
                  <Badge variant="secondary">{activeEntities.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 overflow-auto max-h-[500px]">
              {activeEntities.length === 0 && matchedEntities.length === 0 ? (
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

                  {linkedEntities.size > 0 && (
                    <div className="text-center py-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        {linkedEntities.size} entity/entities linked
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Create Entity Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createNoteMutation.mutate(createFormData)}
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
