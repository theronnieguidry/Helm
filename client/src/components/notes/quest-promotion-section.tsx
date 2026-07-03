import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollText, Plus, Link2, X, Loader2, Check } from "lucide-react";
import type { CleanupQuestSuggestion } from "@shared/cleanup-suggestions";

export type QuestSuggestionStatus = "pending" | "promoted" | "dismissed";

interface QuestPromotionSectionProps {
  suggestions: CleanupQuestSuggestion[];
  statusById: Map<string, QuestSuggestionStatus>;
  pendingId?: string | null;
  onCreateQuest: (suggestion: CleanupQuestSuggestion) => void;
  onLinkExistingQuest: (
    suggestion: CleanupQuestSuggestion,
    questNoteId: string
  ) => void;
  onDismiss: (suggestion: CleanupQuestSuggestion) => void;
}

/**
 * PRD-049 FR-3: "Promote to Quest" suggestions generated from actionable text
 * (Find/Defeat/Retrieve ...). Users can create a new quest, link an existing
 * one, or dismiss.
 */
export function QuestPromotionSection({
  suggestions,
  statusById,
  pendingId,
  onCreateQuest,
  onLinkExistingQuest,
  onDismiss,
}: QuestPromotionSectionProps) {
  const visible = suggestions.filter(
    (s) => statusById.get(s.id) !== "dismissed"
  );

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" data-testid="quest-promotion-section">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Quest Promotion
      </h4>
      <div className="space-y-2">
        {visible.map((suggestion) => {
          const status = statusById.get(suggestion.id) || "pending";
          const isPromoted = status === "promoted";
          const isPending = pendingId === suggestion.id;

          return (
            <div
              key={suggestion.id}
              className="p-3 rounded-lg border border-red-500/20 bg-red-500/5"
              data-testid={`quest-suggestion-${suggestion.id}`}
            >
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-red-500 flex-shrink-0" />
                <span className="text-sm font-medium truncate">
                  {suggestion.proposedQuestTitle}
                </span>
                <Badge variant="secondary" className="text-xs py-0 px-1.5">
                  Quest
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">
                "{suggestion.snippetText}"
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {isPromoted ? (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Promoted
                  </Badge>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      disabled={isPending}
                      onClick={() => onCreateQuest(suggestion)}
                    >
                      {isPending ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3 mr-1" />
                      )}
                      Create Quest
                    </Button>
                    {suggestion.existingQuestMatches.map((quest) => (
                      <Button
                        key={quest.id}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={isPending}
                        onClick={() => onLinkExistingQuest(suggestion, quest.id)}
                      >
                        <Link2 className="h-3 w-3 mr-1" />
                        Link "{quest.title}"
                      </Button>
                    ))}
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
          );
        })}
      </div>
    </div>
  );
}
