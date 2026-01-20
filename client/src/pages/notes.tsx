import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Upload } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { NotesLeftPanel } from "@/components/notes/notes-left-panel";
import { NotesEditorPanel } from "@/components/notes/notes-editor-panel";
import { NuclinoImportDialog } from "@/components/nuclino-import-dialog";
import type { Note, Team, TeamMember } from "@shared/schema";
import { format, isSameDay } from "date-fns";

interface NotesPageProps {
  team: Team;
}

export default function NotesPage({ team }: NotesPageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isTodayMode, setIsTodayMode] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { data: notes, isLoading } = useQuery<Note[]>({
    queryKey: ["/api/teams", team.id, "notes"],
    enabled: !!team.id,
  });

  // PRD-037: Get low-confidence classifications needing review
  const { data: needsReviewData } = useQuery<{
    items: Array<{
      classificationId: string;
      noteId: string;
      noteTitle: string;
      inferredType: string;
      confidence: number;
      explanation: string | null;
    }>;
    count: number;
  }>({
    queryKey: ["/api/teams", team.id, "notes", "needs-review"],
    enabled: !!team.id,
  });

  // PRD-028: Get team members to check AI enabled status
  const { data: members } = useQuery<TeamMember[]>({
    queryKey: ["/api/teams", team.id, "members"],
    enabled: !!team.id,
  });

  const currentMember = members?.find(m => m.userId === user?.id);

  // PRD-038: Mutation for approving/rejecting classifications
  const updateClassification = useMutation({
    mutationFn: async ({
      classificationId,
      status,
      overrideType
    }: {
      classificationId: string;
      status: "approved" | "rejected";
      overrideType?: string;
    }) => {
      return apiRequest("PATCH", `/api/teams/${team.id}/classifications/${classificationId}`, {
        status,
        ...(overrideType && { overrideType }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "notes", "needs-review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "notes"] });
    },
  });

  const handleApproveReview = (classificationId: string) => {
    updateClassification.mutate({ classificationId, status: "approved" });
  };

  const handleRejectReview = (classificationId: string) => {
    updateClassification.mutate({ classificationId, status: "rejected" });
  };

  const handleReclassifyReview = (classificationId: string, newType: string) => {
    updateClassification.mutate({ classificationId, status: "approved", overrideType: newType });
  };

  // Filter out private notes from other users
  const visibleNotes = useMemo(() => {
    if (!notes) return [];
    return notes.filter(
      (note) => !note.isPrivate || note.authorId === user?.id
    );
  }, [notes, user?.id]);

  // Find today's session
  const todaySession = useMemo(() => {
    if (!visibleNotes) return null;
    const today = new Date();
    return (
      visibleNotes.find(
        (note) =>
          note.noteType === "session_log" &&
          note.sessionDate &&
          isSameDay(new Date(note.sessionDate), today)
      ) || null
    );
  }, [visibleNotes]);

  // Get selected note
  const selectedNote = useMemo(() => {
    if (!selectedNoteId || !visibleNotes) return null;
    return visibleNotes.find((n) => n.id === selectedNoteId) || null;
  }, [selectedNoteId, visibleNotes]);

  const handleSelectNote = (note: Note) => {
    setSelectedNoteId(note.id);
    setIsTodayMode(false);
  };

  const handleSelectTodaySession = () => {
    setSelectedNoteId(null);
    setIsTodayMode(true);
  };

  const handleNoteCreated = (note: Note) => {
    // If today's session was created, stay in today mode
    if (note.noteType === "session_log") {
      setIsTodayMode(true);
    }
  };

  const handleNoteDeleted = (noteId: string) => {
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
      setIsTodayMode(true);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex">
        <div className="w-1/3 border-r p-4 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex-1 p-4">
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <h1 className="text-lg font-semibold">Notes</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsImportOpen(true)}
        >
          <Upload className="h-4 w-4 mr-2" />
          Import
        </Button>
      </div>

      {/* Two-panel layout */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1"
      >
        <ResizablePanel
          defaultSize={33}
          minSize={25}
          maxSize={45}
          className="min-w-[250px]"
        >
          <NotesLeftPanel
            notes={visibleNotes}
            team={team}
            selectedNoteId={selectedNoteId}
            isTodayMode={isTodayMode}
            onSelectNote={handleSelectNote}
            onSelectTodaySession={handleSelectTodaySession}
            needsReviewItems={needsReviewData?.items}
            onApproveReview={handleApproveReview}
            onRejectReview={handleRejectReview}
            onReclassifyReview={handleReclassifyReview}
            isReviewActionPending={updateClassification.isPending}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={67} minSize={50}>
          <NotesEditorPanel
            team={team}
            userId={user?.id || ""}
            selectedNote={selectedNote}
            todaySession={todaySession}
            isTodayMode={isTodayMode}
            memberAiEnabled={currentMember?.aiEnabled ?? false}
            onNoteCreated={handleNoteCreated}
            onNoteDeleted={handleNoteDeleted}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Import Dialog */}
      <NuclinoImportDialog
        teamId={team.id}
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        memberAiEnabled={currentMember?.aiEnabled ?? false}
      />
    </div>
  );
}
