import { describe, it, expect } from "vitest";
import {
  availabilityDateKey,
  candidateDateKey,
  classifyRowForCandidate,
  computeAttendance,
  getNonRespondents,
  daysUntilCandidate,
  type AvailabilityRow,
  type AttendeeMember,
} from "./scheduling";
import { instantAt, type SessionCandidate } from "./recurrence";

const NY = "America/New_York";
const team = { timezone: NY, minAttendanceThreshold: 2 };

function makeCandidate(overrides: Partial<SessionCandidate> = {}): SessionCandidate {
  const scheduledAt = instantAt("2026-01-15", "19:00", NY);
  return {
    occurrenceKey: "2026-01-15",
    scheduledAt,
    endsAt: new Date(scheduledAt.getTime() + 180 * 60 * 1000),
    isOverridden: false,
    status: "scheduled",
    ...overrides,
  };
}

function row(userId: string, overrides: Partial<AvailabilityRow> = {}): AvailabilityRow {
  return {
    userId,
    date: new Date("2026-01-15T00:00:00Z"),
    startTime: "19:00",
    endTime: "22:00",
    ...overrides,
  };
}

const MEMBERS: AttendeeMember[] = [
  { userId: "dm-1", role: "dm" },
  { userId: "alice", role: "member" },
  { userId: "bob", role: "member" },
  { userId: "carol", role: "member" },
];

describe("availabilityDateKey", () => {
  it("reads normalized UTC-midnight rows exactly", () => {
    expect(availabilityDateKey({ date: new Date("2026-01-15T00:00:00Z") })).toBe("2026-01-15");
  });

  it("recovers the intended day from legacy local-midnight rows (west of UTC)", () => {
    // A browser in UTC-7 saving "Jan 15 local midnight" produced Jan 15 07:00Z
    expect(availabilityDateKey({ date: new Date("2026-01-15T07:00:00Z") })).toBe("2026-01-15");
  });

  it("recovers the intended day from legacy local-midnight rows (east of UTC)", () => {
    // A browser in UTC+11 saving "Jan 15 local midnight" produced Jan 14 13:00Z
    expect(availabilityDateKey({ date: new Date("2026-01-14T13:00:00Z") })).toBe("2026-01-15");
  });
});

describe("candidateDateKey", () => {
  it("uses the team-timezone date of the effective start time", () => {
    expect(candidateDateKey(makeCandidate(), team)).toBe("2026-01-15");
  });

  it("follows a reschedule to a different day", () => {
    const moved = makeCandidate({
      scheduledAt: instantAt("2026-01-16", "20:00", NY),
      endsAt: instantAt("2026-01-16", "23:00", NY),
    });
    expect(candidateDateKey(moved, team)).toBe("2026-01-16");
  });
});

describe("classifyRowForCandidate", () => {
  it("classifies a full window", () => {
    expect(classifyRowForCandidate(row("alice"), makeCandidate(), team)).toBe("full");
  });

  it("classifies a partial window", () => {
    expect(
      classifyRowForCandidate(row("alice", { startTime: "20:00" }), makeCandidate(), team)
    ).toBe("partial");
  });

  it("classifies a missing-the-window response as none", () => {
    expect(
      classifyRowForCandidate(
        row("alice", { startTime: "09:00", endTime: "12:00" }),
        makeCandidate(),
        team
      )
    ).toBe("none");
  });

  it("returns unavailable for explicit can't-make-it rows", () => {
    expect(
      classifyRowForCandidate(
        row("alice", { status: "unavailable", startTime: null, endTime: null }),
        makeCandidate(),
        team
      )
    ).toBe("unavailable");
  });
});

