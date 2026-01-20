/**
 * PRD-031: AI Import Paywall Stub Dialog
 *
 * Shows value proposition when user tries to enable AI Enhance Import
 * without having AI Features enabled in Settings.
 *
 * Uses a real example from actual import data to demonstrate AI value.
 */

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
import { Sparkles, ArrowRight, Users, MapPin, Link2, FileText } from "lucide-react";
import { useLocation } from "wouter";

interface AIPaywallStubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
}

// Real example from imports/Vagaries of Fate PF2e.zip
// File: Hobgoblin Threat to Agnot 2714fc9d.md
const PAYWALL_EXAMPLE = {
  title: "Hobgoblin Threat to Agnot",
  snippet: `"...The male's name is Killgore... He lets us know that Agnot is a traitor and that they're here to mete out justice... 'We'll be hanging out in the Tawdry Tart if you're willing to bring Agnot to us. 10g a piece to the two of you.'"`,
  baseline: {
    type: "Note",
    typeLabel: "Generic Note",
    entities: [] as { name: string; type: string }[],
    relationships: [] as { from: string; to: string; label: string }[],
  },
  aiEnhanced: {
    type: "Quest",
    typeLabel: "Quest (bounty contract)",
    confidence: 0.87,
    entities: [
      { name: "Killgore", type: "NPC", description: "Hobgoblin duelist" },
      { name: "Unnamed witch", type: "NPC", description: "Hobgoblin caster with raven Corrigan" },
      { name: "The Tawdry Tart", type: "Location", description: "Tavern meeting point" },
      { name: "Agnot", type: "Character", description: "Marked as 'traitor'" },
    ],
    relationships: [
      { from: "Killgore", to: "The Tawdry Tart", type: "NPCInPlace", label: "located in" },
      { from: "Quest", to: "Killgore", type: "QuestHasNPC", label: "involves" },
      { from: "Quest", to: "Witch", type: "QuestHasNPC", label: "involves" },
    ],
  },
};

export function AIPaywallStubDialog({
  open,
  onOpenChange,
  teamId,
}: AIPaywallStubDialogProps) {
  const [, setLocation] = useLocation();

  const handleEnableAI = () => {
    onOpenChange(false);
    setLocation(`/teams/${teamId}/settings`);
  };

  const handleContinueWithoutAI = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Unlock AI-Enhanced Import
          </DialogTitle>
          <DialogDescription>
            See what you're missing with AI-powered entity detection
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Value Proposition */}
          <p className="text-sm text-muted-foreground">
            AI analyzes your notes to automatically classify entities and discover
            relationships that pattern recognition misses.
          </p>

          {/* Before/After Comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Before (Baseline) */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                Pattern Recognition
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium truncate" title={PAYWALL_EXAMPLE.title}>
                  "{PAYWALL_EXAMPLE.title}"
                </p>
                <Badge variant="secondary" className="text-xs">
                  {PAYWALL_EXAMPLE.baseline.typeLabel}
                </Badge>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Entities found:</p>
                <p className="text-sm text-muted-foreground italic">None</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Relationships:</p>
                <p className="text-sm text-muted-foreground italic">None</p>
              </div>
            </div>

            {/* After (AI Enhanced) */}
            <div className="space-y-3 p-4 border border-primary/30 rounded-lg bg-primary/5">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                AI Enhanced
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium truncate" title={PAYWALL_EXAMPLE.title}>
                  "{PAYWALL_EXAMPLE.title}"
                </p>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs bg-red-500/10 text-red-600 hover:bg-red-500/20">
                    {PAYWALL_EXAMPLE.aiEnhanced.typeLabel}
                  </Badge>
                  <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                    {Math.round(PAYWALL_EXAMPLE.aiEnhanced.confidence * 100)}%
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Entities found:</p>
                <div className="flex flex-wrap gap-1">
                  {PAYWALL_EXAMPLE.aiEnhanced.entities.map((entity, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className={`text-xs ${
                        entity.type === "NPC"
                          ? "border-orange-500/50 text-orange-600"
                          : entity.type === "Location"
                          ? "border-purple-500/50 text-purple-600"
                          : "border-blue-500/50 text-blue-600"
                      }`}
                    >
                      {entity.type === "NPC" && <Users className="h-3 w-3 mr-1" />}
                      {entity.type === "Location" && <MapPin className="h-3 w-3 mr-1" />}
                      {entity.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Relationships:</p>
                <div className="space-y-1">
                  {PAYWALL_EXAMPLE.aiEnhanced.relationships.map((rel, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs">
                      <Link2 className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{rel.from}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{rel.label}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{rel.to}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Original Text Snippet */}
          <div className="p-3 bg-muted/50 rounded-lg border-l-2 border-muted-foreground/30">
            <p className="text-xs text-muted-foreground italic">
              {PAYWALL_EXAMPLE.snippet}
            </p>
          </div>

          {/* Stats Banner */}
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              In a typical import, AI improves <strong>40-60%</strong> of classifications
              and discovers <strong>3-5x</strong> more entity relationships.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={handleContinueWithoutAI}
            className="w-full sm:w-auto"
          >
            Continue without AI
          </Button>
          <Button onClick={handleEnableAI} className="w-full sm:w-auto">
            <Sparkles className="h-4 w-4 mr-2" />
            Enable AI Features
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
