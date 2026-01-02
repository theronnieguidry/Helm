import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
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
export const NOTE_TYPES = ["location", "character", "npc", "poi", "quest"] as const;
export type NoteType = typeof NOTE_TYPES[number];

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

// Insert schemas
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true });
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, joinedAt: true });
export const insertInviteSchema = createInsertSchema(invites).omit({ id: true, createdAt: true });
export const insertNoteSchema = createInsertSchema(notes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGameSessionSchema = createInsertSchema(gameSessions).omit({ id: true, createdAt: true });
export const insertAvailabilitySchema = createInsertSchema(availability).omit({ id: true, createdAt: true });
export const insertDiceRollSchema = createInsertSchema(diceRolls).omit({ id: true, createdAt: true });

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
