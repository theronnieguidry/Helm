/**
 * Shared attendance / eligibility / response math (audit S4).
 *
 * Before this module, the attendance-threshold logic lived only in
 * client/src/pages/schedule.tsx — the server shipped raw candidates and could
 * not answer "who has not responded for Saturday?", which is the exact
 * question the reminder engine asks. Both the schedule UI and the server-side
 * engine now call these functions, so they can never disagree.
 */
import { formatInTimeZone } from "date-fns-tz";
import type { Team, UserAvailability } from "./schema";
import type { SessionCandidate, AvailabilityType } from "./recurrence";
import { classifyAvailability, getTeamTimezone, zonedDateKey } from "./recurrence";

/** A member's response state for one session occurrence. */
export type ResponseStatus = "full" | "partial" | "none" | "unavailable" | "no_response";

/**
 * Minimal member shape needed for attendance math (TeamMember without the
 * character/AI fields, so tests and the engine can pass plain objects).
 */
export interface AttendeeMember {
  userId: string;
  role: string; // "dm" | "member"
}

/**
 * user_availability rows predating stage 2 have no status column; rows after
 * it may carry "unavailable" with null times. Accept both shapes.
 */
export type AvailabilityRow = Pick<UserAvailability, "userId" | "date"> & {
  startTime: string | null;
  endTime: string | null;
  status?: "available" | "unavailable" | null;
};

export interface AttendanceSummary {
  /** Non-DM members fully covering the session window */
  full: string[];
  /** Non-DM members partially covering the session window */
  partial: string[];
  /** Members who explicitly said they can't make it (includes DM) */
  unavailable: string[];
  /** Members with no response at all for the date (includes DM) */
  noResponse: string[];
  /** Everyone who responded in any way (includes DM) */
  responded: string[];
  /** full + partial count, DM excluded (PRD-010A) */
  eligibleCount: number;
  threshold: number;
  /** eligibleCount >= threshold */
  isEligible: boolean;
  /**
   * True when the threshold can no longer be met even if every remaining
   * non-respondent says yes — the "this session is mathematically dead"
   * signal that should alert the DM.
   */
  thresholdUnreachable: boolean;
  /** The DM's own response state (a session without its DM isn't happening) */
  dmStatus: ResponseStatus;
}

/**
 * The calendar day (as "YYYY-MM-DD") a user_availability row belongs to.
 *
 * Robust to both storage generations: normalized rows sit exactly at UTC
 * midnight; legacy rows were written at the author's browser-local midnight
 * (anywhere within ±12h of UTC midnight), so rounding to the nearest UTC day
 * recovers the intended date for both (audit S5).
 */
export function availabilityDateKey(row: Pick<AvailabilityRow, "date">): string {
  const t = new Date(row.date).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  return new Date(Math.round(t / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The calendar day a candidate effectively occupies, in the team timezone.
 * For rescheduled occurrences this can differ from the occurrenceKey — a
 * member's availability is about the day the session actually happens.
 */
export function candidateDateKey(candidate: SessionCandidate, team: Pick<Team, "timezone">): string {
  return zonedDateKey(new Date(candidate.scheduledAt), getTeamTimezone(team));
}

/**
 * Classify one availability row against a candidate's window, in the TEAM
 * timezone. Member-entered "HH:MM" windows are defined as team-timezone times
 * (the availability panel labels them with the team zone).
 */
export function classifyRowForCandidate(
  row: AvailabilityRow,
  candidate: SessionCandidate,
  team: Pick<Team, "timezone">
): AvailabilityType | "unavailable" {
  if ((row.status ?? "available") === "unavailable") return "unavailable";
  if (!row.startTime || !row.endTime) return "none";
  const timezone = getTeamTimezone(team);
  const sessionStart = formatInTimeZone(new Date(candidate.scheduledAt), timezone, "HH:mm");
  const sessionEnd = formatInTimeZone(new Date(candidate.endsAt), timezone, "HH:mm");
  return classifyAvailability(row.startTime, row.endTime, sessionStart, sessionEnd);
}

/**
 * Full attendance picture for one candidate: who's in, who's partial, who
 * said no, who hasn't answered, whether the session clears the threshold —
 * shared by the schedule page and the reminder engine.
 */
export function computeAttendance(
  candidate: SessionCandidate,
  members: AttendeeMember[],
  availabilityRows: AvailabilityRow[],
  team: Pick<Team, "timezone" | "minAttendanceThreshold">
): AttendanceSummary {
  const dateKey = candidateDateKey(candidate, team);
  const threshold = team.minAttendanceThreshold || 2;

  const full: string[] = [];
  const partial: string[] = [];
  const unavailable: string[] = [];
  const noResponse: string[] = [];
  const responded: string[] = [];
  let dmStatus: ResponseStatus = "no_response";
  let nonDmMemberCount = 0;

  for (const member of members) {
    const isDm = member.role === "dm";
    if (!isDm) nonDmMemberCount++;

    const row = availabilityRows.find(
      (r) => r.userId === member.userId && availabilityDateKey(r) === dateKey
    );

    if (!row) {
      noResponse.push(member.userId);
      if (isDm) dmStatus = "no_response";
      continue;
    }

    responded.push(member.userId);
    const classification = classifyRowForCandidate(row, candidate, team);

    if (classification === "unavailable") {
      unavailable.push(member.userId);
      if (isDm) dmStatus = "unavailable";
      continue;
    }
    if (isDm) {
      // DM's window classification is tracked but never counted (PRD-010A)
      dmStatus = classification === "none" ? "none" : classification;
      continue;
    }
    if (classification === "full") full.push(member.userId);
    else if (classification === "partial") partial.push(member.userId);
    // "none": responded with a window that misses the session entirely
  }

  const eligibleCount = full.length + partial.length;
  // Best case: everyone who hasn't answered (non-DM) turns out available
  const nonDmNoResponse = members.filter(
    (m) => m.role !== "dm" && noResponse.includes(m.userId)
  ).length;
  const bestPossible = eligibleCount + nonDmNoResponse;

  return {
    full,
    partial,
    unavailable,
    noResponse,
    responded,
    eligibleCount,
    threshold,
    isEligible: eligibleCount >= threshold,
    thresholdUnreachable: bestPossible < threshold && nonDmMemberCount >= threshold,
    dmStatus,
  };
}

/**
 * Members whose availability answer is still outstanding for a candidate —
 * the reminder engine's target audience. Everyone counts, DM included.
 */
export function getNonRespondents(
  candidate: SessionCandidate,
  members: AttendeeMember[],
  availabilityRows: AvailabilityRow[],
  team: Pick<Team, "timezone" | "minAttendanceThreshold">
): string[] {
  return computeAttendance(candidate, members, availabilityRows, team).noResponse;
}

/** Whole calendar days from `now` until the candidate's team-timezone date. */
export function daysUntilCandidate(
  candidate: SessionCandidate,
  now: Date,
  team: Pick<Team, "timezone">
): number {
  const timezone = getTeamTimezone(team);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const todayKey = zonedDateKey(now, timezone);
  const sessionKey = candidateDateKey(candidate, team);
  return Math.round(
    (new Date(`${sessionKey}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / DAY_MS
  );
}
