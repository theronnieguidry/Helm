import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Team types enum values
export const TEAM_TYPES = [
  "pathfinder_2e",
  "dnd",
  "vampire",
  "werewolf",
  "other"
] as const;

export type TeamType = typeof TEAM_TYPES[number];

export const TEAM_TYPE_LABELS: Record<TeamType, string> = {
  pathfinder_2e: "Pathfinder 2e",
  dnd: "Dungeons & Dragons",
  vampire: "Vampire: The Masquerade",
  werewolf: "Werewolf: The Apocalypse",
  other: "Other"
};

// Game-specific terminology for character fields
export type CharacterTerminology = {
  gmTitle: string;
  type1Label: string; // Race/Ancestry/Clan/Tribe
  type2Label: string; // Class/Auspice (empty for Vampire)
  type1Placeholder: string;
  type2Placeholder: string;
};

export const GAME_TERMINOLOGY: Record<TeamType, CharacterTerminology> = {
  dnd: {
    gmTitle: "Dungeon Master",
    type1Label: "Race",
    type2Label: "Class",
    type1Placeholder: "e.g., Human, Elf, Dwarf, Tiefling",
    type2Placeholder: "e.g., Fighter, Wizard, Rogue, Cleric",
  },
  pathfinder_2e: {
    gmTitle: "Game Master",
    type1Label: "Ancestry",
    type2Label: "Class",
    type1Placeholder: "e.g., Human, Elf, Dwarf, Halfling",
    type2Placeholder: "e.g., Fighter, Wizard, Rogue, Cleric",
  },
  vampire: {
    gmTitle: "Storyteller",
    type1Label: "Clan",
    type2Label: "", // No class in Vampire
    type1Placeholder: "e.g., Brujah, Ventrue, Toreador, Nosferatu",
    type2Placeholder: "",
  },
  werewolf: {
    gmTitle: "Storyteller",
    type1Label: "Tribe",
    type2Label: "Auspice",
    type1Placeholder: "e.g., Bone Gnawers, Silver Fangs, Shadow Lords",
    type2Placeholder: "e.g., Ragabash, Theurge, Philodox, Galliard, Ahroun",
  },
  other: {
    gmTitle: "Organizer",
    type1Label: "",
    type2Label: "",
    type1Placeholder: "",
    type2Placeholder: "",
  },
};

// Dice modes based on team type
export const DICE_MODES = ["polyhedral", "d10_pool", "disabled"] as const;
export type DiceMode = typeof DICE_MODES[number];

export const TEAM_TYPE_DICE_MODE: Record<TeamType, DiceMode> = {
  pathfinder_2e: "polyhedral",
  dnd: "polyhedral",
  vampire: "d10_pool",
  werewolf: "d10_pool",
  other: "disabled"
};

// Recurrence frequency
export const RECURRENCE_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type RecurrenceFrequency = typeof RECURRENCE_FREQUENCIES[number];

// Session status (PRD-010)
export const SESSION_STATUSES = ["scheduled", "canceled"] as const;
export type SessionStatus = typeof SESSION_STATUSES[number];

