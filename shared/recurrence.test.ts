import { describe, it, expect } from "vitest";
import {
  classifyAvailability,
  formatTimeHHMM,
  formatDateKey,
  setTimeFromString,
  generateSessionCandidates,
  getSessionEndTime,
} from "./recurrence";
import type { Team, SessionOverride } from "./schema";

describe("classifyAvailability", () => {
  describe("full coverage", () => {
    it("returns full when availability exactly matches session", () => {
      expect(classifyAvailability("19:00", "22:00", "19:00", "22:00")).toBe("full");
    });

    it("returns full when availability starts before and ends after session", () => {
      expect(classifyAvailability("18:00", "23:00", "19:00", "22:00")).toBe("full");
    });

    it("returns full when availability starts before and ends exactly at session end", () => {
      expect(classifyAvailability("18:00", "22:00", "19:00", "22:00")).toBe("full");
    });

    it("returns full when availability starts exactly at session and ends after", () => {
      expect(classifyAvailability("19:00", "23:00", "19:00", "22:00")).toBe("full");
    });
  });

  describe("partial coverage", () => {
    it("returns partial when availability starts late (arriving late)", () => {
      expect(classifyAvailability("20:00", "22:00", "19:00", "22:00")).toBe("partial");
    });

    it("returns partial when availability ends early (leaving early)", () => {
      expect(classifyAvailability("19:00", "21:00", "19:00", "22:00")).toBe("partial");
    });

    it("returns partial when availability is in the middle of session", () => {
      expect(classifyAvailability("20:00", "21:00", "19:00", "22:00")).toBe("partial");
    });

    it("returns partial when availability starts before session but ends during", () => {
      expect(classifyAvailability("18:00", "20:00", "19:00", "22:00")).toBe("partial");
    });

    it("returns partial when availability starts during session and ends after", () => {
      expect(classifyAvailability("21:00", "23:00", "19:00", "22:00")).toBe("partial");
    });
  });

  describe("no coverage", () => {
    it("returns none when availability ends before session starts", () => {
      expect(classifyAvailability("17:00", "18:00", "19:00", "22:00")).toBe("none");
    });

    it("returns none when availability starts after session ends", () => {
      expect(classifyAvailability("23:00", "24:00", "19:00", "22:00")).toBe("none");
    });

    it("returns none when availability ends exactly when session starts", () => {
      expect(classifyAvailability("17:00", "19:00", "19:00", "22:00")).toBe("none");
    });

    it("returns none when availability starts exactly when session ends", () => {
      expect(classifyAvailability("22:00", "24:00", "19:00", "22:00")).toBe("none");
    });
  });
});

describe("formatTimeHHMM", () => {
  it("formats single-digit hours and minutes with leading zeros", () => {
    expect(formatTimeHHMM(new Date(2026, 0, 17, 9, 5))).toBe("09:05");
  });

  it("formats double-digit hours and minutes", () => {
    expect(formatTimeHHMM(new Date(2026, 0, 17, 19, 30))).toBe("19:30");
  });

  it("formats midnight correctly", () => {
    expect(formatTimeHHMM(new Date(2026, 0, 17, 0, 0))).toBe("00:00");
  });
});

describe("formatDateKey", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(formatDateKey(new Date(2026, 0, 17))).toBe("2026-01-17");
  });

  it("pads single-digit months and days", () => {
    expect(formatDateKey(new Date(2026, 8, 5))).toBe("2026-09-05");
  });
});

describe("setTimeFromString", () => {
  it("sets time from HH:MM string", () => {
    const date = new Date(2026, 0, 17);
    const result = setTimeFromString(date, "19:30");
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(0);
  });

  it("preserves the original date", () => {
    const date = new Date(2026, 5, 15);
    const result = setTimeFromString(date, "08:00");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });

  it("does not mutate the original date", () => {
    const date = new Date(2026, 0, 17, 12, 0);
    setTimeFromString(date, "19:30");
    expect(date.getHours()).toBe(12);
  });
});

describe("getSessionEndTime", () => {
  it("calculates end time for 3-hour session", () => {
    expect(getSessionEndTime("19:00", 180)).toBe("22:00");
  });

  it("calculates end time for 2-hour session", () => {
    expect(getSessionEndTime("20:00", 120)).toBe("22:00");
  });

  it("handles crossing midnight", () => {
    expect(getSessionEndTime("23:00", 120)).toBe("01:00");
  });

  it("handles minutes overflow", () => {
    expect(getSessionEndTime("19:45", 90)).toBe("21:15");
  });
});

