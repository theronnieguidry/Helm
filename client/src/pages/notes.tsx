import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  Plus,
  Search,
  MapPin,
  User,
  Users,
  ScrollText,
  Lock,
  Globe,
  Trash2,
  BookOpen,
  Calendar,
  Check,
  Loader2,
  AlertCircle,
  FolderOpen,
  FileText,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useAutosave, type SaveStatus } from "@/hooks/use-autosave";
import { MentionedInSection } from "@/components/mentioned-in-section";
import { NuclinoImportDialog } from "@/components/nuclino-import-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Note, NoteType, Team, QuestStatus } from "@shared/schema";
import { NOTE_TYPES, QUEST_STATUSES, QUEST_STATUS_LABELS, QUEST_STATUS_COLORS } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

// Helper to format date as YYYY-MM-DD
function formatDateForTitle(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Helper to format date for input[type="date"]
function formatDateForInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

interface NotesPageProps {
  team: Team;
}

const NOTE_TYPE_ICONS: Record<NoteType, typeof MapPin> = {
  location: MapPin,
  character: User,
  npc: Users,
  poi: MapPin,
  quest: ScrollText,
  session_log: BookOpen,
  // PRD-015: Import types
  person: User,
  place: MapPin,
  collection: FolderOpen,
  note: FileText,
};

const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  location: "bg-blue-500/10 text-blue-500",
  character: "bg-green-500/10 text-green-500",
  npc: "bg-orange-500/10 text-orange-500",
  poi: "bg-purple-500/10 text-purple-500",
  quest: "bg-red-500/10 text-red-500",
  session_log: "bg-amber-500/10 text-amber-500",
  // PRD-015: Import types
  person: "bg-cyan-500/10 text-cyan-500",
  place: "bg-teal-500/10 text-teal-500",
  collection: "bg-indigo-500/10 text-indigo-500",
  note: "bg-gray-500/10 text-gray-500",
};

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  location: "Location",
  character: "Character",
  npc: "NPC",
  poi: "Point of Interest",
  quest: "Quest",
  session_log: "Session",
  // PRD-015: Import types
  person: "Person",
  place: "Place",
  collection: "Collection",
  note: "Note",
};

