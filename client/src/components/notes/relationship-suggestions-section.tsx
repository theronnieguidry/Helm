import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2 } from "lucide-react";
import type { CleanupRelationshipSuggestion, ConfidenceBucket } from "@shared/cleanup-suggestions";

const BUCKET_STYLES: Record<ConfidenceBucket, string> = {
  HIGH: "bg-green-500/10 text-green-600 border-green-500/20",
  REVIEW: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  LOW: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const BUCKET_LABELS: Record<ConfidenceBucket, string> = {
  HIGH: "High",
  REVIEW: "Needs review",
  LOW: "Low",
};

const RELATIONSHIP_TYPE_LABELS: Record<string, string> = {
  QuestHasNPC: "Quest → NPC",
  QuestAtPlace: "Quest → Place",
  NPCInPlace: "NPC → Place",
  Related: "Related",
};

export type RelationshipSuggestionStatus = "pending" | "accepted" | "dismissed";

interface RelationshipSuggestionsSectionProps {
  suggestions: CleanupRelationshipSuggestion[];
  statusById: Map<string, RelationshipSuggestionStatus>;
  pendingId?: string | null;
  onAccept: (suggestion: CleanupRelationshipSuggestion) => void;
  onDismiss: (suggestion: CleanupRelationshipSuggestion) => void;
}

/**
 * PRD-049 FR-1: relationship suggestions surfaced in the AI Cleanup panel with
 * Accept/Dismiss actions and visible evidence + confidence buckets.
 */
export function RelationshipSuggestionsSection({
  suggestions,
  statusById,
  pendingId,
  onAccept,
  onDismiss,
}: RelationshipSuggestionsSectionProps) {
  const visible = suggestions.filter(
    (s) => statusById.get(s.id) !== "dismissed"
  );

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" data-testid="relationship-suggestions-section">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Relationship Suggestions
      </h4>
      <div className="space-y-2">
        {visible.map((suggestion) => {
          const status = statusById.get(suggestion.id) || "pending";
          const isAccepted = status === "accepted";
          const isPending = pendingId === suggestion.id;
          // LOW-confidence suggestions are visually de-emphasized (PRD-049 FR-5)
          const deEmphasized = suggestion.confidenceBucket === "LOW";

          return (
            <div
              key={suggestion.id}
              className={`p-3 rounded-lg border ${deEmphasized ? "opacity-60" : ""}`}
              data-testid={`relationship-suggestion-${suggestion.id}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-sm font-medium">
                    {suggestion.fromEntityText}
                  </span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className="text-sm font-medium">
                    {suggestion.toEntityText}
                  </span>
                  <Badge variant="secondary" className="text-xs py-0 px-1.5">
                    {RELATIONSHIP_TYPE_LABELS[suggestion.relationshipType] ||
                      suggestion.relationshipType}
                  </Badge>
                  <Badge variant="outline" className="text-xs py-0 px-1.5">
                    {suggestion.evidenceType}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs py-0 px-1.5 ${BUCKET_STYLES[suggestion.confidenceBucket]}`}
                  >
                    {BUCKET_LABELS[suggestion.confidenceBucket]} (
                    {Math.round(suggestion.confidence * 100)}%)
                  </Badge>
                </div>
                <div className="flex gap-1">
                  {isAccepted ? (
                    <Badge variant="secondary" className="text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Accepted
                    </Badge>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        disabled={suggestion.requiresResolution || isPending}
                        title={
                          suggestion.requiresResolution
                            ? "Both entities must be linked to existing notes first"
                            : undefined
                        }
                        onClick={() => onAccept(suggestion)}
                      >
                        {isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3 mr-1" />
                        )}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => onDismiss(suggestion)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {suggestion.snippetText && (
                <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">
                  "{suggestion.snippetText}"
                </p>
              )}
              {suggestion.requiresResolution && !isAccepted && (
                <p className="mt-1 text-xs text-amber-600">
                  Link both entities to existing notes to enable Accept.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
