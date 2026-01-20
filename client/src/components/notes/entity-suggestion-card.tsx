import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { User, MapPin, ScrollText, Plus, X, Link2 } from "lucide-react";
import type { DetectedEntity, EntityType } from "@shared/entity-detection";
import type { Note, NoteType } from "@shared/schema";

const ENTITY_TYPE_ICONS: Record<EntityType, typeof User> = {
  npc: User,
  place: MapPin,
  quest: ScrollText,
};

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  npc: "Person",
  place: "Area",
  quest: "Quest",
};

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  npc: "bg-green-500/10 text-green-500 border-green-500/20",
  place: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  quest: "bg-red-500/10 text-red-500 border-red-500/20",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-gray-400",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

// Map entity types to note types for reclassification
const NOTE_TYPE_OPTIONS: { value: NoteType; label: string }[] = [
  { value: "npc", label: "Person (NPC)" },
  { value: "character", label: "Character" },
  { value: "area", label: "Area" },
  { value: "poi", label: "Point of Interest" },
  { value: "quest", label: "Quest" },
  { value: "note", label: "Note" },
];

// Default mapping from entity type to note type
export const ENTITY_TO_NOTE_TYPE: Record<EntityType, NoteType> = {
  npc: "npc",
  place: "area",
  quest: "quest",
};

interface EntitySuggestionCardProps {
  entity: DetectedEntity;
  reclassifiedType?: NoteType;
  matchingNotes: Note[];
  isSelected: boolean;
  onSelect: () => void;
  onAccept: (noteType: NoteType) => void;
  onDismiss: () => void;
  onReclassify: (newType: NoteType) => void;
  onLinkToExisting: (noteId: string) => void;
}

export function EntitySuggestionCard({
  entity,
  reclassifiedType,
  matchingNotes,
  isSelected,
  onSelect,
  onAccept,
  onDismiss,
  onReclassify,
  onLinkToExisting,
}: EntitySuggestionCardProps) {
  const Icon = ENTITY_TYPE_ICONS[entity.type];
  const displayType = reclassifiedType || ENTITY_TO_NOTE_TYPE[entity.type];
  const hasMatch = matchingNotes.length > 0;

  return (
    <div
      className={`p-3 rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? "ring-2 ring-primary border-primary"
          : ENTITY_TYPE_COLORS[entity.type]
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Header: Name and confidence */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span className="font-medium truncate" title={entity.text}>
            {entity.text}
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${CONFIDENCE_COLORS[entity.confidence]}`}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>{CONFIDENCE_LABELS[entity.confidence]}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Meta: Type and frequency */}
      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-xs py-0 px-1.5">
          {ENTITY_TYPE_LABELS[entity.type]}
        </Badge>
        <span>{entity.frequency}x</span>
      </div>

      {/* Match indicator */}
      {hasMatch && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="text-blue-500">Matches:</span>{" "}
          {matchingNotes.map((n) => n.title).join(", ")}
        </div>
      )}

      {/* Reclassify dropdown */}
      <div className="mt-2">
        <Select
          value={displayType}
          onValueChange={(value) => onReclassify(value as NoteType)}
        >
          <SelectTrigger
            className="h-7 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        {hasMatch ? (
          <Button
            size="sm"
            variant="default"
            className="flex-1 h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onLinkToExisting(matchingNotes[0].id);
            }}
          >
            <Link2 className="h-3 w-3 mr-1" />
            Link
          </Button>
        ) : (
          <Button
            size="sm"
            variant="default"
            className="flex-1 h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onAccept(displayType);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Accept
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
