/**
 * Nuclino ZIP Import Parser (PRD-015)
 *
 * Parses Nuclino export files and prepares them for import into Helm.
 */

import type { NoteType, QuestStatus } from "./schema";

// Types for parsed Nuclino pages
export interface NuclinoLink {
  text: string;
  targetFilename: string;
  targetPageId: string;
  fullMatch: string;
}

export interface NuclinoPage {
  filename: string;
  sourcePageId: string;
  title: string;
  content: string;
  contentRaw: string;
  links: NuclinoLink[];
  isEmpty: boolean;
  lastModified?: Date;
}

export interface CollectionInfo {
  sourcePageId: string;
  title: string;
  linkedPageIds: string[];
  collectionType: "notable_people" | "places" | "todo" | "done" | "other";
}

export interface PageClassification {
  noteType: NoteType;
  questStatus?: QuestStatus;
}

export interface ImportSummary {
  totalPages: number;
  emptyPages: number;
  characters: number;
  npcs: number;
  pois: number;
  questsOpen: number;
  questsDone: number;
  notes: number;
}

// Known collection page names for auto-detection
const PEOPLE_COLLECTION_PATTERNS = [
  /^notable\s*people$/i,
  /^people$/i,
  /^npcs?$/i,
  /^characters?$/i,
];

const PLACES_COLLECTION_PATTERNS = [
  /^places$/i,
  /^locations?$/i,
];

const TODO_COLLECTION_PATTERNS = [
  /^to\s*do$/i,
  /^todo$/i,
  /^open\s*quests?$/i,
];

const DONE_COLLECTION_PATTERNS = [
  /^done$/i,
  /^completed$/i,
  /^finished$/i,
];

// Session log title patterns for auto-detection
const SESSION_LOG_PATTERNS = [
  /^session\s*\d*/i,           // "Session 1", "Session"
  /^scene\s*\d*/i,             // "Scene 1", "Scene" (but not "Scene Setting")
  /^journey\s/i,               // "Journey with..."
  /^we\s+(find|save|meet|go|head|travel)/i, // "We find...", "We save..."
  /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/,  // Contains dates like "5/12/24" or "5-12-2024"
];

/**
 * Check if a title matches session log patterns.
 */
export function isSessionLogTitle(title: string): boolean {
  // Exclude titles that contain "setting" (like "Scene Setting")
  if (/setting/i.test(title)) {
    return false;
  }
  return SESSION_LOG_PATTERNS.some(p => p.test(title));
}

/**
 * Parse a Nuclino filename to extract title and source page ID.
 *
 * Nuclino exports use format: "Title abc12345.md" where abc12345 is an 8-char hex ID.
 *
 * @example
 * parseNuclinoFilename("Kettle 03183b35.md")
 * // => { title: "Kettle", sourcePageId: "03183b35" }
 */
export function parseNuclinoFilename(filename: string): { title: string; sourcePageId: string } {
  // Remove directory path if present
  const basename = filename.replace(/^.*[\\/]/, "");

  // Match: title (anything) + space + 8 hex chars + .md
  const match = basename.match(/^(.+?)\s+([a-f0-9]{8})\.md$/i);

  if (!match) {
    // Fallback: use filename without extension as title, generate a pseudo-ID
    const titleWithoutExt = basename.replace(/\.md$/i, "");
    return {
      title: cleanTitle(titleWithoutExt),
      sourcePageId: generatePseudoId(titleWithoutExt),
    };
  }

  return {
    title: cleanTitle(match[1]),
    sourcePageId: match[2].toLowerCase(),
  };
}

/**
 * Clean a title by applying Nuclino export decodings.
 *
 * - " _ " (space underscore space) -> " / " (session segment separators)
 * - "_" -> "/" (escaped slashes in filenames, e.g., "repair_craft" -> "repair/craft")
 * - Trim whitespace
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/ _ /g, " / ")  // Multi-part session titles like "A _ B _ C"
    .replace(/_/g, "/")       // Escaped slashes in filenames
    .trim();
}

/**
 * Generate a pseudo-ID for files without proper Nuclino IDs.
 */
function generatePseudoId(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8);
}

/**
 * Decode HTML entities in content.
 *
 * @example
 * decodeHtmlEntities("&#x20;Hello&#x20;World")
 * // => " Hello World"
 */
export function decodeHtmlEntities(text: string): string {
  return text
    // Hex entities: &#x20; &#x26; etc.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Decimal entities: &#32; &#38; etc.
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    // Named entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Extract internal links from Nuclino markdown content.
 *
 * Nuclino links look like: [Link Text](<Some Page abc12345.md?n>)
 * The ?n suffix and angle brackets are Nuclino-specific.
 */
export function extractNuclinoLinks(content: string): NuclinoLink[] {
  const links: NuclinoLink[] = [];

  // Match: [text](<filename with spaces abc12345.md?n>)
  // The angle brackets allow spaces in the URL
  const linkRegex = /\[([^\]]+)\]\(<([^>]+\.md(?:\?n)?)\s*>\)/g;

  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const [fullMatch, text, targetFilename] = match;

    // Extract the page ID from the target filename
    const filenameWithoutQuery = targetFilename.replace(/\?n$/, "");
    const { sourcePageId } = parseNuclinoFilename(filenameWithoutQuery);

    links.push({
      text,
      targetFilename: filenameWithoutQuery,
      targetPageId: sourcePageId,
      fullMatch,
    });
  }

  return links;
}

