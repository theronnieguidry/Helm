/**
 * Migration script to consolidate entity types (PRD-018)
 *
 * Migrates:
 * - person → npc (or character if matches party member name)
 * - place → poi
 * - collection → note
 */

import "dotenv/config";
import { db } from "../server/db";
import { notes, teamMembers } from "../shared/schema";
import { eq, sql, inArray } from "drizzle-orm";

async function migrate() {
  console.log("Starting entity type migration...\n");

  // Get current distribution
  const beforeCounts = await db.execute(sql`
    SELECT note_type, COUNT(*)::int as count
    FROM notes
    GROUP BY note_type
    ORDER BY note_type
  `);
  console.log("Before migration:");
  console.table(beforeCounts.rows);

  // Get all party member names (lowercase) for PC detection
  const partyMembers = await db
    .select({ characterName: teamMembers.characterName })
    .from(teamMembers)
    .where(sql`${teamMembers.characterName} IS NOT NULL AND ${teamMembers.characterName} != ''`);

  const partyMemberNames = new Set(
    partyMembers
      .map(m => m.characterName?.toLowerCase().trim())
      .filter((name): name is string => !!name)
  );

  console.log(`\nFound ${partyMemberNames.size} party member names:`, [...partyMemberNames]);

  // Step 1: Migrate person → character (if matches party member name)
  if (partyMemberNames.size > 0) {
    const personNotes = await db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(eq(notes.noteType, "person" as any));

    const pcNoteIds: string[] = [];
    for (const note of personNotes) {
      if (partyMemberNames.has(note.title.toLowerCase().trim())) {
        pcNoteIds.push(note.id);
      }
    }

    if (pcNoteIds.length > 0) {
      await db
        .update(notes)
        .set({ noteType: "character" })
        .where(inArray(notes.id, pcNoteIds));
      console.log(`\nMigrated ${pcNoteIds.length} person notes to character (PC detection)`);
    }
  }

  // Step 2: Migrate remaining person → npc
  const personToNpc = await db
    .update(notes)
    .set({ noteType: "npc" })
    .where(eq(notes.noteType, "person" as any))
    .returning({ id: notes.id });
  console.log(`Migrated ${personToNpc.length} person notes to npc`);

  // Step 3: Migrate place → poi
  const placeToPoi = await db
    .update(notes)
    .set({ noteType: "poi" })
    .where(eq(notes.noteType, "place" as any))
    .returning({ id: notes.id });
  console.log(`Migrated ${placeToPoi.length} place notes to poi`);

  // Step 4: Migrate collection → note
  const collectionToNote = await db
    .update(notes)
    .set({ noteType: "note" })
    .where(eq(notes.noteType, "collection" as any))
    .returning({ id: notes.id });
  console.log(`Migrated ${collectionToNote.length} collection notes to note`);

  // Get final distribution
  const afterCounts = await db.execute(sql`
    SELECT note_type, COUNT(*)::int as count
    FROM notes
    GROUP BY note_type
    ORDER BY note_type
  `);
  console.log("\nAfter migration:");
  console.table(afterCounts.rows);

  console.log("\n✓ Migration complete!");
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
