/**
 * P2-2 (PRD-005 FR-4, gap F34): backlink re-indexing on source content edits.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "./test/memory-storage";
import { createTestUser } from "./test/setup";
import { reindexBacklinksForSource } from "./backlink-reindex";

describe("reindexBacklinksForSource", () => {
  let storage: MemoryStorage;
  let teamId: string;
  let sessionId: string;
  let entityId: string;

  beforeEach(async () => {
    storage = new MemoryStorage();
    const user = createTestUser({ id: "user-1" });
    storage.setUser(user);
    const team = await storage.createTeam({
      name: "T",
      teamType: "dnd",
      diceMode: "polyhedral",
      ownerId: user.id,
    });
    teamId = team.id;
    const session = await storage.createNote({
      teamId,
      authorId: user.id,
      title: "Session 1",
      noteType: "session_log",
      content: "We met Kettle at the tavern and talked all night.",
    });
    sessionId = session.id;
    const entity = await storage.createNote({
      teamId,
      authorId: user.id,
      title: "Kettle",
      noteType: "npc",
    });
    entityId = entity.id;
  });

  async function addBacklink(snippet: string, start: number, end: number) {
    return storage.createBacklink({
      sourceNoteId: sessionId,
      targetNoteId: entityId,
      sourceBlockId: "block-1",
      textSnippet: snippet,
      startOffset: start,
      endOffset: end,
      createdByUserId: "user-1",
      evidenceType: "Mention",
      confidence: 0.8,
    });
  }

  it("refreshes offsets when the snippet still exists at a new position", async () => {
    const backlink = await addBacklink("met Kettle at the tavern", 3, 27);

    const newContent = "Early on, we met Kettle at the tavern.";
    const result = await reindexBacklinksForSource(storage, sessionId, newContent);

    expect(result).toEqual({ refreshed: 1, rebuilt: 0, orphaned: 0 });
    const updated = (await storage.getOutgoingLinks(sessionId)).find((b) => b.id === backlink.id);
    expect(updated!.startOffset).toBe(newContent.indexOf("met Kettle at the tavern"));
  });

  it("rebuilds the snippet from the target title when the old snippet is gone", async () => {
    await addBacklink("met Kettle at the tavern", 3, 27);

    const newContent = "The party greeted Kettle warmly before departing.";
    const result = await reindexBacklinksForSource(storage, sessionId, newContent);

    expect(result).toEqual({ refreshed: 0, rebuilt: 1, orphaned: 0 });
    const updated = (await storage.getOutgoingLinks(sessionId))[0];
    expect(updated.textSnippet).toContain("Kettle");
    expect(updated.startOffset).toBe(newContent.toLowerCase().indexOf("kettle"));
  });

  it("orphans (keeps) the backlink when the mention is currently absent (M7)", async () => {
    const backlink = await addBacklink("met Kettle at the tavern", 3, 27);

    const result = await reindexBacklinksForSource(
      storage,
      sessionId,
      "Nothing relevant happened today."
    );

    expect(result).toEqual({ refreshed: 0, rebuilt: 0, orphaned: 1 });
    const links = await storage.getOutgoingLinks(sessionId);
    expect(links).toHaveLength(1);
    expect(links[0].id).toBe(backlink.id);
    expect(links[0].startOffset).toBeNull();
    expect(links[0].endOffset).toBeNull();
    // Evidence snippet is preserved so the link can re-anchor later
    expect(links[0].textSnippet).toBe("met Kettle at the tavern");
  });

  it("re-anchors an orphaned backlink when the text returns (M7)", async () => {
    const backlink = await addBacklink("met Kettle at the tavern", 3, 27);

    // Simulate a cut... (mention transiently gone)
    await reindexBacklinksForSource(storage, sessionId, "Nothing here yet.");
    // ...and re-paste
    const restored = "So anyway, we met Kettle at the tavern again.";
    const result = await reindexBacklinksForSource(storage, sessionId, restored);

    expect(result).toEqual({ refreshed: 1, rebuilt: 0, orphaned: 0 });
    const links = await storage.getOutgoingLinks(sessionId);
    expect(links).toHaveLength(1);
    expect(links[0].id).toBe(backlink.id);
    expect(links[0].startOffset).toBe(restored.indexOf("met Kettle at the tavern"));
  });

  it("is a no-op for notes without outgoing backlinks", async () => {
    const result = await reindexBacklinksForSource(storage, entityId, "whatever");
    expect(result).toEqual({ refreshed: 0, rebuilt: 0, orphaned: 0 });
  });
});
