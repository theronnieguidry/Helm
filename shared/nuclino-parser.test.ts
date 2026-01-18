import { describe, it, expect } from "vitest";
import {
  parseNuclinoFilename,
  cleanTitle,
  decodeHtmlEntities,
  extractNuclinoLinks,
  parseNuclinoContent,
  isCollectionPage,
  detectCollectionType,
  detectCollectionPages,
  buildCollectionMembership,
  classifyNuclinoPage,
  resolveNuclinoLinks,
  parseNuclinoExport,
  generateImportSummary,
  processNuclinoExport,
  isSessionLogTitle,
  type NuclinoPage,
  type CollectionInfo,
} from "./nuclino-parser";

describe("parseNuclinoFilename", () => {
  it("extracts title and sourcePageId from standard filename", () => {
    const result = parseNuclinoFilename("Kettle 03183b35.md");
    expect(result).toEqual({
      title: "Kettle",
      sourcePageId: "03183b35",
    });
  });

  it("handles multi-word titles", () => {
    const result = parseNuclinoFilename("Check in on the Detanis da93523d.md");
    expect(result).toEqual({
      title: "Check in on the Detanis",
      sourcePageId: "da93523d",
    });
  });

  it("handles titles with special characters", () => {
    const result = parseNuclinoFilename("Barak's Tavern (The Rusty Nail) abc12345.md");
    expect(result).toEqual({
      title: "Barak's Tavern (The Rusty Nail)",
      sourcePageId: "abc12345",
    });
  });

  it("handles uppercase hex IDs", () => {
    const result = parseNuclinoFilename("Test Page ABCDEF12.md");
    expect(result).toEqual({
      title: "Test Page",
      sourcePageId: "abcdef12",
    });
  });

  it("handles filenames with directory path", () => {
    const result = parseNuclinoFilename("subdir/Nested Page 12345678.md");
    expect(result).toEqual({
      title: "Nested Page",
      sourcePageId: "12345678",
    });
  });

  it("falls back for non-standard filenames", () => {
    const result = parseNuclinoFilename("weird-filename.md");
    expect(result.title).toBe("weird-filename");
    expect(result.sourcePageId).toHaveLength(8);
  });
});

describe("cleanTitle", () => {
  it("converts space-underscore-space to slash", () => {
    expect(cleanTitle("Session 1 _ Part A")).toBe("Session 1 / Part A");
  });

  it("trims whitespace", () => {
    expect(cleanTitle("  Some Title  ")).toBe("Some Title");
  });

  it("handles multiple underscores", () => {
    expect(cleanTitle("A _ B _ C")).toBe("A / B / C");
  });

  it("converts underscore to slash (escaped slashes)", () => {
    expect(cleanTitle("repair_craft gear")).toBe("repair/craft gear");
    expect(cleanTitle("Beeby wants to repair_craft gear")).toBe("Beeby wants to repair/craft gear");
  });

  it("handles both patterns together", () => {
    expect(cleanTitle("A _ B_C")).toBe("A / B/C");
    expect(cleanTitle("Session 1 _ repair_craft")).toBe("Session 1 / repair/craft");
  });
});

