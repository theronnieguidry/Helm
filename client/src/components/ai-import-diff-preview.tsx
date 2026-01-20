/**
 * PRD-030: AI Import Diff Preview Component
 *
 * Side-by-side comparison of baseline vs AI-enhanced classifications
 * for Nuclino import preview.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Users,
  MapPin,
  ScrollText,
  FileText,
  ArrowRight,
  Link2,
  Check,
  AlertTriangle,
  ChevronLeft,
  X,
} from "lucide-react";
import type {
  AIPreviewResponse,
  BaselineClassification,
  AIClassification,
  AIRelationship,
  ConfidenceLevel,
} from "@shared/ai-preview-types";
import { getConfidenceLevel, getConfidenceBadgeClass } from "@shared/ai-preview-types";

interface AIImportDiffPreviewProps {
  previewData: AIPreviewResponse;
  onConfirm: () => void;
  onCancel: () => void;
  onBack: () => void;
  isConfirming?: boolean;
}

export function AIImportDiffPreview({
  previewData,
  onConfirm,
  onCancel,
  onBack,
  isConfirming = false,
}: AIImportDiffPreviewProps) {
  const { baseline, aiEnhanced, diff } = previewData;

  // Build a lookup map for baseline types
  const baselineMap = new Map(
    baseline.classifications.map((c) => [c.sourcePageId, c])
  );

  return (
    <div className="flex flex-col h-full max-h-[70vh] overflow-x-hidden">
      {/* Header */}
      <div className="space-y-4 pb-4 border-b">
        {/* Diff Summary Banner */}
        <div
          className="flex items-center gap-4 p-3 bg-primary/5 border border-primary/20 rounded-lg"
          data-testid="diff-summary-banner"
        >
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              AI analyzed {diff.totalPages} pages
            </p>
            <p className="text-xs text-muted-foreground">
              {diff.changedCount} classifications improved &bull;{" "}
              {diff.upgradedCount} confirmed &bull;{" "}
              {aiEnhanced.summary.relationshipsTotal} relationships found
            </p>
          </div>
        </div>

        {/* Summary Cards Grid */}
        <div className="grid grid-cols-2 gap-4 min-w-0">
          {/* Baseline Summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Baseline Import
            </h3>
            <div
              className="grid grid-cols-2 gap-2"
              data-testid="baseline-summary"
            >
              <SummaryCard
                icon={<FileText className="h-4 w-4" />}
                count={baseline.summary.total}
                label="Total"
                variant="default"
              />
              <SummaryCard
                icon={<Users className="h-4 w-4" />}
                count={baseline.summary.npcs}
                label="NPCs"
                variant="orange"
              />
              <SummaryCard
                icon={<MapPin className="h-4 w-4" />}
                count={baseline.summary.pois}
                label="POIs"
                variant="purple"
              />
              <SummaryCard
                icon={<ScrollText className="h-4 w-4" />}
                count={baseline.summary.questsOpen + baseline.summary.questsDone}
                label="Quests"
                variant="red"
              />
            </div>
          </div>

          {/* AI Summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-primary flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              AI Enhanced Import
            </h3>
            <div
              className="grid grid-cols-2 gap-2"
              data-testid="ai-summary"
            >
              <SummaryCard
                icon={<FileText className="h-4 w-4" />}
                count={aiEnhanced.summary.total}
                label="Total"
                variant="default"
              />
              <SummaryCard
                icon={<Users className="h-4 w-4" />}
                count={aiEnhanced.summary.npcs + aiEnhanced.summary.characters}
                label="NPCs"
                variant="orange"
                aiEnhanced
              />
              <SummaryCard
                icon={<MapPin className="h-4 w-4" />}
                count={aiEnhanced.summary.areas}
                label="Areas"
                variant="purple"
                aiEnhanced
              />
              <SummaryCard
                icon={<Link2 className="h-4 w-4" />}
                count={aiEnhanced.summary.relationshipsTotal}
                label="Relations"
                variant="blue"
                aiEnhanced
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="classifications" className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between py-2">
          <TabsList>
            <TabsTrigger value="classifications">Classifications</TabsTrigger>
            <TabsTrigger value="relationships">
              Relationships ({aiEnhanced.relationships.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="classifications" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-[300px] border rounded-lg">
            <div className="p-2 space-y-1" data-testid="classifications-list">
              {aiEnhanced.classifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No classifications found</p>
                </div>
              ) : (
                aiEnhanced.classifications.map((ai) => {
                  const baselineItem = baselineMap.get(ai.sourcePageId);
                  const isChanged = baselineItem
                    ? !areTypesEquivalentLocal(baselineItem.noteType, ai.inferredType)
                    : false;

                  return (
                    <ClassificationRow
                      key={ai.sourcePageId}
                      baseline={baselineItem}
                      ai={ai}
                      isChanged={isChanged}
                    />
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="relationships" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-[300px] border rounded-lg overflow-x-hidden">
            <div className="p-2 space-y-1" data-testid="relationships-list">
              {aiEnhanced.relationships.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No relationships detected</p>
                </div>
              ) : (
                aiEnhanced.relationships.map((rel, idx) => (
                  <RelationshipRow key={idx} relationship={rel} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-4 border-t mt-4">
        <Button variant="ghost" onClick={onBack} disabled={isConfirming}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? (
              <>
                <span className="animate-spin mr-2">
                  <Sparkles className="h-4 w-4" />
                </span>
                Importing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Confirm AI Enhanced Import
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Summary Card Component
interface SummaryCardProps {
  icon: React.ReactNode;
  count: number;
  label: string;
  variant: "default" | "orange" | "purple" | "red" | "blue";
  aiEnhanced?: boolean;
}

function SummaryCard({ icon, count, label, variant, aiEnhanced }: SummaryCardProps) {
  const variantClasses = {
    default: "bg-muted text-muted-foreground",
    orange: "bg-orange-500/10 text-orange-600",
    purple: "bg-purple-500/10 text-purple-600",
    red: "bg-red-500/10 text-red-600",
    blue: "bg-blue-500/10 text-blue-600",
  };

  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg ${variantClasses[variant]}`}>
      {icon}
      <div>
        <p className="text-lg font-semibold">{count}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {aiEnhanced && <Sparkles className="h-2 w-2" />}
        </p>
      </div>
    </div>
  );
}

// Classification Row Component
interface ClassificationRowProps {
  baseline?: BaselineClassification;
  ai: AIClassification;
  isChanged: boolean;
}

function ClassificationRow({ baseline, ai, isChanged }: ClassificationRowProps) {
  const confidenceLevel = getConfidenceLevel(ai.confidence);
  const confidenceClass = getConfidenceBadgeClass(ai.confidence);

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded hover:bg-muted/50 ${
        isChanged ? "bg-primary/5" : ""
      }`}
      data-testid="classification-row"
      data-changed={isChanged}
    >
      {/* Title */}
      <span className="flex-1 text-sm truncate">{ai.title}</span>

      {/* Baseline Type */}
      {baseline && (
        <>
          <Badge variant="secondary" className="text-xs shrink-0">
            {baseline.noteType}
          </Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        </>
      )}

      {/* AI Type with Confidence */}
      <Badge
        variant="outline"
        className={`text-xs shrink-0 ${confidenceClass}`}
      >
        {ai.inferredType}
      </Badge>

      {/* Change Indicator */}
      {isChanged ? (
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
      ) : (
        <Check className="h-3 w-3 text-green-500 shrink-0" />
      )}

      {/* Low Confidence Warning */}
      {confidenceLevel === "low" && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[200px]">
                Low confidence: AI is less than 65% sure about this classification.
                You can review and correct this after import in the Notes screen.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// Relationship Row Component
interface RelationshipRowProps {
  relationship: AIRelationship;
}

function RelationshipRow({ relationship }: RelationshipRowProps) {
  const confidenceClass = getConfidenceBadgeClass(relationship.confidence);
  const confidenceLevel = getConfidenceLevel(relationship.confidence);

  return (
    <div
      className="flex flex-col gap-1 p-2 rounded hover:bg-muted/50"
      data-testid="relationship-row"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {relationship.fromTitle}
        </span>
        <Badge variant="outline" className="text-xs shrink-0">
          {formatRelationshipType(relationship.relationshipType)}
        </Badge>
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {relationship.toTitle}
        </span>
        <Badge variant="outline" className={`text-xs shrink-0 ml-auto ${confidenceClass}`}>
          {Math.round(relationship.confidence * 100)}%
        </Badge>
        {confidenceLevel === "low" && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-[200px]">
                  Low confidence: AI is less than 65% sure about this relationship.
                  You can review and correct this after import in the Notes screen.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {relationship.evidenceSnippet && (
        <p className="text-xs text-muted-foreground pl-2 border-l-2 border-muted break-words">
          "{relationship.evidenceSnippet}"
        </p>
      )}
    </div>
  );
}

// Helper functions
function areTypesEquivalentLocal(baselineType: string, aiType: string): boolean {
  const mapping: Record<string, string> = {
    character: "Character",
    npc: "NPC",
    poi: "Area",
    area: "Area",
    quest: "Quest",
    session_log: "SessionLog",
    note: "Note",
  };
  return mapping[baselineType] === aiType;
}

function formatRelationshipType(type: string): string {
  const labels: Record<string, string> = {
    QuestHasNPC: "involves",
    QuestAtPlace: "at",
    NPCInPlace: "in",
    Related: "related to",
  };
  return labels[type] || type;
}
