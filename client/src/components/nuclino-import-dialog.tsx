import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
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
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface ImportSummary {
  totalPages: number;
  emptyPages: number;
  collections: number;
  people: number;
  places: number;
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

type DialogState = "upload" | "preview" | "importing" | "enriching" | "complete" | "error";

interface NuclinoImportDialogProps {
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuclinoImportDialog({
  teamId,
  open,
  onOpenChange,
}: NuclinoImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<DialogState>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [importEmptyPages, setImportEmptyPages] = useState(true);
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
          options: { importEmptyPages, defaultVisibility },
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

  const handleCommit = () => {
    setState("importing");
    commitMutation.mutate();
  };

  const handleClose = () => {
    // Reset state
    setState("upload");
    setSelectedFile(null);
    setParseResult(null);
    setCommitResult(null);
    setImportEmptyPages(true);
    setDefaultVisibility("private");
    setErrorMessage(null);
    setEnrichmentRunId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onOpenChange(false);
  };

  // PRD-016: Handle AI enhancement toggle change
  const handleAiEnhanceChange = (checked: boolean) => {
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
            <div className="flex items-center gap-2 p-2 bg-cyan-500/10 rounded-lg">
              <User className="h-4 w-4 text-cyan-500" />
              <div>
                <p className="text-lg font-semibold">{summary.people}</p>
                <p className="text-xs text-muted-foreground">People</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-teal-500/10 rounded-lg">
              <MapPin className="h-4 w-4 text-teal-500" />
              <div>
                <p className="text-lg font-semibold">{summary.places}</p>
                <p className="text-xs text-muted-foreground">Places</p>
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

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="h-4 w-4" />
            <span>{summary.collections} collections</span>
            <span className="mx-2">·</span>
            <span>{summary.notes} uncategorized notes</span>
            <span className="mx-2">·</span>
            <span>{summary.emptyPages} empty pages</span>
          </div>

          {/* Empty pages toggle */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <Label htmlFor="import-empty" className="text-sm font-medium">
                Import empty pages
              </Label>
              <p className="text-xs text-muted-foreground">
                Include {summary.emptyPages} empty pages in the import
              </p>
            </div>
            <Switch
              id="import-empty"
              checked={importEmptyPages}
              onCheckedChange={setImportEmptyPages}
            />
          </div>

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

          {/* Pages list */}
          <div>
            <Label className="text-sm font-medium">Pages to import</Label>
            <ScrollArea className="h-48 mt-2 border rounded-lg">
              <div className="p-2 space-y-1">
                {pages
                  .filter((p) => importEmptyPages || !p.isEmpty)
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
            Import {importEmptyPages ? summary.totalPages : summary.totalPages - summary.emptyPages} Pages
          </Button>
        </DialogFooter>
      </>
    );
  };

  const renderImportingState = () => (
    <>
      <DialogHeader>
        <DialogTitle>Importing Notes</DialogTitle>
        <DialogDescription>
          Please wait while your notes are being imported...
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Creating notes and resolving links...
        </p>
        <Progress value={undefined} className="w-full max-w-xs" />
      </div>
    </>
  );

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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {state === "upload" && renderUploadState()}
        {state === "preview" && renderPreviewState()}
        {state === "importing" && renderImportingState()}
        {state === "enriching" && renderEnrichingState()}
        {state === "complete" && renderCompleteState()}
        {state === "error" && renderErrorState()}
      </DialogContent>
    </Dialog>
  );
}
