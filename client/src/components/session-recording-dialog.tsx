/**
 * Session recording import (PRD-053): upload a Craig multitrack download,
 * watch it transcribe, land on the generated session log.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mic, Upload, Check, AlertCircle, Loader2, FileAudio } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

interface SessionRecordingDialogProps {
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface JobStatus {
  phase: "extracting" | "transcribing" | "summarizing" | "creating_notes" | "complete" | "error";
  tracksDone: number;
  tracksTotal: number;
  currentTrack?: string;
  error?: string;
  result?: { transcriptNoteId: string; sessionNoteId: string };
}

const PHASE_LABELS: Record<JobStatus["phase"], string> = {
  extracting: "Unpacking recording…",
  transcribing: "Transcribing speakers…",
  summarizing: "Writing the session log…",
  creating_notes: "Creating notes…",
  complete: "Done",
  error: "Failed",
};

export function SessionRecordingDialog({ teamId, open, onOpenChange }: SessionRecordingDialogProps) {
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sessionDate, setSessionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [operationId, setOperationId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: config } = useQuery<{ transcriptionConfigured: boolean }>({
    queryKey: ["/api/session-recordings/config"],
    enabled: open,
  });

  // Poll job status while processing
  useEffect(() => {
    if (!operationId || !open) return;
    if (job?.phase === "complete" || job?.phase === "error") return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/teams/${teamId}/session-recordings/${operationId}/status`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const next = (await res.json()) as JobStatus;
        setJob(next);
        if (next.phase === "complete") {
          queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "notes"] });
        }
      } catch {
        // transient poll failure — keep trying
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [operationId, open, teamId, job?.phase]);

  const reset = () => {
    setSelectedFile(null);
    setOperationId(null);
    setJob(null);
    setUploadError(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("recording", selectedFile);
      formData.append("sessionDate", sessionDate);
      const res = await fetch(`/api/teams/${teamId}/session-recordings`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || "Upload failed");
      }
      setOperationId(body.operationId);
      setJob({ phase: "extracting", tracksDone: 0, tracksTotal: 0 });
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const processing = !!operationId && job?.phase !== "complete" && job?.phase !== "error";
  const progressValue =
    job && job.tracksTotal > 0
      ? Math.round((job.tracksDone / job.tracksTotal) * 100)
      : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Import Session Recording
          </DialogTitle>
          <DialogDescription>
            Upload a Craig recording of your session. Each speaker's track is
            transcribed and merged into a labeled transcript, and a session log
            is written for the date.
          </DialogDescription>
        </DialogHeader>

        {config && !config.transcriptionConfigured ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Transcription isn't configured on the server yet. An admin needs
              to set <code>WHISPER_API_KEY</code> (any OpenAI-compatible Whisper
              endpoint works). In-app notes and imports keep working without it.
            </AlertDescription>
          </Alert>
        ) : !operationId ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="recording-date">Session date</Label>
              <Input
                id="recording-date"
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-[200px]"
                data-testid="input-recording-date"
              />
            </div>

            <div className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed rounded-lg">
              <FileAudio className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Craig download zip (multitrack), or a single audio file
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Tip: download from Craig as <strong>AAC</strong> — far smaller
                than FLAC. Max 250MB.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.flac,.aac,.m4a,.ogg,.opus,.mp3,.wav,application/zip"
                className="hidden"
                id="recording-file-input"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Choose File
              </Button>
              {selectedFile && (
                <p className="text-sm font-medium truncate max-w-full">
                  {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                </p>
              )}
            </div>

            {uploadError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              {job?.phase === "complete" ? (
                <Check className="h-5 w-5 text-green-500" />
              ) : job?.phase === "error" ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {PHASE_LABELS[job?.phase ?? "extracting"]}
                </p>
                {job?.phase === "transcribing" && (
                  <p className="text-xs text-muted-foreground">
                    {job.currentTrack ? `Now: ${job.currentTrack} · ` : ""}
                    {job.tracksDone}/{job.tracksTotal} tracks
                    {" — long sessions take several minutes"}
                  </p>
                )}
                {job?.phase === "error" && (
                  <p className="text-xs text-destructive">{job.error}</p>
                )}
              </div>
            </div>
            {processing && progressValue !== undefined && (
              <Progress value={progressValue} className="h-2" />
            )}
          </div>
        )}

        <DialogFooter>
          {job?.phase === "complete" && job.result ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button
                onClick={() => {
                  const id = job.result!.sessionNoteId;
                  handleClose();
                  navigate(`/notes/${id}`);
                }}
                data-testid="button-open-session"
              >
                Open Session Log
              </Button>
            </>
          ) : job?.phase === "error" ? (
            <Button variant="outline" onClick={reset}>
              Try Again
            </Button>
          ) : processing ? (
            <Button variant="outline" onClick={handleClose}>
              Continue in background
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading || (config && !config.transcriptionConfigured)}
                data-testid="button-upload-recording"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload & Transcribe
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
