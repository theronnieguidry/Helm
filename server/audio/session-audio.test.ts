/**
 * PRD-053: Craig session-recording intake pipeline.
 *
 * Fake transcription/summarization providers; real zip extraction and note
 * creation against MemoryStorage.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import request from "supertest";
import type { Express } from "express";
import type { Server } from "http";
import { MemoryStorage } from "../test/memory-storage";
import { createTestApp, createTestUser } from "../test/setup";
import { processSessionRecording, getSessionAudioJob } from "./session-audio";
import {
  setTranscriptionProviderForTests,
  type TranscriptionProvider,
} from "./transcription";
import { setSummarizerForTests } from "./summarize";
import type { TranscriptSegment } from "@shared/transcript-merge";

/** Provider that returns queued segment lists in call order (= track order). */
function queueProvider(perTrack: TranscriptSegment[][]): TranscriptionProvider {
  const queue = [...perTrack];
  return {
    async transcribeTrack() {
      return queue.shift() ?? [];
    },
  };
}

async function writeCraigZip(entries: Record<string, string>): Promise<string> {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content));
  }
  const filePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "craig-test-")), "craig.zip");
  await fs.writeFile(filePath, zip.toBuffer());
  return filePath;
}

describe("processSessionRecording", () => {
  let storage: MemoryStorage;
  let teamId: string;
  const user = createTestUser({ id: "user-1" });

  beforeEach(async () => {
    storage = new MemoryStorage();
    storage.setUser(user);
    const team = await storage.createTeam({
      name: "T",
      teamType: "dnd",
      diceMode: "polyhedral",
      ownerId: user.id,
    });
    teamId = team.id;
    await storage.createTeamMember({ teamId, userId: user.id, role: "dm" });
  });

  afterEach(() => {
    setTranscriptionProviderForTests(null);
    setSummarizerForTests(undefined);
  });

  it("turns a multitrack Craig zip into a speaker-labeled transcript + session log", async () => {
    const zipPath = await writeCraigZip({
      "1-Mika.flac": "fake",
      "2-Dana.flac": "fake",
      "info.txt": "not audio",
    });
    const provider = queueProvider([
      [
        { start: 0, end: 3, text: "We head for the crypt." },
        { start: 20, end: 24, text: "Kettle warned us about this." },
      ],
      [{ start: 5, end: 9, text: "Roll perception, everyone." }],
    ]);

    const result = await processSessionRecording(storage, {
      teamId,
      userId: user.id,
      sessionDateKey: "2026-02-14",
      uploadPath: zipPath,
      originalName: "craig.zip",
      provider,
      summarizer: null,
      operationId: "op-test-1",
    });

    const transcript = await storage.getNote(result.transcriptNoteId);
    expect(transcript!.title).toBe("Session Transcript — 2026-02-14");
    expect(transcript!.sourceSystem).toBe("CRAIG");
    expect(transcript!.content).toContain("**Mika** [0:00]: We head for the crypt.");
    expect(transcript!.content).toContain("**Dana** [0:05]: Roll perception, everyone.");
    // Renders through the imported-note markdown view
    expect(transcript!.contentMarkdownResolved).toBe(transcript!.content);

    const session = await storage.getNote(result.sessionNoteId);
    expect(session!.noteType).toBe("session_log");
    expect(session!.authorId).toBe(user.id);
    expect(session!.content).toContain("From the table recording (2026-02-14)");
    expect(session!.content).toContain(`/notes/${result.transcriptNoteId}`);
    expect(session!.content).toContain("Present (from the recording): Dana, Mika.");
    expect(session!.linkedNoteIds).toContain(result.transcriptNoteId);

    const job = getSessionAudioJob("op-test-1");
    expect(job?.phase).toBe("complete");
    expect(job?.result).toEqual(result);

    // Upload file is cleaned up
    await expect(fs.access(zipPath)).rejects.toThrow();
  });

  it("uses the AI summarizer for the session log when available", async () => {
    const zipPath = await writeCraigZip({ "1-Mika.flac": "fake" });
    let receivedTranscript = "";
    const result = await processSessionRecording(storage, {
      teamId,
      userId: user.id,
      sessionDateKey: "2026-02-14",
      uploadPath: zipPath,
      originalName: "craig.zip",
      provider: queueProvider([[{ start: 0, end: 2, text: "We met Lord Blackwood." }]]),
      summarizer: async (plain) => {
        receivedTranscript = plain;
        return "The party met Lord Blackwood.\n\n## Key events\n- Met Blackwood";
      },
      operationId: "op-test-2",
    });

    expect(receivedTranscript).toContain("Mika: We met Lord Blackwood.");
    const session = await storage.getNote(result.sessionNoteId);
    expect(session!.content).toContain("The party met Lord Blackwood.");
    expect(session!.content).toContain("## Key events");
  });

  it("appends to the uploader's existing session log for that date", async () => {
    const existing = await storage.createNote({
      teamId,
      authorId: user.id,
      title: "2026-02-14",
      content: "My own live notes from the night.",
      noteType: "session_log",
      sessionDate: new Date("2026-02-14T12:00:00Z"),
    });

    const zipPath = await writeCraigZip({ "1-Mika.flac": "fake" });
    const result = await processSessionRecording(storage, {
      teamId,
      userId: user.id,
      sessionDateKey: "2026-02-14",
      uploadPath: zipPath,
      originalName: "craig.zip",
      provider: queueProvider([[{ start: 0, end: 2, text: "hello" }]]),
      summarizer: null,
      operationId: "op-test-3",
    });

    expect(result.sessionNoteId).toBe(existing.id);
    const session = await storage.getNote(existing.id);
    expect(session!.content).toContain("My own live notes from the night.");
    expect(session!.content).toContain("From the table recording");
    // No duplicate session created
    const sessions = await storage.getSessionLogs(teamId);
    expect(sessions).toHaveLength(1);
  });

  it("handles a single mixed audio file without speaker labels", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "craig-test-"));
    const audioPath = path.join(dir, "mixdown.aac");
    await fs.writeFile(audioPath, "fake");

    const result = await processSessionRecording(storage, {
      teamId,
      userId: user.id,
      sessionDateKey: "2026-02-14",
      uploadPath: audioPath,
      originalName: "mixdown.aac",
      provider: queueProvider([[{ start: 30, end: 33, text: "Roll initiative." }]]),
      summarizer: null,
      operationId: "op-test-4",
    });

    const transcript = await storage.getNote(result.transcriptNoteId);
    expect(transcript!.content).toContain("[0:30] Roll initiative.");
    expect(transcript!.content).not.toContain("**");
  });

  it("fails cleanly when the zip has no audio tracks", async () => {
    const zipPath = await writeCraigZip({ "info.txt": "hi" });

    await expect(
      processSessionRecording(storage, {
        teamId,
        userId: user.id,
        sessionDateKey: "2026-02-14",
        uploadPath: zipPath,
        originalName: "craig.zip",
        provider: queueProvider([]),
        summarizer: null,
        operationId: "op-test-5",
      })
    ).rejects.toThrow(/No audio tracks/);

    expect(getSessionAudioJob("op-test-5")?.phase).toBe("error");
  });

  it("falls back to the stub log when the summarizer throws", async () => {
    const zipPath = await writeCraigZip({ "1-Mika.flac": "fake" });
    const result = await processSessionRecording(storage, {
      teamId,
      userId: user.id,
      sessionDateKey: "2026-02-14",
      uploadPath: zipPath,
      originalName: "craig.zip",
      provider: queueProvider([[{ start: 0, end: 2, text: "hi" }]]),
      summarizer: async () => {
        throw new Error("model unavailable");
      },
      operationId: "op-test-6",
    });

    const session = await storage.getNote(result.sessionNoteId);
    expect(session!.content).toContain("AI summarization was not configured");
  });
});

