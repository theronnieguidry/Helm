export function normalizeContentForHash(content: string): string {
  return (content || "").replace(/\r\n?/g, "\n");
}

export function computeStableHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;

  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

export function computeSourceContentHash(content: string): string {
  return computeStableHash(normalizeContentForHash(content));
}

export function normalizeSnippetForId(snippetText: string): string {
  return snippetText
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildFallbackSourceBlockId(
  snippetText: string,
  startOffset?: number | null,
  endOffset?: number | null,
): string {
  const snippet = normalizeSnippetForId(snippetText || "");
  const raw = `${snippet}|${startOffset ?? ""}|${endOffset ?? ""}`;
  return `auto:${computeStableHash(raw).slice(0, 16)}`;
}

export function canonicalizeSourceBlockId(
  sourceBlockId: string | null | undefined,
  snippetText: string,
  startOffset?: number | null,
  endOffset?: number | null,
): string {
  const trimmed = sourceBlockId?.trim();
  if (trimmed) {
    return trimmed;
  }
  return buildFallbackSourceBlockId(snippetText, startOffset, endOffset);
}