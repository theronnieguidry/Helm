import { describe, it, expect } from "vitest";
import {
  isAudioTrackFilename,
  speakerFromTrackFilename,
  mergeSpeakerSegments,
  formatTimestamp,
  formatTranscriptMarkdown,
  transcriptPlainText,
  type SpeakerTrack,
} from "./transcript-merge";

describe("isAudioTrackFilename", () => {
  it("accepts Craig audio formats", () => {
    for (const name of ["1-Mika.flac", "2-Dana.aac", "3-Ronnie.ogg", "x.opus", "y.m4a", "z.wav", "w.mp3"]) {
      expect(isAudioTrackFilename(name)).toBe(true);
    }
  });

  it("rejects non-audio zip entries", () => {
    for (const name of ["info.txt", "raw.dat", "README", ".DS_Store", "notes.pdf"]) {
      expect(isAudioTrackFilename(name)).toBe(false);
    }
  });

  it("handles nested zip paths", () => {
    expect(isAudioTrackFilename("craig-abc123/1-Mika.flac")).toBe(true);
    expect(isAudioTrackFilename("craig-abc123/info.txt")).toBe(false);
  });
});

describe("speakerFromTrackFilename", () => {
  it("parses the standard Craig pattern (number-username.ext)", () => {
    expect(speakerFromTrackFilename("1-Yahweasel.flac")).toBe("Yahweasel");
    expect(speakerFromTrackFilename("12-Dungeon Dana.aac")).toBe("Dungeon Dana");
  });

  it("strips legacy Discord discriminators", () => {
    expect(speakerFromTrackFilename("2-mika#1234.flac")).toBe("mika");
    expect(speakerFromTrackFilename("3-ronnie_5678.ogg")).toBe("ronnie");
  });

  it("handles nested paths and unknown shapes gracefully", () => {
    expect(speakerFromTrackFilename("craig-xyz/4-bob.opus")).toBe("bob");
    expect(speakerFromTrackFilename("mixdown.aac")).toBe("mixdown");
  });
});

describe("mergeSpeakerSegments", () => {
  it("interleaves tracks by start time", () => {
    const tracks: SpeakerTrack[] = [
      {
        speaker: "Mika",
        segments: [
          { start: 0, end: 4, text: "We head for the crypt." },
          { start: 20, end: 24, text: "Carefully this time." },
        ],
      },
      {
        speaker: "Dana",
        segments: [{ start: 5, end: 12, text: "Roll perception, everyone." }],
      },
    ];

    const merged = mergeSpeakerSegments(tracks);
    expect(merged.map((s) => s.speaker)).toEqual(["Mika", "Dana", "Mika"]);
  });

  it("drops empty/whitespace segments (silence artifacts)", () => {
    const merged = mergeSpeakerSegments([
      { speaker: "Mika", segments: [{ start: 0, end: 1, text: "  " }, { start: 2, end: 3, text: "hi" }] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("hi");
  });
});

describe("formatTimestamp", () => {
  it("formats minutes and hours", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3600 + 12 * 60 + 33)).toBe("1:12:33");
  });
});

describe("formatTranscriptMarkdown", () => {
  const tracks: SpeakerTrack[] = [
    {
      speaker: "Mika",
      segments: [
        { start: 0, end: 3, text: "We head for the crypt." },
        { start: 4, end: 7, text: "Torches out." }, // within coalesce gap
        { start: 60, end: 63, text: "Wait, what was that?" }, // new turn
      ],
    },
    {
      speaker: "Dana",
      segments: [{ start: 10, end: 15, text: "The door creaks open." }],
    },
  ];

  it("labels speakers with timestamps and coalesces close same-speaker segments", () => {
    const md = formatTranscriptMarkdown(mergeSpeakerSegments(tracks));
    const lines = md.split("\n\n");

    expect(lines[0]).toBe("**Mika** [0:00]: We head for the crypt. Torches out.");
    expect(lines[1]).toBe("**Dana** [0:10]: The door creaks open.");
    expect(lines[2]).toBe("**Mika** [1:00]: Wait, what was that?");
  });

  it("renders unlabeled (mixed single-track) transcripts without speaker names", () => {
    const md = formatTranscriptMarkdown(
      mergeSpeakerSegments([
        { speaker: null, segments: [{ start: 30, end: 35, text: "Everyone rolls initiative." }] },
      ])
    );
    expect(md).toBe("[0:30] Everyone rolls initiative.");
  });

  it("does not coalesce across an interjection by another speaker", () => {
    const interleaved = mergeSpeakerSegments([
      {
        speaker: "Mika",
        segments: [
          { start: 0, end: 2, text: "I open the chest" },
          { start: 5, end: 7, text: "slowly." },
        ],
      },
      { speaker: "Dana", segments: [{ start: 3, end: 4, text: "Careful!" }] },
    ]);
    const md = formatTranscriptMarkdown(interleaved);
    expect(md.split("\n\n")).toHaveLength(3);
  });
});

describe("transcriptPlainText", () => {
  it("produces prose suitable for entity detection", () => {
    const text = transcriptPlainText(
      mergeSpeakerSegments([
        { speaker: "Mika", segments: [{ start: 0, end: 2, text: "We met Lord Blackwood." }] },
      ])
    );
    expect(text).toBe("Mika: We met Lord Blackwood.");
  });
});
