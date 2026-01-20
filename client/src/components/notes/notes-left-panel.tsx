import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotesItemPreview } from "./notes-item-preview";
import {
  BookOpen,
  User,
  Users,
  MapPin,
  ScrollText,
  FileText,
  Search,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  ArrowRight,
  MoreHorizontal,
} from "lucide-react";
import type { Note, NoteType, Team } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// PRD-041: Mapping from API inferredType to NoteType for badge styling
const INFERRED_TYPE_TO_NOTE_TYPE: Record<string, NoteType> = {
  Character: "character",
  NPC: "npc",
  Area: "area",
  Quest: "quest",
  SessionLog: "session_log",
  Note: "note",
};

// PRD-041: Badge colors for each note type
const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  area: "bg-blue-500/10 text-blue-500",
  character: "bg-green-500/10 text-green-500",
  npc: "bg-orange-500/10 text-orange-500",
  poi: "bg-purple-500/10 text-purple-500",
  quest: "bg-red-500/10 text-red-500",
  session_log: "bg-amber-500/10 text-amber-500",
  note: "bg-gray-500/10 text-gray-500",
};

// PRD-041: Icons for each note type
const NOTE_TYPE_ICONS: Record<NoteType, typeof MapPin> = {
  area: MapPin,
  character: User,
  npc: Users,
  poi: MapPin,
  quest: ScrollText,
  session_log: BookOpen,
  note: FileText,
};

// PRD-041: Labels for inferred types
const INFERRED_TYPE_LABELS: Record<string, string> = {
  Character: "Character",
  NPC: "NPC",
  Area: "Area",
  Quest: "Quest",
  SessionLog: "Session",
  Note: "Note",
};

interface FilterCategory {
  key: string;
  label: string;
  icon: typeof BookOpen;
  types: NoteType[];
  color: string;
}

const FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: "sessions",
    label: "Sessions",
    icon: BookOpen,
    types: ["session_log"],
    color: "text-amber-500",
  },
  {
    key: "people",
    label: "People",
    icon: Users,
    types: ["character", "npc"],
    color: "text-green-500",
  },
  {
    key: "areas",
    label: "Areas",
    icon: MapPin,
    types: ["area"],
    color: "text-blue-500",
  },
  {
    key: "quests",
    label: "Quests",
    icon: ScrollText,
    types: ["quest"],
    color: "text-red-500",
  },
  {
    key: "pois",
    label: "Points of Interest",
    icon: MapPin,
    types: ["poi"],
    color: "text-purple-500",
  },
  {
    key: "notes",
    label: "Notes",
    icon: FileText,
    types: ["note"],
    color: "text-gray-500",
  },
];

// PRD-037: Type for needs-review items
interface NeedsReviewItem {
  classificationId: string;
  noteId: string;
  noteTitle: string;
  inferredType: string;
  confidence: number;
  explanation: string | null;
}

interface NotesLeftPanelProps {
  notes: Note[];
  team: Team;
  selectedNoteId: string | null;
  isTodayMode: boolean;
  onSelectNote: (note: Note) => void;
  onSelectTodaySession: () => void;
  needsReviewItems?: NeedsReviewItem[];
  // PRD-038: Review action callbacks
  onApproveReview?: (classificationId: string) => void;
  onRejectReview?: (classificationId: string) => void;
  onReclassifyReview?: (classificationId: string, newType: string) => void;
  isReviewActionPending?: boolean;
}

