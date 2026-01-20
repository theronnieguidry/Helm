import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Note, NoteType, Team } from "@shared/schema";
import { NOTE_TYPES } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

// Reclassification types (exclude session_log)
const RECLASSIFY_TYPES = NOTE_TYPES.filter((t) => t !== "session_log");

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  area: "Area",
  character: "Character",
  npc: "NPC",
  poi: "Point of Interest",
  quest: "Quest",
  session_log: "Session",
  note: "Note",
};

const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  area: "bg-blue-500/10 text-blue-500",
  character: "bg-green-500/10 text-green-500",
  npc: "bg-orange-500/10 text-orange-500",
  poi: "bg-purple-500/10 text-purple-500",
  quest: "bg-red-500/10 text-red-500",
  session_log: "bg-amber-500/10 text-amber-500",
  note: "bg-gray-500/10 text-gray-500",
};

interface NotesItemPreviewProps {
  note: Note;
  team: Team;
  children: React.ReactNode;
}

export function NotesItemPreview({
  note,
  team,
  children,
}: NotesItemPreviewProps) {
  const reclassifyMutation = useMutation({
    mutationFn: async (newType: NoteType) => {
      return apiRequest("PATCH", `/api/teams/${team.id}/notes/${note.id}`, {
        noteType: newType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", team.id, "notes"],
      });
    },
  });

  const contentSnippet =
    note.content && note.content.length > 300
      ? note.content.slice(0, 300) + "..."
      : note.content || "";

  const handleReclassify = (value: string) => {
    if (value !== note.noteType) {
      reclassifyMutation.mutate(value as NoteType);
    }
  };

  return (
    <HoverCard openDelay={300} closeDelay={200}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-sm leading-tight">{note.title}</h4>
            <Badge
              variant="secondary"
              className={`shrink-0 text-xs ${NOTE_TYPE_COLORS[note.noteType]}`}
            >
              {NOTE_TYPE_LABELS[note.noteType]}
            </Badge>
          </div>

          {contentSnippet && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {contentSnippet}
            </p>
          )}

          {note.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Updated {formatDistanceToNow(new Date(note.updatedAt))} ago
            </p>
          )}

          {note.noteType !== "session_log" && (
            <div className="pt-2 border-t">
              <label className="text-xs text-muted-foreground block mb-1.5">
                Reclassify as
              </label>
              <Select
                value={note.noteType}
                onValueChange={handleReclassify}
                disabled={reclassifyMutation.isPending}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECLASSIFY_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="text-xs">
                      {NOTE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
