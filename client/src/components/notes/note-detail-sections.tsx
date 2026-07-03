import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Share2, ExternalLink, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { confidenceBucket, type ConfidenceBucket } from "@shared/cleanup-suggestions";
import type { Note, Team } from "@shared/schema";

interface NoteDetailReferenceIn {
  id: string;
  sourceNoteId: string;
  sourceBlockId?: string | null;
  sourceNoteTitle: string | null;
  sourceNoteType: string | null;
  sourceNoteSessionDate: string | null;
  createdByName: string | null;
  textSnippet: string | null;
  snippetPreview: string | null;
  createdAt: string;
}

interface NoteDetailRelationshipEnd {
  id: string;
  title: string | null;
  noteType: string | null;
  hidden?: boolean;
}

interface NoteDetailRelationship {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  relationshipType: string;
  evidenceType: string | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  createdByUserId: string | null;
  fromNote: NoteDetailRelationshipEnd;
  toNote: NoteDetailRelationshipEnd;
}

export interface NoteDetailResponse extends Note {
  referencesIn: NoteDetailReferenceIn[];
  referencesOut: unknown[];
  relationships: NoteDetailRelationship[];
}

const BUCKET_STYLES: Record<ConfidenceBucket, string> = {
  HIGH: "bg-green-500/10 text-green-600 border-green-500/20",
  REVIEW: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  LOW: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const BUCKET_LABELS: Record<ConfidenceBucket, string> = {
  HIGH: "High",
  REVIEW: "Needs review",
  LOW: "Low",
};

const RELATIONSHIP_GROUP_LABELS: Record<string, string> = {
  QuestHasNPC: "Quest ↔ NPC",
  QuestAtPlace: "Quest ↔ Place",
  NPCInPlace: "NPC ↔ Place",
  Related: "Related",
};

interface NoteDetailSectionsProps {
  team: Team;
  note: Note;
  userId: string;
  isDm: boolean;
  onOpenNote?: (noteId: string) => void;
}

/**
 * PRD-048: "Referenced in Sessions" + "Relationships" sections rendered on
 * entity pages (NPC/Area/Quest/POI/...). Both sections always render with
 * informative empty states so entity pages are never blank.
 */
export function NoteDetailSections({
  team,
  note,
  userId,
  isDm,
  onOpenNote,
}: NoteDetailSectionsProps) {
  const { toast } = useToast();

  const detailQueryKey = ["/api/teams", team.id, "notes", note.id];
  const { data: detail, isLoading } = useQuery<NoteDetailResponse>({
    queryKey: detailQueryKey,
    enabled: !!team.id && !!note.id,
  });

  const deleteRelationshipMutation = useMutation({
    mutationFn: async (relationshipId: string) => {
      await apiRequest(
        "DELETE",
        `/api/teams/${team.id}/relationships/${relationshipId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      toast({
        title: "Relationship removed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to remove relationship",
        variant: "destructive",
      });
    },
  });

  // PRD-048 FR-1c: group relationships by type
  const groupedRelationships = useMemo(() => {
    const groups = new Map<string, NoteDetailRelationship[]>();
    for (const relationship of detail?.relationships ?? []) {
      const group = groups.get(relationship.relationshipType) ?? [];
      group.push(relationship);
      groups.set(relationship.relationshipType, group);
    }
    return groups;
  }, [detail?.relationships]);

  if (isLoading) {
    return (
      <div className="space-y-3 border-t mt-4 pt-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const referencesIn = detail?.referencesIn ?? [];
  const relationships = detail?.relationships ?? [];

  return (
    <div className="space-y-4 border-t mt-4 pt-4">
      {/* PRD-048 FR-1b / FR-2: Referenced in Sessions */}
      <div className="space-y-2" data-testid="referenced-in-sessions">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Referenced in Sessions
          {referencesIn.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {referencesIn.length}
            </Badge>
          )}
        </h4>
        {referencesIn.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Not referenced in any sessions yet. Link mentions from session
            notes to see them here.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-auto">
            {referencesIn.map((reference) => (
              <button
                key={reference.id}
                type="button"
                onClick={() => onOpenNote?.(reference.sourceNoteId)}
                className="w-full text-left p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
                data-testid={`session-reference-${reference.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate text-sm">
                    {reference.sourceNoteTitle || "Private note"}
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </div>
                {reference.textSnippet && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                    "{reference.textSnippet}"
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  <span>
                    {reference.sourceNoteSessionDate
                      ? new Date(reference.sourceNoteSessionDate).toLocaleDateString()
                      : new Date(reference.createdAt).toLocaleDateString()}
                  </span>
                  {reference.createdByName && (
                    <>
                      <span>·</span>
                      <span>added by {reference.createdByName}</span>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PRD-048 FR-1c / FR-3: Relationships */}
      <div className="space-y-2" data-testid="relationships-section">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Share2 className="h-4 w-4" />
          Relationships
          {relationships.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {relationships.length}
            </Badge>
          )}
        </h4>
        {relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No relationships yet. Accept relationship suggestions from session
            notes or import linked pages to connect this entity.
          </p>
        ) : (
          <div className="space-y-3">
            {Array.from(groupedRelationships.entries()).map(([type, group]) => (
              <div key={type} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {RELATIONSHIP_GROUP_LABELS[type] || type}
                </p>
                {group.map((relationship) => {
                  const isOutgoing = relationship.fromNoteId === note.id;
                  const otherEnd = isOutgoing
                    ? relationship.toNote
                    : relationship.fromNote;
                  const bucket =
                    relationship.confidence != null
                      ? confidenceBucket(relationship.confidence)
                      : null;
                  const canDelete =
                    isDm || relationship.createdByUserId === userId;

                  return (
                    <div
                      key={relationship.id}
                      className="p-2.5 rounded-lg border flex items-start justify-between gap-2"
                      data-testid={`relationship-${relationship.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            className="text-sm font-medium hover:underline truncate"
                            onClick={() =>
                              !otherEnd.hidden && onOpenNote?.(otherEnd.id)
                            }
                          >
                            {otherEnd.hidden
                              ? "Private note"
                              : otherEnd.title || "Untitled"}
                          </button>
                          {relationship.evidenceType && (
                            <Badge variant="outline" className="text-xs py-0 px-1.5">
                              {relationship.evidenceType}
                            </Badge>
                          )}
                          {bucket && (
                            <Badge
                              variant="outline"
                              className={`text-xs py-0 px-1.5 ${BUCKET_STYLES[bucket]}`}
                            >
                              {BUCKET_LABELS[bucket]}
                            </Badge>
                          )}
                        </div>
                        {relationship.evidenceSnippet && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                            "{relationship.evidenceSnippet}"
                          </p>
                        )}
                      </div>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                          aria-label="Remove relationship"
                          disabled={deleteRelationshipMutation.isPending}
                          onClick={() =>
                            deleteRelationshipMutation.mutate(relationship.id)
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