// Teams table
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  teamType: text("team_type").notNull().$type<TeamType>(),
  diceMode: text("dice_mode").notNull().$type<DiceMode>(),
  ownerId: varchar("owner_id").notNull(),
  recurrenceFrequency: text("recurrence_frequency").$type<RecurrenceFrequency>(),
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly/biweekly
  daysOfMonth: json("days_of_month").$type<number[]>(), // for monthly
  startTime: text("start_time"), // HH:MM format
  timezone: text("timezone"),
  recurrenceAnchorDate: timestamp("recurrence_anchor_date"),
  minAttendanceThreshold: integer("min_attendance_threshold").default(2),
  defaultSessionDurationMinutes: integer("default_session_duration_minutes").default(180), // PRD-010A: 3 hours default
  // PRD-027: AI Features paywall
  aiEnabled: boolean("ai_enabled").default(false).notNull(),
  aiEnabledAt: timestamp("ai_enabled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Team members table
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull().$type<"dm" | "member">(),
  // Character information (optional, for tabletop gaming groups)
  characterName: text("character_name"),
  characterType1: text("character_type1"), // Race/Ancestry/Clan/Tribe depending on game
  characterType2: text("character_type2"), // Class/Auspice depending on game
  characterDescription: text("character_description"),
  // PRD-028: Per-member AI features toggle
  aiEnabled: boolean("ai_enabled").default(false).notNull(),
  aiEnabledAt: timestamp("ai_enabled_at"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Invites table
export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  code: varchar("code", { length: 6 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notes table
// Consolidated entity types (PRD-018: removed redundant person, place, collection)
// PRD-019: Renamed "location" to "area"
export const NOTE_TYPES = ["area", "character", "npc", "poi", "quest", "session_log", "note"] as const;
export type NoteType = typeof NOTE_TYPES[number];

// Quest status enum (PRD-004)
export const QUEST_STATUSES = ["lead", "todo", "active", "done", "abandoned"] as const;
export type QuestStatus = typeof QUEST_STATUSES[number];

// Import run status (PRD-015A)
export const IMPORT_RUN_STATUSES = ["completed", "failed", "deleted"] as const;
export type ImportRunStatus = typeof IMPORT_RUN_STATUSES[number];

// Import visibility options (PRD-015A)
export const IMPORT_VISIBILITIES = ["private", "team"] as const;
export type ImportVisibility = typeof IMPORT_VISIBILITIES[number];

// Import run options stored as JSON (PRD-015A)
export interface ImportRunOptions {
  importEmptyPages: boolean;
  defaultVisibility: ImportVisibility;
}

// Import run stats stored as JSON (PRD-015A)
export interface ImportRunStats {
  totalPagesDetected: number;
  notesCreated: number;
  notesUpdated: number;
  notesSkipped: number;
  emptyPagesImported: number;
  linksResolved: number;
  warningsCount: number;
}

export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  lead: "Lead",
  todo: "To Do",
  active: "Active",
  done: "Done",
  abandoned: "Abandoned",
};

export const QUEST_STATUS_COLORS: Record<QuestStatus, string> = {
  lead: "bg-gray-500/10 text-gray-500",
  todo: "bg-blue-500/10 text-blue-500",
  active: "bg-yellow-500/10 text-yellow-500",
  done: "bg-green-500/10 text-green-500",
  abandoned: "bg-red-500/10 text-red-500",
};

// Content block for session logs (PRD-001)
export interface ContentBlock {
  id: string;
  content: string;
  entityRefs?: string[];
  createdAt: string;
}

export const notes = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  authorId: varchar("author_id").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  noteType: text("note_type").notNull().$type<NoteType>(),
  isPrivate: boolean("is_private").default(false),
  parentNoteId: varchar("parent_note_id"),
  linkedNoteIds: json("linked_note_ids").$type<string[]>().default([]),
  // PRD-001: Session log fields
  sessionDate: timestamp("session_date"),
  contentBlocks: json("content_blocks").$type<ContentBlock[]>(),
  // PRD-004: Quest status field
  questStatus: text("quest_status").$type<QuestStatus>(),
  // PRD-015: Import tracking fields
  sourceSystem: text("source_system"), // e.g., "NUCLINO"
  sourcePageId: text("source_page_id"), // e.g., 8-char hex ID from Nuclino filename
  contentMarkdown: text("content_markdown"), // Original raw markdown
  contentMarkdownResolved: text("content_markdown_resolved"), // Markdown with resolved links
  // PRD-015A: Attribution and import run tracking
  importRunId: varchar("import_run_id"), // Links to import_runs.id
  createdByUserId: varchar("created_by_user_id"), // User who created this note
  updatedByUserId: varchar("updated_by_user_id"), // User who last updated this note
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sessions (game sessions, not auth sessions)
export const gameSessions = pgTable("game_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  isOverride: boolean("is_override").default(false),
  notes: text("notes"),
  status: text("status").notNull().$type<SessionStatus>().default("scheduled"), // PRD-010
  createdAt: timestamp("created_at").defaultNow(),
});

// Availability
export const AVAILABILITY_STATUS = ["available", "busy", "maybe"] as const;
export type AvailabilityStatus = typeof AVAILABILITY_STATUS[number];

export const availability = pgTable("availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  userId: varchar("user_id").notNull(),
  status: text("status").notNull().$type<AvailabilityStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Dice rolls
export const diceRolls = pgTable("dice_rolls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  userId: varchar("user_id").notNull(),
  diceType: text("dice_type").notNull(), // e.g., "d20", "d10_pool"
  count: integer("count").default(1),
  modifier: integer("modifier").default(0),
  results: json("results").$type<number[]>().notNull(),
  total: integer("total").notNull(),
  isShared: boolean("is_shared").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Availability (PRD-009) - date-based personal availability
export const userAvailability = pgTable("user_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  userId: varchar("user_id").notNull(),
  date: timestamp("date").notNull(),
  startTime: text("start_time").notNull(), // HH:MM format
  endTime: text("end_time").notNull(),     // HH:MM format
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Backlinks table (PRD-005)
export const backlinks = pgTable("backlinks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceNoteId: varchar("source_note_id").notNull(),
  sourceBlockId: varchar("source_block_id"),
  targetNoteId: varchar("target_note_id").notNull(),
  textSnippet: text("text_snippet"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Session Overrides table (PRD-010A) - DM overrides for auto-generated session candidates
export const sessionOverrides = pgTable("session_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  occurrenceKey: varchar("occurrence_key").notNull(), // e.g., "2026-01-24" - stable identity for computed occurrence
  status: text("status").notNull().$type<SessionStatus>().default("scheduled"),
  scheduledAtOverride: timestamp("scheduled_at_override"), // null = use computed time from recurrence
  updatedBy: varchar("updated_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Import Runs table (PRD-015A) - Track import operations for attribution and rollback
export const importRuns = pgTable("import_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  sourceSystem: text("source_system").notNull(), // e.g., "NUCLINO"
  createdByUserId: varchar("created_by_user_id").notNull(),
  status: text("status").notNull().$type<ImportRunStatus>().default("completed"),
  options: json("options").$type<ImportRunOptions>(),
  stats: json("stats").$type<ImportRunStats>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Note Import Snapshots table (PRD-015A FR-6) - Store previous state for rollback of updated notes
export const noteImportSnapshots = pgTable("note_import_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull(),
  importRunId: varchar("import_run_id").notNull(),
  previousTitle: text("previous_title").notNull(),
  previousContent: text("previous_content"),
  previousNoteType: text("previous_note_type").notNull().$type<NoteType>(),
  previousQuestStatus: text("previous_quest_status").$type<QuestStatus>(),
  previousContentMarkdown: text("previous_content_markdown"),
  previousContentMarkdownResolved: text("previous_content_markdown_resolved"),
  previousIsPrivate: boolean("previous_is_private"),
  createdAt: timestamp("created_at").defaultNow(),
});

// PRD-016: AI Enrichment types
export const ENRICHMENT_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type EnrichmentStatus = typeof ENRICHMENT_STATUSES[number];

// PRD-019: Renamed "Location" to "Area"
export const INFERRED_ENTITY_TYPES = ["Character", "NPC", "Area", "Quest", "SessionLog", "Note"] as const;
export type InferredEntityType = typeof INFERRED_ENTITY_TYPES[number];

export const CLASSIFICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type ClassificationStatus = typeof CLASSIFICATION_STATUSES[number];

export const RELATIONSHIP_TYPES = ["QuestHasNPC", "QuestAtPlace", "NPCInPlace", "Related"] as const;
export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

export const EVIDENCE_TYPES = ["Link", "Mention", "Heuristic"] as const;
export type EvidenceType = typeof EVIDENCE_TYPES[number];

export interface EnrichmentRunTotals {
  notesProcessed: number;
  classificationsCreated: number;
  relationshipsFound: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  userReviewRequired: number;
}

// PRD-016: Enrichment Runs table - Track AI processing pipeline
export const enrichmentRuns = pgTable("enrichment_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importRunId: varchar("import_run_id").notNull(),
  teamId: varchar("team_id").notNull(),
  createdByUserId: varchar("created_by_user_id").notNull(),
  status: text("status").notNull().$type<EnrichmentStatus>().default("pending"),
  totals: json("totals").$type<EnrichmentRunTotals>(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// PRD-016: Note Classifications table - AI-inferred entity classifications
export const noteClassifications = pgTable("note_classifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull(),
  enrichmentRunId: varchar("enrichment_run_id").notNull(),
  inferredType: text("inferred_type").notNull().$type<InferredEntityType>(),
  confidence: real("confidence").notNull(), // 0.0-1.0
  explanation: text("explanation"),
  extractedEntities: json("extracted_entities").$type<string[]>(),
  status: text("status").notNull().$type<ClassificationStatus>().default("pending"),
  approvedByUserId: varchar("approved_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// PRD-016: Note Relationships table - Detected relationships between notes
export const noteRelationships = pgTable("note_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enrichmentRunId: varchar("enrichment_run_id").notNull(),
  fromNoteId: varchar("from_note_id").notNull(),
  toNoteId: varchar("to_note_id").notNull(),
  relationshipType: text("relationship_type").notNull().$type<RelationshipType>(),
  confidence: real("confidence").notNull(), // 0.0-1.0
  evidenceSnippet: text("evidence_snippet"),
  evidenceType: text("evidence_type").notNull().$type<EvidenceType>(),
  status: text("status").notNull().$type<ClassificationStatus>().default("pending"),
  approvedByUserId: varchar("approved_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// PRD-043: AI Cache types
export const AI_CACHE_TYPES = ["classification", "relationship"] as const;
export type AICacheType = typeof AI_CACHE_TYPES[number];

// PRD-043: AI Cache Entries table - Persistent cache for AI enrichment results
export const aiCacheEntries = pgTable("ai_cache_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Cache key components
  cacheType: text("cache_type").notNull().$type<AICacheType>(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(), // SHA-256
  algorithmVersion: varchar("algorithm_version", { length: 20 }).notNull(),
  contextHash: varchar("context_hash", { length: 64 }), // For PC names context
  // Cache scope (required - team isolation)
  teamId: varchar("team_id").notNull(),
  // Cached result (ClassificationResult or RelationshipResult)
  result: json("result").notNull(),
  // Metadata
  modelId: varchar("model_id", { length: 100 }).notNull(),
  tokensSaved: integer("tokens_saved"),
  hitCount: integer("hit_count").default(0),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  lastHitAt: timestamp("last_hit_at"),
  expiresAt: timestamp("expires_at"),
});

// PRD-043: AI Algorithm Versions table - Track prompt/algorithm versions for cache invalidation
export const aiAlgorithmVersions = pgTable("ai_algorithm_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operationType: text("operation_type").notNull().$type<AICacheType>(),
  version: varchar("version", { length: 20 }).notNull(),
  description: text("description"),
  promptHash: varchar("prompt_hash", { length: 64 }), // SHA-256 of system prompt
  isCurrent: boolean("is_current").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  deprecatedAt: timestamp("deprecated_at"),
});

// PRD-043: Cache statistics for developer monitoring
export interface AICacheStats {
  totalEntries: number;
  entriesByType: {
    classification: number;
    relationship: number;
  };
  totalHits: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  entriesExpiringSoon: number; // Within 7 days
}

// Relations
export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  invites: many(invites),
  notes: many(notes),
  sessions: many(gameSessions),
  diceRolls: many(diceRolls),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  team: one(teams, { fields: [invites.teamId], references: [teams.id] }),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  team: one(teams, { fields: [notes.teamId], references: [teams.id] }),
  parent: one(notes, { fields: [notes.parentNoteId], references: [notes.id] }),
}));

export const gameSessionsRelations = relations(gameSessions, ({ one, many }) => ({
  team: one(teams, { fields: [gameSessions.teamId], references: [teams.id] }),
  availability: many(availability),
}));

export const availabilityRelations = relations(availability, ({ one }) => ({
  session: one(gameSessions, { fields: [availability.sessionId], references: [gameSessions.id] }),
}));

export const diceRollsRelations = relations(diceRolls, ({ one }) => ({
  team: one(teams, { fields: [diceRolls.teamId], references: [teams.id] }),
}));

export const userAvailabilityRelations = relations(userAvailability, ({ one }) => ({
  team: one(teams, { fields: [userAvailability.teamId], references: [teams.id] }),
}));

export const backlinksRelations = relations(backlinks, ({ one }) => ({
  sourceNote: one(notes, { fields: [backlinks.sourceNoteId], references: [notes.id] }),
  targetNote: one(notes, { fields: [backlinks.targetNoteId], references: [notes.id] }),
}));

export const sessionOverridesRelations = relations(sessionOverrides, ({ one }) => ({
  team: one(teams, { fields: [sessionOverrides.teamId], references: [teams.id] }),
}));

export const importRunsRelations = relations(importRuns, ({ one, many }) => ({
  team: one(teams, { fields: [importRuns.teamId], references: [teams.id] }),
}));

export const noteImportSnapshotsRelations = relations(noteImportSnapshots, ({ one }) => ({
  note: one(notes, { fields: [noteImportSnapshots.noteId], references: [notes.id] }),
  importRun: one(importRuns, { fields: [noteImportSnapshots.importRunId], references: [importRuns.id] }),
}));

// PRD-016: Enrichment relations
export const enrichmentRunsRelations = relations(enrichmentRuns, ({ one, many }) => ({
  importRun: one(importRuns, { fields: [enrichmentRuns.importRunId], references: [importRuns.id] }),
  team: one(teams, { fields: [enrichmentRuns.teamId], references: [teams.id] }),
  classifications: many(noteClassifications),
  relationships: many(noteRelationships),
}));

export const noteClassificationsRelations = relations(noteClassifications, ({ one }) => ({
  note: one(notes, { fields: [noteClassifications.noteId], references: [notes.id] }),
  enrichmentRun: one(enrichmentRuns, { fields: [noteClassifications.enrichmentRunId], references: [enrichmentRuns.id] }),
}));

export const noteRelationshipsRelations = relations(noteRelationships, ({ one }) => ({
  fromNote: one(notes, { fields: [noteRelationships.fromNoteId], references: [notes.id] }),
  toNote: one(notes, { fields: [noteRelationships.toNoteId], references: [notes.id] }),
  enrichmentRun: one(enrichmentRuns, { fields: [noteRelationships.enrichmentRunId], references: [enrichmentRuns.id] }),
}));

// PRD-043: AI Cache relations
export const aiCacheEntriesRelations = relations(aiCacheEntries, ({ one }) => ({
  team: one(teams, { fields: [aiCacheEntries.teamId], references: [teams.id] }),
}));

// Insert schemas
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, joinedAt: true });
export const insertInviteSchema = createInsertSchema(invites).omit({ id: true, createdAt: true });
export const insertNoteSchema = createInsertSchema(notes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGameSessionSchema = createInsertSchema(gameSessions).omit({ id: true, createdAt: true });
export const insertAvailabilitySchema = createInsertSchema(availability).omit({ id: true, createdAt: true });
export const insertDiceRollSchema = createInsertSchema(diceRolls).omit({ id: true, createdAt: true });
export const insertBacklinkSchema = createInsertSchema(backlinks).omit({ id: true, createdAt: true });
export const insertUserAvailabilitySchema = createInsertSchema(userAvailability).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSessionOverrideSchema = createInsertSchema(sessionOverrides).omit({ id: true, createdAt: true, updatedAt: true });
export const insertImportRunSchema = createInsertSchema(importRuns).omit({ id: true, createdAt: true });
export const insertNoteImportSnapshotSchema = createInsertSchema(noteImportSnapshots).omit({ id: true, createdAt: true });
// PRD-016: Enrichment insert schemas
export const insertEnrichmentRunSchema = createInsertSchema(enrichmentRuns).omit({ id: true, createdAt: true });
export const insertNoteClassificationSchema = createInsertSchema(noteClassifications).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNoteRelationshipSchema = createInsertSchema(noteRelationships).omit({ id: true, createdAt: true, updatedAt: true });
// PRD-043: AI Cache insert schemas
export const insertAICacheEntrySchema = createInsertSchema(aiCacheEntries).omit({ id: true, createdAt: true });
export const insertAIAlgorithmVersionSchema = createInsertSchema(aiAlgorithmVersions).omit({ id: true, createdAt: true });

// Types
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type Invite = typeof invites.$inferSelect;
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type Availability = typeof availability.$inferSelect;
export type InsertAvailability = z.infer<typeof insertAvailabilitySchema>;
export type DiceRoll = typeof diceRolls.$inferSelect;
export type InsertDiceRoll = z.infer<typeof insertDiceRollSchema>;
export type Backlink = typeof backlinks.$inferSelect;
export type InsertBacklink = z.infer<typeof insertBacklinkSchema>;
export type UserAvailability = typeof userAvailability.$inferSelect;
export type InsertUserAvailability = z.infer<typeof insertUserAvailabilitySchema>;
export type SessionOverride = typeof sessionOverrides.$inferSelect;
export type InsertSessionOverride = z.infer<typeof insertSessionOverrideSchema>;
export type ImportRun = typeof importRuns.$inferSelect;
export type InsertImportRun = z.infer<typeof insertImportRunSchema>;
export type NoteImportSnapshot = typeof noteImportSnapshots.$inferSelect;
export type InsertNoteImportSnapshot = z.infer<typeof insertNoteImportSnapshotSchema>;
// PRD-016: Enrichment types
export type EnrichmentRun = typeof enrichmentRuns.$inferSelect;
export type InsertEnrichmentRun = z.infer<typeof insertEnrichmentRunSchema>;
export type NoteClassification = typeof noteClassifications.$inferSelect;
export type InsertNoteClassification = z.infer<typeof insertNoteClassificationSchema>;
export type NoteRelationship = typeof noteRelationships.$inferSelect;
export type InsertNoteRelationship = z.infer<typeof insertNoteRelationshipSchema>;
// PRD-043: AI Cache types
export type AICacheEntry = typeof aiCacheEntries.$inferSelect;
export type InsertAICacheEntry = z.infer<typeof insertAICacheEntrySchema>;
export type AIAlgorithmVersion = typeof aiAlgorithmVersions.$inferSelect;
export type InsertAIAlgorithmVersion = z.infer<typeof insertAIAlgorithmVersionSchema>;
