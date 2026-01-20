import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAutosave, type SaveStatus } from "@/hooks/use-autosave";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Loader2,
  AlertCircle,
  Trash2,
  Calendar,
  MapPin,
  User,
  Users,
  ScrollText,
  FileText,
  BookOpen,
} from "lucide-react";
import type { Note, NoteType, Team, QuestStatus } from "@shared/schema";
import { QUEST_STATUSES, QUEST_STATUS_LABELS } from "@shared/schema";
import { format } from "date-fns";
import { EntitySuggestionsPanel } from "./entity-suggestions-panel";

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  area: "Area",
  character: "Character",
  npc: "NPC",
  poi: "Point of Interest",
  quest: "Quest",
  session_log: "Session",
  note: "Note",
};

const NOTE_TYPE_ICONS: Record<NoteType, typeof MapPin> = {
  area: MapPin,
  character: User,
  npc: Users,
  poi: MapPin,
  quest: ScrollText,
  session_log: BookOpen,
  note: FileText,
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

interface NotesEditorPanelProps {
  team: Team;
  userId: string;
  selectedNote: Note | null;
  todaySession: Note | null;
  isTodayMode: boolean;
  memberAiEnabled: boolean; // PRD-028
  onNoteCreated: (note: Note) => void;
  onNoteDeleted: (noteId: string) => void;
}

export function NotesEditorPanel({
  team,
  userId,
  selectedNote,
  todaySession,
  isTodayMode,
  memberAiEnabled,
  onNoteCreated,
  onNoteDeleted,
}: NotesEditorPanelProps) {
  const { toast } = useToast();
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftQuestStatus, setDraftQuestStatus] = useState<QuestStatus>("lead");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [hasCreatedToday, setHasCreatedToday] = useState(false);
  const isCreatingRef = useRef(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Get the active note (either selected note or today's session)
  const activeNote = isTodayMode ? todaySession : selectedNote;

  // Sync draft with active note
  useEffect(() => {
    if (activeNote) {
      setDraftTitle(activeNote.title);
      setDraftContent(activeNote.content || "");
      setDraftQuestStatus(activeNote.questStatus || "lead");
      setHasCreatedToday(true);
    } else if (isTodayMode) {
      setDraftTitle(todayStr);
      setDraftContent("");
      setDraftQuestStatus("lead");
      setHasCreatedToday(false);
    }
  }, [activeNote, isTodayMode, todayStr]);

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest(
        "POST",
        `/api/teams/${team.id}/notes`,
        {
          title: todayStr,
          content,
          noteType: "session_log",
          sessionDate: new Date().toISOString(),
          isPrivate: false,
        }
      );
      return response.json();
    },
    onSuccess: (note) => {
      setHasCreatedToday(true);
      onNoteCreated(note);
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", team.id, "notes"],
      });
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async (data: {
      title?: string;
      content?: string;
      questStatus?: QuestStatus;
    }) => {
      if (!activeNote) return null;
      const response = await apiRequest(
        "PATCH",
        `/api/teams/${team.id}/notes/${activeNote.id}`,
        data
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", team.id, "notes"],
      });
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async () => {
      if (!activeNote) return;
      await apiRequest(
        "DELETE",
        `/api/teams/${team.id}/notes/${activeNote.id}`
      );
    },
    onSuccess: () => {
      if (activeNote) {
        onNoteDeleted(activeNote.id);
      }
      setDraftContent("");
      setDraftTitle(todayStr);
      setHasCreatedToday(false);
      queryClient.invalidateQueries({
        queryKey: ["/api/teams", team.id, "notes"],
      });
      toast({
        title: "Note deleted",
        description: "The note has been deleted.",
      });
    },
  });

  // Handle autosave
  const handleAutosave = useCallback(
    async (data: { title: string; content: string; questStatus: QuestStatus }) => {
      // In today mode without an existing session
      if (isTodayMode && !todaySession && !hasCreatedToday) {
        // Only create if there's content and we're not already creating
        if (data.content.trim() && !isCreatingRef.current) {
          isCreatingRef.current = true;
          try {
            await createSessionMutation.mutateAsync(data.content);
          } finally {
            isCreatingRef.current = false;
          }
        }
        return;
      }

      // Update existing note
      if (activeNote) {
        await updateNoteMutation.mutateAsync({
          title: data.title,
          content: data.content,
          questStatus:
            activeNote.noteType === "quest" ? data.questStatus : undefined,
        });
      }
    },
    [
      isTodayMode,
      todaySession,
      hasCreatedToday,
      activeNote,
      createSessionMutation,
      updateNoteMutation,
    ]
  );

  // Autosave hook
  const { status: autosaveStatus } = useAutosave({
    data: { title: draftTitle, content: draftContent, questStatus: draftQuestStatus },
    onSave: handleAutosave,
    debounceMs: 750,
    maxWaitMs: 10000,
    enabled: isTodayMode || !!activeNote,
  });

  // Handle delete
  const handleDelete = () => {
    setIsDeleteOpen(false);
    deleteNoteMutation.mutate();
  };

  // Handle content change - check for empty to potentially delete
  const handleContentChange = (value: string) => {
    setDraftContent(value);

    // If content becomes empty and we have an existing today's session, optionally delete it
    // For now, we just let the autosave handle it - an empty session is fine
  };

  const Icon = activeNote
    ? NOTE_TYPE_ICONS[activeNote.noteType]
    : NOTE_TYPE_ICONS.session_log;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          {isTodayMode ? (
            <>
              <Calendar className="h-5 w-5 text-amber-500" />
              <h2 className="font-semibold text-lg">Today — {todayStr}</h2>
            </>
          ) : activeNote ? (
            <>
              <Icon
                className={`h-5 w-5 ${NOTE_TYPE_COLORS[activeNote.noteType].split(" ")[1]}`}
              />
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={NOTE_TYPE_COLORS[activeNote.noteType]}
                >
                  {NOTE_TYPE_LABELS[activeNote.noteType]}
                </Badge>
                <h2 className="font-semibold text-lg">{activeNote.title}</h2>
              </div>
            </>
          ) : (
            <h2 className="font-semibold text-lg text-muted-foreground">
              Select a note
            </h2>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Autosave status */}
          <SaveStatusIndicator status={autosaveStatus} />

          {/* Delete button */}
          {activeNote && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Title input (for non-session notes) */}
        {activeNote && activeNote.noteType !== "session_log" && (
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Note title"
            />
          </div>
        )}

        {/* Quest status (for quest notes) */}
        {activeNote && activeNote.noteType === "quest" && (
          <div className="space-y-2">
            <Label>Quest Status</Label>
            <Select
              value={draftQuestStatus}
              onValueChange={(v) => setDraftQuestStatus(v as QuestStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUEST_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {QUEST_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Content editor */}
        {(isTodayMode || activeNote) && (
          <div className="space-y-2 flex-1">
            <Label htmlFor="content">
              {isTodayMode ? "Session Notes" : "Content"}
            </Label>
            <Textarea
              id="content"
              value={draftContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder={
                isTodayMode
                  ? "Start typing your session notes..."
                  : "Write your notes here..."
              }
              className="min-h-[400px] resize-none"
            />

            {/* Entity Suggestions Panel - only for session logs */}
            {(isTodayMode || activeNote?.noteType === "session_log") && (
              <EntitySuggestionsPanel
                team={team}
                sessionDate={todayStr}
                content={draftContent}
                sessionNote={activeNote}
                memberAiEnabled={memberAiEnabled}
                onNoteCreated={onNoteCreated}
              />
            )}
          </div>
        )}

        {/* Empty state */}
        {!isTodayMode && !activeNote && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Select a note from the left panel or click "Today" to start writing</p>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete "
              {activeNote?.title}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {status === "pending" && (
        <>
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Unsaved changes</span>
        </>
      )}
      {status === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Saving...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3 w-3 text-green-500" />
          <span>Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-3 w-3 text-destructive" />
          <span>Failed to save</span>
        </>
      )}
    </div>
  );
}
