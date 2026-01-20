import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  FileArchive,
  User,
  MapPin,
  ScrollText,
  FolderOpen,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  Lock,
  Users,
  Sparkles,
  X,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { AIImportDiffPreview } from "./ai-import-diff-preview";
import { AIPaywallStubDialog } from "./ai-paywall-stub-dialog";
import type { AIPreviewResponse } from "@shared/ai-preview-types";

interface ImportSummary {
  totalPages: number;
  emptyPages: number;
  characters: number;
  npcs: number;
  pois: number;
  questsOpen: number;
  questsDone: number;
  notes: number;
}

interface ParsedPage {
  sourcePageId: string;
  title: string;
  noteType: string;
  questStatus?: string;
  isEmpty: boolean;
}

interface ParseResponse {
  importPlanId: string;
  summary: ImportSummary;
  pages: ParsedPage[];
  detectedPCNames?: string[]; // PRD-040: PC names from team member settings
}

interface CommitResponse {
  importRunId: string;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

interface EnrichmentResponse {
  enrichmentRunId: string;
  status: string;
}

// PRD-030: Added ai-diff-loading and ai-diff-preview states
type DialogState = "upload" | "preview" | "ai-diff-loading" | "ai-diff-preview" | "importing" | "enriching" | "complete" | "error";

interface NuclinoImportDialogProps {
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberAiEnabled?: boolean; // PRD-031: Whether current member has AI features enabled
}

export function NuclinoImportDialog({
  teamId,
  open,
  onOpenChange,
  memberAiEnabled = false, // PRD-031: Default to false for safety
}: NuclinoImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<DialogState>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  // PRD-042: Granular empty page selection (replaces importEmptyPages boolean)
  const [selectedEmptyPageIds, setSelectedEmptyPageIds] = useState<Set<string>>(new Set());
  const [emptyPagesExpanded, setEmptyPagesExpanded] = useState(false);
  const [defaultVisibility, setDefaultVisibility] = useState<"private" | "team">("private");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // PRD-016: AI enhancement toggle
  const [aiEnhanceEnabled, setAiEnhanceEnabled] = useState(() => {
    // Default based on localStorage preference
    const stored = localStorage.getItem("helm-ai-enhance-preference");
    if (stored !== null) return stored === "true";
    return false; // Default off in production
  });
  const [enrichmentRunId, setEnrichmentRunId] = useState<string | null>(null);
  // PRD-030: AI preview state
  const [aiPreviewResult, setAiPreviewResult] = useState<AIPreviewResponse | null>(null);
  const [aiPreviewError, setAiPreviewError] = useState<string | null>(null);
  // PRD-031: Paywall stub dialog state
  const [showPaywallStub, setShowPaywallStub] = useState(false);
  // PRD-035: Progress tracking state
  const [currentOperationId, setCurrentOperationId] = useState<string | null>(null);
  // PRD-040: PC names for AI classification
  const [pcNames, setPcNames] = useState<string[]>([]);
  const [pcNameInput, setPcNameInput] = useState("");
  const [detectedPCNames, setDetectedPCNames] = useState<string[]>([]);

  // PRD-035: Progress polling query
  interface ImportProgress {
    operationId: string;
    phase: 'classifying' | 'relationships' | 'creating' | 'linking' | 'complete';
    current: number;
    total: number;
    currentItem?: string;
    startedAt: number;
  }

  const { data: progressData } = useQuery<ImportProgress>({
    queryKey: ["/api/teams", teamId, "imports/progress", currentOperationId],
    queryFn: async () => {
      if (!currentOperationId) throw new Error("No operation ID");
      const response = await fetch(
        `/api/teams/${teamId}/imports/progress/${currentOperationId}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch progress");
      }
      return response.json();
    },
    enabled: !!currentOperationId && (state === "ai-diff-loading" || state === "importing"),
    refetchInterval: 500, // Poll every 500ms
  });

  // PRD-042: Derived empty pages list
  const emptyPages = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.pages.filter(p => p.isEmpty);
  }, [parseResult]);

  // PRD-042: Handlers for empty page selection
  const handleSelectAllEmptyPages = useCallback(() => {
    setSelectedEmptyPageIds(new Set(emptyPages.map(p => p.sourcePageId)));
  }, [emptyPages]);

  const handleDeselectAllEmptyPages = useCallback(() => {
    setSelectedEmptyPageIds(new Set());
  }, []);

  const toggleEmptyPage = useCallback((pageId: string) => {
    setSelectedEmptyPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  // Parse mutation
  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("zipFile", file);

      const response = await fetch(`/api/teams/${teamId}/imports/nuclino/parse`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to parse ZIP file");
      }

      return response.json() as Promise<ParseResponse>;
    },
    onSuccess: (data) => {
      setParseResult(data);
      // PRD-042: Initialize all empty pages as selected by default
      const emptyPageIds = data.pages.filter(p => p.isEmpty).map(p => p.sourcePageId);
      setSelectedEmptyPageIds(new Set(emptyPageIds));
      // PRD-040: Initialize PC names from team member settings
      if (data.detectedPCNames && data.detectedPCNames.length > 0) {
        setDetectedPCNames(data.detectedPCNames);
        setPcNames(data.detectedPCNames);
      }
      setState("preview");
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      setState("error");
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!parseResult) throw new Error("No import plan");

      const response = await fetch(`/api/teams/${teamId}/imports/nuclino/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          importPlanId: parseResult.importPlanId,
          options: {
            // PRD-042: Send list of empty pages to exclude
            excludedEmptyPageIds: emptyPages
              .filter(p => !selectedEmptyPageIds.has(p.sourcePageId))
              .map(p => p.sourcePageId),
            defaultVisibility,
          },
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to commit import");
      }

      return response.json() as Promise<CommitResponse>;
    },
    onSuccess: async (data) => {
      setCommitResult(data);
      // Invalidate notes query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "notes"] });

      // PRD-016: Trigger enrichment if enabled
      if (aiEnhanceEnabled && data.importRunId) {
        setState("enriching");
        try {
          const enrichmentResponse = await fetch(
            `/api/teams/${teamId}/imports/${data.importRunId}/enrich`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ overrideExistingClassifications: false }),
              credentials: "include",
            }
          );
          if (enrichmentResponse.ok) {
            const enrichmentData = await enrichmentResponse.json() as EnrichmentResponse;
            setEnrichmentRunId(enrichmentData.enrichmentRunId);
            toast({
              title: "AI Enhancement Started",
              description: "Notes are being analyzed. You can review suggestions in a moment.",
            });
          }
        } catch (err) {
          console.error("Failed to trigger enrichment:", err);
          // Don't fail the whole import, just show a warning
          toast({
            title: "AI Enhancement Unavailable",
            description: "Import completed but AI enhancement could not be started.",
            variant: "destructive",
          });
        }
      }
      setState("complete");
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      setState("error");
    },
  });

  // PRD-030/035/040: AI preview mutation with progress tracking and PC names
  const aiPreviewMutation = useMutation({
    mutationFn: async ({ importPlanId, operationId, aiOptions }: {
      importPlanId: string;
      operationId: string;
      aiOptions?: { playerCharacterNames?: string[] };
    }) => {
      const response = await fetch(`/api/teams/${teamId}/imports/nuclino/ai-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ importPlanId, operationId, aiOptions }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate AI preview");
      }

      return response.json() as Promise<AIPreviewResponse>;
    },
    onSuccess: (data) => {
      setAiPreviewResult(data);
      setAiPreviewError(null);
      setCurrentOperationId(null); // Stop polling
      setState("ai-diff-preview");
    },
    onError: (error: Error) => {
      setAiPreviewError(error.message);
      setCurrentOperationId(null); // Stop polling on error
      // Stay on ai-diff-loading state to show error with fallback option
    },
  });

  // PRD-030/035: AI-enhanced commit mutation with progress tracking
  const aiCommitMutation = useMutation({
    mutationFn: async (operationId: string) => {
      if (!parseResult || !aiPreviewResult) throw new Error("No import plan or AI preview");

      const response = await fetch(`/api/teams/${teamId}/imports/nuclino/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          importPlanId: parseResult.importPlanId,
          options: {
            // PRD-042: Send list of empty pages to exclude
            excludedEmptyPageIds: emptyPages
              .filter(p => !selectedEmptyPageIds.has(p.sourcePageId))
              .map(p => p.sourcePageId),
            defaultVisibility,
          },
          useAIClassifications: true,
          aiPreviewId: aiPreviewResult.previewId,
          operationId, // PRD-035: Include for progress tracking
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to commit AI-enhanced import");
      }

      return response.json() as Promise<CommitResponse & { enrichmentRunId?: string; aiEnhanced?: boolean; operationId?: string }>;
    },
    onSuccess: (data) => {
      setCommitResult(data);
      setCurrentOperationId(null); // PRD-035: Stop polling
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "notes"] });

      if (data.enrichmentRunId) {
        setEnrichmentRunId(data.enrichmentRunId);
      }

      setState("complete");
      toast({
        title: "AI-Enhanced Import Complete",
        description: `${data.created} notes created with AI classifications.`,
      });
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      setCurrentOperationId(null); // PRD-035: Stop polling on error
      setState("error");
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      parseMutation.mutate(selectedFile);
    }
  };

  // PRD-035: Helper to generate unique operation ID
  const generateOperationId = () => {
    return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  // PRD-030/031/035: Modified to use AI preview when enabled, with paywall check and progress tracking
  const handleCommit = () => {
    if (aiEnhanceEnabled && parseResult) {
      // PRD-031: If AI toggle is on but user doesn't have AI enabled in settings,
      // show the paywall stub instead of trying to call the AI preview endpoint
      if (!memberAiEnabled) {
        setShowPaywallStub(true);
        return;
      }
      // PRD-035: Generate operation ID and start polling before mutation
      const opId = generateOperationId();
      setCurrentOperationId(opId);
      setState("ai-diff-loading");
      // PRD-040: Pass PC names to AI classification
      aiPreviewMutation.mutate({
        importPlanId: parseResult.importPlanId,
        operationId: opId,
        aiOptions: pcNames.length > 0 ? { playerCharacterNames: pcNames } : undefined,
      });
    } else {
      setState("importing");
      commitMutation.mutate();
    }
  };

  // PRD-030/035: Handle AI-enhanced commit with progress tracking
  const handleAIConfirm = () => {
    // PRD-035: Generate operation ID for commit progress tracking
    const opId = generateOperationId();
    setCurrentOperationId(opId);
    setState("importing");
    aiCommitMutation.mutate(opId);
  };

  // PRD-030: Handle going back from AI preview to settings
  const handleAIPreviewBack = () => {
    setState("preview");
    setAiPreviewResult(null);
    setAiPreviewError(null);
  };

  // PRD-030: Handle fallback to baseline import on AI error
  const handleFallbackToBaseline = () => {
    setState("importing");
    commitMutation.mutate();
  };

  const handleClose = () => {
    // Reset state
    setState("upload");
    setSelectedFile(null);
    setParseResult(null);
    setCommitResult(null);
    // PRD-042: Reset empty page selection state
    setSelectedEmptyPageIds(new Set());
    setEmptyPagesExpanded(false);
    setDefaultVisibility("private");
    setErrorMessage(null);
    setEnrichmentRunId(null);
    // PRD-030: Reset AI preview state
    setAiPreviewResult(null);
    setAiPreviewError(null);
    // PRD-035: Reset progress tracking state
    setCurrentOperationId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onOpenChange(false);
  };

  // PRD-016/031: Handle AI enhancement toggle change
  const handleAiEnhanceChange = (checked: boolean) => {
    // PRD-031: If user is trying to enable AI but doesn't have it enabled in settings,
    // show the paywall stub dialog instead of toggling
    if (checked && !memberAiEnabled) {
      setShowPaywallStub(true);
      return;
    }
    setAiEnhanceEnabled(checked);
    localStorage.setItem("helm-ai-enhance-preference", String(checked));
  };

  const renderUploadState = () => (
    <>
      <DialogHeader>
        <DialogTitle>Import Notes from Nuclino</DialogTitle>
        <DialogDescription>
          Upload a Nuclino export ZIP file to import your notes, preserving
          links and categorization.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="flex flex-col items-center justify-center gap-4 p-8 border-2 border-dashed rounded-lg">
          <FileArchive className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Select a Nuclino export ZIP file
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Only .zip files are accepted (max 50MB)
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={handleFileSelect}
            className="hidden"
            id="nuclino-zip-input"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Choose File
          </Button>
        </div>

        {selectedFile && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <FileArchive className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Check className="h-5 w-5 text-green-500" />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || parseMutation.isPending}
        >
          {parseMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload & Parse
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  );

  const renderPreviewState = () => {
    if (!parseResult) return null;
    const { summary, pages } = parseResult;

    return (
      <>
        <DialogHeader>
          <DialogTitle>Import Preview</DialogTitle>
          <DialogDescription>
            Review the pages that will be imported from your Nuclino export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-lg font-semibold">{summary.totalPages}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-orange-500/10 rounded-lg">
              <Users className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-lg font-semibold">{summary.npcs}</p>
                <p className="text-xs text-muted-foreground">NPCs</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-purple-500/10 rounded-lg">
              <MapPin className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-lg font-semibold">{summary.pois}</p>
                <p className="text-xs text-muted-foreground">POIs</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-red-500/10 rounded-lg">
              <ScrollText className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-lg font-semibold">
                  {summary.questsOpen + summary.questsDone}
                </p>
                <p className="text-xs text-muted-foreground">Quests</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <FileText className="h-4 w-4 shrink-0" />
            <span>{summary.notes} general notes</span>
            <span>·</span>
            <span>{summary.emptyPages} empty pages</span>
          </div>

          {/* PRD-042: Expandable empty pages section */}
          {emptyPages.length > 0 && (
            <Collapsible
              open={emptyPagesExpanded}
              onOpenChange={setEmptyPagesExpanded}
            >
              <div className="bg-muted rounded-lg">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center justify-between w-full p-3 hover:bg-muted/80 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="text-left">
                        <span className="text-sm font-medium">Empty Pages</span>
                        <p className="text-xs text-muted-foreground">
                          {selectedEmptyPageIds.size} of {emptyPages.length} selected
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        emptyPagesExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 space-y-2">
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAllEmptyPages}
                        disabled={selectedEmptyPageIds.size === emptyPages.length}
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleDeselectAllEmptyPages}
                        disabled={selectedEmptyPageIds.size === 0}
                      >
                        Deselect All
                      </Button>
                    </div>
                    <ScrollArea className="h-32">
                      <div className="space-y-1 pr-4">
                        {emptyPages.map(page => (
                          <label
                            key={page.sourcePageId}
                            className="flex items-center gap-2 p-1.5 rounded hover:bg-muted-foreground/10 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedEmptyPageIds.has(page.sourcePageId)}
                              onCheckedChange={() => toggleEmptyPage(page.sourcePageId)}
                            />
                            <span className="text-sm truncate">
                              {page.title || "Untitled"}
                            </span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* PRD-015A: Visibility selector */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <Label htmlFor="visibility" className="text-sm font-medium">
                Default Visibility
              </Label>
              <p className="text-xs text-muted-foreground">
                Who can see imported notes
              </p>
            </div>
            <Select
              value={defaultVisibility}
              onValueChange={(value: "private" | "team") => setDefaultVisibility(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <span>Private (only me)</span>
                  </div>
                </SelectItem>
                <SelectItem value="team">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Shared with team</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* PRD-016: AI Enhancement toggle */}
          <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="ai-enhance" className="text-sm font-medium">
                    AI Enhance Import
                  </Label>
                  <Badge variant="outline" className="text-xs">
                    Beta
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Detect NPCs, places, quests, and relationships to improve organization
                </p>
              </div>
            </div>
            <Switch
              id="ai-enhance"
              checked={aiEnhanceEnabled}
              onCheckedChange={handleAiEnhanceChange}
            />
          </div>

          {/* PRD-040: PC Names section - only show when AI enhance is enabled */}
          {aiEnhanceEnabled && (
            <div className="space-y-3 p-3 bg-muted rounded-lg">
              <div>
                <Label className="text-sm font-medium">Player Character Names</Label>
                <p className="text-xs text-muted-foreground">
                  Notes about these characters will be classified as "Character" instead of "NPC"
                </p>
              </div>

              {/* Display current PC names as badges */}
              {pcNames.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pcNames.map((name, idx) => (
                    <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                      {name}
                      {/* Only show remove button for user-added names (not auto-detected ones) */}
                      {!detectedPCNames.includes(name) && (
                        <button
                          type="button"
                          onClick={() => setPcNames(pcNames.filter((_, i) => i !== idx))}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Add new PC name input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add PC name..."
                  value={pcNameInput}
                  onChange={(e) => setPcNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pcNameInput.trim()) {
                      e.preventDefault();
                      if (!pcNames.includes(pcNameInput.trim())) {
                        setPcNames([...pcNames, pcNameInput.trim()]);
                      }
                      setPcNameInput("");
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (pcNameInput.trim() && !pcNames.includes(pcNameInput.trim())) {
                      setPcNames([...pcNames, pcNameInput.trim()]);
                    }
                    setPcNameInput("");
                  }}
                  disabled={!pcNameInput.trim()}
                >
                  Add
                </Button>
              </div>

              {detectedPCNames.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {detectedPCNames.length} name(s) detected from team settings
                </p>
              )}
            </div>
          )}

          {/* Pages list */}
          <div>
            <Label className="text-sm font-medium">Pages to import</Label>
            <ScrollArea className="h-48 mt-2 border rounded-lg">
              <div className="p-2 space-y-1">
                {pages
                  .filter((p) => !p.isEmpty || selectedEmptyPageIds.has(p.sourcePageId))
                  .map((page) => (
                    <div
                      key={page.sourcePageId}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted/50"
                    >
                      <Badge variant="secondary" className="text-xs">
                        {page.noteType}
                      </Badge>
                      <span className="text-sm truncate">{page.title}</span>
                      {page.isEmpty && (
                        <Badge variant="outline" className="text-xs ml-auto">
                          empty
                        </Badge>
                      )}
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCommit}>
            Import {summary.totalPages - summary.emptyPages + selectedEmptyPageIds.size} Pages
          </Button>
        </DialogFooter>
      </>
    );
  };

  // PRD-035/038: Phase configurations for progress calculation
  // AI Preview only uses classifying + relationships (2 phases)
  // Import commit uses creating + linking (2 phases)
  const aiPreviewPhases = {
    classifying: { start: 0, weight: 0.50, step: 1, totalSteps: 2 },
    relationships: { start: 0.50, weight: 0.50, step: 2, totalSteps: 2 },
    complete: { start: 1.0, weight: 0, step: 2, totalSteps: 2 },
  };

  const importPhases = {
    creating: { start: 0, weight: 0.75, step: 1, totalSteps: 2 },
    linking: { start: 0.75, weight: 0.25, step: 2, totalSteps: 2 },
    complete: { start: 1.0, weight: 0, step: 2, totalSteps: 2 },
  };

  const phaseLabels: Record<string, string> = {
    classifying: "Classifying notes",
    relationships: "Analyzing relationships",
    creating: "Creating notes",
    linking: "Resolving links",
    complete: "Complete",
  };

  // PRD-035/038: Calculate overall progress for AI preview (classifying + relationships)
  const getAIPreviewProgressPercent = () => {
    if (!progressData || progressData.total === 0) return undefined;
    const { phase, current, total } = progressData;
    const phaseConfig = aiPreviewPhases[phase as keyof typeof aiPreviewPhases];
    if (!phaseConfig) return undefined;

    const phaseProgress = current / total;
    const overallProgress = phaseConfig.start + (phaseProgress * phaseConfig.weight);
    return Math.round(overallProgress * 100);
  };

  // PRD-035/038: Calculate overall progress for import commit (creating + linking)
  const getImportProgressPercent = () => {
    if (!progressData || progressData.total === 0) return undefined;
    const { phase, current, total } = progressData;
    const phaseConfig = importPhases[phase as keyof typeof importPhases];
    if (!phaseConfig) return undefined;

    const phaseProgress = current / total;
    const overallProgress = phaseConfig.start + (phaseProgress * phaseConfig.weight);
    return Math.round(overallProgress * 100);
  };

  // PRD-035/038: Helper to get progress status info
  const getProgressStatusInfo = (isAIPreview: boolean) => {
    if (!progressData) return null;
    const { phase, current, total, currentItem } = progressData;

    const phases = isAIPreview ? aiPreviewPhases : importPhases;
    const phaseConfig = phases[phase as keyof typeof phases];
    if (!phaseConfig) return null;

    return {
      step: phaseConfig.step,
      totalSteps: phaseConfig.totalSteps,
      phaseLabel: phaseLabels[phase] || "Processing",
      current: current + 1,
      total,
      currentItem,
    };
  };

  const renderImportingState = () => {
    const overallPercent = getImportProgressPercent();
    const statusInfo = getProgressStatusInfo(false);

    return (
      <>
        <DialogHeader>
          <DialogTitle>Importing Notes</DialogTitle>
          <DialogDescription>
            Please wait while your notes are being imported...
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />

          {/* PRD-038: Segmented progress bar with phase markers */}
          <div className="w-full max-w-xs">
            <div className="relative">
              <Progress value={overallPercent} className="w-full" />
              {/* Phase segment dividers: Creating (75%) | Linking (25%) */}
              <div className="absolute inset-0 flex pointer-events-none" style={{ height: '8px' }}>
                <div className="w-[75%] border-r border-white/30" />
                <div className="w-[25%]" />
              </div>
            </div>

            {/* Status text with step indicator */}
            {statusInfo ? (
              <div className="mt-3 text-center">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Step {statusInfo.step} of {statusInfo.totalSteps}</span>
                  {" · "}
                  {statusInfo.phaseLabel} ({statusInfo.current} of {statusInfo.total})
                </p>
                {statusInfo.currentItem && (
                  <p className="text-xs text-muted-foreground/70 truncate mt-1">
                    {statusInfo.currentItem}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center mt-3">
                Processing...
              </p>
            )}
          </div>
        </div>
      </>
    );
  };

  // PRD-030/035/038: Render AI diff loading state with segmented progress
  const renderAIDiffLoadingState = () => {
    const overallPercent = getAIPreviewProgressPercent();
    const statusInfo = getProgressStatusInfo(true);

    return (
      <>
        <DialogHeader>
          <DialogTitle>Analyzing with AI</DialogTitle>
          <DialogDescription>
            Generating AI-enhanced classification preview...
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="relative">
            <Sparkles className="h-12 w-12 text-primary" />
            <Loader2 className="h-6 w-6 animate-spin text-primary absolute -bottom-1 -right-1" />
          </div>

          {/* PRD-038: Segmented progress bar with phase markers */}
          <div className="w-full max-w-xs">
            <div className="relative">
              <Progress value={overallPercent} className="w-full" />
              {/* Phase segment dividers: Classifying (50%) | Relationships (50%) */}
              <div className="absolute inset-0 flex pointer-events-none" style={{ height: '8px' }}>
                <div className="w-[50%] border-r border-white/30" />
                <div className="w-[50%]" />
              </div>
            </div>

            {/* Status text with step indicator */}
            {statusInfo ? (
              <div className="mt-3 text-center">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Step {statusInfo.step} of {statusInfo.totalSteps}</span>
                  {" · "}
                  {statusInfo.phaseLabel} ({statusInfo.current} of {statusInfo.total})
                </p>
                {statusInfo.currentItem && (
                  <p className="text-xs text-muted-foreground/70 truncate mt-1">
                    {statusInfo.currentItem}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center mt-3">
                Processing...
              </p>
            )}
          </div>

          {/* Show error with fallback option */}
          {aiPreviewError && (
            <Alert variant="destructive" className="mt-4 w-full max-w-xs">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-2">{aiPreviewError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFallbackToBaseline}
                >
                  Import without AI
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </DialogFooter>
      </>
    );
  };

  // PRD-030: Render AI diff preview state
  const renderAIDiffPreviewState = () => {
    if (!aiPreviewResult) return null;

    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Import Preview
          </DialogTitle>
          <DialogDescription>
            Review AI-enhanced classifications before importing.
          </DialogDescription>
        </DialogHeader>

        <AIImportDiffPreview
          previewData={aiPreviewResult}
          onConfirm={handleAIConfirm}
          onCancel={handleClose}
          onBack={handleAIPreviewBack}
          isConfirming={aiCommitMutation.isPending}
        />
      </>
    );
  };

  const renderEnrichingState = () => (
    <>
      <DialogHeader>
        <DialogTitle>AI Enhancement in Progress</DialogTitle>
        <DialogDescription>
          Analyzing notes to detect entities and relationships...
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="relative">
          <Sparkles className="h-12 w-12 text-primary" />
          <Loader2 className="h-6 w-6 animate-spin text-primary absolute -bottom-1 -right-1" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Detecting NPCs, places, quests, and relationships...
          <br />
          <span className="text-xs">This may take a moment</span>
        </p>
        <Progress value={undefined} className="w-full max-w-xs" />
      </div>
    </>
  );

  const renderCompleteState = () => {
    if (!commitResult) return null;

    return (
      <>
        <DialogHeader>
          <DialogTitle>Import Complete</DialogTitle>
          <DialogDescription>
            Your Nuclino notes have been successfully imported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-center p-8">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-500">
                {commitResult.created}
              </p>
              <p className="text-sm text-muted-foreground">Created</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-500">
                {commitResult.updated}
              </p>
              <p className="text-sm text-muted-foreground">Updated</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-500">
                {commitResult.skipped}
              </p>
              <p className="text-sm text-muted-foreground">Skipped</p>
            </div>
          </div>

          {commitResult.warnings.length > 0 && (
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-1">
                  {commitResult.warnings.length} warnings during import:
                </p>
                <ScrollArea className="h-24">
                  <ul className="text-xs space-y-1">
                    {commitResult.warnings.slice(0, 10).map((warning, i) => (
                      <li key={i}>· {warning}</li>
                    ))}
                    {commitResult.warnings.length > 10 && (
                      <li>
                        · ... and {commitResult.warnings.length - 10} more
                      </li>
                    )}
                  </ul>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {/* PRD-016: AI Enhancement status */}
          {enrichmentRunId && (
            <Alert className="bg-primary/5 border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertDescription>
                <p className="font-medium text-primary">AI Enhancement Queued</p>
                <p className="text-xs text-muted-foreground">
                  Notes are being analyzed in the background. Check the Import Management
                  page to review AI suggestions when ready.
                </p>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleClose}>Done</Button>
        </DialogFooter>
      </>
    );
  };

  const renderErrorState = () => (
    <>
      <DialogHeader>
        <DialogTitle>Import Failed</DialogTitle>
        <DialogDescription>
          There was an error importing your Nuclino export.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {errorMessage || "An unknown error occurred"}
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleClose}>
          Close
        </Button>
        <Button
          onClick={() => {
            setState("upload");
            setErrorMessage(null);
          }}
        >
          Try Again
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className={state === "ai-diff-preview" ? "sm:max-w-4xl" : "sm:max-w-2xl"}>
          {state === "upload" && renderUploadState()}
          {state === "preview" && renderPreviewState()}
          {state === "ai-diff-loading" && renderAIDiffLoadingState()}
          {state === "ai-diff-preview" && renderAIDiffPreviewState()}
          {state === "importing" && renderImportingState()}
          {state === "enriching" && renderEnrichingState()}
          {state === "complete" && renderCompleteState()}
          {state === "error" && renderErrorState()}
        </DialogContent>
      </Dialog>

      {/* PRD-031: Paywall stub dialog for non-entitled users */}
      <AIPaywallStubDialog
        open={showPaywallStub}
        onOpenChange={setShowPaywallStub}
        teamId={teamId}
      />
    </>
  );
}
