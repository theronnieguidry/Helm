/**
 * Cleanup script for orphaned suggestion-created entities (PRD-034)
 *
 * Finds and deletes entities that:
 * - Have incoming backlinks from session_logs that have an importRunId
 * - But themselves have no importRunId
 *
 * This indicates they were created via the Suggestions panel from imported content
 * before the PRD-034 fix was applied.
 *
 * Usage: npx tsx scripts/cleanup-orphaned-suggestions.ts [--dry-run]
 */

import "dotenv/config";
import { db } from "../server/db";
import { notes, backlinks } from "../shared/schema";
import { eq, isNull, isNotNull, sql, inArray } from "drizzle-orm";

const isDryRun = process.argv.includes("--dry-run");

async function cleanup() {
  console.log("=== Orphaned Suggestion Entity Cleanup (PRD-034) ===\n");

  if (isDryRun) {
    console.log("DRY RUN MODE - No changes will be made\n");
  }

  // Step 1: Find session_logs that have an importRunId (imported sessions)
  const importedSessions = await db
    .select({ id: notes.id, title: notes.title, importRunId: notes.importRunId })
    .from(notes)
    .where(sql`${notes.noteType} = 'session_log' AND ${notes.importRunId} IS NOT NULL`);

  console.log(`Found ${importedSessions.length} imported session logs\n`);

  if (importedSessions.length === 0) {
    console.log("No imported sessions found. Nothing to clean up.");
    return;
  }

  const importedSessionIds = importedSessions.map(s => s.id);

  // Step 2: Find backlinks FROM imported sessions TO other notes
  const backlinksFromImportedSessions = await db
    .select({
      backlinkId: backlinks.id,
      sourceNoteId: backlinks.sourceNoteId,
      targetNoteId: backlinks.targetNoteId,
      textSnippet: backlinks.textSnippet,
    })
    .from(backlinks)
    .where(inArray(backlinks.sourceNoteId, importedSessionIds));

  console.log(`Found ${backlinksFromImportedSessions.length} backlinks from imported sessions\n`);

  // Step 3: Get the target notes and check if they have importRunId
  const targetNoteIds = [...new Set(backlinksFromImportedSessions.map(b => b.targetNoteId))];

  if (targetNoteIds.length === 0) {
    console.log("No target notes found. Nothing to clean up.");
    return;
  }

  const targetNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      noteType: notes.noteType,
      importRunId: notes.importRunId,
    })
    .from(notes)
    .where(inArray(notes.id, targetNoteIds));

  // Step 4: Filter to orphaned notes (no importRunId)
  const orphanedNotes = targetNotes.filter(n => !n.importRunId);

  console.log(`Found ${orphanedNotes.length} orphaned entities (no importRunId):\n`);

  if (orphanedNotes.length === 0) {
    console.log("No orphaned entities found. Nothing to clean up.");
    return;
  }

  // Show what will be deleted
  console.log("Entities to delete:");
  console.table(orphanedNotes.map(n => ({
    id: n.id.substring(0, 8) + "...",
    title: n.title,
    type: n.noteType,
  })));

  // Step 5: Find backlinks associated with orphaned notes
  const orphanedIds = orphanedNotes.map(n => n.id);

  const orphanedBacklinks = await db
    .select({ id: backlinks.id })
    .from(backlinks)
    .where(sql`${backlinks.sourceNoteId} IN ${orphanedIds} OR ${backlinks.targetNoteId} IN ${orphanedIds}`);

  console.log(`\nBacklinks to delete: ${orphanedBacklinks.length}`);

  if (isDryRun) {
    console.log("\n--- DRY RUN COMPLETE ---");
    console.log(`Would delete ${orphanedNotes.length} notes and ${orphanedBacklinks.length} backlinks`);
    return;
  }

  // Step 6: Delete backlinks first (no cascade in schema, so manual cleanup)
  console.log("\nDeleting backlinks...");
  for (const note of orphanedNotes) {
    await db.delete(backlinks).where(eq(backlinks.sourceNoteId, note.id));
    await db.delete(backlinks).where(eq(backlinks.targetNoteId, note.id));
  }
  console.log(`Deleted backlinks for ${orphanedNotes.length} notes`);

  // Step 7: Delete the orphaned notes
  console.log("\nDeleting orphaned notes...");
  const deleted = await db
    .delete(notes)
    .where(inArray(notes.id, orphanedIds))
    .returning({ id: notes.id, title: notes.title });

  console.log(`Deleted ${deleted.length} orphaned notes`);

  console.log("\n✓ Cleanup complete!");
}

cleanup()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  });