describe("isSessionLogTitle", () => {
  it("detects Session titles", () => {
    expect(isSessionLogTitle("Session 1")).toBe(true);
    expect(isSessionLogTitle("Session")).toBe(true);
    expect(isSessionLogTitle("session 5")).toBe(true);
  });

  it("detects Scene titles", () => {
    expect(isSessionLogTitle("Scene 1")).toBe(true);
    expect(isSessionLogTitle("Scene")).toBe(true);
  });

  it("excludes Scene Setting titles", () => {
    expect(isSessionLogTitle("Scene Setting")).toBe(false);
    expect(isSessionLogTitle("Beeby Scene Setting")).toBe(false);
  });

  it("detects Journey titles", () => {
    expect(isSessionLogTitle("Journey with Samwell")).toBe(true);
    expect(isSessionLogTitle("Journey to the Mountains")).toBe(true);
  });

  it("detects 'We' action titles", () => {
    expect(isSessionLogTitle("We find the body")).toBe(true);
    expect(isSessionLogTitle("We save the family")).toBe(true);
    expect(isSessionLogTitle("We meet the king")).toBe(true);
    expect(isSessionLogTitle("We go to town")).toBe(true);
    expect(isSessionLogTitle("We head to the tavern")).toBe(true);
    expect(isSessionLogTitle("We travel north")).toBe(true);
  });

  it("detects date-formatted titles", () => {
    expect(isSessionLogTitle("5/12/2024")).toBe(true);
    expect(isSessionLogTitle("Session 5-12-24")).toBe(true);
  });

  it("returns false for non-session titles", () => {
    expect(isSessionLogTitle("Kettle")).toBe(false);
    expect(isSessionLogTitle("The Silver Horn")).toBe(false);
    expect(isSessionLogTitle("Notable People")).toBe(false);
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes hex entities", () => {
    expect(decodeHtmlEntities("&#x20;")).toBe(" ");
    expect(decodeHtmlEntities("&#x26;")).toBe("&");
  });

  it("decodes decimal entities", () => {
    expect(decodeHtmlEntities("&#32;")).toBe(" ");
    expect(decodeHtmlEntities("&#38;")).toBe("&");
  });

  it("decodes named entities", () => {
    expect(decodeHtmlEntities("&amp;")).toBe("&");
    expect(decodeHtmlEntities("&lt;")).toBe("<");
    expect(decodeHtmlEntities("&gt;")).toBe(">");
    expect(decodeHtmlEntities("&quot;")).toBe('"');
    expect(decodeHtmlEntities("&apos;")).toBe("'");
    expect(decodeHtmlEntities("&nbsp;")).toBe(" ");
  });

  it("handles mixed content", () => {
    expect(decodeHtmlEntities("Hello&#x20;World &amp; Friends")).toBe("Hello World & Friends");
  });
});

describe("extractNuclinoLinks", () => {
  it("extracts single link", () => {
    const content = "See [Kettle](<Kettle 03183b35.md?n>) for more info.";
    const links = extractNuclinoLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      text: "Kettle",
      targetFilename: "Kettle 03183b35.md",
      targetPageId: "03183b35",
      fullMatch: "[Kettle](<Kettle 03183b35.md?n>)",
    });
  });

  it("extracts multiple links", () => {
    const content = `
      - [Person A](<Person A 11111111.md?n>)
      - [Place B](<Place B 22222222.md?n>)
    `;
    const links = extractNuclinoLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].targetPageId).toBe("11111111");
    expect(links[1].targetPageId).toBe("22222222");
  });

  it("handles links without ?n suffix", () => {
    const content = "[Test](<Test 12345678.md>)";
    const links = extractNuclinoLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].targetPageId).toBe("12345678");
  });

  it("returns empty array for no links", () => {
    const content = "Just regular text without links.";
    const links = extractNuclinoLinks(content);

    expect(links).toHaveLength(0);
  });

  it("handles links with spaces in filename", () => {
    const content = "[Long Title Page](<This Is A Long Title Page 87654321.md?n>)";
    const links = extractNuclinoLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].text).toBe("Long Title Page");
    expect(links[0].targetPageId).toBe("87654321");
  });
});

describe("parseNuclinoContent", () => {
  it("decodes entities and extracts links", () => {
    const markdown = "&#x20;See [Person](<Person abc12345.md?n>) here.";
    const result = parseNuclinoContent(markdown);

    // Content is trimmed to remove leading/trailing whitespace from HTML entities
    expect(result.content).toBe("See [Person](<Person abc12345.md?n>) here.");
    expect(result.links).toHaveLength(1);
  });

  it("trims leading and trailing whitespace", () => {
    const markdown = "&#x20;&#x20;Hello World&#x20;&#x20;";
    const result = parseNuclinoContent(markdown);

    expect(result.content).toBe("Hello World");
  });
});

