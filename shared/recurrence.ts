import type { Team, SessionOverride, SessionStatus } from "./schema";

/**
 * Session candidate generated from team recurrence settings
 */
export interface SessionCandidate {
  occurrenceKey: string;      // Stable ID: "2026-01-24" (date string)
  scheduledAt: Date;          // Session start time
  endsAt: Date;               // Session end time (start + duration)
  isOverridden: boolean;      // Has DM override applied?
  status: SessionStatus;      // "scheduled" | "canceled"
}

/**
 * Availability classification relative to a session window
 */
export type AvailabilityType = "full" | "partial" | "none";

/**
 * Classify a user's availability relative to a session time window
 *
 * @param availStartTime User's availability start time in "HH:MM" format
 * @param availEndTime User's availability end time in "HH:MM" format
 * @param sessionStartTime Session start time in "HH:MM" format
 * @param sessionEndTime Session end time in "HH:MM" format
 * @returns "full" | "partial" | "none"
 */
export function classifyAvailability(
  availStartTime: string,
  availEndTime: string,
  sessionStartTime: string,
  sessionEndTime: string
): AvailabilityType {
  // Convert to minutes for easier comparison
  const toMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const availStart = toMinutes(availStartTime);
  const availEnd = toMinutes(availEndTime);
  const sessStart = toMinutes(sessionStartTime);
  const sessEnd = toMinutes(sessionEndTime);

  // No overlap: availability ends before session starts OR starts after session ends
  if (availEnd <= sessStart || availStart >= sessEnd) {
    return "none";
  }

  // Full coverage: availability starts at or before session AND ends at or after session
  if (availStart <= sessStart && availEnd >= sessEnd) {
    return "full";
  }

  // Partial overlap: overlaps but doesn't fully cover
  return "partial";
}

/**
 * Format a Date to "HH:MM" string
 */
export function formatTimeHHMM(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Format a Date to "YYYY-MM-DD" string for occurrence key
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse "HH:MM" time string and set it on a date
 */
export function setTimeFromString(date: Date, timeStr: string): Date {
  const result = new Date(date);
  const [hours, minutes] = timeStr.split(":").map(Number);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get the next occurrence of a specific day of the week on or after a given date
 *
 * @param fromDate Start searching from this date
 * @param targetDayOfWeek Target day of week (0 = Sunday, 6 = Saturday)
 */
function getNextDayOfWeek(fromDate: Date, targetDayOfWeek: number): Date {
  const result = new Date(fromDate);
  result.setHours(0, 0, 0, 0);
  const currentDay = result.getDay();
  const daysUntilTarget = (targetDayOfWeek - currentDay + 7) % 7;
  result.setDate(result.getDate() + daysUntilTarget);
  return result;
}

/**
 * Check if a date falls on the correct week for biweekly recurrence
 * Uses the anchor date to determine which weeks are "on" weeks
 */
function isCorrectBiweeklyWeek(date: Date, anchorDate: Date): boolean {
  // Calculate the number of weeks since the anchor date
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceAnchor = Math.floor(
    (date.getTime() - anchorDate.getTime()) / msPerWeek
  );
  // Even weeks from anchor are valid
  return weeksSinceAnchor >= 0 && weeksSinceAnchor % 2 === 0;
}

/**
 * Get the last day of a month
 */
function getLastDayOfMonth(year: number, month: number): number {
  // Create a date for the first of the next month, then go back one day
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Generate session candidates based on team recurrence settings
 *
 * @param team The team with recurrence settings
 * @param fromDate Start generating from this date
 * @param toDate Stop generating after this date
 * @param overrides Session overrides to apply (optional)
 * @returns Array of session candidates
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

  const duration = team.defaultSessionDurationMinutes || 180; // Default 3 hours

  // Build override lookup map by occurrenceKey
  const overrideMap = new Map<string, SessionOverride>();
  if (overrides) {
    for (const override of overrides) {
      overrideMap.set(override.occurrenceKey, override);
    }
  }

  switch (team.recurrenceFrequency) {
    case "weekly":
      if (team.dayOfWeek != null) {
        let current = getNextDayOfWeek(fromDate, team.dayOfWeek);

        while (current <= toDate) {
          const candidate = createCandidate(current, team.startTime, duration, overrideMap);
          if (candidate.scheduledAt >= fromDate) {
            candidates.push(candidate);
          }
          current = addDays(current, 7);
        }
      }
      break;

    case "biweekly":
      if (team.dayOfWeek != null && team.recurrenceAnchorDate) {
        let current = getNextDayOfWeek(fromDate, team.dayOfWeek);
        const anchorDate = new Date(team.recurrenceAnchorDate);
        anchorDate.setHours(0, 0, 0, 0);

        // If current date is not on a valid biweekly week, advance to the next valid week
        if (!isCorrectBiweeklyWeek(current, anchorDate)) {
          current = addDays(current, 7);
        }

        while (current <= toDate) {
          const candidate = createCandidate(current, team.startTime, duration, overrideMap);
          if (candidate.scheduledAt >= fromDate) {
            candidates.push(candidate);
          }
          current = addDays(current, 14);
        }
      }
      break;

    case "monthly":
      if (team.daysOfMonth && team.daysOfMonth.length > 0) {
        // Start from the month of fromDate
        let year = fromDate.getFullYear();
        let month = fromDate.getMonth();

        // Generate for each month in range
        while (new Date(year, month, 1) <= toDate) {
          const lastDay = getLastDayOfMonth(year, month);

          for (const targetDay of team.daysOfMonth) {
            // Handle day overflow (e.g., day 31 in February)
            const actualDay = Math.min(targetDay, lastDay);
            const date = new Date(year, month, actualDay);

            if (date >= fromDate && date <= toDate) {
              const candidate = createCandidate(date, team.startTime, duration, overrideMap);
              candidates.push(candidate);
            }
          }

          // Move to next month
          month++;
          if (month > 11) {
            month = 0;
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
 * Create a session candidate for a given date
 */
function createCandidate(
  date: Date,
  startTime: string,
  durationMinutes: number,
  overrideMap: Map<string, SessionOverride>
): SessionCandidate {
  const occurrenceKey = formatDateKey(date);
  const override = overrideMap.get(occurrenceKey);

  let scheduledAt: Date;
  if (override?.scheduledAtOverride) {
    // Use the override time
    scheduledAt = new Date(override.scheduledAtOverride);
  } else {
    // Use computed time from recurrence
    scheduledAt = setTimeFromString(date, startTime);
  }

  const endsAt = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);

  return {
    occurrenceKey,
    scheduledAt,
    endsAt,
    isOverridden: !!override,
    status: override?.status || "scheduled",
  };
}

/**
 * Get session end time as "HH:MM" string
 */
export function getSessionEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
}