describe("session recording API", () => {
  let storage: MemoryStorage;
  let app: Express;
  let server: Server;
  let teamId: string;
  const user = createTestUser({ id: "user-1" });

  beforeEach(async () => {
    storage = new MemoryStorage();
    storage.setUser(user);
    const result = await createTestApp({ storage, authenticatedUser: user });
    app = result.app;
    server = result.server;
    const teamRes = await request(app)
      .post("/api/teams")
      .send({ name: "T", teamType: "dnd", diceMode: "polyhedral" });
    teamId = teamRes.body.id;
  });

  afterEach(() => {
    server.close();
    setTranscriptionProviderForTests(null);
    setSummarizerForTests(undefined);
  });

  it("503s with guidance when transcription is not configured", async () => {
    const res = await request(app)
      .post(`/api/teams/${teamId}/session-recordings`)
      .field("sessionDate", "2026-02-14")
      .attach("recording", Buffer.from("fake"), "craig.zip")
      .expect(503);
    expect(res.body.message).toContain("WHISPER_API_KEY");
  });

  it("validates the session date and file presence", async () => {
    setTranscriptionProviderForTests(queueProvider([]));
    await request(app)
      .post(`/api/teams/${teamId}/session-recordings`)
      .field("sessionDate", "Feb 14")
      .attach("recording", Buffer.from("fake"), "craig.zip")
      .expect(400);
    await request(app)
      .post(`/api/teams/${teamId}/session-recordings`)
      .field("sessionDate", "2026-02-14")
      .expect(400);
  });

  it("accepts an upload and reports progress to completion", async () => {
    setTranscriptionProviderForTests(
      queueProvider([[{ start: 0, end: 2, text: "We head for the crypt." }]])
    );
    setSummarizerForTests(null); // explicit: no AI summary in this test

    const zip = new AdmZip();
    zip.addFile("1-Mika.flac", Buffer.from("fake"));

    const uploadRes = await request(app)
      .post(`/api/teams/${teamId}/session-recordings`)
      .field("sessionDate", "2026-02-14")
      .attach("recording", zip.toBuffer(), "craig.zip")
      .expect(202);

    const { operationId } = uploadRes.body;
    expect(operationId).toBeTruthy();

    // Poll until the background job completes
    let job: { phase: string; result?: { sessionNoteId: string } } | undefined;
    for (let i = 0; i < 50; i++) {
      const statusRes = await request(app)
        .get(`/api/teams/${teamId}/session-recordings/${operationId}/status`)
        .expect(200);
      job = statusRes.body;
      if (job!.phase === "complete" || job!.phase === "error") break;
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(job?.phase).toBe("complete");
    const session = await storage.getNote(job!.result!.sessionNoteId);
    expect(session!.noteType).toBe("session_log");
  });

  it("scopes status lookups to the team", async () => {
    await request(app)
      .get(`/api/teams/${teamId}/session-recordings/rec-nope/status`)
      .expect(404);
  });
});
