/**
 * Script to simulate AI classification locally and identify parsing issues
 * Run with: npx tsx scripts/simulate-classification.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

const IMPORT_FILE = 'imports/Vagaries of Fate PF2e.zip';

interface NoteForClassification {
  id: string;
  title: string;
  content: string;
  currentType: string;
  existingLinks: string[];
}

// Extract notes from the zip file
function extractNotes(): NoteForClassification[] {
  const zip = new AdmZip(IMPORT_FILE);
  const entries = zip.getEntries();
  const notes: NoteForClassification[] = [];

  for (const entry of entries) {
    if (entry.entryName.endsWith('.md')) {
      const content = entry.getData().toString('utf8');
      const title = entry.entryName.replace(/\s+[a-f0-9]{8}\.md$/, '');

      // Extract links from markdown content
      const linkMatches = content.matchAll(/\[([^\]]+)\]\(<[^>]+>\)/g);
      const links = [...linkMatches].map(m => m[1]);

      notes.push({
        id: entry.entryName.replace('.md', ''),
        title,
        content,
        currentType: 'note',
        existingLinks: links,
      });
    }
  }

  return notes;
}

// Build the exact prompt that would be sent to Claude (FIXED version)
function buildClassificationPrompt(notes: NoteForClassification[]): string {
  const notesJson = notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content.slice(0, 2000),
    currentType: note.currentType,
    linkedTitles: note.existingLinks.slice(0, 10),
  }));

  // FIXED: Now uses "Character" | "NPC" | "Area" to match system prompt
  return `Classify the following notes. Return a JSON array with one object per note:

\`\`\`json
[
  {
    "noteId": "string",
    "inferredType": "Character" | "NPC" | "Area" | "Quest" | "SessionLog" | "Note",
    "confidence": 0.0-1.0,
    "explanation": "brief reason for classification",
    "extractedEntities": ["entity1", "entity2"]
  }
]
\`\`\`

Notes to classify:
${JSON.stringify(notesJson, null, 2)}`;
}

const SYSTEM_PROMPT = `You are a TTRPG (tabletop roleplaying game) campaign note classifier. Your job is to analyze notes from a game master's campaign wiki and classify them into categories.

For each note, determine the most appropriate category:
- Character: A player character (PC) - one of the main protagonists controlled by players
- NPC: A non-player character, deity, historical figure, or any named individual that is NOT a PC
- Area: A location, city, building, region, landmark, point of interest, or geographic feature
- Quest: A task, mission, objective, or storyline the players might pursue
- SessionLog: A record or summary of a game session that already happened
- Note: General reference material, rules, world lore, or uncategorizable content

Be conservative with confidence scores:
- 0.90+: Very clear category (e.g., "The City of Ironforge" is clearly an Area)
- 0.70-0.89: Strong indicators but some ambiguity
- 0.50-0.69: Weak signals, needs human review
- Below 0.50: Very uncertain, should be marked as Note

Also extract any entity names mentioned in the content (NPCs, locations, quest names).

Output valid JSON only. No markdown, no explanation outside the JSON.`;

// Main
const notes = extractNotes();
console.log(`Extracted ${notes.length} notes from ${IMPORT_FILE}\n`);

// Show stats
const emptyNotes = notes.filter(n => !n.content.trim());
const notesWithContent = notes.filter(n => n.content.trim());

console.log(`Empty notes: ${emptyNotes.length}`);
console.log(`Notes with content: ${notesWithContent.length}\n`);

// Show empty note titles
if (emptyNotes.length > 0) {
  console.log('Empty notes (will get "Not analyzed by AI"):');
  emptyNotes.forEach(n => console.log(`  - ${n.title}`));
  console.log('');
}

// Show sample batches
const BATCH_SIZE = 10;
const batches = [];
for (let i = 0; i < notesWithContent.length; i += BATCH_SIZE) {
  batches.push(notesWithContent.slice(i, i + BATCH_SIZE));
}

console.log(`Would create ${batches.length} batches of ${BATCH_SIZE} notes each\n`);

// Print first batch's prompt for analysis
console.log('='.repeat(80));
console.log('SYSTEM PROMPT:');
console.log('='.repeat(80));
console.log(SYSTEM_PROMPT);
console.log('');

console.log('='.repeat(80));
console.log('USER PROMPT (first batch):');
console.log('='.repeat(80));
console.log(buildClassificationPrompt(batches[0]));
console.log('');

// Highlight the fix
console.log('='.repeat(80));
console.log('BUG FIX (PRD-039):');
console.log('='.repeat(80));
console.log('Previously the USER PROMPT said: "Person" | "Place" | "Quest" | "SessionLog" | "Note"');
console.log('But the SYSTEM PROMPT defined: Character, NPC, Area, Quest, SessionLog, Note');
console.log('');
console.log('This mismatch caused "Failed to parse AI response" errors when Claude used "Person" or "Place".');
console.log('');
console.log('NOW FIXED: USER PROMPT says: "Character" | "NPC" | "Area" | "Quest" | "SessionLog" | "Note"');
console.log('');

// Show notes that would be most likely to fail
console.log('='.repeat(80));
console.log('Notes most likely to cause JSON parsing issues:');
console.log('='.repeat(80));
notesWithContent.forEach(note => {
  // Check for problematic patterns
  const hasUnescapedQuotes = note.content.match(/"[^"]+"/g);
  const hasSpecialChars = note.content.match(/[\n\r\t]/);
  const hasLongContent = note.content.length > 1500;

  if (hasUnescapedQuotes && hasUnescapedQuotes.length > 3) {
    console.log(`  ${note.title}: Has ${hasUnescapedQuotes.length} quoted strings that may cause JSON issues`);
  }
});
