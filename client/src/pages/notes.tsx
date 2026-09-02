import { useState, useMemo, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Upload, ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { NotesLeftPanel } from "@/components/notes/notes-left-panel";
import { NotesEditorPanel } from "@/components/notes/notes-editor-panel";
import { NuclinoImportDialog } from "@/components/nuclino-import-dialog";
import type { Note, Team, TeamMember } from "@shared/schema";
import { format, isSameDay } from "date-fns";

interface NotesPageProps {
  team: Team;
}

// The members endpoint attaches user profile fields for display (M13)
type MemberWithUser = TeamMember & {
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    profileImageUrl?: string | null;
    email?: string | null;
  };
};

export default function NotesPage({ team }: NotesPageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isTodayMode, setIsTodayMode] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);
  // M9: below md the two panels become a single-pane list ⇄ editor flow.
  // Capture-first: the page opens on the Today editor, Back reaches the list.
  const [mobileView, setMobileView] = useState<"list" | "editor">("editor");

  // Gap F47 (PRD-015 FR-4): honor /notes/:id deep links (imported wiki links,
  // browser history) by selecting the target note instead of ignoring the param.
  const [matchesNoteRoute, noteRouteParams] = useRoute("/notes/:id");
  const routeNoteId = matchesNoteRoute ? noteRouteParams?.id : undefined;
  useEffect(() => {
    if (routeNoteId) {
      setSelectedNoteId(routeNoteId);
      setIsTodayMode(false);
      setMobileView("editor");
    }
  }, [routeNoteId]);

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
  const { data: members } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/teams", team.id, "members"],
    enabled: !!team.id,
  });

  const currentMember = members?.find(m => m.userId === user?.id);

  // M13: authorId → display name, so session rows/header can say whose log it is
  const authorNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members ?? []) {
      map[m.userId] =
        [m.user?.firstName, m.user?.lastName].filter(Boolean).join(" ") ||
        m.user?.email ||
        "Member";
    }
    return map;
  }, [members]);

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

  // Find today's session. M1: sessions are per-author — only the current
  // user's own log may pre-fill the Today editor, never a teammate's.
  const todaySession = useMemo(() => {
    if (!visibleNotes) return null;
    const today = new Date();
    return (
      visibleNotes.find(
        (note) =>
          note.noteType === "session_log" &&
          note.authorId === user?.id &&
          note.sessionDate &&
          isSameDay(new Date(note.sessionDate), today)
      ) || null
    );
  }, [visibleNotes, user?.id]);

  // Get selected note
  const selectedNote = useMemo(() => {
    if (!selectedNoteId || !visibleNotes) return null;
    return visibleNotes.find((n) => n.id === selectedNoteId) || null;
  }, [selectedNoteId, visibleNotes]);

  const handleSelectNote = (note: Note) => {
    setSelectedNoteId(note.id);
    setIsTodayMode(false);
    setMobileView("editor");
  };

  const handleSelectTodaySession = () => {
    setSelectedNoteId(null);
    setIsTodayMode(true);
    setMobileView("editor");
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

  // P2-2 (PRD-005 FR-3): carry mention offsets so the editor can scroll to
  // and select the exact reference after opening the note.
  const [pendingHighlight, setPendingHighlight] = useState<{
    noteId: string;
    start: number;
    end: number;
  } | null>(null);

  const handleOpenNote = (
    noteId: string,
    highlight?: { start: number; end: number }
  ) => {
    setSelectedNoteId(noteId);
    setIsTodayMode(false);
    setMobileView("editor");
    setPendingHighlight(highlight ? { noteId, ...highlight } : null);
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

      {/* Layout: resizable two-panel on desktop, single-pane flow on mobile (M9) */}
      {isMobile ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {mobileView === "list" ? (
            <NotesLeftPanel
              notes={visibleNotes}
              team={team}
              selectedNoteId={selectedNoteId}
              isTodayMode={isTodayMode}
              authorNames={authorNames}
              currentUserId={user?.id}
              onSelectNote={handleSelectNote}
              onSelectTodaySession={handleSelectTodaySession}
              needsReviewItems={needsReviewData?.items}
              onApproveReview={handleApproveReview}
              onRejectReview={handleRejectReview}
              onReclassifyReview={handleReclassifyReview}
              isReviewActionPending={updateClassification.isPending}
            />
          ) : (
            <>
              <div className="border-b px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileView("list")}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  All notes
                </Button>
              </div>
              <div className="flex-1 min-h-0">
                <NotesEditorPanel
                  team={team}
                  userId={user?.id || ""}
                  selectedNote={selectedNote}
                  todaySession={todaySession}
                  isTodayMode={isTodayMode}
                  memberAiEnabled={currentMember?.aiEnabled ?? false}
                  memberRole={currentMember?.role}
                  authorNames={authorNames}
                  onNoteCreated={handleNoteCreated}
                  onNoteDeleted={handleNoteDeleted}
                  onOpenNote={handleOpenNote}
                  pendingHighlight={pendingHighlight}
                  onHighlightConsumed={() => setPendingHighlight(null)}
                />
              </div>
            </>
          )}
        </div>
      ) : (
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
              authorNames={authorNames}
              currentUserId={user?.id}
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
              memberRole={currentMember?.role}
              authorNames={authorNames}
              onNoteCreated={handleNoteCreated}
              onNoteDeleted={handleNoteDeleted}
              onOpenNote={handleOpenNote}
              pendingHighlight={pendingHighlight}
              onHighlightConsumed={() => setPendingHighlight(null)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

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
