/**
 * Speech-to-text provider (PRD-053).
 *
 * Configured via env against any OpenAI-compatible Whisper endpoint —
 * OpenAI itself, Groq's whisper models, or a self-hosted faster-whisper
 * server:
 *
 *   WHISPER_API_URL  (default https://api.openai.com/v1)
 *   WHISPER_API_KEY  (required to enable transcription)
 *   WHISPER_MODEL    (default "whisper-1"; e.g. "whisper-large-v3" on Groq)
 *
 * Long Craig tracks exceed the 25MB upload cap, so each track is first
 * re-encoded + segmented by bundled ffmpeg into 10-minute mono 16kHz Opus
 * chunks (~2MB each), transcribed chunk by chunk, and re-offset onto the
 * track's own timeline.
 */
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import ffmpegPath from "ffmpeg-static";
import type { TranscriptSegment } from "@shared/transcript-merge";

export interface TranscriptionProvider {
  transcribeTrack(filePath: string): Promise<TranscriptSegment[]>;
}

export const CHUNK_SECONDS = 600;

export function isTranscriptionConfigured(): boolean {
  return !!process.env.WHISPER_API_KEY;
}

function apiBase(): string {
  return (process.env.WHISPER_API_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg binary unavailable on this platform"));
      return;
    }
    const proc = spawn(ffmpegPath, ["-hide_banner", "-nostdin", "-y", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      // Keep only the tail; ffmpeg is chatty
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-1000)}`));
    });
  });
}

/**
 * Re-encode + split one audio file into small mono Opus chunks the API will
 * accept. Returns chunk paths in order; caller owns cleanup of the directory.
 */
export async function chunkAudioFile(inputPath: string, workDir: string): Promise<string[]> {
  await fs.mkdir(workDir, { recursive: true });
  const pattern = path.join(workDir, "chunk-%04d.ogg");
  await runFfmpeg([
    "-i", inputPath,
    "-map", "0:a:0",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "libopus",
    "-b:a", "24k",
    "-f", "segment",
    "-segment_time", String(CHUNK_SECONDS),
    "-reset_timestamps", "1",
    pattern,
  ]);
  const files = (await fs.readdir(workDir))
    .filter((f) => f.startsWith("chunk-") && f.endsWith(".ogg"))
    .sort();
  return files.map((f) => path.join(workDir, f));
}

interface VerboseJsonResponse {
  segments?: Array<{ start: number; end: number; text: string }>;
  text?: string;
}

async function transcribeChunk(chunkPath: string): Promise<TranscriptSegment[]> {
  const buffer = await fs.readFile(chunkPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "audio/ogg" }), "chunk.ogg");
  form.append("model", process.env.WHISPER_MODEL || "whisper-1");
  form.append("response_format", "verbose_json");

  const response = await fetch(`${apiBase()}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHISPER_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Transcription API ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as VerboseJsonResponse;
  if (data.segments && data.segments.length > 0) {
    return data.segments.map((s) => ({ start: s.start, end: s.end, text: s.text }));
  }
  // Some servers return plain text only — treat the chunk as one segment
  if (data.text && data.text.trim()) {
    return [{ start: 0, end: CHUNK_SECONDS, text: data.text.trim() }];
  }
  return [];
}

class WhisperProvider implements TranscriptionProvider {
  async transcribeTrack(filePath: string): Promise<TranscriptSegment[]> {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "helm-audio-"));
    try {
      const chunks = await chunkAudioFile(filePath, workDir);
      const segments: TranscriptSegment[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const offset = i * CHUNK_SECONDS;
        const chunkSegments = await transcribeChunk(chunks[i]);
        for (const s of chunkSegments) {
          segments.push({ start: s.start + offset, end: s.end + offset, text: s.text });
        }
      }
      return segments;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// Injectable for tests (mirrors the push-sender pattern in notifications.ts)
let providerOverride: TranscriptionProvider | null = null;

export function setTranscriptionProviderForTests(provider: TranscriptionProvider | null): void {
  providerOverride = provider;
}

export function getTranscriptionProvider(): TranscriptionProvider | null {
  if (providerOverride) return providerOverride;
  return isTranscriptionConfigured() ? new WhisperProvider() : null;
}
