/**
 * Craig session-recording intake pipeline (PRD-053).
 *
 * Input: a Craig multitrack download (zip with one audio file per speaker,
 * all tracks padded to a common start) or a single mixed audio file.
 * Output: a speaker-labeled transcript note plus a session log for the
 * chosen date — AI-summarized when Anthropic is configured, a structured
 * stub otherwise — linked together, ready for the existing entity
 * detection / AI cleanup / review flow.
 */
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import type { IStorage } from "../storage";
import type { Note } from "@shared/schema";
import {
  isAudioTrackFilename,
  speakerFromTrackFilename,
  mergeSpeakerSegments,
  formatTranscriptMarkdown,
  transcriptPlainText,
  type SpeakerTrack,
} from "@shared/transcript-merge";
import { normalizeAvailabilityDate } from "@shared/scheduling";
import type { TranscriptionProvider } from "./transcription";
import type { TranscriptSummarizer } from "./summarize";

export interface SessionAudioJob {
  operationId: string;
  teamId: string;
  phase: "extracting" | "transcribing" | "summarizing" | "creating_notes" | "complete" | "error";
  tracksDone: number;
  tracksTotal: number;
  currentTrack?: string;
  error?: string;
  result?: { transcriptNoteId: string; sessionNoteId: string };
  updatedAt: number;
}

// In-memory job store; entries expire opportunistically (no module-scope timer
// — those leak into the test process, audit S8's lesson)
const jobs = new Map<string, SessionAudioJob>();
const JOB_TTL_MS = 60 * 60 * 1000;

function pruneJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of Array.from(jobs.entries())) {
    if (job.updatedAt < cutoff) jobs.delete(id);
  }
}

export function getSessionAudioJob(operationId: string): SessionAudioJob | undefined {
  pruneJobs();
  return jobs.get(operationId);
}

export function updateSessionAudioJob(
  operationId: string,
  teamId: string,
  patch: Partial<SessionAudioJob>
): SessionAudioJob {
  pruneJobs();
  const existing = jobs.get(operationId) ?? {
    operationId,
    teamId,
    phase: "extracting" as const,
    tracksDone: 0,
    tracksTotal: 0,
    updatedAt: Date.now(),
  };
  const next = { ...existing, ...patch, updatedAt: Date.now() };
  jobs.set(operationId, next);
  return next;
}

export interface ProcessRecordingOptions {
  teamId: string;
  userId: string;
  /** Calendar date of the session, "YYYY-MM-DD" */
  sessionDateKey: string;
  /** Path to the uploaded file on disk (zip or single audio file) */
  uploadPath: string;
  originalName: string;
  provider: TranscriptionProvider;
  summarizer: TranscriptSummarizer | null;
  operationId: string;
}

interface ExtractedTrack {
  speaker: string | null;
  filePath: string;
}

/** Pull audio tracks out of the upload into a temp dir. */
async function extractTracks(
  uploadPath: string,
  originalName: string,
  workDir: string
): Promise<ExtractedTrack[]> {
  if (isAudioTrackFilename(originalName)) {
    // A single mixed recording — no speaker labels
    return [{ speaker: null, filePath: uploadPath }];
  }

  const zip = new AdmZip(uploadPath);
  const audioEntries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && !entry.entryName.startsWith("__MACOSX/"))
    .filter((entry) => isAudioTrackFilename(entry.entryName));

  if (audioEntries.length === 0) {
    throw new Error(
      "No audio tracks found in the upload. Download the Craig recording as multitrack FLAC or AAC and upload that zip."
    );
  }

  const multitrack = audioEntries.length > 1;
  // Craig names per-speaker tracks "1-Username.ext"; a lone file WITHOUT the
  // track-number prefix is a mixdown and stays unlabeled
  const looksLikeCraigTrack = (name: string) => /^\d+[-_.]/.test(name.split("/").pop() ?? name);

  const tracks: ExtractedTrack[] = [];
  for (let i = 0; i < audioEntries.length; i++) {
    const entry = audioEntries[i];
    const ext = entry.entryName.split(".").pop() || "bin";
    const filePath = path.join(workDir, `track-${i}.${ext}`);
    await fs.writeFile(filePath, entry.getData());
    tracks.push({
      speaker:
        multitrack || looksLikeCraigTrack(entry.entryName)
          ? speakerFromTrackFilename(entry.entryName)
          : null,
      filePath,
    });
  }
  return tracks;
}

function fallbackSessionBody(sessionDateKey: string, speakers: string[]): string {
  const who = speakers.length > 0 ? `Present (from the recording): ${speakers.join(", ")}.` : "";
  return `Session reconstructed from the table recording of ${sessionDateKey}. ${who}

The full speaker-labeled transcript is linked to this note. AI summarization was not configured when this was imported — enable it and re-run, or summarize the highlights here by hand.`;
}

