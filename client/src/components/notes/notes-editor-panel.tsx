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
import { NoteDetailSections } from "./note-detail-sections";
import { ImportedNoteView } from "./imported-note-view";

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
  memberRole?: string; // PRD-048: role-gates relationship deletion
  onNoteCreated: (note: Note) => void;
  onNoteDeleted: (noteId: string) => void;
  onOpenNote?: (noteId: string) => void;
}

export function NotesEditorPanel({
  team,
  userId,
  selectedNote,
  todaySession,
  isTodayMode,
  memberAiEnabled,
  memberRole,
  onNoteCreated,
  onNoteDeleted,
  onOpenNote,
}: NotesEditorPanelProps) {
  const { toast } = useToast();
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftQuestStatus, setDraftQuestStatus] = useState<QuestStatus>("lead");
  // PRD-008 FR-4 (gap F2): session date is editable independently of the title
  const [draftSessionDate, setDraftSessionDate] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [hasCreatedToday, setHasCreatedToday] = useState(false);
  // Gap F47: imported notes render read-mode markdown until the user edits
  const [isEditingImported, setIsEditingImported] = useState(false);
  const isCreatingRef = useRef(false);
  // Gap F43: track the previous note + live drafts so we can flush unsaved
  // text before the editor switches away from it.
  const prevNoteRef = useRef<Note | null>(null);
  const draftsRef = useRef({ title: "", content: "", questStatus: "lead" as QuestStatus });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Get the active note (either selected note or today's session)
  const activeNote = isTodayMode ? todaySession : selectedNote;

  // Keep a live snapshot of drafts for the flush-on-switch path
  useEffect(() => {
    draftsRef.current = {
      title: draftTitle,
      content: draftContent,
      questStatus: draftQuestStatus,
    };
  });

  // Sync draft with active note. Keyed by note id (not object identity) so a
  // background refetch of the notes list does not clobber in-progress typing.
  const activeNoteId = activeNote?.id ?? null;
  useEffect(() => {
    // Gap F43 (PRD-019 FR-4): flush unsaved draft text for the note we are
    // leaving before resetting the editor, so switching selection inside the
    // debounce window never drops typed text.
    const prev = prevNoteRef.current;
    if (prev && prev.id !== activeNoteId) {
      const drafts = draftsRef.current;
      const dirty =
        drafts.title !== prev.title ||
        drafts.content !== (prev.content || "") ||
        (prev.noteType === "quest" &&
          drafts.questStatus !== (prev.questStatus || "lead"));
      if (dirty) {
        apiRequest("PATCH", `/api/teams/${team.id}/notes/${prev.id}`, {
          title: drafts.title,
          content: drafts.content,
          ...(prev.noteType === "quest" ? { questStatus: drafts.questStatus } : {}),
        })
          .then(() => {
            queryClient.invalidateQueries({
              queryKey: ["/api/teams", team.id, "notes"],
            });
          })
          .catch(() => {
            // The autosave error indicator already covers persistent failures;
            // a failed flush must not block switching notes.
          });
      }
    }
    prevNoteRef.current = activeNote ?? null;

    if (activeNote) {
      setDraftTitle(activeNote.title);
      setDraftContent(activeNote.content || "");
      setDraftQuestStatus(activeNote.questStatus || "lead");
      setDraftSessionDate(
        activeNote.sessionDate
          ? format(new Date(activeNote.sessionDate), "yyyy-MM-dd")
          : ""
      );
      setHasCreatedToday(true);
    } else if (isTodayMode) {
      setDraftTitle(todayStr);
      setDraftContent("");
      setDraftQuestStatus("lead");
      setDraftSessionDate("");
      setHasCreatedToday(false);
    }
    setIsEditingImported(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId, isTodayMode, todayStr]);

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

      // Gap F42 (PRD-019 FR-4): deleting today's session content back to empty
      // removes the session record instead of leaving a ghost entry.
      if (
        isTodayMode &&
        activeNote &&
        activeNote.noteType === "session_log" &&
        data.content.trim() === "" &&
        (activeNote.content || "").trim() !== ""
      ) {
        await apiRequest(
          "DELETE",
          `/api/teams/${team.id}/notes/${activeNote.id}`
        );
        setHasCreatedToday(false);
        onNoteDeleted(activeNote.id);
        queryClient.invalidateQueries({
          queryKey: ["/api/teams", team.id, "notes"],
        });
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
      team.id,
      onNoteDeleted,
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

  // PRD-008 FR-4 (gap F2): persist a session date change immediately
  const handleSessionDateChange = (value: string) => {
    setDraftSessionDate(value);
    if (!activeNote || !value) return;
    // Anchor at midday to avoid timezone-boundary date shifts
    apiRequest("PATCH", `/api/teams/${team.id}/notes/${activeNote.id}`, {
      sessionDate: new Date(`${value}T12:00:00`).toISOString(),
    })
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: ["/api/teams", team.id, "notes"],
        });
      })
      .catch(() => {
        toast({
          title: "Failed to update session date",
          variant: "destructive",
        });
      });
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
        {/* Title input. PRD-008 FR-3 (gap F3): session titles are editable too,
            e.g. "2026-07-05 - Dockside Investigation". */}
        {activeNote && (
          <div className="flex gap-3 flex-wrap">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder={
                  activeNote.noteType === "session_log"
                    ? "Session title"
                    : "Note title"
                }
              />
            </div>
            {/* PRD-008 FR-4 (gap F2): editable session date, independent of title */}
            {activeNote.noteType === "session_log" && (
              <div className="space-y-2">
                <Label htmlFor="session-date">Session Date</Label>
                <Input
                  id="session-date"
                  type="date"
                  value={draftSessionDate}
                  onChange={(e) => handleSessionDateChange(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            )}
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

        {/* Content editor. Gap F47 (PRD-015 FR-4): imported notes render their
            link-resolved markdown read-mode by default; Edit switches to the
            plain editor. */}
        {(isTodayMode || activeNote) && (
          <div className="space-y-2 flex-1">
            {activeNote &&
            activeNote.noteType !== "session_log" &&
            activeNote.sourceSystem &&
            activeNote.contentMarkdownResolved &&
            !isEditingImported ? (
              <ImportedNoteView
                note={activeNote}
                onOpenNote={onOpenNote}
                onEdit={() => setIsEditingImported(true)}
              />
            ) : (
              <>
                <Label htmlFor="content">
                  {isTodayMode ? "Session Notes" : "Content"}
                </Label>
                <Textarea
                  id="content"
                  value={draftContent}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder={
                    isTodayMode || activeNote?.noteType === "session_log"
                      ? "Start typing your session notes..."
                      : "Add details about this entity... (appearance, role, motivations, etc.)"
                  }
                  className="min-h-[400px] resize-none"
                />
              </>
            )}

            {/* Entity Suggestions Panel - only for session logs */}
            {(isTodayMode || activeNote?.noteType === "session_log") && (
              <EntitySuggestionsPanel
                team={team}
                // Gap F27: key suggestion persistence to the session's own date,
                // not today's, so reviewing an older session keeps its own state
                sessionDate={
                  activeNote?.sessionDate
                    ? format(new Date(activeNote.sessionDate), "yyyy-MM-dd")
                    : todayStr
                }
                content={draftContent}
                sessionNote={activeNote}
                memberAiEnabled={memberAiEnabled}
                onNoteCreated={onNoteCreated}
                onOpenNote={onOpenNote}
              />
            )}

            {/* PRD-048: entity pages show session references + relationships */}
            {!isTodayMode &&
              activeNote &&
              activeNote.noteType !== "session_log" && (
                <NoteDetailSections
                  team={team}
                  note={activeNote}
                  userId={userId}
                  isDm={memberRole === "dm"}
                  onOpenNote={onOpenNote}
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
