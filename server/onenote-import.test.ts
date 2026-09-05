/**
 * PRD-052: OneNote .docx import conversion.
 *
 * Fixtures are real (minimal) .docx files built in-memory — a docx is a zip
 * of WordprocessingML parts — so mammoth exercises its actual parsing path.
 */
import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import {
  fnv1a8,
  splitMarkdownByH1,
  convertDocxEntriesToPages,
} from "./onenote-import";
import { processNuclinoExport } from "@shared/nuclino-parser";

type Block =
  | { kind: "p"; text: string; style?: "Heading1" | "Heading2"; bold?: boolean }
  | { kind: "table"; rows: string[][] };

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function blockXml(block: Block): string {
  if (block.kind === "table") {
    const rows = block.rows
      .map(
        (cells) =>
          `<w:tr>${cells
            .map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`)
            .join("")}</w:tr>`
      )
      .join("");
    return `<w:tbl>${rows}</w:tbl>`;
  }
  const pPr = block.style ? `<w:pPr><w:pStyle w:val="${block.style}"/></w:pPr>` : "";
  const rPr = block.bold ? `<w:rPr><w:b/></w:rPr>` : "";
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(block.text)}</w:t></w:r></w:p>`;
}

/** Build a minimal but valid .docx from content blocks. */
function buildDocx(blocks: Block[]): Buffer {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${blocks.map(blockXml).join("")}</w:body></w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes));
  zip.addFile("_rels/.rels", Buffer.from(rels));
  zip.addFile("word/_rels/document.xml.rels", Buffer.from(docRels));
  zip.addFile("word/document.xml", Buffer.from(documentXml));
  zip.addFile("word/styles.xml", Buffer.from(stylesXml));
  return zip.toBuffer();
}

describe("fnv1a8", () => {
  it("is deterministic 8-char hex", () => {
    expect(fnv1a8("hello")).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a8("hello")).toBe(fnv1a8("hello"));
    expect(fnv1a8("hello")).not.toBe(fnv1a8("world"));
  });
});

describe("splitMarkdownByH1", () => {
  it("splits a multi-page section export on top-level headings", () => {
    const md = "# Kettle\nAn innkeeper.\n\n# The Crypt\nDark and damp.";
    const pages = splitMarkdownByH1(md, "fallback");
    expect(pages.map((p) => p.title)).toEqual(["Kettle", "The Crypt"]);
    expect(pages[0].body).toContain("An innkeeper.");
    expect(pages[1].body).toContain("Dark and damp.");
  });

  it("keeps a single-H1 document as one page titled by the heading", () => {
    const pages = splitMarkdownByH1("# Session 12\nWe fought.", "fallback");
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("Session 12");
    expect(pages[0].body).toBe("We fought.");
  });

  it("falls back to the filename when there is no H1", () => {
    const pages = splitMarkdownByH1("Just some notes.\nMore notes.", "Loose Notes");
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("Loose Notes");
    expect(pages[0].body).toContain("Just some notes.");
  });

  it("attaches preamble before the first H1 to the first page in multi-page docs", () => {
    const md = "Intro line\n\n# One\nbody1\n# Two\nbody2";
    const pages = splitMarkdownByH1(md, "fallback");
    expect(pages).toHaveLength(2);
    expect(pages[0].body).toContain("Intro line");
  });
});

