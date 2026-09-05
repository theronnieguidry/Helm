import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trash2,
  Lock,
  Users,
  FileText,
  AlertCircle,
  Sparkles,
  Loader2,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { EnrichmentReviewDialog } from "@/components/enrichment-review-dialog";

interface ImportRunOptions {
  importEmptyPages: boolean;
  defaultVisibility: "private" | "team";
}

interface ImportRunStats {
  totalPagesDetected: number;
  notesCreated: number;
  notesUpdated: number;
  notesSkipped: number;
  emptyPagesImported: number;
  linksResolved: number;
  warningsCount: number;
}

interface ImportRun {
  id: string;
  teamId: string;
  sourceSystem: string;
  createdByUserId: string;
  status: "pending" | "completed" | "failed" | "deleted";
  options: ImportRunOptions | null;
  stats: ImportRunStats | null;
  createdAt: string;
  importerName: string;
}

// P2-4 F49: note entry returned by GET /api/teams/:teamId/imports/:importId
interface ImportRunNote {
  id: string;
  title: string;
  noteType: string;
  wasUpdated?: boolean;
}

interface ImportRunDetails extends ImportRun {
  notes: ImportRunNote[];
}

interface ImportManagementProps {
  teamId: string;
  isDM: boolean;
  currentUserId: string;
}

