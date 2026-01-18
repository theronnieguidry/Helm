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
  Trash2,
  Lock,
  Users,
  FileText,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

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
  status: "completed" | "failed" | "deleted";
  options: ImportRunOptions | null;
  stats: ImportRunStats | null;
  createdAt: string;
  importerName: string;
}

interface ImportManagementProps {
  teamId: string;
  isDM: boolean;
  currentUserId: string;
}

export function ImportManagement({ teamId, isDM, currentUserId }: ImportManagementProps) {
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<ImportRun | null>(null);

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

          {canDelete(importRun) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteTarget(importRun)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}

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