describe("isCollectionPage", () => {
  it("returns true for a page that is mostly links", () => {
    const content = `
# Notable People
- [Alice](<Alice 11111111.md?n>)
- [Bob](<Bob 22222222.md?n>)
- [Charlie](<Charlie 33333333.md?n>)
- [Diana](<Diana 44444444.md?n>)
    `;
    const links = extractNuclinoLinks(content);

    expect(isCollectionPage(content, links)).toBe(true);
  });

  it("returns false for a page with substantial text", () => {
    const content = `
# Some Character

This is a detailed description of the character. They have many traits
and a rich backstory. Here is a lot of text about them that makes this
page clearly not a collection page.

See also: [Related](<Related 12345678.md?n>)
    `;
    const links = extractNuclinoLinks(content);

    expect(isCollectionPage(content, links)).toBe(false);
  });

  it("returns false for pages with fewer than 3 links", () => {
    const content = `
- [Only One](<Only One 11111111.md?n>)
- [Only Two](<Only Two 22222222.md?n>)
    `;
    const links = extractNuclinoLinks(content);

    expect(isCollectionPage(content, links)).toBe(false);
  });
});

describe("detectCollectionType", () => {
  it("detects Notable People", () => {
    expect(detectCollectionType("Notable People")).toBe("notable_people");
    expect(detectCollectionType("notable people")).toBe("notable_people");
    expect(detectCollectionType("People")).toBe("notable_people");
    expect(detectCollectionType("NPCs")).toBe("notable_people");
    expect(detectCollectionType("NPC")).toBe("notable_people");
    expect(detectCollectionType("Characters")).toBe("notable_people");
  });

  it("detects Places", () => {
    expect(detectCollectionType("Places")).toBe("places");
    expect(detectCollectionType("places")).toBe("places");
    expect(detectCollectionType("Locations")).toBe("places");
    expect(detectCollectionType("Location")).toBe("places");
  });

  it("detects To do", () => {
    expect(detectCollectionType("To do")).toBe("todo");
    expect(detectCollectionType("Todo")).toBe("todo");
    expect(detectCollectionType("to do")).toBe("todo");
    expect(detectCollectionType("Open Quests")).toBe("todo");
  });

  it("detects Done", () => {
    expect(detectCollectionType("Done")).toBe("done");
    expect(detectCollectionType("done")).toBe("done");
    expect(detectCollectionType("Completed")).toBe("done");
    expect(detectCollectionType("Finished")).toBe("done");
  });

  it("returns other for unknown titles", () => {
    expect(detectCollectionType("Random Collection")).toBe("other");
    expect(detectCollectionType("Index")).toBe("other");
  });
});

describe("detectCollectionPages", () => {
  it("identifies collection pages from a set of pages", () => {
    const pages: NuclinoPage[] = [
      {
        filename: "Notable People 11111111.md",
        sourcePageId: "11111111",
        title: "Notable People",
        content: "- [Alice](<Alice 22222222.md?n>)\n- [Bob](<Bob 33333333.md?n>)\n- [Charlie](<Charlie 44444444.md?n>)",
        contentRaw: "",
        links: [
          { text: "Alice", targetFilename: "Alice 22222222.md", targetPageId: "22222222", fullMatch: "[Alice](<Alice 22222222.md?n>)" },
          { text: "Bob", targetFilename: "Bob 33333333.md", targetPageId: "33333333", fullMatch: "[Bob](<Bob 33333333.md?n>)" },
          { text: "Charlie", targetFilename: "Charlie 44444444.md", targetPageId: "44444444", fullMatch: "[Charlie](<Charlie 44444444.md?n>)" },
        ],
        isEmpty: false,
      },
      {
        filename: "Alice 22222222.md",
        sourcePageId: "22222222",
        title: "Alice",
        content: "Alice is a character in the story.",
        contentRaw: "",
        links: [],
        isEmpty: false,
      },
    ];

    const collections = detectCollectionPages(pages);

    expect(collections.size).toBe(1);
    expect(collections.has("11111111")).toBe(true);

    const collection = collections.get("11111111")!;
    expect(collection.collectionType).toBe("notable_people");
    expect(collection.linkedPageIds).toEqual(["22222222", "33333333", "44444444"]);
  });
});