export function ImportManagement({ teamId, isDM, currentUserId }: ImportManagementProps) {
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<ImportRun | null>(null);
  // PRD-016 / P0-4: enrichment run currently open in the review dialog
  const [reviewEnrichmentRunId, setReviewEnrichmentRunId] = useState<string | null>(null);
  const [enrichTargetId, setEnrichTargetId] = useState<string | null>(null);
  // P2-4 F49: import run currently open in the View Details dialog
  const [detailsImportId, setDetailsImportId] = useState<string | null>(null);

  const { data: imports, isLoading } = useQuery<ImportRun[]>({
    queryKey: ["/api/teams", teamId, "imports"],
    queryFn: async () => {
      const response = await fetch(`/api/teams/${teamId}/imports`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch imports");
      return response.json();
    },
  });

  // P2-4 F49: fetch details (run + its notes) for the View Details dialog
  const { data: importDetails, isLoading: detailsLoading } = useQuery<ImportRunDetails>({
    queryKey: ["/api/teams", teamId, "imports", detailsImportId],
    queryFn: async () => {
      const response = await fetch(`/api/teams/${teamId}/imports/${detailsImportId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch import details");
      return response.json();
    },
    enabled: !!detailsImportId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (importId: string) => {
      const response = await fetch(`/api/teams/${teamId}/imports/${importId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete import");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "imports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "notes"] });
      toast({
        title: "Import deleted",
        description: `${data.notesDeleted} notes removed, ${data.notesRestored} notes restored`,
      });
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete import",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // PRD-016 / P0-4: Open (or start) the AI enrichment review for an import.
  // There is no read endpoint exposing an import's enrichment run, so we use
  // POST /enrich: a 400 response means a run already exists and returns its id
  // (no side effect); an OK response means a new enrichment was started.
  const enrichMutation = useMutation({
    mutationFn: async (importId: string) => {
      const response = await fetch(`/api/teams/${teamId}/imports/${importId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const data = await response.json();
      if (response.ok && data.enrichmentRunId) {
        return { enrichmentRunId: data.enrichmentRunId as string, started: true };
      }
      if (response.status === 400 && data.enrichmentRunId) {
        // Enrichment already exists for this import - review it
        return { enrichmentRunId: data.enrichmentRunId as string, started: false };
      }
      throw new Error(data.message || "Failed to load AI suggestions");
    },
    onSuccess: ({ enrichmentRunId, started }) => {
      if (started) {
        toast({
          title: "AI enrichment started",
          description: "Notes are being analyzed. Suggestions will appear when ready.",
        });
      }
      setReviewEnrichmentRunId(enrichmentRunId);
    },
    onError: (error: Error) => {
      toast({
        title: "AI suggestions unavailable",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setEnrichTargetId(null);
    },
  });

  const handleReviewDialogChange = (open: boolean) => {
    if (!open) {
      setReviewEnrichmentRunId(null);
      // Approvals in the dialog change note types and clear needs-review items
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "notes", "needs-review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "notes"] });
    }
  };

  const canDelete = (importRun: ImportRun) => {
    return isDM || importRun.createdByUserId === currentUserId;
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading imports...</div>;
  }

  if (!imports || imports.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No imports yet</p>
        <p className="text-sm">Use the Notes page to import from Nuclino</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {imports.map((importRun) => (
        <div
          key={importRun.id}
          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{importRun.sourceSystem}</Badge>
              {importRun.options?.defaultVisibility === "private" ? (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" />
                  Private
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Users className="h-3 w-3" />
                  Team
                </Badge>
              )}
              {importRun.stats && importRun.stats.warningsCount > 0 && (
                <Badge variant="outline" className="text-yellow-600 gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {importRun.stats.warningsCount} warnings
                </Badge>
              )}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Imported by {importRun.importerName} on{" "}
              {format(new Date(importRun.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </div>
            {importRun.stats && (
              <div className="mt-1 text-sm">
                {importRun.stats.notesCreated} created, {importRun.stats.notesUpdated} updated,{" "}
                {importRun.stats.notesSkipped} skipped
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDetailsImportId(importRun.id)}
              aria-label="View import details"
            >
              <Eye className="h-4 w-4" />
            </Button>

            {importRun.status === "completed" && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-primary hover:text-primary"
                onClick={() => {
                  setEnrichTargetId(importRun.id);
                  enrichMutation.mutate(importRun.id);
                }}
                disabled={enrichMutation.isPending}
                aria-label="Review AI suggestions"
              >
                {enrichMutation.isPending && enrichTargetId === importRun.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">AI suggestions</span>
              </Button>
            )}

            {canDelete(importRun) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteTarget(importRun)}
                className="text-destructive hover:text-destructive"
                aria-label="Delete import"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}

      {/* P2-4 F49: View Details dialog listing the run's notes */}
      <Dialog
        open={!!detailsImportId}
        onOpenChange={(open) => {
          if (!open) setDetailsImportId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Details</DialogTitle>
            <DialogDescription>
              Notes created or updated by this import.
            </DialogDescription>
          </DialogHeader>
          {detailsLoading || !importDetails ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading import details...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {importDetails.notes.length} note{importDetails.notes.length === 1 ? "" : "s"} in this import
                {importDetails.stats
                  ? ` (${importDetails.stats.notesCreated} created, ${importDetails.stats.notesUpdated} updated)`
                  : ""}
              </p>
              <ScrollArea className="h-64 border rounded-lg">
                <div className="p-2 space-y-1">
                  {importDetails.notes.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">
                      No notes remain from this import.
                    </p>
                  ) : (
                    importDetails.notes.map((note) => (
                      <div
                        key={note.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted/50"
                      >
                        <Badge variant="secondary" className="text-xs">
                          {note.noteType}
                        </Badge>
                        <span className="text-sm truncate flex-1">{note.title}</span>
                        {typeof note.wasUpdated === "boolean" && (
                          <Badge variant="outline" className="text-xs">
                            {note.wasUpdated ? "updated" : "created"}
                          </Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {reviewEnrichmentRunId && (
        <EnrichmentReviewDialog
          teamId={teamId}
          enrichmentRunId={reviewEnrichmentRunId}
          open={!!reviewEnrichmentRunId}
          onOpenChange={handleReviewDialogChange}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Import</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all {deleteTarget?.stats?.notesCreated || 0} notes created by this import
              {deleteTarget?.stats?.notesUpdated
                ? ` and restore ${deleteTarget.stats.notesUpdated} notes to their previous state`
                : ""}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