/**
 * PRD-040: Strip directory/tree structure patterns from content.
 * Nuclino exports sometimes contain directory tree visualizations that cause noise.
 *
 * @example
 * stripDirectoryStructure("├── folder/\n│   └── file.md")
 * // => ""
 */
export function stripDirectoryStructure(content: string): string {
  // Remove lines that look like directory trees:
  // ├── folder/
  // └── file.md
  // │   └── subfolder/
  // ─── item
  // Only match lines that START with tree box-drawing characters
  const treeLinePattern = /^[ \t]*[│├└─┬┴┼┤]+[─ ]*[^\n]*$/gm;
  return content
    .replace(treeLinePattern, '') // Lines starting with tree characters
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();
}

/**
 * Parse Nuclino markdown content.
 *
 * @returns The cleaned content and extracted links
 */
export function parseNuclinoContent(markdown: string): { content: string; links: NuclinoLink[] } {
  const decoded = decodeHtmlEntities(markdown);
  const links = extractNuclinoLinks(decoded);
  // PRD-040: Strip directory structure noise
  const cleaned = stripDirectoryStructure(decoded);

  return {
    content: cleaned.trim(), // Trim leading/trailing whitespace
    links,
  };
}

/**
 * Check if a page is primarily a collection (list of links).
 *
 * A collection page is one where most of the non-whitespace content is links.
 */
export function isCollectionPage(content: string, links: NuclinoLink[]): boolean {
  if (links.length < 3) {
    return false;
  }

  // Remove all link text from content
  let textWithoutLinks = content;
  for (const link of links) {
    textWithoutLinks = textWithoutLinks.replace(link.fullMatch, "");
  }

  // Remove markdown formatting, bullets, newlines, whitespace
  const remainingText = textWithoutLinks
    .replace(/^#+\s*/gm, "")       // Headers
    .replace(/^\s*[-*]\s*/gm, "")  // List bullets
    .replace(/\n/g, " ")           // Newlines
    .replace(/\s+/g, " ")          // Multiple spaces
    .trim();

  // If remaining text is short relative to link count, it's a collection
  const remainingCharCount = remainingText.length;
  const avgLinkTextLength = links.reduce((sum, l) => sum + l.text.length, 0) / links.length;

  // Collection if remaining text is less than the average link text length × 3
  return remainingCharCount < avgLinkTextLength * 3;
}

/**
 * Detect collection type from page title.
 */
export function detectCollectionType(title: string): CollectionInfo["collectionType"] {
  const normalizedTitle = title.trim();

  if (PEOPLE_COLLECTION_PATTERNS.some(p => p.test(normalizedTitle))) {
    return "notable_people";
  }
  if (PLACES_COLLECTION_PATTERNS.some(p => p.test(normalizedTitle))) {
    return "places";
  }
  if (TODO_COLLECTION_PATTERNS.some(p => p.test(normalizedTitle))) {
    return "todo";
  }
  if (DONE_COLLECTION_PATTERNS.some(p => p.test(normalizedTitle))) {
    return "done";
  }

  return "other";
}

/**
 * Detect all collection pages and their linked page IDs.
 */
export function detectCollectionPages(pages: NuclinoPage[]): Map<string, CollectionInfo> {
  const collections = new Map<string, CollectionInfo>();

  for (const page of pages) {
    if (isCollectionPage(page.content, page.links)) {
      collections.set(page.sourcePageId, {
        sourcePageId: page.sourcePageId,
        title: page.title,
        linkedPageIds: page.links.map(l => l.targetPageId),
        collectionType: detectCollectionType(page.title),
      });
    }
  }

  return collections;
}

/**
 * Build a map of which collections each page belongs to.
 */
export function buildCollectionMembership(
  pages: NuclinoPage[],
  collections: Map<string, CollectionInfo>
): Map<string, CollectionInfo["collectionType"][]> {
  const membership = new Map<string, CollectionInfo["collectionType"][]>();

  for (const collection of collections.values()) {
    for (const linkedPageId of collection.linkedPageIds) {
      const existing = membership.get(linkedPageId) || [];
      if (!existing.includes(collection.collectionType)) {
        existing.push(collection.collectionType);
      }
      membership.set(linkedPageId, existing);
    }
  }

  return membership;
}

/**
 * Classify a page based on its collection membership.
 * @param partyMemberNames - Optional set of party member names (lowercase) for PC detection
 */
export function classifyNuclinoPage(
  page: NuclinoPage,
  membership: Map<string, CollectionInfo["collectionType"][]>,
  collections: Map<string, CollectionInfo>,
  partyMemberNames?: Set<string>
): PageClassification {
  // Check if this is a collection page itself - now maps to "note"
  if (collections.has(page.sourcePageId)) {
    return { noteType: "note" };
  }

  const memberOf = membership.get(page.sourcePageId) || [];

  // Priority: NPC/Character > POI > Quest (Done > Open) > Note
  if (memberOf.includes("notable_people")) {
    // Check if this is a PC (party member) by name matching
    const normalizedTitle = page.title.toLowerCase().trim();
    if (partyMemberNames && partyMemberNames.has(normalizedTitle)) {
      return { noteType: "character" };
    }
    return { noteType: "npc" };
  }

  if (memberOf.includes("places")) {
    return { noteType: "poi" };
  }

  if (memberOf.includes("done")) {
    return { noteType: "quest", questStatus: "done" };
  }

  if (memberOf.includes("todo")) {
    return { noteType: "quest", questStatus: "active" };
  }

  // Check for session log patterns in title
  if (isSessionLogTitle(page.title)) {
    return { noteType: "session_log" };
  }

  return { noteType: "note" };
}

/**
 * Resolve Nuclino internal links to Helm note URLs.
 *
 * @param content - The markdown content with Nuclino links
 * @param pageIdToNoteId - Map from Nuclino sourcePageId to Helm noteId
 * @returns Object with resolved content and list of unresolved links
 */
export function resolveNuclinoLinks(
  content: string,
  pageIdToNoteId: Map<string, string>
): { resolved: string; unresolvedLinks: string[] } {
  const unresolvedLinks: string[] = [];

  // Match Nuclino link format: [text](<filename abc12345.md?n>)
  const resolved = content.replace(
    /\[([^\]]+)\]\(<([^>]+\.md(?:\?n)?)\s*>\)/g,
    (fullMatch, text, targetFilename) => {
      const filenameWithoutQuery = targetFilename.replace(/\?n$/, "");
      const { sourcePageId } = parseNuclinoFilename(filenameWithoutQuery);

      const noteId = pageIdToNoteId.get(sourcePageId);

      if (noteId) {
        // Convert to Helm internal link format
        return `[${text}](/notes/${noteId})`;
      } else {
        // Leave as plain text and record as unresolved
        unresolvedLinks.push(text);
        return `[${text}](#unresolved)`;
      }
    }
  );

  return { resolved, unresolvedLinks };
}