export default function NotesPage({ team }: NotesPageProps) {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<NoteType | "all">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Default form data for creating new sessions
  const getDefaultFormData = () => ({
    title: formatDateForTitle(new Date()),
    content: "",
    noteType: "session_log" as NoteType,
    isPrivate: false,
    questStatus: "lead" as QuestStatus,
    sessionDate: formatDateForInput(new Date()),
  });

  const [formData, setFormData] = useState(getDefaultFormData());

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("create") === "true") {
      setIsCreateOpen(true);
      navigate("/notes", { replace: true });
    }
  }, [searchString, navigate]);

  const { data: notes, isLoading } = useQuery<Note[]>({
    queryKey: ["/api/teams", team.id, "notes"],
    enabled: !!team.id,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Convert sessionDate string to Date for API
      const apiData = {
        ...data,
        sessionDate: data.sessionDate ? new Date(data.sessionDate).toISOString() : undefined,
      };
      const response = await apiRequest("POST", `/api/teams/${team.id}/notes`, apiData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "notes"] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: "Note created", description: "Your note has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create note", description: error.message, variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      // Convert sessionDate string to Date for API
      const apiData = {
        ...data,
        sessionDate: data.sessionDate ? new Date(data.sessionDate).toISOString() : undefined,
      };
      const response = await apiRequest("PATCH", `/api/teams/${team.id}/notes/${id}`, apiData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "notes"] });
      setSelectedNote(null);
      resetForm();
      toast({ title: "Note updated", description: "Your changes have been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update note", description: error.message, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/teams/${team.id}/notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "notes"] });
      setIsDeleteOpen(false);
      setNoteToDelete(null);
      toast({ title: "Note deleted", description: "The note has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete note", description: error.message, variant: "destructive" });
    },
  });

  // Autosave function for session logs
  const handleAutosave = useCallback(async (data: typeof formData) => {
    if (!selectedNote) return;
    const apiData = {
      ...data,
      sessionDate: data.sessionDate ? new Date(data.sessionDate).toISOString() : undefined,
    };
    await apiRequest("PATCH", `/api/teams/${team.id}/notes/${selectedNote.id}`, apiData);
    queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "notes"] });
  }, [selectedNote, team.id]);

  // Autosave hook - enabled only when editing a session log
  const { status: autosaveStatus, lastSavedAt } = useAutosave({
    data: formData,
    onSave: handleAutosave,
    debounceMs: 2000,  // 2 second idle debounce
    maxWaitMs: 15000,  // 15 second hard limit
    enabled: !!selectedNote && formData.noteType === "session_log",
  });

  const resetForm = () => {
    setFormData(getDefaultFormData());
  };

  const openEditNote = (note: Note) => {
    setFormData({
      title: note.title,
      content: note.content || "",
      noteType: note.noteType as NoteType,
      isPrivate: note.isPrivate || false,
      questStatus: (note.questStatus as QuestStatus) || "lead",
      sessionDate: note.sessionDate
        ? formatDateForInput(new Date(note.sessionDate))
        : formatDateForInput(new Date(note.createdAt!)),
    });
    setSelectedNote(note);
  };

  const handleSubmit = () => {
    if (selectedNote) {
      updateNoteMutation.mutate({ id: selectedNote.id, data: formData });
    } else {
      createNoteMutation.mutate(formData);
    }
  };

  // Filter and sort notes - all notes shown together, sorted by session date (descending)
  const filteredNotes = notes
    ?.filter((note) => {
      const matchesSearch =
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === "all" || note.noteType === selectedType;
      const isVisible = !note.isPrivate || note.authorId === user?.id;
      return matchesSearch && matchesType && isVisible;
    })
    .sort((a, b) => {
      // Sort by sessionDate (for session logs) or createdAt (for other types), descending
      const dateA = a.sessionDate ? new Date(a.sessionDate) : new Date(a.createdAt!);
      const dateB = b.sessionDate ? new Date(b.sessionDate) : new Date(b.createdAt!);
      return dateB.getTime() - dateA.getTime();
    });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium">Sessions</h1>
          <p className="text-muted-foreground">
            Record and review your session notes
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button
            onClick={() => {
              resetForm(); // Reset to defaults (today's date, session_log type)
              setIsCreateOpen(true);
            }}
            data-testid="button-create-note"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Session
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-notes"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          <Button
            variant={selectedType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedType("all")}
            data-testid="filter-all"
          >
            All
          </Button>
          {NOTE_TYPES.map((type) => {
            const Icon = NOTE_TYPE_ICONS[type];
            return (
              <Button
                key={type}
                variant={selectedType === type ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedType(type)}
                data-testid={`filter-${type}`}
              >
                <Icon className="h-4 w-4 mr-1" />
                {NOTE_TYPE_LABELS[type]}
              </Button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : filteredNotes && filteredNotes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map(note => {
            const Icon = NOTE_TYPE_ICONS[note.noteType as NoteType];
            const isOwner = note.authorId === user?.id;
            return (
              <Card 
                key={note.id} 
                className="hover-elevate transition-all cursor-pointer group"
                onClick={() => openEditNote(note)}
                data-testid={`note-card-${note.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className={`h-10 w-10 rounded-md flex items-center justify-center flex-shrink-0 ${NOTE_TYPE_COLORS[note.noteType as NoteType]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1">
                      {note.isPrivate ? (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      )}
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNoteToDelete(note);
                            setIsDeleteOpen(true);
                          }}
                          data-testid={`delete-note-${note.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <h3 className="font-medium mb-1 line-clamp-1">{note.title}</h3>
                  {note.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {note.content}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {note.sessionDate
                        ? new Date(note.sessionDate).toLocaleDateString()
                        : new Date(note.createdAt!).toLocaleDateString()}
                    </Badge>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {NOTE_TYPE_LABELS[note.noteType as NoteType]}
                    </Badge>
                    {note.noteType === "quest" && note.questStatus && (
                      <Badge
                        className={`text-xs ${QUEST_STATUS_COLORS[note.questStatus as QuestStatus]}`}
                      >
                        {QUEST_STATUS_LABELS[note.questStatus as QuestStatus]}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(note.updatedAt!), { addSuffix: true })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">No sessions found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery || selectedType !== "all"
                ? "Try adjusting your filters"
                : "Create your first session to get started"}
            </p>
            {!searchQuery && selectedType === "all" && (
              <Button
                onClick={() => {
                  resetForm();
                  setIsCreateOpen(true);
                }}
                data-testid="button-create-first-note"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Session
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={isCreateOpen || !!selectedNote} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setSelectedNote(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedNote ? "Edit Session" : "Create Session"}
            </DialogTitle>
            <DialogDescription>
              {selectedNote
                ? "Update your session details"
                : "Record notes from your session"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sessionDate">Session Date</Label>
                <Input
                  id="sessionDate"
                  type="date"
                  value={formData.sessionDate}
                  onChange={(e) => setFormData({ ...formData, sessionDate: e.target.value })}
                  data-testid="input-session-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="noteType">Type</Label>
                <Select
                  value={formData.noteType}
                  onValueChange={(value: NoteType) => setFormData({ ...formData, noteType: value })}
                >
                  <SelectTrigger data-testid="select-note-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map((type) => {
                      const Icon = NOTE_TYPE_ICONS[type];
                      return (
                        <SelectItem key={type} value={type}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {NOTE_TYPE_LABELS[type]}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="2024-01-15 — The Dragon's Lair"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                data-testid="input-note-title"
              />
              <p className="text-xs text-muted-foreground">
                Tip: Add a suffix like " — Session 14" or " — The Heist"
              </p>
            </div>
            {formData.noteType === "quest" && (
              <div className="space-y-2">
                <Label htmlFor="questStatus">Quest Status</Label>
                <Select
                  value={formData.questStatus}
                  onValueChange={(value: QuestStatus) =>
                    setFormData({ ...formData, questStatus: value })
                  }
                >
                  <SelectTrigger data-testid="select-quest-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUEST_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${QUEST_STATUS_COLORS[status].split(" ")[0]}`}
                          />
                          {QUEST_STATUS_LABELS[status]}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                placeholder="Write your notes here..."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={6}
                data-testid="textarea-note-content"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="private">Private Note</Label>
                <p className="text-sm text-muted-foreground">
                  Only visible to you
                </p>
              </div>
              <Switch
                id="private"
                checked={formData.isPrivate}
                onCheckedChange={(checked) => setFormData({ ...formData, isPrivate: checked })}
                data-testid="switch-private"
              />
            </div>
            {/* Show "Mentioned In" section for entity notes (not session logs) */}
            {selectedNote && formData.noteType !== "session_log" && (
              <MentionedInSection
                teamId={team.id}
                noteId={selectedNote.id}
                onNavigateToNote={(noteId) => {
                  setSelectedNote(null);
                  // Navigate to session review for the source note
                  navigate(`/session-review/${noteId}`);
                }}
              />
            )}
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {/* Autosave status indicator for session logs */}
            {selectedNote && formData.noteType === "session_log" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="autosave-status">
                {autosaveStatus === "pending" && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>Unsaved changes</span>
                  </>
                )}
                {autosaveStatus === "saving" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                )}
                {autosaveStatus === "saved" && (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Saved</span>
                  </>
                )}
                {autosaveStatus === "error" && (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span>Failed to save</span>
                  </>
                )}
                {autosaveStatus === "idle" && lastSavedAt && (
                  <>
                    <Check className="h-4 w-4 text-muted-foreground" />
                    <span>Saved</span>
                  </>
                )}
              </div>
            ) : (
              <div /> // Spacer for flex alignment
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false);
                  setSelectedNote(null);
                  resetForm();
                }}
                data-testid="button-cancel"
              >
                {selectedNote && formData.noteType === "session_log" ? "Close" : "Cancel"}
              </Button>
              {/* Hide manual save button for session logs being edited (autosave handles it) */}
              {!(selectedNote && formData.noteType === "session_log") && (
                <Button
                  onClick={handleSubmit}
                  disabled={!formData.title.trim() || createNoteMutation.isPending || updateNoteMutation.isPending}
                  data-testid="button-save-note"
                >
                  {createNoteMutation.isPending || updateNoteMutation.isPending
                    ? "Saving..."
                    : selectedNote
                    ? "Update"
                    : "Create"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{noteToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => noteToDelete && deleteNoteMutation.mutate(noteToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteNoteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PRD-015: Nuclino Import Dialog */}
      <NuclinoImportDialog
        teamId={team.id}
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
      />
    </div>
  );
}
