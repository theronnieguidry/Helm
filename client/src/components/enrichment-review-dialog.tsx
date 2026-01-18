/**
 * PRD-016: Enrichment Review Dialog
 *
 * Dialog for reviewing and approving AI-generated classifications
 * and relationships after import enrichment.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Check,
  X,
  Sparkles,
  User,
  MapPin,
  ScrollText,
  FileText,
  Calendar,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface Classification {
  id: string;
  noteId: string;
  noteTitle: string;
  inferredType: string;
  confidence: number;
  explanation: string | null;
  status: "pending" | "approved" | "rejected";
}

interface Relationship {
  id: string;
  fromNoteId: string;
  fromNoteTitle: string;
  toNoteId: string;
  toNoteTitle: string;
  relationshipType: string;
  confidence: number;
  evidenceSnippet: string | null;
  evidenceType: string;
  status: "pending" | "approved" | "rejected";
}

interface EnrichmentRunData {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  totals: {
    notesProcessed: number;
    classificationsCreated: number;
    relationshipsFound: number;
    highConfidenceCount: number;
    lowConfidenceCount: number;
    userReviewRequired: number;
  } | null;
  classifications: Classification[];
  relationships: Relationship[];
}

interface EnrichmentReviewDialogProps {
  teamId: string;
  enrichmentRunId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  Person: <User className="h-4 w-4" />,
  Place: <MapPin className="h-4 w-4" />,
  Quest: <ScrollText className="h-4 w-4" />,
  SessionLog: <Calendar className="h-4 w-4" />,
  Note: <FileText className="h-4 w-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  Person: "bg-cyan-500/10 text-cyan-600",
  Place: "bg-teal-500/10 text-teal-600",
  Quest: "bg-red-500/10 text-red-600",
  SessionLog: "bg-purple-500/10 text-purple-600",
  Note: "bg-gray-500/10 text-gray-600",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  QuestHasNPC: "Quest involves NPC",
  QuestAtPlace: "Quest at location",
  NPCInPlace: "NPC at location",
  Related: "Related",
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.8
      ? "bg-green-500/10 text-green-600"
      : confidence >= 0.65
        ? "bg-yellow-500/10 text-yellow-600"
        : "bg-red-500/10 text-red-600";

  return (
    <Badge variant="outline" className={cn("text-xs", color)}>
      {Math.round(confidence * 100)}%
    </Badge>
  );
}

export function EnrichmentReviewDialog({
  teamId,
  enrichmentRunId,
  open,
  onOpenChange,
}: EnrichmentReviewDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"classifications" | "relationships" | "warnings">("classifications");

  // Fetch enrichment run data
  const { data: enrichment, isLoading, refetch } = useQuery({
    queryKey: ["/api/teams", teamId, "enrichments", enrichmentRunId],
    queryFn: async () => {
      const response = await fetch(
        `/api/teams/${teamId}/enrichments/${enrichmentRunId}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to fetch enrichment");
      return response.json() as Promise<EnrichmentRunData>;
    },
    enabled: open && !!enrichmentRunId,
    refetchInterval: (data) =>
      data?.status === "running" || data?.status === "pending" ? 2000 : false,
  });

  // Approve classification mutation
  const approveClassificationMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const response = await fetch(
        `/api/teams/${teamId}/classifications/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
          credentials: "include",
        }
      );
      if (!response.ok) throw new Error("Failed to update classification");
      return response.json();
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "notes"] });
    },
  });

  // Approve relationship mutation
  const approveRelationshipMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const response = await fetch(
        `/api/teams/${teamId}/relationships/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
          credentials: "include",
        }
      );
      if (!response.ok) throw new Error("Failed to update relationship");
      return response.json();
    },
    onSuccess: () => {
      refetch();
    },
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async ({ type }: { type: "classifications" | "relationships" }) => {
      const endpoint =
        type === "classifications"
          ? `/api/teams/${teamId}/enrichments/${enrichmentRunId}/classifications/bulk-approve`
          : `/api/teams/${teamId}/enrichments/${enrichmentRunId}/relationships/bulk-approve`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approveHighConfidence: true, threshold: 0.80 }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to bulk approve");
      return response.json();
    },
    onSuccess: (data) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "notes"] });
      toast({
        title: "Approved",
        description: `${data.approved} high-confidence items approved`,
      });
    },
  });

  const pendingClassifications = enrichment?.classifications.filter(
    (c) => c.status === "pending"
  ) || [];
  const pendingRelationships = enrichment?.relationships.filter(
    (r) => r.status === "pending"
  ) || [];
  const lowConfidenceItems = [
    ...pendingClassifications.filter((c) => c.confidence < 0.65),
    ...pendingRelationships.filter((r) => r.confidence < 0.65),
  ];

  if (!open) return null;

  // Loading or processing state
  if (isLoading || enrichment?.status === "running" || enrichment?.status === "pending") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Enhancement in Progress
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-12 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Analyzing notes...
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Error state
  if (enrichment?.status === "failed") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Enrichment Failed
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The AI enhancement process failed. Please try again.
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Review AI Suggestions
          </DialogTitle>
          <DialogDescription>
            Review and approve the AI-detected classifications and relationships
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="classifications" className="text-xs sm:text-sm">
              Classifications ({pendingClassifications.length})
            </TabsTrigger>
            <TabsTrigger value="relationships" className="text-xs sm:text-sm">
              Relationships ({pendingRelationships.length})
            </TabsTrigger>
            <TabsTrigger value="warnings" className="text-xs sm:text-sm">
              Needs Review ({lowConfidenceItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="classifications" className="mt-4">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-4">
                {pendingClassifications.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No pending classifications
                  </p>
                ) : (
                  pendingClassifications.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge
                          variant="secondary"
                          className={cn("shrink-0", TYPE_COLORS[c.inferredType])}
                        >
                          {TYPE_ICONS[c.inferredType]}
                          <span className="ml-1">{c.inferredType}</span>
                        </Badge>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.noteTitle}</p>
                          {c.explanation && (
                            <p className="text-xs text-muted-foreground truncate">
                              {c.explanation}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <ConfidenceBadge confidence={c.confidence} />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => approveClassificationMutation.mutate({ id: c.id, status: "approved" })}
                          disabled={approveClassificationMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => approveClassificationMutation.mutate({ id: c.id, status: "rejected" })}
                          disabled={approveClassificationMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            {pendingClassifications.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => bulkApproveMutation.mutate({ type: "classifications" })}
                  disabled={bulkApproveMutation.isPending}
                >
                  {bulkApproveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Approve All High Confidence (80%+)
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="relationships" className="mt-4">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-4">
                {pendingRelationships.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No pending relationships
                  </p>
                ) : (
                  pendingRelationships.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate max-w-[120px]">
                          {r.fromNoteTitle}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate max-w-[120px]">
                          {r.toNoteTitle}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {RELATIONSHIP_LABELS[r.relationshipType] || r.relationshipType}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <ConfidenceBadge confidence={r.confidence} />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => approveRelationshipMutation.mutate({ id: r.id, status: "approved" })}
                          disabled={approveRelationshipMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => approveRelationshipMutation.mutate({ id: r.id, status: "rejected" })}
                          disabled={approveRelationshipMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            {pendingRelationships.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => bulkApproveMutation.mutate({ type: "relationships" })}
                  disabled={bulkApproveMutation.isPending}
                >
                  {bulkApproveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Approve All High Confidence (80%+)
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="warnings" className="mt-4">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-4">
                {lowConfidenceItems.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No low-confidence items requiring review
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mb-4">
                      These items have low confidence scores and should be reviewed carefully.
                    </p>
                    {lowConfidenceItems.map((item) => {
                      const isClassification = "inferredType" in item;
                      if (isClassification) {
                        const c = item as Classification;
                        return (
                          <div
                            key={c.id}
                            className="flex items-center justify-between p-3 border border-yellow-200 bg-yellow-50/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Badge
                                variant="secondary"
                                className={cn("shrink-0", TYPE_COLORS[c.inferredType])}
                              >
                                {TYPE_ICONS[c.inferredType]}
                                <span className="ml-1">{c.inferredType}</span>
                              </Badge>
                              <p className="text-sm font-medium truncate">{c.noteTitle}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <ConfidenceBadge confidence={c.confidence} />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => approveClassificationMutation.mutate({ id: c.id, status: "approved" })}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => approveClassificationMutation.mutate({ id: c.id, status: "rejected" })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      } else {
                        const r = item as Relationship;
                        return (
                          <div
                            key={r.id}
                            className="flex items-center justify-between p-3 border border-yellow-200 bg-yellow-50/50 rounded-lg"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm truncate">{r.fromNoteTitle}</span>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm truncate">{r.toNoteTitle}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <ConfidenceBadge confidence={r.confidence} />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => approveRelationshipMutation.mutate({ id: r.id, status: "approved" })}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => approveRelationshipMutation.mutate({ id: r.id, status: "rejected" })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button onClick={() => onOpenChange(false)}>Done Reviewing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
