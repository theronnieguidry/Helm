import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Team, SessionOverride, SessionStatus } from "./schema";

/**
 * Session candidate generated from team recurrence settings
 */
export interface SessionCandidate {
  occurrenceKey: string;      // Stable ID: "2026-01-24" (calendar date in the TEAM timezone)
  scheduledAt: Date;          // Session start time (absolute instant)
  endsAt: Date;               // Session end time (start + duration)
  isOverridden: boolean;      // Has DM override applied?
  status: SessionStatus;      // "scheduled" | "canceled"
}

/**
 * Availability classification relative to a session window
 */
export type AvailabilityType = "full" | "partial" | "none";

/**
 * The fallback when a team never set a timezone. Kept as a single named
 * constant so the client and server can never silently disagree (audit S5).
 */
export const DEFAULT_TEAM_TIMEZONE = "America/New_York";

export function getTeamTimezone(team: Pick<Team, "timezone">): string {
  return team.timezone || DEFAULT_TEAM_TIMEZONE;
}

// ---------------------------------------------------------------------------
// Calendar-day math. All of it runs in "date key" space ("2026-01-24") backed
// by UTC-midnight Dates, so results are identical regardless of the HOST
// timezone (audit S5: occurrenceKeys used to shift with the deploy host's TZ,
// silently detaching session_overrides rows).
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a "YYYY-MM-DD" key to its UTC-midnight Date. */
export function keyToUtcDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/** Format a UTC-midnight Date back to its "YYYY-MM-DD" key. */
function utcDateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The calendar date an instant falls on in a given timezone, as a key. */
export function zonedDateKey(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
}

/**
 * The absolute instant of a wall-clock time on a calendar date in a timezone.
 * DST-correct: "19:00" means 19:00 on that team's clock, whatever UTC offset
 * is in effect that day.
 */
export function instantAt(dateKey: string, timeHHMM: string, timezone: string): Date {
  return fromZonedTime(`${dateKey}T${timeHHMM}:00`, timezone);
}

/** Day-of-week (0=Sunday) of a date key — pure calendar, host-TZ independent. */
export function dayOfWeekForKey(key: string): number {
  return keyToUtcDate(key).getUTCDay();
}

function addDaysToKey(key: string, days: number): string {
  return utcDateToKey(new Date(keyToUtcDate(key).getTime() + days * DAY_MS));
}

/** Whole calendar days from `fromKey` to `toKey` (positive when toKey later). */
function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcDate(toKey).getTime() - keyToUtcDate(fromKey).getTime()) / DAY_MS);
}

/**
 * Classify a user's availability relative to a session time window.
 *
 * Both windows are wall-clock "HH:MM" pairs on the same calendar day (team
 * timezone). A window whose end is at or before its start is treated as
 * crossing midnight (e.g. a 23:00 session that ends at 02:00). When the
 * session crosses midnight, the member window is also evaluated shifted a day
 * later, and the better classification wins — so "00:30–02:00" correctly
 * overlaps the tail of a 23:00–02:00 session.
 */
export function classifyAvailability(
  availStartTime: string,
  availEndTime: string,
  sessionStartTime: string,
  sessionEndTime: string
): AvailabilityType {
  const toMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const sessStart = toMinutes(sessionStartTime);
  let sessEnd = toMinutes(sessionEndTime);
  const sessionWraps = sessEnd <= sessStart;
  if (sessionWraps) sessEnd += 24 * 60;

  const availStart = toMinutes(availStartTime);
  let availEnd = toMinutes(availEndTime);
  if (availEnd <= availStart) availEnd += 24 * 60;

  const classify = (aStart: number, aEnd: number): AvailabilityType => {
    if (aEnd <= sessStart || aStart >= sessEnd) return "none";
    if (aStart <= sessStart && aEnd >= sessEnd) return "full";
    return "partial";
  };

  const direct = classify(availStart, availEnd);
  if (!sessionWraps || direct === "full") return direct;

  // Session crosses midnight: also try the member window on the "next day" side
  const shifted = classify(availStart + 24 * 60, availEnd + 24 * 60);
  const rank: Record<AvailabilityType, number> = { none: 0, partial: 1, full: 2 };
  return rank[shifted] > rank[direct] ? shifted : direct;
}

/**
 * Format a Date to "HH:MM" string (host-local — display helper only)
 */
