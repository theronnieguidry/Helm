import { useState, useEffect } from "react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Search,
  MapPin,
  User,
  Users,
  ScrollText,
  Lock,
  Globe,
  Pencil,
  Trash2,
  X,
  BookOpen,
  Calendar,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Note, NoteType, Team, QuestStatus } from "@shared/schema";
import { NOTE_TYPES, QUEST_STATUSES, QUEST_STATUS_LABELS, QUEST_STATUS_COLORS } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

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
};

const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  location: "bg-blue-500/10 text-blue-500",
  character: "bg-green-500/10 text-green-500",
  npc: "bg-orange-500/10 text-orange-500",
  poi: "bg-purple-500/10 text-purple-500",
  quest: "bg-red-500/10 text-red-500",
  session_log: "bg-amber-500/10 text-amber-500",
};

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  location: "Location",
  character: "Character",
  npc: "NPC",
  poi: "Point of Interest",
  quest: "Quest",
  session_log: "Session Log",
};

// Filter out session_log from regular note types
const REGULAR_NOTE_TYPES = NOTE_TYPES.filter((t) => t !== "session_log");

export default function NotesPage({ team }: NotesPageProps) {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<NoteType | "all">("all");
  const [activeTab, setActiveTab] = useState<"notes" | "sessions">("notes");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    noteType: "location" as NoteType,
    isPrivate: false,
    questStatus: "lead" as QuestStatus,
  });

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
      const response = await apiRequest("POST", `/api/teams/${team.id}/notes`, data);
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
      const response = await apiRequest("PATCH", `/api/teams/${team.id}/notes/${id}`, data);
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

  const resetForm = () => {
    setFormData({ title: "", content: "", noteType: "location", isPrivate: false, questStatus: "lead" });
  };

  const openEditNote = (note: Note) => {
    setFormData({
      title: note.title,
      content: note.content || "",
      noteType: note.noteType as NoteType,
      isPrivate: note.isPrivate || false,
      questStatus: (note.questStatus as QuestStatus) || "lead",
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

  const filteredNotes = notes?.filter((note) => {
    const matchesSearch =
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === "all" || note.noteType === selectedType;
    const isVisible = !note.isPrivate || note.authorId === user?.id;
    // Filter by tab: notes tab shows non-session notes, sessions tab shows session_log
    const matchesTab =
      activeTab === "sessions"
        ? note.noteType === "session_log"
        : note.noteType !== "session_log";
    return matchesSearch && matchesType && isVisible && matchesTab;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium">Notes</h1>
          <p className="text-muted-foreground">
            Keep track of your campaign details
          </p>
        </div>
        <Button
          onClick={() => {
            setFormData((prev) => ({
              ...prev,
              noteType: activeTab === "sessions" ? "session_log" : "location",
            }));
            setIsCreateOpen(true);
          }}
          data-testid="button-create-note"
        >
          <Plus className="h-4 w-4 mr-2" />
          {activeTab === "sessions" ? "New Session Log" : "New Note"}
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as "notes" | "sessions");
          setSelectedType("all");
        }}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="notes" data-testid="tab-notes">
            <ScrollText className="h-4 w-4 mr-2" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="sessions" data-testid="tab-sessions">
            <BookOpen className="h-4 w-4 mr-2" />
            Session Logs
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === "sessions" ? "Search session logs..." : "Search notes..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-notes"
          />
        </div>
        {activeTab === "notes" && (
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
            <Button
              variant={selectedType === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedType("all")}
              data-testid="filter-all"
            >
              All
            </Button>
            {REGULAR_NOTE_TYPES.map((type) => {
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
        )}
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
                    {note.noteType === "session_log" && note.sessionDate && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(note.sessionDate).toLocaleDateString()}
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
            {activeTab === "sessions" ? (
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            ) : (
              <ScrollText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            )}
            <h3 className="font-medium mb-1">
              {activeTab === "sessions" ? "No session logs found" : "No notes found"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery || selectedType !== "all"
                ? "Try adjusting your filters"
                : activeTab === "sessions"
                  ? "Create your first session log to get started"
                  : "Create your first note to get started"}
            </p>
            {!searchQuery && selectedType === "all" && (
              <Button
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    noteType: activeTab === "sessions" ? "session_log" : "location",
                  }));
                  setIsCreateOpen(true);
                }}
                data-testid="button-create-first-note"
              >
                <Plus className="h-4 w-4 mr-2" />
                {activeTab === "sessions" ? "Create Session Log" : "Create Note"}
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
              {selectedNote
                ? formData.noteType === "session_log"
                  ? "Edit Session Log"
                  : "Edit Note"
                : activeTab === "sessions"
                  ? "Create Session Log"
                  : "Create Note"}
            </DialogTitle>
            <DialogDescription>
              {selectedNote
                ? "Update your note details"
                : activeTab === "sessions"
                  ? "Add a new session log to your campaign"
                  : "Add a new note to your campaign"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder={activeTab === "sessions" ? "Session 1: The Beginning" : "Note title"}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                data-testid="input-note-title"
              />
            </div>
            {activeTab !== "sessions" && formData.noteType !== "session_log" && (
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
                    {REGULAR_NOTE_TYPES.map((type) => {
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
            )}
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
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCreateOpen(false);
                setSelectedNote(null);
                resetForm();
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
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
    </div>
  );
}