export function NotesLeftPanel({
  notes,
  team,
  selectedNoteId,
  isTodayMode,
  onSelectNote,
  onSelectTodaySession,
  needsReviewItems,
  onApproveReview,
  onRejectReview,
  onReclassifyReview,
  isReviewActionPending,
}: NotesLeftPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<string[]>([
    "sessions",
  ]);
  // PRD-037: State for needs review section
  const [isNeedsReviewExpanded, setIsNeedsReviewExpanded] = useState(true);
  // PRD-038: State for expanded review item
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);

  // Group notes by category
  const notesByCategory = useMemo(() => {
    const filtered = notes.filter(
      (note) =>
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (note.content &&
          note.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const grouped: Record<string, Note[]> = {};
    for (const category of FILTER_CATEGORIES) {
      grouped[category.key] = filtered
        .filter((note) => category.types.includes(note.noteType))
        .sort((a, b) => {
          // Sort sessions by sessionDate, others by updatedAt
          if (a.noteType === "session_log" && b.noteType === "session_log") {
            const dateA = a.sessionDate
              ? new Date(a.sessionDate).getTime()
              : 0;
            const dateB = b.sessionDate
              ? new Date(b.sessionDate).getTime()
              : 0;
            return dateB - dateA;
          }
          const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return updatedB - updatedA;
        });
    }
    return grouped;
  }, [notes, searchQuery]);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Header with search */}
      <div className="p-4 border-b space-y-3">
        <h2 className="font-semibold text-lg">Notes</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Today's Session Button */}
      <div className="p-3 border-b">
        <Button
          variant={isTodayMode ? "secondary" : "ghost"}
          className={cn(
            "w-full justify-start gap-2",
            isTodayMode && "bg-primary/10 text-primary"
          )}
          onClick={onSelectTodaySession}
        >
          <Calendar className="h-4 w-4" />
          <span>Today — {todayStr}</span>
        </Button>
      </div>

      {/* Filter Accordions - PRD-038: Moved Needs Review inside ScrollArea for scrolling */}
      <ScrollArea className="flex-1">
        {/* PRD-037: Needs Review Section */}
        {needsReviewItems && needsReviewItems.length > 0 && (
          <div className="p-3 border-b">
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setIsNeedsReviewExpanded(!isNeedsReviewExpanded)}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Needs Review</span>
                <Badge
                  variant="secondary"
                  className="bg-amber-500/10 text-amber-600 border-amber-500/20"
                >
                  {needsReviewItems.length}
                </Badge>
              </div>
              {isNeedsReviewExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {isNeedsReviewExpanded && (
              <div className="mt-2 space-y-1">
                {needsReviewItems.map((item) => {
                  const note = notes.find((n) => n.id === item.noteId);
                  const isExpanded = expandedReviewId === item.classificationId;
                  const reclassifyOptions = [
                    { value: "Character", label: "Character" },
                    { value: "NPC", label: "NPC" },
                    { value: "Area", label: "Area" },
                    { value: "Quest", label: "Quest" },
                    { value: "SessionLog", label: "Session Log" },
                    { value: "Note", label: "Note" },
                  ].filter((opt) => opt.value !== item.inferredType);

                  return (
                    <div key={item.classificationId} className="rounded-md border border-transparent hover:border-border">
                      {/* Header row - click to expand */}
                      <button
                        className={cn(
                          "w-full text-left px-3 py-1.5 rounded-md text-sm hover:bg-accent transition-colors",
                          isExpanded && "bg-accent"
                        )}
                        onClick={() => setExpandedReviewId(isExpanded ? null : item.classificationId)}
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={cn(
                              "h-3 w-3 text-muted-foreground transition-transform shrink-0",
                              isExpanded && "rotate-90"
                            )}
                          />
                          <span className="truncate flex-1">{item.noteTitle}</span>
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              item.confidence >= 0.5 ? "bg-yellow-500" : "bg-gray-400"
                            )}
                            title={`${Math.round(item.confidence * 100)}% confidence`}
                          />
                        </div>
                        {/* PRD-041: Classification badge with icon and color */}
                        {(() => {
                          const noteType = INFERRED_TYPE_TO_NOTE_TYPE[item.inferredType];
                          const TypeIcon = noteType ? NOTE_TYPE_ICONS[noteType] : FileText;
                          const colorClass = noteType ? NOTE_TYPE_COLORS[noteType] : "bg-gray-500/10 text-gray-500";
                          const label = INFERRED_TYPE_LABELS[item.inferredType] || item.inferredType;
                          return (
                            <Badge
                              variant="secondary"
                              className={cn("ml-5 h-5 gap-1 text-xs font-normal", colorClass)}
                            >
                              <TypeIcon className="h-3 w-3" />
                              {label}
                            </Badge>
                          );
                        })()}
                      </button>

                      {/* PRD-038: Expanded content with explanation and actions */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-3">
                          {/* AI Explanation */}
                          <div className="ml-5 p-2 bg-muted/50 rounded-md">
                            <p className="text-xs text-muted-foreground italic">
                              {item.explanation || "No explanation available"}
                            </p>
                          </div>

                          {/* Action buttons */}
                          <div className="ml-5 flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={isReviewActionPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                onApproveReview?.(item.classificationId);
                              }}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={isReviewActionPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                onRejectReview?.(item.classificationId);
                              }}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={isReviewActionPending}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-3 w-3 mr-1" />
                                  Reclassify
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {reclassifyOptions.map((opt) => (
                                  <DropdownMenuItem
                                    key={opt.value}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onReclassifyReview?.(item.classificationId, opt.value);
                                    }}
                                  >
                                    {opt.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* View Note link */}
                          {note && (
                            <button
                              className="ml-5 text-xs text-primary hover:underline flex items-center gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNote(note);
                              }}
                            >
                              View Note
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <Accordion
          type="multiple"
          value={expandedSections}
          onValueChange={setExpandedSections}
          className="px-2"
        >
          {FILTER_CATEGORIES.map((category) => {
            const categoryNotes = notesByCategory[category.key] || [];
            const Icon = category.icon;

            return (
              <AccordionItem
                key={category.key}
                value={category.key}
                className="border-b-0"
              >
                <AccordionTrigger className="py-2 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", category.color)} />
                    <span className="text-sm">{category.label}</span>
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {categoryNotes.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  {categoryNotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground pl-6 py-2">
                      No items
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {categoryNotes.map((note) => (
                        <NotesItemPreview key={note.id} note={note} team={team}>
                          <button
                            className={cn(
                              "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors",
                              "hover:bg-accent hover:text-accent-foreground",
                              selectedNoteId === note.id &&
                                !isTodayMode &&
                                "bg-accent text-accent-foreground"
                            )}
                            onClick={() => onSelectNote(note)}
                          >
                            <div className="flex items-center gap-2">
                              {note.noteType === "session_log" &&
                              note.sessionDate ? (
                                <span className="text-muted-foreground text-xs">
                                  {format(
                                    new Date(note.sessionDate),
                                    "yyyy-MM-dd"
                                  )}
                                </span>
                              ) : null}
                              <span className="truncate">{note.title}</span>
                            </div>
                          </button>
                        </NotesItemPreview>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </ScrollArea>
    </div>
  );
}
