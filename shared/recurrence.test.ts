import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import {
  classifyAvailability,
  formatTimeHHMM,
  formatDateKey,
  setTimeFromString,
  generateSessionCandidates,
  getSessionEndTime,
  instantAt,
  zonedDateKey,
  dayOfWeekForKey,
  DEFAULT_TEAM_TIMEZONE,
} from "./recurrence";
import type { Team, SessionOverride } from "./schema";

const NY = "America/New_York";

// Host-TZ-independent instant helpers: all ranges are explicit team-zone
// wall-clock times, so these tests pass identically on any CI host (audit S5).
const nyStart = (key: string) => instantAt(key, "00:00", NY);
const nyEnd = (key: string) => instantAt(key, "23:59", NY);
const nyTime = (d: Date) => formatInTimeZone(d, NY, "HH:mm");

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

  // Audit S5: a 23:00 session with a 3h duration ends at 02:00 — the old
  // minutes math returned garbage for every comparison against it.
  describe("sessions crossing midnight", () => {
    it("classifies full coverage of a wrapping session", () => {
      expect(classifyAvailability("22:00", "03:00", "23:00", "02:00")).toBe("full");
    });

    it("classifies a member window that also wraps", () => {
      expect(classifyAvailability("23:00", "02:00", "23:00", "02:00")).toBe("full");
    });

    it("classifies the pre-midnight tail as partial", () => {
      expect(classifyAvailability("21:00", "00:00", "23:00", "02:00")).toBe("partial");
    });

    it("classifies a post-midnight-only window as partial via the shifted day", () => {
      expect(classifyAvailability("00:30", "02:00", "23:00", "02:00")).toBe("partial");
    });

    it("returns none for an afternoon window against a late-night session", () => {
      expect(classifyAvailability("14:00", "17:00", "23:00", "02:00")).toBe("none");
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

describe("timezone primitives", () => {
  it("zonedDateKey gives the team-zone calendar date of an instant", () => {
    // 2026-01-02T01:00Z is still Jan 1 in New York (UTC-5)
    expect(zonedDateKey(new Date("2026-01-02T01:00:00Z"), NY)).toBe("2026-01-01");
    expect(zonedDateKey(new Date("2026-01-02T06:00:00Z"), NY)).toBe("2026-01-02");
  });

  it("instantAt resolves wall-clock time DST-correctly", () => {
    // Jan 15 (EST, UTC-5) vs Jul 15 (EDT, UTC-4) — same wall clock, different instants
    expect(instantAt("2026-01-15", "19:00", NY).toISOString()).toBe("2026-01-16T00:00:00.000Z");
    expect(instantAt("2026-07-15", "19:00", NY).toISOString()).toBe("2026-07-15T23:00:00.000Z");
  });

  it("dayOfWeekForKey is pure calendar math", () => {
    expect(dayOfWeekForKey("2026-01-01")).toBe(4); // Thursday
    expect(dayOfWeekForKey("2026-01-04")).toBe(0); // Sunday
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
      timezone: NY,
      recurrenceAnchorDate: null,
      minAttendanceThreshold: 2,
      defaultSessionDurationMinutes: 180,
      aiEnabled: false,
      aiEnabledAt: null,
      createdAt: new Date(),
      ...overrides,
    } as Team;
  }

  describe("weekly recurrence", () => {
    it("generates weekly sessions with team-timezone occurrence keys", () => {
      const team = createTeam({ recurrenceFrequency: "weekly", dayOfWeek: 4 });

      // January 2026: Thursdays are 1, 8, 15, 22, 29
      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"));

      expect(candidates.map((c) => c.occurrenceKey)).toEqual([
        "2026-01-01",
        "2026-01-08",
        "2026-01-15",
        "2026-01-22",
        "2026-01-29",
      ]);
    });

    it("sets start and end times as team-zone wall clock", () => {
      const team = createTeam({ startTime: "19:00", defaultSessionDurationMinutes: 180 });

      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-08"));

      expect(nyTime(candidates[0].scheduledAt)).toBe("19:00");
      expect(nyTime(candidates[0].endsAt)).toBe("22:00");
      // EST in January: 19:00 ET == 00:00Z next day, on ANY host timezone
      expect(candidates[0].scheduledAt.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    });

    it("keeps the same wall-clock time across a DST transition", () => {
      const team = createTeam({ startTime: "19:00" });

      // US DST starts 2026-03-08 — candidates on both sides of it
      const candidates = generateSessionCandidates(team, nyStart("2026-03-01"), nyEnd("2026-03-21"));

      expect(candidates.map((c) => c.occurrenceKey)).toEqual([
        "2026-03-05",
        "2026-03-12",
        "2026-03-19",
      ]);
      for (const c of candidates) {
        expect(nyTime(c.scheduledAt)).toBe("19:00");
      }
      // The UTC offset actually changed between the first and last candidate
      expect(candidates[0].scheduledAt.getUTCHours()).toBe(0); // EST: 19+5
      expect(candidates[2].scheduledAt.getUTCHours()).toBe(23); // EDT: 19+4
    });

    it("returns empty array when no recurrence settings", () => {
      const team = createTeam({ recurrenceFrequency: null, dayOfWeek: null, startTime: null });
      expect(
        generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"))
      ).toHaveLength(0);
    });

    it("returns empty array when startTime is missing", () => {
      const team = createTeam({ recurrenceFrequency: "weekly", dayOfWeek: 4, startTime: null });
      expect(
        generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"))
      ).toHaveLength(0);
    });

    it("falls back to the default timezone when the team has none", () => {
      const team = createTeam({ timezone: null });
      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-08"));
      expect(formatInTimeZone(candidates[0].scheduledAt, DEFAULT_TEAM_TIMEZONE, "HH:mm")).toBe("19:00");
    });
  });

  describe("biweekly recurrence", () => {
    it("generates biweekly sessions starting from anchor", () => {
      const team = createTeam({
        recurrenceFrequency: "biweekly",
        dayOfWeek: 4, // Thursday
        recurrenceAnchorDate: instantAt("2026-01-01", "12:00", NY),
      });

      // Biweekly from Jan 1: Jan 1, Jan 15, Jan 29
      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"));

      expect(candidates.map((c) => c.occurrenceKey)).toEqual([
        "2026-01-01",
        "2026-01-15",
        "2026-01-29",
      ]);
    });

    it("respects anchor date for alternating weeks", () => {
      const team = createTeam({
        recurrenceFrequency: "biweekly",
        dayOfWeek: 4, // Thursday
        recurrenceAnchorDate: instantAt("2026-01-08", "12:00", NY),
      });

      // Biweekly from Jan 8: Jan 8, Jan 22
      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"));

      expect(candidates.map((c) => c.occurrenceKey)).toEqual(["2026-01-08", "2026-01-22"]);
    });

    it("keeps week parity across a DST boundary", () => {
      const team = createTeam({
        recurrenceFrequency: "biweekly",
        dayOfWeek: 4,
        recurrenceAnchorDate: instantAt("2026-02-26", "12:00", NY),
      });

      // DST starts Mar 8; parity must not drift: Feb 26, Mar 12, Mar 26
      const candidates = generateSessionCandidates(team, nyStart("2026-02-20"), nyEnd("2026-03-31"));

      expect(candidates.map((c) => c.occurrenceKey)).toEqual([
        "2026-02-26",
        "2026-03-12",
        "2026-03-26",
      ]);
    });

    it("returns empty when no anchor date", () => {
      const team = createTeam({
        recurrenceFrequency: "biweekly",
        dayOfWeek: 4,
        recurrenceAnchorDate: null,
      });
      expect(
        generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"))
      ).toHaveLength(0);
    });
  });

  describe("monthly recurrence", () => {
    it("generates monthly sessions on specific days", () => {
      const team = createTeam({
        recurrenceFrequency: "monthly",
        dayOfWeek: null,
        daysOfMonth: [15, 1],
      });

      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-03-31"));

      expect(candidates.map((c) => c.occurrenceKey)).toEqual([
        "2026-01-01",
        "2026-01-15",
        "2026-02-01",
        "2026-02-15",
        "2026-03-01",
        "2026-03-15",
      ]);
    });

    it("handles day overflow for short months (Feb 30 → Feb 28)", () => {
      const team = createTeam({ recurrenceFrequency: "monthly", daysOfMonth: [30] });

      const candidates = generateSessionCandidates(team, nyStart("2026-02-01"), nyEnd("2026-02-28"));

      expect(candidates).toHaveLength(1);
      expect(candidates[0].occurrenceKey).toBe("2026-02-28");
    });

    it("handles day 31 in months with 30 days", () => {
      const team = createTeam({ recurrenceFrequency: "monthly", daysOfMonth: [31] });

      const candidates = generateSessionCandidates(team, nyStart("2026-04-01"), nyEnd("2026-04-30"));

      expect(candidates).toHaveLength(1);
      expect(candidates[0].occurrenceKey).toBe("2026-04-30");
    });

    it("does not emit duplicate occurrenceKeys when two targets clamp to the same day (audit S14)", () => {
      const team = createTeam({ recurrenceFrequency: "monthly", daysOfMonth: [30, 31] });

      const candidates = generateSessionCandidates(team, nyStart("2026-02-01"), nyEnd("2026-02-28"));

      // Both 30 and 31 clamp to Feb 28 — one candidate, not two
      expect(candidates).toHaveLength(1);
      expect(candidates[0].occurrenceKey).toBe("2026-02-28");
    });

    it("returns empty when daysOfMonth is empty", () => {
      const team = createTeam({ recurrenceFrequency: "monthly", daysOfMonth: [] });
      expect(
        generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"))
      ).toHaveLength(0);
    });
  });

  describe("session overrides", () => {
    function makeOverride(overrides: Partial<SessionOverride>): SessionOverride {
      return {
        id: "override-1",
        teamId: "team-1",
        occurrenceKey: "2026-01-08",
        status: "scheduled",
        scheduledAtOverride: null,
        updatedBy: "dm-user",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      } as SessionOverride;
    }

    it("applies cancel override", () => {
      const team = createTeam();
      const overrides = [makeOverride({ status: "canceled" })];

      const candidates = generateSessionCandidates(
        team,
        nyStart("2026-01-01"),
        nyEnd("2026-01-15"),
        overrides
      );

      expect(candidates).toHaveLength(3);
      const canceledSession = candidates.find((c) => c.occurrenceKey === "2026-01-08");
      expect(canceledSession?.status).toBe("canceled");
      expect(canceledSession?.isOverridden).toBe(true);
    });

    it("applies reschedule override as an absolute instant", () => {
      const team = createTeam();
      const newTime = instantAt("2026-01-09", "20:00", NY); // Friday 8 PM instead of Thursday

      const overrides = [makeOverride({ scheduledAtOverride: newTime })];

      const candidates = generateSessionCandidates(
        team,
        nyStart("2026-01-01"),
        nyEnd("2026-01-15"),
        overrides
      );

      const rescheduledSession = candidates.find((c) => c.occurrenceKey === "2026-01-08");
      expect(rescheduledSession?.scheduledAt.getTime()).toBe(newTime.getTime());
      expect(nyTime(rescheduledSession!.scheduledAt)).toBe("20:00");
      expect(rescheduledSession?.isOverridden).toBe(true);
    });

    it("computes correct end time after reschedule", () => {
      const team = createTeam({ defaultSessionDurationMinutes: 120 });
      const newTime = instantAt("2026-01-09", "18:30", NY);

      const overrides = [makeOverride({ scheduledAtOverride: newTime })];

      const candidates = generateSessionCandidates(
        team,
        nyStart("2026-01-01"),
        nyEnd("2026-01-15"),
        overrides
      );

      const rescheduledSession = candidates.find((c) => c.occurrenceKey === "2026-01-08");
      expect(nyTime(rescheduledSession!.endsAt)).toBe("20:30");
    });
  });

  describe("sorting and filtering", () => {
    it("returns candidates sorted by scheduledAt", () => {
      const team = createTeam({
        recurrenceFrequency: "monthly",
        daysOfMonth: [20, 5, 15],
      });

      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"));

      expect(candidates.map((c) => c.occurrenceKey)).toEqual([
        "2026-01-05",
        "2026-01-15",
        "2026-01-20",
      ]);
    });

    it("excludes candidates before fromDate", () => {
      const team = createTeam({ recurrenceFrequency: "weekly", dayOfWeek: 4 });

      // Start from Jan 10 — should skip Jan 1 and Jan 8
      const candidates = generateSessionCandidates(team, nyStart("2026-01-10"), nyEnd("2026-01-31"));

      expect(candidates.map((c) => c.occurrenceKey)).toEqual([
        "2026-01-15",
        "2026-01-22",
        "2026-01-29",
      ]);
    });
  });

  describe("default session duration", () => {
    it("uses default 180 minutes when not specified", () => {
      const team = createTeam({ defaultSessionDurationMinutes: null, startTime: "19:00" });

      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-08"));

      expect(nyTime(candidates[0].endsAt)).toBe("22:00");
    });

    it("uses custom duration when specified", () => {
      const team = createTeam({ defaultSessionDurationMinutes: 240, startTime: "19:00" });

      const candidates = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-08"));

      expect(nyTime(candidates[0].endsAt)).toBe("23:00");
    });
  });

  describe("host-timezone independence (audit S5)", () => {
    it("produces identical occurrence keys for equivalent instant ranges", () => {
      const team = createTeam();
      // The same absolute range expressed two ways
      const a = generateSessionCandidates(
        team,
        new Date("2026-01-01T05:00:00Z"),
        new Date("2026-02-01T04:59:00Z")
      );
      const b = generateSessionCandidates(team, nyStart("2026-01-01"), nyEnd("2026-01-31"));
      expect(a.map((c) => c.occurrenceKey)).toEqual(b.map((c) => c.occurrenceKey));
      expect(a.map((c) => c.scheduledAt.toISOString())).toEqual(
        b.map((c) => c.scheduledAt.toISOString())
      );
    });
  });
});
