/**
 * @vitest-environment jsdom
 *
 * Gap F47 (PRD-015 FR-4): imported notes render resolved markdown with
 * navigable internal links.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportedNoteView } from "./imported-note-view";
import type { Note } from "@shared/schema";

const baseNote = {
  id: "note-1",
  teamId: "team-1",
  title: "Kettle",
  noteType: "npc",
  content: "raw [Kettle](<Kettle 03183b35.md?n>) syntax",
  sourceSystem: "NUCLINO",
  contentMarkdownResolved:
    "# Kettle\n\nA friendly innkeeper. See [The Tavern](/notes/note-tavern) and [Ghost Page](#unresolved).\n\n- Runs the inn\n- Knows rumors",
} as Note;

describe("ImportedNoteView", () => {
  it("renders resolved markdown instead of raw link syntax", () => {
    render(<ImportedNoteView note={baseNote} onEdit={vi.fn()} />);

    expect(screen.getByText("Kettle")).toBeInTheDocument();
    expect(screen.getByText("A friendly innkeeper.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Runs the inn")).toBeInTheDocument();
    // Raw Nuclino syntax should not appear anywhere
    expect(screen.queryByText(/03183b35\.md/)).not.toBeInTheDocument();
  });

  it("navigates internal /notes/:id links through onOpenNote", () => {
    const onOpenNote = vi.fn();
    render(<ImportedNoteView note={baseNote} onOpenNote={onOpenNote} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "The Tavern" }));
    expect(onOpenNote).toHaveBeenCalledWith("note-tavern");
  });

  it("renders unresolved links as non-navigable muted text", () => {
    render(<ImportedNoteView note={baseNote} onEdit={vi.fn()} />);

    const ghost = screen.getByText("Ghost Page");
    expect(ghost.tagName).toBe("SPAN");
    expect(ghost).toHaveAttribute("title", expect.stringContaining("not part of the import"));
  });

  it("offers an Edit action", () => {
    const onEdit = vi.fn();
    render(<ImportedNoteView note={baseNote} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("falls back to plain content when no resolved markdown exists", () => {
    const note = { ...baseNote, contentMarkdownResolved: null } as Note;
    render(<ImportedNoteView note={note} onEdit={vi.fn()} />);
    expect(screen.getByText(/raw/, { exact: false })).toBeInTheDocument();
  });
});
