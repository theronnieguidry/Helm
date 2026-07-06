/**
 * P2-2 (PRD-005 FR-4, gap F34): keep backlink evidence in sync with edits.
 *
 * The product uses an offset-based traceability model (see PRD-005's
 * implementation notes): backlinks store a snippet plus start/end offsets into
 * the source note's plain-text content. When that content is edited, each
 * outgoing backlink is re-anchored:
 *  1. If the stored snippet still occurs in the new content, offsets are
 *     refreshed to its new position.
 *  2. Otherwise, if the target note's title still occurs, the snippet is
 *     rebuilt from a window around the first occurrence.
 *  3. Otherwise the mention is gone from the note, so the backlink is removed
 *     ("backlinks always reflect current state — no stale references").
 */
import type { IStorage } from "./storage";

const SNIPPET_WINDOW = 100;
const SNIPPET_MAX = 240;

function windowAround(content: string, index: number, matchLength: number): string {
  const start = Math.max(0, index - SNIPPET_WINDOW);
  const end = Math.min(content.length, index + matchLength + SNIPPET_WINDOW);
  const slice = content.slice(start, end).replace(/\s+/g, " ").trim();
  return slice.length > SNIPPET_MAX ? `${slice.slice(0, SNIPPET_MAX - 3)}...` : slice;
}

export interface ReindexResult {
  refreshed: number;
  rebuilt: number;
  removed: number;
}

export async function reindexBacklinksForSource(
  storage: IStorage,
  sourceNoteId: string,
  newContent: string,
): Promise<ReindexResult> {
  const result: ReindexResult = { refreshed: 0, rebuilt: 0, removed: 0 };
  const outgoing = await storage.getOutgoingLinks(sourceNoteId);
  if (outgoing.length === 0) return result;

  const lowerContent = newContent.toLowerCase();

  for (const backlink of outgoing) {
    const snippet = (backlink.textSnippet || "").trim();

    // 1. Exact snippet still present: refresh offsets.
    if (snippet) {
      const idx = newContent.indexOf(snippet);
      if (idx !== -1) {
        await storage.updateBacklink(backlink.id, {
          startOffset: idx,
          endOffset: idx + snippet.length,
        });
        result.refreshed++;
        continue;
      }
    }

    // 2. Target title still mentioned: rebuild the snippet around it.
    const target = await storage.getNote(backlink.targetNoteId);
    const title = target?.title?.trim();
    if (title) {
      const titleIdx = lowerContent.indexOf(title.toLowerCase());
      if (titleIdx !== -1) {
        await storage.updateBacklink(backlink.id, {
          textSnippet: windowAround(newContent, titleIdx, title.length),
          startOffset: titleIdx,
          endOffset: titleIdx + title.length,
        });
        result.rebuilt++;
        continue;
      }
    }

    // 3. Mention no longer exists in the note: remove the stale backlink.
    await storage.deleteBacklink(backlink.id);
    result.removed++;
  }

  return result;
}
