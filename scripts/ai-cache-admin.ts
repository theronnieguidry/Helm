#!/usr/bin/env npx tsx
/**
 * PRD-043: AI Cache Administration CLI
 *
 * Command-line tool for managing the AI enrichment cache.
 * Run directly against the database - NOT exposed over HTTP.
 *
 * Usage:
 *   npx tsx scripts/ai-cache-admin.ts stats
 *   npx tsx scripts/ai-cache-admin.ts prune-expired
 *   npx tsx scripts/ai-cache-admin.ts invalidate-version classification 1.0.0
 *   npx tsx scripts/ai-cache-admin.ts invalidate-team <team-id>
 */

import { storage } from "../server/storage";

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case "stats":
        await showStats();
        break;

      case "prune-expired":
        await pruneExpired();
        break;

      case "invalidate-version":
        if (args.length < 2) {
          console.error("Error: invalidate-version requires <operationType> and <version>");
          console.error("Example: npx tsx scripts/ai-cache-admin.ts invalidate-version classification 1.0.0");
          process.exit(1);
        }
        await invalidateByVersion(args[0], args[1]);
        break;

      case "invalidate-team":
        if (args.length < 1) {
          console.error("Error: invalidate-team requires <teamId>");
          process.exit(1);
        }
        await invalidateByTeam(args[0]);
        break;

      case "help":
      case "--help":
      case "-h":
        printUsage();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  process.exit(0);
}

function printUsage() {
  console.log(`
AI Cache Administration CLI

Commands:
  stats                                    Show cache statistics
  prune-expired                            Delete all expired cache entries
  invalidate-version <type> <version>      Invalidate entries by algorithm version
                                           Types: classification, relationship
  invalidate-team <teamId>                 Invalidate all entries for a team
  help                                     Show this help message

Examples:
  npx tsx scripts/ai-cache-admin.ts stats
  npx tsx scripts/ai-cache-admin.ts prune-expired
  npx tsx scripts/ai-cache-admin.ts invalidate-version classification 1.0.0
  npx tsx scripts/ai-cache-admin.ts invalidate-team abc-123-def
`);
}

async function showStats() {
  console.log("Fetching AI cache statistics...\n");

  const stats = await storage.getAICacheStats();

  console.log("=== AI Cache Statistics ===\n");
  console.log(`Total Entries:        ${stats.totalEntries}`);
  console.log(`  - Classifications:  ${stats.entriesByType.classification}`);
  console.log(`  - Relationships:    ${stats.entriesByType.relationship}`);
  console.log(`Total Cache Hits:     ${stats.totalHits}`);
  console.log(`Expiring Soon (7d):   ${stats.entriesExpiringSoon}`);

  if (stats.oldestEntry) {
    console.log(`Oldest Entry:         ${new Date(stats.oldestEntry).toISOString()}`);
  }
  if (stats.newestEntry) {
    console.log(`Newest Entry:         ${new Date(stats.newestEntry).toISOString()}`);
  }
}

async function pruneExpired() {
  console.log("Pruning expired cache entries...");

  const count = await storage.deleteExpiredAICacheEntries();

  console.log(`Deleted ${count} expired entries.`);
}

async function invalidateByVersion(operationType: string, version: string) {
  if (!["classification", "relationship"].includes(operationType)) {
    console.error(`Invalid operation type: ${operationType}`);
    console.error("Must be 'classification' or 'relationship'");
    process.exit(1);
  }

  console.log(`Invalidating ${operationType} cache entries with version ${version}...`);

  const count = await storage.deleteAICacheByVersion(operationType, version);

  console.log(`Deleted ${count} entries.`);
}

async function invalidateByTeam(teamId: string) {
  console.log(`Invalidating cache entries for team ${teamId}...`);

  const count = await storage.deleteAICacheByTeam(teamId);

  console.log(`Deleted ${count} entries.`);
}

main();
