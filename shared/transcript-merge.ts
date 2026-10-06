/**
 * Craig multitrack transcript assembly (PRD-053).
 *
 * Craig records each Discord speaker to a separate audio track and pads all
 * tracks to a common start, so per-track transcription timestamps are
 * directly comparable. That sidesteps voice diarization entirely: transcribe
 * each speaker's track independently, then interleave segments by start time
 * into one speaker-labeled transcript.
 *
 * Everything here is pure so it can be tested without audio or providers.
 */

export interface TranscriptSegment {
  start: number; // seconds from track start
  end: number;
  text: string;
}

export interface SpeakerTrack {
  speaker: string | null; // null = unlabeled (single mixed track)
  segments: TranscriptSegment[];
}

export interface SpeakerSegment extends TranscriptSegment {
  speaker: string | null;
}

const AUDIO_EXTENSIONS = new Set(["flac", "aac", "m4a", "ogg", "opus", "wav", "mp3", "webm"]);

/** Is this zip entry a per-speaker audio track (vs info.txt, raw data, etc.)? */
export function isAudioTrackFilename(filename: string): boolean {
  const base = filename.split("/").pop() ?? filename;
  if (base.startsWith(".")) return false;
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return AUDIO_EXTENSIONS.has(ext);
}

/**
 * Extract the speaker name from a Craig track filename.
 *
 * Craig names tracks like "1-Yahweasel.flac" (track number, dash, Discord
 * username). Older exports may carry a #1234 or _1234 discriminator suffix.
 * Tolerant by design: unknown shapes fall back to the cleaned basename.
 */
export function speakerFromTrackFilename(filename: string): string {
  let base = filename.split("/").pop() ?? filename;
  base = base.replace(/\.[^.]+$/, ""); // extension
  base = base.replace(/^\d+[-_.]/, ""); // leading track number
  base = base.replace(/[#_]\d{4}$/, ""); // trailing discriminator
  return base.trim() || "Unknown speaker";
}

/** Interleave all tracks' segments into one timeline, ordered by start time. */
export function mergeSpeakerSegments(tracks: SpeakerTrack[]): SpeakerSegment[] {
  const merged: SpeakerSegment[] = [];
  for (const track of tracks) {
    for (const segment of track.segments) {
      const text = segment.text.trim();
      if (!text) continue;
      merged.push({ ...segment, text, speaker: track.speaker });
    }
  }
  merged.sort((a, b) => a.start - b.start || a.end - b.end);
  return merged;
}

export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = m.toString().padStart(h > 0 ? 2 : 1, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface FormatOptions {
  /**
   * Consecutive segments from the same speaker closer together than this are
   * coalesced into one paragraph, so the transcript reads as turns, not as
   * one line per breath. Default 8s.
   */
  coalesceGapSeconds?: number;
}

/**
 * Render merged segments as a Markdown transcript:
 *
 *   **Mika** [1:12:33]: we head for the crypt. carefully this time.
 *
 * Unlabeled (single mixed track) segments render with timestamps only.
 */
export function formatTranscriptMarkdown(
  segments: SpeakerSegment[],
  options: FormatOptions = {}
): string {
  const gap = options.coalesceGapSeconds ?? 8;
  const turns: Array<{ speaker: string | null; start: number; parts: string[]; lastEnd: number }> = [];

  for (const segment of segments) {
    const current = turns[turns.length - 1];
    if (
      current &&
      current.speaker === segment.speaker &&
      segment.start - current.lastEnd <= gap
    ) {
      current.parts.push(segment.text);
      current.lastEnd = Math.max(current.lastEnd, segment.end);
    } else {
      turns.push({
        speaker: segment.speaker,
        start: segment.start,
        parts: [segment.text],
        lastEnd: segment.end,
      });
    }
  }

  return turns
    .map((turn) => {
      const stamp = `[${formatTimestamp(turn.start)}]`;
      const text = turn.parts.join(" ");
      return turn.speaker ? `**${turn.speaker}** ${stamp}: ${text}` : `${stamp} ${text}`;
    })
    .join("\n\n");
}

/** Plain prose (no speaker labels/timestamps) for entity detection + AI summary input. */
export function transcriptPlainText(segments: SpeakerSegment[]): string {
  return segments
    .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
    .join("\n");
}
