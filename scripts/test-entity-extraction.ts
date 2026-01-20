/**
 * PRD-026: Test script to compare pattern-based vs Haiku entity extraction
 *
 * Usage: npx tsx scripts/test-entity-extraction.ts
 */

import { detectEntities } from "../shared/entity-detection";

// Test content from PRD-024 (the user's session notes)
const sessionNotes = `Misty Vale is the region and Granite Landing is the main city and seat of the barony
of The Misty Vale. It at the headwaters of the Broken Bridge river.

Captain Garner makes his way into camp. Lieutenant Sasha Livingstone is with him and
is a human woman and was on the exhibition when we saved Samwell. There's a dwarven
male (Drogon Stonefist) fully encased in gray steel. He's a heavy metal singer when
he's not fighting. One of his squad members is Gundren, a dwarven male who is the
former owner of the Chuckwagon. Chuckwagon motions to the runners to get moving.

Blacktalon, Breaker, Amir, Skald, all meet up with them. Blacktalon introduces his
senior staff and commanders to the Captain. Baron Chilton isn't aware of any contracts
signed. The contract has been signed in support of the Baron.

The Duke's army is marching. Duke Harrington arrived yesterday. The Duke's son followed.`;

console.log("=".repeat(70));
console.log("PATTERN-BASED ENTITY DETECTION RESULTS");
console.log("=".repeat(70));

const patternEntities = detectEntities(sessionNotes);

console.log(`\nTotal entities detected: ${patternEntities.length}\n`);

// Group by type
const byType: Record<string, typeof patternEntities> = {};
for (const entity of patternEntities) {
  if (!byType[entity.type]) byType[entity.type] = [];
  byType[entity.type].push(entity);
}

for (const [type, entities] of Object.entries(byType)) {
  console.log(`\n${type.toUpperCase()} (${entities.length}):`);
  for (const entity of entities) {
    console.log(`  - ${entity.text} (confidence: ${entity.confidence}, mentions: ${entity.frequency})`);
  }
}

console.log("\n" + "=".repeat(70));
console.log("HAIKU ENTITY EXTRACTION (requires ANTHROPIC_API_KEY)");
console.log("=".repeat(70));

async function testHaikuExtraction() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("\n⚠️  ANTHROPIC_API_KEY not set. Skipping Haiku extraction.");
    console.log("   Set the environment variable and run again to test Haiku.\n");
    return;
  }

  try {
    const { ClaudeAIProvider } = await import("../server/ai/claude-provider");
    const aiProvider = new ClaudeAIProvider();

    console.log("\nCalling Haiku API...\n");
    const result = await aiProvider.extractEntities(sessionNotes);

    console.log(`Total entities extracted: ${result.entities.length}`);
    console.log(`Total relationships found: ${result.relationships.length}\n`);

    // Group by type
    const aiByType: Record<string, typeof result.entities> = {};
    for (const entity of result.entities) {
      if (!aiByType[entity.type]) aiByType[entity.type] = [];
      aiByType[entity.type].push(entity);
    }

    for (const [type, entities] of Object.entries(aiByType)) {
      console.log(`\n${type.toUpperCase()} (${entities.length}):`);
      for (const entity of entities) {
        console.log(`  - ${entity.name} (confidence: ${entity.confidence.toFixed(2)}, mentions: ${entity.mentions})`);
        if (entity.context) {
          console.log(`    Context: ${entity.context}`);
        }
      }
    }

    if (result.relationships.length > 0) {
      console.log(`\nRELATIONSHIPS (${result.relationships.length}):`);
      for (const rel of result.relationships) {
        console.log(`  - ${rel.entity1} → ${rel.relationship} → ${rel.entity2} (confidence: ${rel.confidence.toFixed(2)})`);
      }
    }
  } catch (error) {
    console.error("Error calling Haiku:", error);
  }
}

testHaikuExtraction().then(() => {
  console.log("\n" + "=".repeat(70));
  console.log("COMPARISON COMPLETE");
  console.log("=".repeat(70) + "\n");
});