describe("buildCollectionMembership", () => {
  it("maps pages to their collection memberships", () => {
    const pages: NuclinoPage[] = [];
    const collections = new Map<string, CollectionInfo>();
    collections.set("coll1", {
      sourcePageId: "coll1",
      title: "Notable People",
      linkedPageIds: ["page1", "page2"],
      collectionType: "notable_people",
    });
    collections.set("coll2", {
      sourcePageId: "coll2",
      title: "Done",
      linkedPageIds: ["page2", "page3"],
      collectionType: "done",
    });

    const membership = buildCollectionMembership(pages, collections);

    expect(membership.get("page1")).toEqual(["notable_people"]);
    expect(membership.get("page2")).toEqual(["notable_people", "done"]);
    expect(membership.get("page3")).toEqual(["done"]);
  });
});

describe("classifyNuclinoPage", () => {
  const emptyMembership = new Map<string, CollectionInfo["collectionType"][]>();
  const emptyCollections = new Map<string, CollectionInfo>();

  it("classifies collection pages", () => {
    const page: NuclinoPage = {
      filename: "Index 11111111.md",
      sourcePageId: "11111111",
      title: "Index",
      content: "",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const collections = new Map<string, CollectionInfo>();
    collections.set("11111111", {
      sourcePageId: "11111111",
      title: "Index",
      linkedPageIds: [],
      collectionType: "other",
    });

    const result = classifyNuclinoPage(page, emptyMembership, collections);
    expect(result).toEqual({ noteType: "collection" });
  });

  it("classifies people from Notable People collection", () => {
    const page: NuclinoPage = {
      filename: "Alice 22222222.md",
      sourcePageId: "22222222",
      title: "Alice",
      content: "",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const membership = new Map<string, CollectionInfo["collectionType"][]>();
    membership.set("22222222", ["notable_people"]);

    const result = classifyNuclinoPage(page, membership, emptyCollections);
    expect(result).toEqual({ noteType: "person" });
  });

  it("classifies places from Places collection", () => {
    const page: NuclinoPage = {
      filename: "Tavern 33333333.md",
      sourcePageId: "33333333",
      title: "Tavern",
      content: "",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const membership = new Map<string, CollectionInfo["collectionType"][]>();
    membership.set("33333333", ["places"]);

    const result = classifyNuclinoPage(page, membership, emptyCollections);
    expect(result).toEqual({ noteType: "place" });
  });

  it("classifies open quests from To do collection", () => {
    const page: NuclinoPage = {
      filename: "Quest 44444444.md",
      sourcePageId: "44444444",
      title: "Quest",
      content: "",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const membership = new Map<string, CollectionInfo["collectionType"][]>();
    membership.set("44444444", ["todo"]);

    const result = classifyNuclinoPage(page, membership, emptyCollections);
    expect(result).toEqual({ noteType: "quest", questStatus: "active" });
  });

  it("classifies done quests from Done collection", () => {
    const page: NuclinoPage = {
      filename: "Quest 55555555.md",
      sourcePageId: "55555555",
      title: "Quest",
      content: "",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const membership = new Map<string, CollectionInfo["collectionType"][]>();
    membership.set("55555555", ["done"]);

    const result = classifyNuclinoPage(page, membership, emptyCollections);
    expect(result).toEqual({ noteType: "quest", questStatus: "done" });
  });

  it("classifies uncategorized pages as notes", () => {
    const page: NuclinoPage = {
      filename: "Random 66666666.md",
      sourcePageId: "66666666",
      title: "Random",
      content: "",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const result = classifyNuclinoPage(page, emptyMembership, emptyCollections);
    expect(result).toEqual({ noteType: "note" });
  });

  it("prioritizes person over quest when in multiple collections", () => {
    const page: NuclinoPage = {
      filename: "NPC Quest 77777777.md",
      sourcePageId: "77777777",
      title: "NPC Quest",
      content: "",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const membership = new Map<string, CollectionInfo["collectionType"][]>();
    membership.set("77777777", ["notable_people", "todo"]);

    const result = classifyNuclinoPage(page, membership, emptyCollections);
    expect(result).toEqual({ noteType: "person" });
  });

  it("classifies session log pages by title pattern", () => {
    const journeyPage: NuclinoPage = {
      filename: "Journey with Samwell 88888888.md",
      sourcePageId: "88888888",
      title: "Journey with Samwell",
      content: "We traveled to Stonefall...",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const result = classifyNuclinoPage(journeyPage, emptyMembership, emptyCollections);
    expect(result).toEqual({ noteType: "session_log" });
  });

  it("classifies 'We' action pages as session logs", () => {
    const actionPage: NuclinoPage = {
      filename: "We find the body 99999999.md",
      sourcePageId: "99999999",
      title: "We find the body",
      content: "The party discovered...",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const result = classifyNuclinoPage(actionPage, emptyMembership, emptyCollections);
    expect(result).toEqual({ noteType: "session_log" });
  });

  it("does not classify 'Scene Setting' as session log", () => {
    const settingPage: NuclinoPage = {
      filename: "Beeby Scene Setting aabbccdd.md",
      sourcePageId: "aabbccdd",
      title: "Beeby Scene Setting",
      content: "Setting description...",
      contentRaw: "",
      links: [],
      isEmpty: false,
    };

    const result = classifyNuclinoPage(settingPage, emptyMembership, emptyCollections);
    expect(result).toEqual({ noteType: "note" });
  });
});

describe("resolveNuclinoLinks", () => {
  it("converts Nuclino links to Helm links", () => {
    const content = "See [Alice](<Alice abc12345.md?n>) for more.";
    const pageIdToNoteId = new Map<string, string>();
    pageIdToNoteId.set("abc12345", "note-uuid-123");

    const result = resolveNuclinoLinks(content, pageIdToNoteId);

    expect(result.resolved).toBe("See [Alice](/notes/note-uuid-123) for more.");
    expect(result.unresolvedLinks).toHaveLength(0);
  });

  it("marks unresolved links", () => {
    const content = "See [Unknown](<Unknown 00000000.md?n>) for more.";
    const pageIdToNoteId = new Map<string, string>();

    const result = resolveNuclinoLinks(content, pageIdToNoteId);

    expect(result.resolved).toBe("See [Unknown](#unresolved) for more.");
    expect(result.unresolvedLinks).toEqual(["Unknown"]);
  });

  it("handles multiple links", () => {
    const content = "[A](<A 11111111.md?n>) and [B](<B 22222222.md?n>)";
    const pageIdToNoteId = new Map<string, string>();
    pageIdToNoteId.set("11111111", "note-1");
    pageIdToNoteId.set("22222222", "note-2");

    const result = resolveNuclinoLinks(content, pageIdToNoteId);

    expect(result.resolved).toBe("[A](/notes/note-1) and [B](/notes/note-2)");
    expect(result.unresolvedLinks).toHaveLength(0);
  });
});

describe("parseNuclinoExport", () => {
  it("parses entries into NuclinoPage objects", () => {
    const entries = [
      { filename: "Page A 11111111.md", content: "Content A with [Link](<Link 22222222.md?n>)" },
      { filename: "Page B 22222222.md", content: "" },
    ];

    const pages = parseNuclinoExport(entries);

    expect(pages).toHaveLength(2);

    expect(pages[0].sourcePageId).toBe("11111111");
    expect(pages[0].title).toBe("Page A");
    expect(pages[0].links).toHaveLength(1);
    expect(pages[0].isEmpty).toBe(false);

    expect(pages[1].sourcePageId).toBe("22222222");
    expect(pages[1].isEmpty).toBe(true);
  });

  it("filters non-md files", () => {
    const entries = [
      { filename: "readme.txt", content: "text file" },
      { filename: "Page 11111111.md", content: "markdown" },
      { filename: "image.png", content: "" },
    ];

    const pages = parseNuclinoExport(entries);

    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("Page");
  });
});

describe("generateImportSummary", () => {
  it("generates correct summary counts", () => {
    const pages: NuclinoPage[] = [
      { filename: "a.md", sourcePageId: "1", title: "A", content: "", contentRaw: "", links: [], isEmpty: false },
      { filename: "b.md", sourcePageId: "2", title: "B", content: "", contentRaw: "", links: [], isEmpty: true },
      { filename: "c.md", sourcePageId: "3", title: "C", content: "", contentRaw: "", links: [], isEmpty: false },
      { filename: "d.md", sourcePageId: "4", title: "D", content: "", contentRaw: "", links: [], isEmpty: false },
      { filename: "e.md", sourcePageId: "5", title: "E", content: "", contentRaw: "", links: [], isEmpty: false },
    ];

    const classifications = new Map<string, { noteType: string; questStatus?: string }>();
    classifications.set("1", { noteType: "collection" });
    classifications.set("2", { noteType: "note" });
    classifications.set("3", { noteType: "person" });
    classifications.set("4", { noteType: "quest", questStatus: "active" });
    classifications.set("5", { noteType: "quest", questStatus: "done" });

    const summary = generateImportSummary(pages, classifications as any);

    expect(summary).toEqual({
      totalPages: 5,
      emptyPages: 1,
      collections: 1,
      people: 1,
      places: 0,
      questsOpen: 1,
      questsDone: 1,
      notes: 1,
    });
  });
});

describe("processNuclinoExport", () => {
  it("processes a complete export", () => {
    const entries = [
      {
        filename: "Notable People 11111111.md",
        content: "- [Alice](<Alice 22222222.md?n>)\n- [Bob](<Bob 33333333.md?n>)\n- [Charlie](<Charlie 44444444.md?n>)",
      },
      { filename: "Alice 22222222.md", content: "Alice is a character." },
      { filename: "Bob 33333333.md", content: "Bob is a character." },
      { filename: "Charlie 44444444.md", content: "Charlie is a character." },
      { filename: "Places 55555555.md", content: "- [Tavern](<Tavern 66666666.md?n>)\n- [Castle](<Castle 77777777.md?n>)\n- [Forest](<Forest 88888888.md?n>)" },
      { filename: "Tavern 66666666.md", content: "The local tavern." },
      { filename: "Castle 77777777.md", content: "A grand castle." },
      { filename: "Forest 88888888.md", content: "A dark forest." },
      { filename: "Random Note 99999999.md", content: "Just a note." },
      { filename: "Empty 00000000.md", content: "" },
    ];

    const result = processNuclinoExport(entries);

    expect(result.pages).toHaveLength(10);
    expect(result.collections.size).toBe(2);
    expect(result.summary.totalPages).toBe(10);
    expect(result.summary.emptyPages).toBe(1);
    expect(result.summary.collections).toBe(2);
    expect(result.summary.people).toBe(3);
    expect(result.summary.places).toBe(3);
    // 2 notes: "Random Note" + "Empty" (empty pages are still classified)
    expect(result.summary.notes).toBe(2);
  });
});
