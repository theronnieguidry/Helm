/**
 * Session-recording API handlers (PRD-053). Shared factories registered by
 * BOTH routers, like every other surface.
 */
import type { Request, Response } from "express";
import os from "os";
import multer from "multer";
import type { IStorage } from "../storage";
import { getTranscriptionProvider, isTranscriptionConfigured } from "./transcription";
import { getSummarizer } from "./summarize";
import {
  processSessionRecording,
  getSessionAudioJob,
  updateSessionAudioJob,
} from "./session-audio";

type AnyRequest = Request & { user: { claims: { sub: string } }; file?: Express.Multer.File };

function getUserId(req: Request): string {
  return (req as AnyRequest).user.claims.sub;
}

/**
 * Audio uploads go to disk, not memory — a Craig multitrack zip is far larger
 * than the 50MB in-memory cap the note importers use. Recommend AAC/Opus
 * downloads over FLAC; 250MB covers a long session in either.
 */
export const sessionAudioUpload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 250 * 1024 * 1024 },
});

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** POST /api/teams/:teamId/session-recordings — kick off transcription. */
export function makeSessionRecordingUploadHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId } = req.params;
      const file = (req as AnyRequest).file;
      const { sessionDate } = req.body ?? {};

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      if (!file) {
        return res.status(400).json({ message: "No recording uploaded" });
      }
      if (typeof sessionDate !== "string" || !DATE_KEY_REGEX.test(sessionDate)) {
        return res.status(400).json({ message: "sessionDate is required as YYYY-MM-DD" });
      }

      const provider = getTranscriptionProvider();
      if (!provider) {
        return res.status(503).json({
          message:
            "Transcription is not configured. Set WHISPER_API_KEY (and optionally WHISPER_API_URL/WHISPER_MODEL) on the server.",
        });
      }

      const operationId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      updateSessionAudioJob(operationId, teamId, { phase: "extracting" });

      // The transcription of a multi-hour session takes minutes — run in the
      // background and let the client poll the status endpoint.
      processSessionRecording(storage, {
        teamId,
        userId,
        sessionDateKey: sessionDate,
        uploadPath: file.path,
        originalName: file.originalname || "recording",
        provider,
        summarizer: getSummarizer(),
        operationId,
      }).catch((error) => {
        // processSessionRecording already recorded the error on the job
        console.error("Session recording processing failed:", error);
      });

      res.status(202).json({ operationId });
    } catch (error) {
      console.error("Error accepting session recording:", error);
      res.status(500).json({ message: "Failed to accept the recording" });
    }
  };
}

/** GET /api/teams/:teamId/session-recordings/:operationId/status */
export function makeSessionRecordingStatusHandler(storage: IStorage) {
  return async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { teamId, operationId } = req.params;

      const member = await storage.getTeamMember(teamId, userId);
      if (!member) {
        return res.status(403).json({ message: "Not a team member" });
      }

      const job = getSessionAudioJob(operationId);
      if (!job || job.teamId !== teamId) {
        return res.status(404).json({ message: "Recording job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error fetching recording status:", error);
      res.status(500).json({ message: "Failed to fetch recording status" });
    }
  };
}

/** GET /api/session-recordings/config — is transcription available at all? */
export function makeSessionRecordingConfigHandler() {
  return async (_req: Request, res: Response) => {
    res.json({ transcriptionConfigured: isTranscriptionConfigured() || !!getTranscriptionProvider() });
  };
}
