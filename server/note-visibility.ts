// P0-1 (NOTE_TAKING_GAP_REPORT F0/F48/F81/F9): shared note-privacy predicate.
// Single source of truth imported by BOTH server/routes.ts (production) and
// server/test/test-routes.ts (test harness) so the two can never diverge on
// privacy semantics again (the PRD-021 lesson).

export interface NoteVisibilityFields {
  isPrivate: boolean | null;
  authorId: string;
}

/**
 * A note is viewable when it is not private, or the caller authored it,
 * or the caller is the team DM (DM sees all).
 */
export function canViewNote(
  note: NoteVisibilityFields,
  userId: string,
  role: "dm" | "member",
): boolean {
  return !note.isPrivate || note.authorId === userId || role === "dm";
}

/**
 * Filters a list of notes down to those the caller may view.
 */
export function filterVisibleNotes<T extends NoteVisibilityFields>(
  notes: T[],
  userId: string,
  role: "dm" | "member",
): T[] {
  return notes.filter((note) => canViewNote(note, userId, role));
}