describe("computeAttendance", () => {
  it("buckets members and computes eligibility (DM excluded from count)", () => {
    const rows = [
      row("dm-1"),
      row("alice"),
      row("bob", { startTime: "20:00" }),
      // carol: no response
    ];

    const summary = computeAttendance(makeCandidate(), MEMBERS, rows, team);

    expect(summary.full).toEqual(["alice"]);
    expect(summary.partial).toEqual(["bob"]);
    expect(summary.noResponse).toEqual(["carol"]);
    expect(summary.responded.sort()).toEqual(["alice", "bob", "dm-1"]);
    expect(summary.eligibleCount).toBe(2); // DM's full window NOT counted
    expect(summary.isEligible).toBe(true);
    expect(summary.dmStatus).toBe("full");
  });

  it("tracks explicit unavailable responses separately from silence", () => {
    const rows = [
      row("alice", { status: "unavailable", startTime: null, endTime: null }),
    ];

    const summary = computeAttendance(makeCandidate(), MEMBERS, rows, team);

    expect(summary.unavailable).toEqual(["alice"]);
    expect(summary.responded).toEqual(["alice"]);
    expect(summary.noResponse.sort()).toEqual(["bob", "carol", "dm-1"]);
    expect(summary.eligibleCount).toBe(0);
  });

  it("flags thresholdUnreachable when remaining members cannot clear the bar", () => {
    // Threshold 3, three non-DM members, two already said unavailable:
    // best case 0 available + 1 silent = 1 < 3
    const strictTeam = { timezone: NY, minAttendanceThreshold: 3 };
    const rows = [
      row("alice", { status: "unavailable", startTime: null, endTime: null }),
      row("bob", { status: "unavailable", startTime: null, endTime: null }),
    ];

    const summary = computeAttendance(makeCandidate(), MEMBERS, rows, strictTeam);

    expect(summary.isEligible).toBe(false);
    expect(summary.thresholdUnreachable).toBe(true);
  });

  it("does not flag unreachable while silent members could still fill the gap", () => {
    const strictTeam = { timezone: NY, minAttendanceThreshold: 3 };
    const rows = [
      row("alice", { status: "unavailable", startTime: null, endTime: null }),
    ];

    const summary = computeAttendance(makeCandidate(), MEMBERS, rows, strictTeam);

    // bob + carol silent: best case 2... still < 3 → unreachable
    expect(summary.thresholdUnreachable).toBe(true);

    // With threshold 2, two silent members could still make it
    const summary2 = computeAttendance(makeCandidate(), MEMBERS, rows, team);
    expect(summary2.thresholdUnreachable).toBe(false);
  });

  it("never flags unreachable for teams smaller than their threshold", () => {
    // A 2-member team (DM + 1) with threshold 2 can never mathematically hit
    // it — that's a config problem, not something to alarm on every week.
    const tinyMembers: AttendeeMember[] = [
      { userId: "dm-1", role: "dm" },
      { userId: "alice", role: "member" },
    ];
    const summary = computeAttendance(makeCandidate(), tinyMembers, [], team);
    expect(summary.thresholdUnreachable).toBe(false);
  });

  it("ignores availability rows from other dates", () => {
    const rows = [row("alice", { date: new Date("2026-01-16T00:00:00Z") })];
    const summary = computeAttendance(makeCandidate(), MEMBERS, rows, team);
    expect(summary.noResponse).toContain("alice");
  });

  it("matches availability against the rescheduled day, not the occurrenceKey", () => {
    const moved = makeCandidate({
      scheduledAt: instantAt("2026-01-16", "19:00", NY),
      endsAt: instantAt("2026-01-16", "22:00", NY),
    });
    const rows = [row("alice", { date: new Date("2026-01-16T00:00:00Z") })];

    const summary = computeAttendance(moved, MEMBERS, rows, team);
    expect(summary.full).toEqual(["alice"]);
  });
});

describe("getNonRespondents", () => {
  it("lists everyone with no row for the date, DM included", () => {
    const rows = [row("alice")];
    expect(getNonRespondents(makeCandidate(), MEMBERS, rows, team).sort()).toEqual([
      "bob",
      "carol",
      "dm-1",
    ]);
  });
});

describe("daysUntilCandidate", () => {
  it("counts whole team-timezone calendar days", () => {
    const now = instantAt("2026-01-08", "10:00", NY);
    expect(daysUntilCandidate(makeCandidate(), now, team)).toBe(7);
  });

  it("is 0 on game day regardless of time-of-day", () => {
    const now = instantAt("2026-01-15", "08:00", NY);
    expect(daysUntilCandidate(makeCandidate(), now, team)).toBe(0);
  });

  it("uses the team-timezone day boundary, not UTC", () => {
    // 2026-01-08T01:00Z is still Jan 7 in New York → 8 days out
    const now = new Date("2026-01-08T01:00:00Z");
    expect(daysUntilCandidate(makeCandidate(), now, team)).toBe(8);
  });
});