describe("convertDocxEntriesToPages", () => {
  it("converts a single-page docx to a Nuclino-shaped markdown entry", async () => {
    const docx = buildDocx([
      { kind: "p", text: "Kettle the Innkeeper", style: "Heading1" },
      { kind: "p", text: "Runs the Rusty Blade tavern." },
      { kind: "p", text: "Secretly a lich", bold: true },
    ]);

    const { pages, warnings } = await convertDocxEntriesToPages([
      { filename: "Kettle.docx", buffer: docx },
    ]);

    expect(warnings).toEqual([]);
    expect(pages).toHaveLength(1);
    expect(pages[0].filename).toMatch(/^Kettle the Innkeeper [0-9a-f]{8}\.md$/);
    expect(pages[0].content).toContain("Runs the Rusty Blade tavern.");
    expect(pages[0].content).toContain("**Secretly a lich**");
  });

  it("splits a OneNote SECTION export (multiple H1 pages) into separate pages", async () => {
    const docx = buildDocx([
      { kind: "p", text: "Silverwood Forest", style: "Heading1" },
      { kind: "p", text: "Ancient trees." },
      { kind: "p", text: "The Crypt", style: "Heading1" },
      { kind: "p", text: "Below the chapel." },
    ]);

    const { pages } = await convertDocxEntriesToPages([
      { filename: "Places.docx", buffer: docx },
    ]);

    expect(pages).toHaveLength(2);
    expect(pages[0].filename).toMatch(/^Silverwood Forest [0-9a-f]{8}\.md$/);
    expect(pages[1].filename).toMatch(/^The Crypt [0-9a-f]{8}\.md$/);
    expect(pages[1].content).toContain("Below the chapel.");
  });

  it("preserves table content", async () => {
    const docx = buildDocx([
      { kind: "p", text: "Party Loot", style: "Heading1" },
      { kind: "table", rows: [["Item", "Owner"], ["Flame Sword", "Mika"]] },
    ]);

    const { pages } = await convertDocxEntriesToPages([
      { filename: "Loot.docx", buffer: docx },
    ]);

    expect(pages[0].content).toContain("Flame Sword");
    expect(pages[0].content).toContain("Mika");
  });

  it("uses the filename as title when the docx has no heading", async () => {
    const docx = buildDocx([{ kind: "p", text: "misc scribbles" }]);
    const { pages } = await convertDocxEntriesToPages([
      { filename: "exports/Campaign Ideas.docx", buffer: docx },
    ]);
    expect(pages[0].filename).toMatch(/^Campaign Ideas [0-9a-f]{8}\.md$/);
  });

  it("gives identical titles stable ids and disambiguates same-upload collisions", async () => {
    const docx = buildDocx([
      { kind: "p", text: "Notes", style: "Heading1" },
      { kind: "p", text: "first" },
      { kind: "p", text: "Notes", style: "Heading1" },
      { kind: "p", text: "second" },
    ]);

    const first = await convertDocxEntriesToPages([{ filename: "a.docx", buffer: docx }]);
    const second = await convertDocxEntriesToPages([{ filename: "a.docx", buffer: docx }]);

    // Two pages, distinct ids within one upload
    const ids1 = first.pages.map((p) => p.filename.match(/([0-9a-f]{8})\.md$/)![1]);
    expect(new Set(ids1).size).toBe(2);
    // Deterministic across uploads (so re-import updates, not duplicates)
    const ids2 = second.pages.map((p) => p.filename.match(/([0-9a-f]{8})\.md$/)![1]);
    expect(ids1).toEqual(ids2);
  });

  it("reports unreadable files as warnings instead of failing the batch", async () => {
    const good = buildDocx([{ kind: "p", text: "Fine", style: "Heading1" }]);
    const { pages, warnings } = await convertDocxEntriesToPages([
      { filename: "broken.docx", buffer: Buffer.from("not a docx") },
      { filename: "good.docx", buffer: good },
    ]);

    expect(pages).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("broken.docx");
  });

  it("feeds the existing Nuclino pipeline end-to-end", async () => {
    const docx = buildDocx([
      { kind: "p", text: "Lord Blackwood", style: "Heading1" },
      { kind: "p", text: "A scheming noble NPC the party distrusts." },
      { kind: "p", text: "Find the Lost Relic", style: "Heading1" },
      { kind: "p", text: "The relic was stolen from the chapel." },
    ]);

    const { pages: entries } = await convertDocxEntriesToPages([
      { filename: "Campaign.docx", buffer: docx },
    ]);

    const { pages, summary } = processNuclinoExport(entries);

    expect(summary.totalPages).toBe(2);
    const titles = pages.map((p) => p.title).sort();
    expect(titles).toEqual(["Find the Lost Relic", "Lord Blackwood"]);
    for (const page of pages) {
      expect(page.sourcePageId).toMatch(/^[0-9a-f]{8}$/);
      expect(page.isEmpty).toBe(false);
    }
  });
});
