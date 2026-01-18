import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Backlink {
  id: string;
  sourceNoteId: string;
  sourceBlockId?: string;
  targetNoteId: string;
  textSnippet?: string;
  createdAt: string;
}

interface SourceNote {
  id: string;
  title: string;
  noteType: string;
  sessionDate?: string;
  createdAt: string;
}

interface MentionedInSectionProps {
  teamId: string;
  noteId: string;
  onNavigateToNote?: (noteId: string, blockId?: string) => void;
}

export function MentionedInSection({
  teamId,
  noteId,
  onNavigateToNote,
}: MentionedInSectionProps) {
  // Fetch backlinks for this note
  const { data: backlinks, isLoading: isLoadingBacklinks } = useQuery<Backlink[]>({
    queryKey: ["/api/teams", teamId, "notes", noteId, "backlinks"],
    enabled: !!teamId && !!noteId,
  });

  // Fetch all notes to get source note details
  const { data: allNotes, isLoading: isLoadingNotes } = useQuery<SourceNote[]>({
    queryKey: ["/api/teams", teamId, "notes"],
    enabled: !!teamId && backlinks && backlinks.length > 0,
  });

  const isLoading = isLoadingBacklinks || isLoadingNotes;

  // Map backlinks to source notes
  const mentionsWithNotes = backlinks
    ?.map((backlink) => {
      const sourceNote = allNotes?.find((n) => n.id === backlink.sourceNoteId);
      return sourceNote ? { backlink, sourceNote } : null;
    })
    .filter(Boolean) as { backlink: Backlink; sourceNote: SourceNote }[] | undefined;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Mentioned In
        </h4>
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (!mentionsWithNotes || mentionsWithNotes.length === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Mentioned In
        </h4>
        <p className="text-sm text-muted-foreground py-4 text-center">
          Not mentioned in any session logs yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <BookOpen className="h-4 w-4" />
        Mentioned In
        <Badge variant="secondary" className="text-xs">
          {mentionsWithNotes.length}
        </Badge>
      </h4>
      <div className="space-y-2 max-h-48 overflow-auto">
        {mentionsWithNotes.map(({ backlink, sourceNote }) => (
          <button
            key={backlink.id}
            onClick={() => onNavigateToNote?.(sourceNote.id, backlink.sourceBlockId)}
            className="w-full text-left p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{sourceNote.title}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </div>
                {backlink.textSnippet && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    "{backlink.textSnippet}"
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>
                {sourceNote.sessionDate
                  ? new Date(sourceNote.sessionDate).toLocaleDateString()
                  : new Date(sourceNote.createdAt).toLocaleDateString()}
              </span>
              <span>·</span>
              <span>
                {formatDistanceToNow(new Date(backlink.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