/**
 * Parse all pages from a Nuclino ZIP export.
 *
 * @param entries - Array of { filename, content, lastModified? } from ZIP
 * @returns Parsed pages ready for classification and import
 */
export function parseNuclinoExport(
  entries: Array<{ filename: string; content: string; lastModified?: Date }>
): NuclinoPage[] {
  return entries
    .filter(entry => entry.filename.toLowerCase().endsWith(".md"))
    .map(entry => {
      const { title, sourcePageId } = parseNuclinoFilename(entry.filename);
      const { content, links } = parseNuclinoContent(entry.content);

      return {
        filename: entry.filename,
        sourcePageId,
        title,
        content,
        contentRaw: entry.content,
        links,
        isEmpty: content.trim().length === 0,
        lastModified: entry.lastModified,
      };
    });
}

/**
 * Generate import summary from classified pages.
 */
export function generateImportSummary(
  pages: NuclinoPage[],
  classifications: Map<string, PageClassification>
): ImportSummary {
  const summary: ImportSummary = {
    totalPages: pages.length,
    emptyPages: 0,
    characters: 0,
    npcs: 0,
    pois: 0,
    questsOpen: 0,
    questsDone: 0,
    notes: 0,
  };

  for (const page of pages) {
    if (page.isEmpty) {
      summary.emptyPages++;
    }

    const classification = classifications.get(page.sourcePageId);
    if (!classification) continue;

    switch (classification.noteType) {
      case "character":
        summary.characters++;
        break;
      case "npc":
        summary.npcs++;
        break;
      case "poi":
        summary.pois++;
        break;
      case "quest":
        if (classification.questStatus === "done") {
          summary.questsDone++;
        } else {
          summary.questsOpen++;
        }
        break;
      default:
        summary.notes++;
    }
  }

  return summary;
}

/**
 * Main entry point: Parse and classify all pages from a Nuclino export.
 * @param partyMemberNames - Optional set of party member names (lowercase) for PC detection
 */
export function processNuclinoExport(
  entries: Array<{ filename: string; content: string; lastModified?: Date }>,
  partyMemberNames?: Set<string>
): {
  pages: NuclinoPage[];
  collections: Map<string, CollectionInfo>;
  classifications: Map<string, PageClassification>;
  summary: ImportSummary;
} {
  // Parse all pages
  const pages = parseNuclinoExport(entries);

  // Detect collections
  const collections = detectCollectionPages(pages);

  // Build membership map
  const membership = buildCollectionMembership(pages, collections);

  // Classify each page
  const classifications = new Map<string, PageClassification>();
  for (const page of pages) {
    classifications.set(
      page.sourcePageId,
      classifyNuclinoPage(page, membership, collections, partyMemberNames)
    );
  }

  // Generate summary
  const summary = generateImportSummary(pages, classifications);

  return { pages, collections, classifications, summary };
}