describe("generateSessionCandidates", () => {
  // Helper to create a team with recurrence settings
  function createTeam(overrides: Partial<Team> = {}): Team {
    return {
      id: "team-1",
      name: "Test Team",
      teamType: "dnd",
      diceMode: "polyhedral",
      ownerId: "owner-1",
      recurrenceFrequency: "weekly",
      dayOfWeek: 4, // Thursday
      daysOfMonth: null,
      startTime: "19:00",
      timezone: "America/New_York",
      recurrenceAnchorDate: null,
      minAttendanceThreshold: 2,
      defaultSessionDurationMinutes: 180,
      createdAt: new Date(),
      ...overrides,
    };
  }

  describe("weekly recurrence", () => {
    it("generates weekly sessions", () => {
      const team = createTeam({
        recurrenceFrequency: "weekly",
        dayOfWeek: 4, // Thursday
      });

      // January 2026: Thursdays are 1, 8, 15, 22, 29
      const fromDate = new Date(2026, 0, 1); // Jan 1
      const toDate = new Date(2026, 0, 31); // Jan 31

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      expect(candidates).toHaveLength(5);
      expect(candidates[0].occurrenceKey).toBe("2026-01-01");
      expect(candidates[1].occurrenceKey).toBe("2026-01-08");
      expect(candidates[2].occurrenceKey).toBe("2026-01-15");
      expect(candidates[3].occurrenceKey).toBe("2026-01-22");
      expect(candidates[4].occurrenceKey).toBe("2026-01-29");
    });

    it("sets correct start and end times", () => {
      const team = createTeam({
        startTime: "19:00",
        defaultSessionDurationMinutes: 180,
      });

      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 8);

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      expect(candidates[0].scheduledAt.getHours()).toBe(19);
      expect(candidates[0].scheduledAt.getMinutes()).toBe(0);
      expect(candidates[0].endsAt.getHours()).toBe(22);
      expect(candidates[0].endsAt.getMinutes()).toBe(0);
    });

    it("returns empty array when no recurrence settings", () => {
      const team = createTeam({
        recurrenceFrequency: null,
        dayOfWeek: null,
        startTime: null,
      });

      const candidates = generateSessionCandidates(
        team,
        new Date(2026, 0, 1),
        new Date(2026, 0, 31)
      );

      expect(candidates).toHaveLength(0);
    });

    it("returns empty array when startTime is missing", () => {
      const team = createTeam({
        recurrenceFrequency: "weekly",
        dayOfWeek: 4,
        startTime: null,
      });

      const candidates = generateSessionCandidates(
        team,
        new Date(2026, 0, 1),
        new Date(2026, 0, 31)
      );

      expect(candidates).toHaveLength(0);
    });
  });

  describe("biweekly recurrence", () => {
    it("generates biweekly sessions starting from anchor", () => {
      const team = createTeam({
        recurrenceFrequency: "biweekly",
        dayOfWeek: 4, // Thursday
        recurrenceAnchorDate: new Date(2026, 0, 1), // First Thursday of Jan 2026
      });

      // January 2026: Thursdays are 1, 8, 15, 22, 29
      // Biweekly from Jan 1: Jan 1, Jan 15, Jan 29
      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 31);

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      expect(candidates).toHaveLength(3);
      expect(candidates[0].occurrenceKey).toBe("2026-01-01");
      expect(candidates[1].occurrenceKey).toBe("2026-01-15");
      expect(candidates[2].occurrenceKey).toBe("2026-01-29");
    });

    it("respects anchor date for alternating weeks", () => {
      const team = createTeam({
        recurrenceFrequency: "biweekly",
        dayOfWeek: 4, // Thursday
        recurrenceAnchorDate: new Date(2026, 0, 8), // Second Thursday
      });

      // Biweekly from Jan 8: Jan 8, Jan 22
      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 31);

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      expect(candidates).toHaveLength(2);
      expect(candidates[0].occurrenceKey).toBe("2026-01-08");
      expect(candidates[1].occurrenceKey).toBe("2026-01-22");
    });

    it("returns empty when no anchor date", () => {
      const team = createTeam({
        recurrenceFrequency: "biweekly",
        dayOfWeek: 4,
        recurrenceAnchorDate: null,
      });

      const candidates = generateSessionCandidates(
        team,
        new Date(2026, 0, 1),
        new Date(2026, 0, 31)
      );

      expect(candidates).toHaveLength(0);
    });
  });

  describe("monthly recurrence", () => {
    it("generates monthly sessions on specific days", () => {
      const team = createTeam({
        recurrenceFrequency: "monthly",
        dayOfWeek: null,
        daysOfMonth: [15, 1],
      });

      // Q1 2026: Jan-Mar
      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 2, 31);

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      // 1st and 15th of each month = 6 sessions
      expect(candidates).toHaveLength(6);
      expect(candidates.map(c => c.occurrenceKey)).toEqual([
        "2026-01-01",
        "2026-01-15",
        "2026-02-01",
        "2026-02-15",
        "2026-03-01",
        "2026-03-15",
      ]);
    });

    it("handles day overflow for short months (Feb 30 → Feb 28)", () => {
      const team = createTeam({
        recurrenceFrequency: "monthly",
        daysOfMonth: [30],
      });

      const fromDate = new Date(2026, 1, 1); // Feb 1
      const toDate = new Date(2026, 1, 28); // Feb 28

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      // Day 30 in Feb → uses Feb 28
      expect(candidates).toHaveLength(1);
      expect(candidates[0].occurrenceKey).toBe("2026-02-28");
    });

    it("handles day 31 in months with 30 days", () => {
      const team = createTeam({
        recurrenceFrequency: "monthly",
        daysOfMonth: [31],
      });

      const fromDate = new Date(2026, 3, 1); // April 1
      const toDate = new Date(2026, 3, 30); // April 30

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      // April has 30 days, so 31 → 30
      expect(candidates).toHaveLength(1);
      expect(candidates[0].occurrenceKey).toBe("2026-04-30");
    });

    it("returns empty when daysOfMonth is empty", () => {
      const team = createTeam({
        recurrenceFrequency: "monthly",
        daysOfMonth: [],
      });

      const candidates = generateSessionCandidates(
        team,
        new Date(2026, 0, 1),
        new Date(2026, 0, 31)
      );

      expect(candidates).toHaveLength(0);
    });
  });

  describe("session overrides", () => {
    it("applies cancel override", () => {
      const team = createTeam();
      const overrides: SessionOverride[] = [
        {
          id: "override-1",
          teamId: team.id,
          occurrenceKey: "2026-01-08",
          status: "canceled",
          scheduledAtOverride: null,
          updatedBy: "dm-user",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 15);

      const candidates = generateSessionCandidates(team, fromDate, toDate, overrides);

      expect(candidates).toHaveLength(3);

      const canceledSession = candidates.find(c => c.occurrenceKey === "2026-01-08");
      expect(canceledSession?.status).toBe("canceled");
      expect(canceledSession?.isOverridden).toBe(true);
    });

    it("applies reschedule override", () => {
      const team = createTeam();
      const newTime = new Date(2026, 0, 9, 20, 0); // Friday at 8 PM instead of Thursday

      const overrides: SessionOverride[] = [
        {
          id: "override-1",
          teamId: team.id,
          occurrenceKey: "2026-01-08",
          status: "scheduled",
          scheduledAtOverride: newTime,
          updatedBy: "dm-user",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 15);

      const candidates = generateSessionCandidates(team, fromDate, toDate, overrides);

      const rescheduledSession = candidates.find(c => c.occurrenceKey === "2026-01-08");
      expect(rescheduledSession?.scheduledAt.getDate()).toBe(9);
      expect(rescheduledSession?.scheduledAt.getHours()).toBe(20);
      expect(rescheduledSession?.isOverridden).toBe(true);
    });

    it("computes correct end time after reschedule", () => {
      const team = createTeam({
        defaultSessionDurationMinutes: 120, // 2 hours
      });
      const newTime = new Date(2026, 0, 9, 18, 30); // 6:30 PM

      const overrides: SessionOverride[] = [
        {
          id: "override-1",
          teamId: team.id,
          occurrenceKey: "2026-01-08",
          status: "scheduled",
          scheduledAtOverride: newTime,
          updatedBy: "dm-user",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 15);

      const candidates = generateSessionCandidates(team, fromDate, toDate, overrides);

      const rescheduledSession = candidates.find(c => c.occurrenceKey === "2026-01-08");
      expect(rescheduledSession?.endsAt.getHours()).toBe(20); // 8:30 PM
      expect(rescheduledSession?.endsAt.getMinutes()).toBe(30);
    });
  });

  describe("sorting and filtering", () => {
    it("returns candidates sorted by scheduledAt", () => {
      const team = createTeam({
        recurrenceFrequency: "monthly",
        daysOfMonth: [20, 5, 15],
      });

      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 31);

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      expect(candidates.map(c => c.occurrenceKey)).toEqual([
        "2026-01-05",
        "2026-01-15",
        "2026-01-20",
      ]);
    });

    it("excludes candidates before fromDate", () => {
      const team = createTeam({
        recurrenceFrequency: "weekly",
        dayOfWeek: 4, // Thursday
      });

      // Start from Jan 10 - should skip Jan 1 and Jan 8
      const fromDate = new Date(2026, 0, 10);
      const toDate = new Date(2026, 0, 31);

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      expect(candidates).toHaveLength(3);
      expect(candidates[0].occurrenceKey).toBe("2026-01-15");
    });
  });

  describe("default session duration", () => {
    it("uses default 180 minutes when not specified", () => {
      const team = createTeam({
        defaultSessionDurationMinutes: null,
        startTime: "19:00",
      });

      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 8);

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      // 19:00 + 180 min = 22:00
      expect(candidates[0].endsAt.getHours()).toBe(22);
    });

    it("uses custom duration when specified", () => {
      const team = createTeam({
        defaultSessionDurationMinutes: 240, // 4 hours
        startTime: "19:00",
      });

      const fromDate = new Date(2026, 0, 1);
      const toDate = new Date(2026, 0, 8);

      const candidates = generateSessionCandidates(team, fromDate, toDate);

      // 19:00 + 240 min = 23:00
      expect(candidates[0].endsAt.getHours()).toBe(23);
    });
  });
});