export function formatTimeHHMM(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Format a Date to "YYYY-MM-DD" using host-local calendar fields.
 * Retained for client-side day-cell keys (which are host-local by design);
 * occurrence keys are NOT derived from this anymore — see zonedDateKey.
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse "HH:MM" time string and set it on a date (host-local; display only)
 */
export function setTimeFromString(date: Date, timeStr: string): Date {
  const result = new Date(date);
  const [hours, minutes] = timeStr.split(":").map(Number);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function getLastDayOfMonth(year: number, month0: number): number {
  // Day 0 of the next month == last day of this month (UTC calendar)
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * Generate session candidates based on team recurrence settings.
 *
 * All calendar decisions (which dates, occurrence keys, week parity) happen in
 * the TEAM's timezone; scheduledAt/endsAt are absolute instants. The same
 * inputs produce the same candidates on any host in any timezone.
 *
 * @param team The team with recurrence settings
 * @param fromDate Start generating from this instant
 * @param toDate Stop generating after this instant
 * @param overrides Session overrides to apply (optional)
 */
export function generateSessionCandidates(
  team: Team,
  fromDate: Date,
  toDate: Date,
  overrides?: SessionOverride[]
): SessionCandidate[] {
  const candidates: SessionCandidate[] = [];

  // Require recurrence settings
  if (!team.recurrenceFrequency || team.startTime == null) {
    return candidates;
  }

  const timezone = getTeamTimezone(team);
  const duration = team.defaultSessionDurationMinutes || 180; // Default 3 hours
  const startKey = zonedDateKey(fromDate, timezone);
  const endKey = zonedDateKey(toDate, timezone);

  // Build override lookup map by occurrenceKey
  const overrideMap = new Map<string, SessionOverride>();
  if (overrides) {
    for (const override of overrides) {
      overrideMap.set(override.occurrenceKey, override);
    }
  }

  const pushCandidate = (dateKey: string) => {
    const candidate = createCandidate(dateKey, team.startTime!, duration, timezone, overrideMap);
    if (candidate.scheduledAt >= fromDate) {
      candidates.push(candidate);
    }
  };

  /** First key >= startKey falling on the target weekday. */
  const firstOnWeekday = (targetDow: number): string => {
    const offset = (targetDow - dayOfWeekForKey(startKey) + 7) % 7;
    return addDaysToKey(startKey, offset);
  };

  switch (team.recurrenceFrequency) {
    case "weekly":
      if (team.dayOfWeek != null) {
        let currentKey = firstOnWeekday(team.dayOfWeek);
        while (currentKey <= endKey) {
          pushCandidate(currentKey);
          currentKey = addDaysToKey(currentKey, 7);
        }
      }
      break;

    case "biweekly":
      if (team.dayOfWeek != null && team.recurrenceAnchorDate) {
        const anchorKey = zonedDateKey(new Date(team.recurrenceAnchorDate), timezone);
        let currentKey = firstOnWeekday(team.dayOfWeek);

        // Calendar-day parity, immune to DST hour drift (audit S5)
        const isOnWeek = (key: string): boolean => {
          const weeks = Math.floor(daysBetweenKeys(anchorKey, key) / 7);
          return weeks >= 0 && weeks % 2 === 0;
        };

        if (!isOnWeek(currentKey)) {
          currentKey = addDaysToKey(currentKey, 7);
        }
        while (currentKey <= endKey) {
          if (isOnWeek(currentKey)) {
            pushCandidate(currentKey);
          }
          currentKey = addDaysToKey(currentKey, 14);
        }
      }
      break;

    case "monthly":
      if (team.daysOfMonth && team.daysOfMonth.length > 0) {
        let year = keyToUtcDate(startKey).getUTCFullYear();
        let month0 = keyToUtcDate(startKey).getUTCMonth();
        const endDate = keyToUtcDate(endKey);
        const seenKeys = new Set<string>();

        while (new Date(Date.UTC(year, month0, 1)) <= endDate) {
          const lastDay = getLastDayOfMonth(year, month0);

          for (const targetDay of team.daysOfMonth) {
            // Handle day overflow (e.g. day 31 in February clamps to the 28th)
            const actualDay = Math.min(targetDay, lastDay);
            const dateKey = utcDateToKey(new Date(Date.UTC(year, month0, actualDay)));

            // Two targets clamping to the same day (30 & 31 in Feb) must not
            // produce duplicate occurrenceKeys
            if (seenKeys.has(dateKey)) continue;
            seenKeys.add(dateKey);

            if (dateKey >= startKey && dateKey <= endKey) {
              pushCandidate(dateKey);
            }
          }

          month0++;
          if (month0 > 11) {
            month0 = 0;
            year++;
          }
        }
      }
      break;
  }

  // Sort by scheduled time
  candidates.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return candidates;
}

/**
 * Create a session candidate for a given team-timezone calendar date
 */
function createCandidate(
  dateKey: string,
  startTime: string,
  durationMinutes: number,
  timezone: string,
  overrideMap: Map<string, SessionOverride>
): SessionCandidate {
  const override = overrideMap.get(dateKey);

  let scheduledAt: Date;
  if (override?.scheduledAtOverride) {
    // Use the override time (already an absolute instant)
    scheduledAt = new Date(override.scheduledAtOverride);
  } else {
    // Wall-clock start time on this date in the team's timezone
    scheduledAt = instantAt(dateKey, startTime, timezone);
  }

  const endsAt = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);

  return {
    occurrenceKey: dateKey,
    scheduledAt,
    endsAt,
    isOverridden: !!override,
    status: override?.status || "scheduled",
  };
}

/**
 * Get session end time as "HH:MM" string. An end at or before the start means
 * the session crosses midnight — classifyAvailability understands that.
 */
export function getSessionEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
}
