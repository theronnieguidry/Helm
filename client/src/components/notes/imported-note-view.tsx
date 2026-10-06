import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, BookOpen } from "lucide-react";
import type { Note } from "@shared/schema";

interface ImportedNoteViewProps {
  note: Note;
  onOpenNote?: (noteId: string) => void;
  onEdit: () => void;
}

/**
 * Gap F47 (PRD-015 FR-4/AC-3/AC-4): imported notes store link-resolved markdown
 * in contentMarkdownResolved, but it was never rendered — users saw raw
 * Nuclino "[text](page.md?n)" syntax in a plain textarea. This read-mode view
 * renders the resolved markdown with internal /notes/:id links wired to
 * in-app navigation. Unresolved links render as muted, non-navigable text.
 */
export function ImportedNoteView({ note, onOpenNote, onEdit }: ImportedNoteViewProps) {
  const markdown = note.contentMarkdownResolved || note.content || "";

  const components = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        if (href?.startsWith("/notes/")) {
          const noteId = href.slice("/notes/".length);
          return (
            <button
              type="button"
              className="text-primary underline underline-offset-2 hover:opacity-80"
              onClick={() => onOpenNote?.(noteId)}
            >
              {children}
            </button>
          );
        }
        if (href === "#unresolved") {
          return (
            <span
              className="text-muted-foreground border-b border-dotted border-muted-foreground/50 cursor-default"
              title="This link's target page was not part of the import"
            >
              {children}
            </span>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {children}
          </a>
        );
      },
    }),
    [onOpenNote]
  );

  return (
    <div className="space-y-2" data-testid="imported-note-view">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          <span>Imported page</span>
          {note.sourceSystem && (
            <Badge variant="secondary" className="text-xs py-0 px-1.5">
              {note.sourceSystem}
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}>
          <Pencil className="h-3 w-3 mr-1" />
          Edit
        </Button>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg border bg-muted/30 p-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_li]:my-0.5">
        <ReactMarkdown components={components}>{markdown}</ReactMarkdown>
      </div>
    </div>
  );
}
