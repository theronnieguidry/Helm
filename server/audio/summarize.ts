/**
 * Session-transcript summarization (PRD-053).
 *
 * Turns a multi-hour speaker-labeled transcript into the session log the
 * dedicated notetaker would have written: what happened, who was met, where
 * the party went, quests picked up or advanced. Uses the same Anthropic
 * account the enrichment features use; skips gracefully when no key is set.
 */
import Anthropic from "@anthropic-ai/sdk";

export type TranscriptSummarizer = (plainTranscript: string, sessionDateKey: string) => Promise<string>;

// Keep well inside the context window even for marathon sessions
const MAX_TRANSCRIPT_CHARS = 350_000;

export function isSummarizerConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const realSummarizer: TranscriptSummarizer = async (plainTranscript, sessionDateKey) => {
  const client = new Anthropic();
  const model = process.env.AI_SUMMARY_MODEL || "claude-haiku-4-5-20251001";

  let transcript = plainTranscript;
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]";
  }

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `The following is a speaker-labeled transcript of a tabletop RPG session played on ${sessionDateKey}. Write the session log a dedicated notetaker would have written, in Markdown:

- Open with a 2-4 sentence summary of the session.
- Then "## Key events" as a bullet list in play order.
- Then "## People & places" listing NPCs and locations that appeared, one line each.
- Then "## Quests & loose threads" for quests started, advanced, or completed, and any unresolved hooks.

Write about the events in the game world, not about the players talking. Use the names as spoken. Do not invent details that are not in the transcript.

<transcript>
${transcript}
</transcript>`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Summarizer returned no text");
  return text;
};

// Injectable for tests
let summarizerOverride: TranscriptSummarizer | null | undefined;

export function setSummarizerForTests(summarizer: TranscriptSummarizer | null | undefined): void {
  summarizerOverride = summarizer;
}

/** null = summarization unavailable (no key) — callers fall back to a stub log. */
export function getSummarizer(): TranscriptSummarizer | null {
  if (summarizerOverride !== undefined) return summarizerOverride;
  return isSummarizerConfigured() ? realSummarizer : null;
}
