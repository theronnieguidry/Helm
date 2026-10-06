# PRD-053: Craig Session Recording Intake

## Story Status
`Implemented`

## Problem

The group records sessions with Craig (the Discord multitrack recording bot).
The dedicated notetaker has been away, so for recent sessions the Craig
recordings are the **only** record of what happened. For the group to adopt
Helm, those recordings must become session notes.

The crucial insight: Craig already solves the hard part. It records **each
speaker to a separate track** and pads all tracks to a common start, so
per-track transcription timestamps are directly comparable. No voice
diarization needed — transcribe each speaker's track independently, then
interleave by timestamp into a speaker-labeled transcript.

## Functional Requirements

- **FR-1 · Upload**: "Recording" button on the Notes page opens a dialog:
  pick the session date, upload the Craig download zip (or a single mixed
  audio file). Uploads go to disk (limit 250MB); the dialog recommends
  Craig's AAC download over FLAC for size.
- **FR-2 · Transcription**: each audio track is re-encoded and segmented by
  bundled ffmpeg into 10-minute mono 16kHz Opus chunks (under the 25MB API
  cap), transcribed against any **OpenAI-compatible Whisper endpoint**
  (`WHISPER_API_URL`/`WHISPER_API_KEY`/`WHISPER_MODEL` — OpenAI, Groq, or
  self-hosted faster-whisper), and re-offset onto the track timeline.
- **FR-3 · Speaker labels**: track filenames (`1-Username.flac`) provide the
  speaker names; legacy `#1234`/`_1234` discriminators are stripped. A single
  file without the track-number prefix is treated as an unlabeled mixdown.
- **FR-4 · Transcript note**: merged segments render as a Markdown transcript
  (`**Mika** [1:12:33]: …`), with close consecutive same-speaker segments
  coalesced into turns. Stored as a `sourceSystem: "CRAIG"` note so it
  renders through the imported-note markdown view.
- **FR-5 · Session log**: an AI summary (Anthropic, same account as
  enrichment; `AI_SUMMARY_MODEL` overridable) becomes the session log for the
  chosen date — summary, key events, people & places, quests & loose threads.
  Without an Anthropic key, a structured stub log is written instead. The log
  is the **uploader's own** per-author session for that date: appended if it
  exists, created if not, and linked to the transcript via `linkedNoteIds`.
- **FR-6 · Progress + resilience**: background job with a polled status
  endpoint (phases: extracting → transcribing per track → summarizing →
  creating notes); summarizer failure falls back to the stub, upload files
  and temp chunks are always cleaned up, clear 503 guidance when
  transcription isn't configured.
- **FR-7 · Downstream**: the generated session content flows into the
  existing entity-suggestion / AI-cleanup / review pipeline like any
  hand-written session log.

## Acceptance Criteria (Global)
- [x] A Craig multitrack zip becomes a speaker-labeled transcript + session log
- [x] Works with zero diarization — speakers come from track names
- [x] AI summary when configured; useful stub when not
- [x] Appends to an existing same-date session instead of duplicating
- [x] Clear configuration guidance when speech-to-text is not set up

## Implementation Notes

- Files: `shared/transcript-merge.ts` (pure merge/format logic),
  `server/audio/transcription.ts` (Whisper client + ffmpeg chunking,
  test-injectable), `server/audio/summarize.ts` (Anthropic summarizer,
  test-injectable), `server/audio/session-audio.ts` (pipeline + job store),
  `server/audio/session-audio-handlers.ts` (shared route factories, both
  routers), `client/src/components/session-recording-dialog.tsx`.
- Env: `WHISPER_API_KEY` (required for the feature), `WHISPER_API_URL`
  (default `https://api.openai.com/v1`), `WHISPER_MODEL` (default
  `whisper-1`), `AI_SUMMARY_MODEL` (default `claude-haiku-4-5-20251001`).
- Cost note: per-track transcription bills for every speaker's full track
  (mostly silence). At OpenAI Whisper pricing a 4-hour, 5-speaker session is
  a few dollars; Groq's whisper is substantially cheaper and faster. A future
  optimization is silence-stripping (ffmpeg `silenceremove`) before upload,
  which should cut billed minutes several-fold.
- Deferred: silence-stripping; Craig `info.txt` parsing (start time); direct
  Craig link ingestion (recordings expire after 7 days — download promptly);
  attaching the original audio (storage-prohibitive on the current host).
- Deps: `ffmpeg-static` (bundled binary; `fluent-ffmpeg` deliberately avoided
  — deprecated).
- Tests: `shared/transcript-merge.test.ts` (13) and
  `server/audio/session-audio.test.ts` (10) — fake providers, real zip
  extraction, MemoryStorage; covers merge/coalescing, filename parsing,
  mixdown fallback, append-vs-create, summarizer fallback, job progress over
  HTTP, and validation/503 guidance.