/**
 * The whole pipeline. Runs in the background behind the upload endpoint;
 * tests call it directly with fake providers.
 */
export async function processSessionRecording(
  storage: IStorage,
  options: ProcessRecordingOptions
): Promise<{ transcriptNoteId: string; sessionNoteId: string }> {
  const { teamId, userId, sessionDateKey, operationId } = options;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "helm-session-audio-"));

  try {
    updateSessionAudioJob(operationId, teamId, { phase: "extracting" });
    const tracks = await extractTracks(options.uploadPath, options.originalName, workDir);

    updateSessionAudioJob(operationId, teamId, {
      phase: "transcribing",
      tracksTotal: tracks.length,
      tracksDone: 0,
    });

    const speakerTracks: SpeakerTrack[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      updateSessionAudioJob(operationId, teamId, {
        tracksDone: i,
        currentTrack: track.speaker ?? "recording",
      });
      const segments = await options.provider.transcribeTrack(track.filePath);
      speakerTracks.push({ speaker: track.speaker, segments });
    }
    updateSessionAudioJob(operationId, teamId, { tracksDone: tracks.length });

    const merged = mergeSpeakerSegments(speakerTracks);
    if (merged.length === 0) {
      throw new Error("The recording produced no transcribable speech.");
    }
    const transcriptMarkdown = formatTranscriptMarkdown(merged);
    const plainText = transcriptPlainText(merged);
    const speakers = Array.from(
      new Set(speakerTracks.map((t) => t.speaker).filter((s): s is string => !!s))
    ).sort();

    // Session summary — the log the notetaker would have written
    let summaryBody: string;
    if (options.summarizer) {
      updateSessionAudioJob(operationId, teamId, { phase: "summarizing" });
      try {
        summaryBody = await options.summarizer(plainText, sessionDateKey);
      } catch (error) {
        console.error("Transcript summarization failed:", error);
        summaryBody = fallbackSessionBody(sessionDateKey, speakers);
      }
    } else {
      summaryBody = fallbackSessionBody(sessionDateKey, speakers);
    }

    updateSessionAudioJob(operationId, teamId, { phase: "creating_notes" });

    // Transcript note: sourceSystem CRAIG + resolved markdown, so it renders
    // through the read-mode markdown view like other imported notes
    const transcriptTitle = `Session Transcript — ${sessionDateKey}`;
    const transcriptNote = await storage.createNote({
      teamId,
      authorId: userId,
      title: transcriptTitle,
      content: transcriptMarkdown,
      noteType: "note",
      isPrivate: false,
      sourceSystem: "CRAIG",
      sourcePageId: `craig-${sessionDateKey}-${operationId.slice(-6)}`,
      contentMarkdown: transcriptMarkdown,
      contentMarkdownResolved: transcriptMarkdown,
      createdByUserId: userId,
      updatedByUserId: userId,
    });

    // Session log for that date: the uploader's own (sessions are per-author)
    const sessionInstant = normalizeAvailabilityDate(sessionDateKey);
    sessionInstant.setUTCHours(12); // midday UTC = same calendar day everywhere
    const existingSession = await storage.findSessionByDate(teamId, sessionInstant, userId);

    let sessionNote: Note;
    const recordingSection = `## From the table recording (${sessionDateKey})

${summaryBody}

Full transcript: /notes/${transcriptNote.id}`;

    if (existingSession) {
      const content = `${existingSession.content ?? ""}\n\n${recordingSection}`.trim();
      const linked = Array.from(new Set([...(existingSession.linkedNoteIds ?? []), transcriptNote.id]));
      sessionNote = await storage.updateNote(existingSession.id, {
        content,
        linkedNoteIds: linked,
      });
    } else {
      sessionNote = await storage.createNote({
        teamId,
        authorId: userId,
        title: sessionDateKey,
        content: recordingSection,
        noteType: "session_log",
        isPrivate: false,
        sessionDate: sessionInstant,
        linkedNoteIds: [transcriptNote.id],
        createdByUserId: userId,
        updatedByUserId: userId,
      });
    }

    const result = { transcriptNoteId: transcriptNote.id, sessionNoteId: sessionNote.id };
    updateSessionAudioJob(operationId, teamId, { phase: "complete", result });
    return result;
  } catch (error) {
    updateSessionAudioJob(operationId, teamId, {
      phase: "error",
      error: (error as Error).message,
    });
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(options.uploadPath, { force: true }).catch(() => {});
  }
}
