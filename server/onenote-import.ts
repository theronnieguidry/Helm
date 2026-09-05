/**
 * OneNote import (PRD-052).
 *
 * The no-auth path into Helm for a OneNote user: in OneNote desktop,
 * File → Export a page or section as a Word document (.docx), then upload the
 * .docx (or a zip of several) here. We convert each document to Markdown,
 * split multi-page section exports on top-level headings, and synthesize
 * entries shaped exactly like a Nuclino export — so the entire existing
 * import pipeline (preview, classification, diff, attribution, rollback,
 * AI enrichment) runs unchanged with sourceSystem "ONENOTE".
 */
import mammoth from "mammoth";
import TurndownService from "turndown";
// turndown-plugin-gfm has no types; tables matter for OneNote notes
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { gfm } from "turndown-plugin-gfm";

export interface DocxEntry {
  filename: string;
  buffer: Buffer;
  lastModified?: Date;
}

export interface ConvertedPage {
  filename: string; // synthesized "<Title> <8hex>.md" (Nuclino-compatible)
  content: string;  // markdown
  lastModified?: Date;
}

/** Deterministic 8-hex id (FNV-1a) so re-imports update instead of duplicate. */
export function fnv1a8(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function makeTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  td.use(gfm);
  return td;
}

/** Filename base without extension or path. */
function baseName(filename: string): string {
  const last = filename.split("/").pop() ?? filename;
  return last.replace(/\.[^.]+$/, "");
}

/**
 * Split a converted markdown document into pages.
 *
 * A OneNote SECTION exported to Word contains every page in the section, each
 * introduced by its page title as a top-level heading. Two or more H1s →
 * one page per H1. Zero or one H1 → the document is a single page, titled by
 * its H1 (falling back to the filename).
 */
export function splitMarkdownByH1(
  markdown: string,
  fallbackTitle: string
): Array<{ title: string; body: string }> {
  const lines = markdown.split("\n");
  const sections: Array<{ title: string; bodyLines: string[] }> = [];
  let current: { title: string; bodyLines: string[] } | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1) {
      if (current) sections.push(current);
      current = { title: h1[1], bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  if (sections.length >= 2) {
    // Multi-page section export. Any preamble before the first H1 belongs to
    // the first page.
    if (preamble.join("").trim()) {
      sections[0].bodyLines = [...preamble, ...sections[0].bodyLines];
    }
    return sections.map((s) => ({ title: s.title, body: s.bodyLines.join("\n").trim() }));
  }

  if (sections.length === 1) {
    const body = [...preamble, ...sections[0].bodyLines].join("\n").trim();
    return [{ title: sections[0].title, body }];
  }

  return [{ title: fallbackTitle, body: markdown.trim() }];
}

/**
 * Convert OneNote .docx exports into Nuclino-shaped import entries.
 *
 * Entry filenames follow Nuclino's "<Title> <8hex>.md" convention with a
 * deterministic content-independent id (hash of the title), so the existing
 * parser extracts title + sourcePageId untouched and re-importing an updated
 * export updates the same notes.
 */
export async function convertDocxEntriesToPages(
  entries: DocxEntry[]
): Promise<{ pages: ConvertedPage[]; warnings: string[] }> {
  const turndown = makeTurndown();
  const pages: ConvertedPage[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries) {
    let html: string;
    try {
      const result = await mammoth.convertToHtml({ buffer: entry.buffer });
      html = result.value;
      for (const message of result.messages ?? []) {
        if (message.type === "warning") {
          warnings.push(`${entry.filename}: ${message.message}`);
        }
      }
    } catch (error) {
      warnings.push(`${entry.filename}: could not be read as a Word document (${(error as Error).message})`);
      continue;
    }

    const markdown = turndown.turndown(html);
    const split = splitMarkdownByH1(markdown, baseName(entry.filename));

    for (const page of split) {
      const title = page.title.trim() || baseName(entry.filename);
      // Id from the title alone: stable across content edits so updates match
      let id = fnv1a8(`onenote:${title.toLowerCase()}`);
      // Two distinct pages with the same title in one upload must not collide
      while (seenIds.has(id)) {
        id = fnv1a8(`${id}:${title.toLowerCase()}`);
      }
      seenIds.add(id);

      pages.push({
        filename: `${title} ${id}.md`,
        content: page.body,
        lastModified: entry.lastModified,
      });
    }
  }

  return { pages, warnings };
}
