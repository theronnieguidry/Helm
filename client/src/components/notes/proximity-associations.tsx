import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeftRight } from "lucide-react";
import type { ProximitySuggestion } from "@shared/proximity-suggestions";
import type { Note } from "@shared/schema";

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-500",
  medium: "text-yellow-500",
  low: "text-gray-400",
};

interface ProximityAssociationsProps {
  entityId: string;
  entityText: string;
  proximitySuggestions: Map<string, ProximitySuggestion>;
  existingNotes: Note[];
  entityMatches: Map<string, string[]>;
  selectedAssociations: Set<string>;
  onToggleAssociation: (noteId: string) => void;
}

export function ProximityAssociations({
  entityId,
  entityText,
  proximitySuggestions,
  existingNotes,
  entityMatches,
  selectedAssociations,
  onToggleAssociation,
}: ProximityAssociationsProps) {
  const suggestion = proximitySuggestions.get(entityId);

  if (!suggestion || suggestion.relatedEntities.length === 0) {
    return null;
  }

  // Find related entities that match existing notes
  const relatedWithNotes = suggestion.relatedEntities
    .map((related) => {
      const matchingNoteIds = entityMatches.get(related.entityId) || [];
      const matchingNotes = existingNotes.filter((n) =>
        matchingNoteIds.includes(n.id)
      );

      return {
        ...related,
        notes: matchingNotes,
      };
    })
    .filter((r) => r.notes.length > 0 || r.confidence === "high");

  if (relatedWithNotes.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t border-dashed">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <ArrowLeftRight className="h-3 w-3" />
        <span>Mentioned together with:</span>
      </div>
      <div className="space-y-2">
        {relatedWithNotes.map((related) => (
          <div
            key={related.entityId}
            className="flex items-start gap-2 text-xs"
          >
            {related.notes.length > 0 ? (
              <>
                <Checkbox
                  id={`assoc-${related.entityId}`}
                  checked={selectedAssociations.has(related.notes[0].id)}
                  onCheckedChange={() =>
                    onToggleAssociation(related.notes[0].id)
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor={`assoc-${related.entityId}`}
                  className="flex-1 cursor-pointer"
                >
                  <span className="font-medium">{related.notes[0].title}</span>
                  <span className={`ml-1.5 ${CONFIDENCE_COLORS[related.confidence]}`}>
                    ({related.confidence})
                  </span>
                  {related.context && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-1">
                      "{related.context}"
                    </p>
                  )}
                </label>
              </>
            ) : (
              <div className="flex-1 pl-5">
                <span className="font-medium text-muted-foreground">
                  {related.entityText}
                </span>
                <Badge variant="outline" className="ml-1.5 text-[10px] py-0">
                  new
                </Badge>
                <span className={`ml-1.5 ${CONFIDENCE_COLORS[related.confidence]}`}>
                  ({related.confidence})
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
