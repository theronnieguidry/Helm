/**
 * Stage 4 (scheduling audit S3): the availability reminder engine — the
 * owner's core requirement. "At least a week out, determine if everyone has
 * their availability in; if not, push the person who hasn't responded and
 * tell the rest of the group who we're waiting on."
 *
 * All tests drive the engine with an injected clock against MemoryStorage;
 * assertions read the in-app notification feed (the same rows push rides on).
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { User } from "@shared/schema";
import { MemoryStorage } from "../test/memory-storage";
import { instantAt } from "@shared/recurrence";
import {
  runReminderSweep,
  runEventChecksForTeam,
  notifyOccurrenceChanged,
  currentStage,
} from "./reminder-engine";

const NY = "America/New_York";

function user(id: string, firstName: string): User {
  return { id, email: `${id}@test.dev`, firstName, lastName: "Player" } as User;
}

describe("currentStage", () => {
  it("picks the tightest applicable stage", () => {
    expect(currentStage(8)).toBeNull();
    expect(currentStage(7)?.key).toBe("t7");
    expect(currentStage(4)?.key).toBe("t7");
    expect(currentStage(3)?.key).toBe("t3");
    expect(currentStage(2)?.key).toBe("t3"); // ad-hoc session 2 days out: straight to t3
    expect(currentStage(1)?.key).toBe("t1");
    expect(currentStage(0)?.key).toBe("t1");
  });
});

describe("reminder engine", () => {
  let storage: MemoryStorage;
  let teamId: string;

  // Weekly Thursdays 19:00 New York; occurrence under test: 2026-01-15.
  // Sweep clocks sit on non-Thursdays: for a weekly team, exactly T-7 IS the
  // previous session's game day, so two occurrences would be live at once —
  // correct engine behavior, but noisy for assertions.
  const T7 = instantAt("2026-01-09", "10:30", NY); // Friday, 6 days out → t7 window
  const T3 = instantAt("2026-01-12", "10:30", NY); // Monday, 3 days out
  const T1 = instantAt("2026-01-14", "10:30", NY); // Wednesday, 1 day out
  const GAME_DAY_NOON = instantAt("2026-01-15", "12:30", NY);

  beforeEach(async () => {
    storage = new MemoryStorage();
    for (const u of [user("dm-1", "Dana"), user("alice", "Alice"), user("bob", "Bob"), user("carol", "Carol")]) {
      storage.setUser(u);
    }
    const team = await storage.createTeam({
      name: "Thursday Knights",
      teamType: "dnd",
      diceMode: "polyhedral",
      ownerId: "dm-1",
      recurrenceFrequency: "weekly",
      dayOfWeek: 4,
      startTime: "19:00",
      timezone: NY,
      minAttendanceThreshold: 2,
      defaultSessionDurationMinutes: 180,
    });
    teamId = team.id;
    await storage.createTeamMember({ teamId, userId: "dm-1", role: "dm" });
    for (const id of ["alice", "bob", "carol"]) {
      await storage.createTeamMember({ teamId, userId: id, role: "member" });
    }
  });

  async function respond(userId: string, status: "available" | "unavailable" = "available") {
    await storage.createUserAvailability({
      teamId,
      userId,
      date: new Date("2026-01-15T00:00:00Z"),
      status,
      startTime: status === "available" ? "19:00" : null,
      endTime: status === "available" ? "22:00" : null,
    });
  }

  async function feedFor(userId: string) {
    return storage.getNotificationsForUser(userId);
  }

  it("T-7: nudges every non-respondent (DM included) when nobody has answered", async () => {
    const summary = await runReminderSweep(storage, T7);

    expect(summary.teamsProcessed).toBe(1);
    for (const id of ["dm-1", "alice", "bob", "carol"]) {
      const feed = await feedFor(id);
      const nudges = feed.filter((n) => n.type === "availability_reminder");
      expect(nudges).toHaveLength(1);
      expect(nudges[0].stage).toBe("t7");
      expect(nudges[0].occurrenceKey).toBe("2026-01-15");
      expect(nudges[0].title).toContain("Thursday, Jan 15");
      expect(nudges[0].url).toBe("/schedule");
    }
    // Nobody responded, so nobody is around to receive the digest
    const digests = (await feedFor("alice")).filter((n) => n.type === "group_awaiting");
    expect(digests).toHaveLength(0);
  });

  it("T-7: responders get ONE aggregated digest naming who's outstanding", async () => {
    await respond("alice");
    await runReminderSweep(storage, T7);

    const aliceFeed = await feedFor("alice");
    expect(aliceFeed.filter((n) => n.type === "availability_reminder")).toHaveLength(0);
    const digests = aliceFeed.filter((n) => n.type === "group_awaiting");
    expect(digests).toHaveLength(1);
    expect(digests[0].body).toContain("Bob");
    expect(digests[0].body).toContain("Carol");
    expect(digests[0].body).toContain("Dana");
    expect(digests[0].body).not.toContain("Alice");

    // The laggards still get their personal nudges
    expect((await feedFor("bob")).filter((n) => n.type === "availability_reminder")).toHaveLength(1);
  });

  it("is idempotent: a second sweep at the same stage sends nothing", async () => {
    await respond("alice");
    const first = await runReminderSweep(storage, T7);
    const second = await runReminderSweep(storage, T7);
    const third = await runReminderSweep(storage, instantAt("2026-01-10", "11:00", NY)); // next day, still t7

    expect(first.notificationsSent).toBeGreaterThan(0);
    expect(second.notificationsSent).toBe(0);
    expect(third.notificationsSent).toBe(0);
  });

  it("holds scheduled nudges before 10:00 team-local (quiet hours)", async () => {
    const earlyMorning = instantAt("2026-01-09", "07:00", NY);
    const summary = await runReminderSweep(storage, earlyMorning);
    expect(summary.notificationsSent).toBe(0);

    // Same day after 10:00 — now they go out
    const after = await runReminderSweep(storage, T7);
    expect(after.notificationsSent).toBeGreaterThan(0);
  });

  it("escalates: t7, then t3, then t1 for a member who never answers", async () => {
    await respond("alice");
    await runReminderSweep(storage, T7);
    await runReminderSweep(storage, T3);
    await runReminderSweep(storage, T1);

    const bobNudges = (await feedFor("bob")).filter((n) => n.type === "availability_reminder");
    expect(bobNudges.map((n) => n.stage).sort()).toEqual(["t1", "t3", "t7"]);

    // Alice got one digest per stage, all aggregated
    const aliceDigests = (await feedFor("alice")).filter((n) => n.type === "group_awaiting");
    expect(aliceDigests.map((n) => n.stage).sort()).toEqual(["t1", "t3", "t7"]);
  });

  it("stops nudging a member the moment they respond (edge case 1)", async () => {
    await runReminderSweep(storage, T7);
    await respond("bob");
    await runReminderSweep(storage, T3);

    const bobNudges = (await feedFor("bob")).filter((n) => n.type === "availability_reminder");
    expect(bobNudges.map((n) => n.stage)).toEqual(["t7"]); // no t3
    // And bob now receives the digest side instead
    const bobDigests = (await feedFor("bob")).filter((n) => n.type === "group_awaiting");
    expect(bobDigests.map((n) => n.stage)).toEqual(["t3"]);
  });

  it("respects a member's availability-reminder opt-out", async () => {
    const members = await storage.getTeamMembers(teamId);
    const bob = members.find((m) => m.userId === "bob")!;
    await storage.updateMemberNotificationPrefs(bob.id, { notifyAvailabilityReminders: false });

    await runReminderSweep(storage, T7);

    expect((await feedFor("bob")).filter((n) => n.type === "availability_reminder")).toHaveLength(0);
    expect((await feedFor("carol")).filter((n) => n.type === "availability_reminder")).toHaveLength(1);
  });

  it("explicit 'can't make it' answers are respected — no nudges, and they still get group updates", async () => {
    await respond("alice", "unavailable");
    await runReminderSweep(storage, T7);

    const aliceFeed = await feedFor("alice");
    expect(aliceFeed.filter((n) => n.type === "availability_reminder")).toHaveLength(0);
    expect(aliceFeed.filter((n) => n.type === "group_awaiting")).toHaveLength(1);
  });

  it("sends 'everyone's in' the moment the last response arrives (event-driven)", async () => {
    await respond("dm-1");
    await respond("alice");
    await respond("bob");
    await respond("carol");

    // Even at 7am — confirmations answer a user action, no quiet-hour hold
    const summary = await runEventChecksForTeam(storage, teamId, instantAt("2026-01-09", "07:10", NY));
    expect(summary.notificationsSent).toBe(4);

    const feed = await feedFor("carol");
    const confirmed = feed.filter((n) => n.type === "session_confirmed");
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].body).toContain("confirmed");
    expect(confirmed[0].body).toContain("3 available"); // alice+bob+carol; DM not counted

    // The sweep won't re-send it
    const sweep = await runReminderSweep(storage, T3);
    expect(
      (await feedFor("carol")).filter((n) => n.type === "session_confirmed")
    ).toHaveLength(1);
    expect(sweep.notificationsSent).toBe(0);
  });

  it("warns the DM when the threshold becomes unreachable", async () => {
    // Threshold 2 with 3 members: two explicit 'no's leave best case 1
    await respond("alice", "unavailable");
    await respond("bob", "unavailable");

    await runEventChecksForTeam(storage, teamId, instantAt("2026-01-09", "08:00", NY));

    const dmFeed = await feedFor("dm-1");
    const warnings = dmFeed.filter((n) => n.type === "threshold_unreachable");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].body).toContain("2 can't make it");
    // Only the DM is warned
    expect((await feedFor("alice")).filter((n) => n.type === "threshold_unreachable")).toHaveLength(0);
  });

  it("sends the game-day confirmation at noon team-local when the session is on", async () => {
    await respond("alice");
    await respond("bob");

    // 9am game day: too early
    await runReminderSweep(storage, instantAt("2026-01-15", "09:00", NY));
    expect((await feedFor("alice")).filter((n) => n.type === "game_day")).toHaveLength(0);

    await runReminderSweep(storage, GAME_DAY_NOON);
    const gameDay = (await feedFor("alice")).filter((n) => n.type === "game_day");
    expect(gameDay).toHaveLength(1);
    expect(gameDay[0].body).toContain("7:00 PM");
  });

  it("never reminds about a canceled occurrence (edge case 5)", async () => {
    await storage.upsertSessionOverride({
      teamId,
      occurrenceKey: "2026-01-15",
      status: "canceled",
      scheduledAtOverride: null,
      updatedBy: "dm-1",
    });

    const summary = await runReminderSweep(storage, T7);
    expect(summary.notificationsSent).toBe(0);
  });

  it("re-opens the reminder ladder when the DM reschedules (edge case 6)", async () => {
    await runReminderSweep(storage, T7);
    const before = (await feedFor("bob")).filter((n) => n.type === "availability_reminder");
    expect(before).toHaveLength(1);

    // Move Thursday's session to Friday evening
    await storage.upsertSessionOverride({
      teamId,
      occurrenceKey: "2026-01-15",
      status: "scheduled",
      scheduledAtOverride: instantAt("2026-01-16", "20:00", NY),
      updatedBy: "dm-1",
    });

    await runReminderSweep(storage, instantAt("2026-01-10", "10:30", NY)); // back in t7 for the new date
    const after = (await feedFor("bob")).filter((n) => n.type === "availability_reminder");
    expect(after).toHaveLength(2);
    expect(after.some((n) => n.title.includes("Friday, Jan 16"))).toBe(true);
  });

  it("notifyOccurrenceChanged tells everyone but the acting DM about a cancel", async () => {
    await notifyOccurrenceChanged(storage, teamId, "2026-01-15", {
      kind: "canceled",
      actorUserId: "dm-1",
      transitionAt: new Date("2026-01-09T00:00:00Z"),
    });

    expect((await feedFor("dm-1")).filter((n) => n.type === "session_canceled")).toHaveLength(0);
    for (const id of ["alice", "bob", "carol"]) {
      expect((await feedFor(id)).filter((n) => n.type === "session_canceled")).toHaveLength(1);
    }
  });

  it("ignores teams without recurrence and is safe on empty teams", async () => {
    const bare = await storage.createTeam({
      name: "No Schedule",
      teamType: "dnd",
      diceMode: "polyhedral",
      ownerId: "dm-1",
    });
    const summary = await runReminderSweep(storage, T7);
    // Only the recurrence team is processed
    expect(summary.teamsProcessed).toBe(1);
    expect(bare.recurrenceFrequency).toBeNull();
  });
});
