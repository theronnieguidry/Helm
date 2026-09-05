import { describe, it, expect } from "vitest";
import { canViewNote, filterVisibleNotes } from "./note-visibility";

describe("note-visibility (P0-1 shared privacy predicate)", () => {
  const author = "author-1";
  const otherMember = "member-2";
  const dm = "dm-user";

  const publicNote = { id: "n1", isPrivate: false, authorId: author };
  const privateNote = { id: "n2", isPrivate: true, authorId: author };
  const nullPrivacyNote = { id: "n3", isPrivate: null, authorId: author };

  describe("canViewNote", () => {
    it("allows anyone to view a non-private note", () => {
      expect(canViewNote(publicNote, otherMember, "member")).toBe(true);
      expect(canViewNote(publicNote, author, "member")).toBe(true);
    });

    it("treats isPrivate: null as non-private", () => {
      expect(canViewNote(nullPrivacyNote, otherMember, "member")).toBe(true);
    });

    it("allows the author to view their own private note", () => {
      expect(canViewNote(privateNote, author, "member")).toBe(true);
    });

    it("denies another member viewing someone else's private note", () => {
      expect(canViewNote(privateNote, otherMember, "member")).toBe(false);
    });

    it("allows the DM to view any private note (DM sees all)", () => {
      expect(canViewNote(privateNote, dm, "dm")).toBe(true);
    });

    it("allows the DM to view their own and public notes too", () => {
      expect(canViewNote(publicNote, dm, "dm")).toBe(true);
      expect(canViewNote({ isPrivate: true, authorId: dm }, dm, "dm")).toBe(true);
    });
  });

  describe("filterVisibleNotes", () => {
    const notes = [publicNote, privateNote, nullPrivacyNote];

    it("keeps only public + own private notes for a member", () => {
      const memberPrivate = { id: "n4", isPrivate: true, authorId: otherMember };
      const visible = filterVisibleNotes([...notes, memberPrivate], otherMember, "member");
      expect(visible.map((n) => n.id)).toEqual(["n1", "n3", "n4"]);
    });

    it("keeps everything for the author", () => {
      const visible = filterVisibleNotes(notes, author, "member");
      expect(visible.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    });

    it("keeps everything for the DM", () => {
      const visible = filterVisibleNotes(notes, dm, "dm");
      expect(visible.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    });

    it("returns an empty array for empty input", () => {
      expect(filterVisibleNotes([], otherMember, "member")).toEqual([]);
    });

    it("preserves extra fields on filtered notes", () => {
      const rich = [{ id: "n5", isPrivate: false, authorId: author, title: "T" }];
      const visible = filterVisibleNotes(rich, otherMember, "member");
      expect(visible[0].title).toBe("T");
    });
  });
});
