/**
 * The availability reminder engine (scheduling audit stage 4, S3 — the
 * owner's core requirement).
 *
 * A week out from each session, determine whether everyone's availability is
 * in. If not: push-notify each member whose answer is missing, and send the
 * rest of the group one aggregated "still waiting on…" digest. Escalate at
 * T-3 and T-1, confirm the moment everyone has answered, warn the DM when the
 * threshold becomes mathematically unreachable, and send the game-day
 * confirmation from the original build directive.
 *
 * Design properties:
 *  - IDEMPOTENT: every send goes through deliverNotification's dedupeKey
 *    ledger, so the hourly sweep, the boot-time catch-up after downtime, and
 *    the event-driven checks can all overlap without double-sending.
 *  - TEAM-TIMEZONE AWARE: "a week out" and send-hours are computed on the
 *    team's clock (stage 1 groundwork); nudges show the session time in the
 *    recipient's own timezone when they've set one.
 *  - QUIET-HOURS SAFE: scheduled sends wait for a civil hour on the team's
 *    clock (10:00 for nudges/digests, 12:00 for game-day); event-driven
 *    notices (confirmed / unreachable / canceled / rescheduled) go out
 *    immediately because they answer a user action.
 *  - LADDER RESETS ON RESCHEDULE: dedupe keys include the occurrence's
 *    effective start instant, so moving a session re-opens its reminders.
 */
import { formatInTimeZone } from "date-fns-tz";
import type { IStorage } from "../storage";
import type { Team } from "@shared/schema";
import {
  generateSessionCandidates,
  getTeamTimezone,
  type SessionCandidate,
} from "@shared/recurrence";
import {
  computeAttendance,
  daysUntilCandidate,
  type AttendanceSummary,
} from "@shared/scheduling";
import { deliverNotification } from "../notifications";

export const REMINDER_STAGES = [
  { key: "t7", days: 7 },
  { key: "t3", days: 3 },
  { key: "t1", days: 1 },
] as const;

/** Team-local hour before which scheduled nudges/digests hold off */
export const NUDGE_SEND_HOUR = 10;
/** Team-local hour for the game-day confirmation (build directive §5) */
export const GAME_DAY_SEND_HOUR = 12;
/** How far ahead the sweep looks (covers T-7 with a day of slack) */
const HORIZON_DAYS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

interface MemberInfo {
  userId: string;
  role: string;
  displayName: string;
  notifyAvailabilityReminders: boolean;
  notifyGroupAwaiting: boolean;
  notifyGameDay: boolean;
}

export interface SweepSummary {
  teamsProcessed: number;
  notificationsSent: number;
}

function fmtDate(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "EEEE, MMM d");
}

function fmtTime(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "h:mm a");
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

async function loadMembers(storage: IStorage, teamId: string): Promise<MemberInfo[]> {
  const members = await storage.getTeamMembers(teamId);
  return members.map((m) => ({
    userId: m.userId,
    role: m.role,
    displayName:
      `${m.user?.firstName ?? ""} ${m.user?.lastName ?? ""}`.trim() || "A member",
    notifyAvailabilityReminders: m.notifyAvailabilityReminders ?? true,
    notifyGroupAwaiting: m.notifyGroupAwaiting ?? true,
    notifyGameDay: m.notifyGameDay ?? true,
  }));
}

/** The recipient's own timezone when set, else the team's (edge case 9). */
async function recipientTimezone(
  storage: IStorage,
  userId: string,
  teamTz: string
): Promise<string> {
  try {
    const user = await storage.getUser(userId);
    return user?.timezone || teamTz;
  } catch {
    return teamTz;
  }
}

interface OccurrenceContext {
  team: Team;
  timezone: string;
  candidate: SessionCandidate;
  attendance: AttendanceSummary;
  members: MemberInfo[];
  daysUntil: number;
  now: Date;
  sent: { count: number };
}

/** Ladder-scoped dedupe root: reschedules re-open the ladder (edge case 6). */
function occurrenceLedgerRoot(teamId: string, candidate: SessionCandidate): string {
  return `${teamId}:${candidate.occurrenceKey}:${candidate.scheduledAt.getTime()}`;
}

async function send(
  storage: IStorage,
  ctx: OccurrenceContext,
  input: Parameters<typeof deliverNotification>[1]
): Promise<void> {
  const result = await deliverNotification(storage, input);
  if (result.delivered) ctx.sent.count++;
}

/**
 * Which reminder stage this occurrence is currently in: the tightest stage
 * whose window contains daysUntil. An ad-hoc session created 2 days out goes
 * straight to t3 — earlier stages never fire late (edge case 7).
 */
export function currentStage(daysUntil: number): (typeof REMINDER_STAGES)[number] | null {
  let match: (typeof REMINDER_STAGES)[number] | null = null;
  for (const stage of REMINDER_STAGES) {
    if (daysUntil <= stage.days) match = stage;
  }
  return match;
}

async function processAvailabilityNudges(storage: IStorage, ctx: OccurrenceContext): Promise<void> {
  const stage = currentStage(ctx.daysUntil);
  if (!stage) return;
  if (ctx.attendance.noResponse.length === 0) return;

  const localHour = Number(formatInTimeZone(ctx.now, ctx.timezone, "H"));
  if (localHour < NUDGE_SEND_HOUR) return;

  const root = occurrenceLedgerRoot(ctx.team.id, ctx.candidate);

  for (const userId of ctx.attendance.noResponse) {
    const member = ctx.members.find((m) => m.userId === userId);
    if (!member || !member.notifyAvailabilityReminders) continue;

    const tz = await recipientTimezone(storage, userId, ctx.timezone);
    await send(storage, ctx, {
      userId,
      teamId: ctx.team.id,
      type: "availability_reminder",
      dedupeKey: `availability_reminder:${root}:${stage.key}:${userId}`,
      stage: stage.key,
      occurrenceKey: ctx.candidate.occurrenceKey,
      title: `Are you in for ${fmtDate(ctx.candidate.scheduledAt, tz)}?`,
      body: `${ctx.team.name} plays at ${fmtTime(ctx.candidate.scheduledAt, tz)} and the group needs your availability. Tap to answer.`,
      url: "/schedule",
    });
  }
}

async function processGroupDigest(storage: IStorage, ctx: OccurrenceContext): Promise<void> {
  const stage = currentStage(ctx.daysUntil);
  if (!stage) return;
  if (ctx.attendance.noResponse.length === 0) return;

  const localHour = Number(formatInTimeZone(ctx.now, ctx.timezone, "H"));
  if (localHour < NUDGE_SEND_HOUR) return;

  const laggardNames = ctx.attendance.noResponse
    .map((id) => ctx.members.find((m) => m.userId === id)?.displayName ?? "a member")
    .sort();
  const dateLabel = fmtDate(ctx.candidate.scheduledAt, ctx.timezone);
  const root = occurrenceLedgerRoot(ctx.team.id, ctx.candidate);

  // One digest per responder per stage (not per laggard, not per sweep) —
  // aggregated by design so a slow week never becomes notification spam
  const body = ctx.attendance.isEligible
    ? `${dateLabel} is on (${ctx.attendance.eligibleCount} in) — still waiting on ${listNames(laggardNames)}.`
    : `Still waiting on ${listNames(laggardNames)} for ${dateLabel}'s session.`;

  for (const member of ctx.members) {
    if (ctx.attendance.noResponse.includes(member.userId)) continue; // they get the nudge instead
    if (!member.notifyGroupAwaiting) continue;

    await send(storage, ctx, {
      userId: member.userId,
      teamId: ctx.team.id,
      type: "group_awaiting",
      dedupeKey: `group_awaiting:${root}:${stage.key}:${member.userId}`,
      stage: stage.key,
      occurrenceKey: ctx.candidate.occurrenceKey,
      title: `Awaiting availability for ${dateLabel}`,
      body,
      url: "/schedule",
    });
  }
}

async function processConfirmation(storage: IStorage, ctx: OccurrenceContext): Promise<void> {
  // "Everyone's in": every member answered AND the session clears the bar
  if (ctx.attendance.noResponse.length > 0) return;
  if (!ctx.attendance.isEligible) return;

  const root = occurrenceLedgerRoot(ctx.team.id, ctx.candidate);

  for (const member of ctx.members) {
    if (!member.notifyGroupAwaiting) continue;
    const tz = await recipientTimezone(storage, member.userId, ctx.timezone);
    await send(storage, ctx, {
      userId: member.userId,
      teamId: ctx.team.id,
      type: "session_confirmed",
      dedupeKey: `session_confirmed:${root}:${member.userId}`,
      occurrenceKey: ctx.candidate.occurrenceKey,
      title: "Everyone's in!",
      body: `${fmtDate(ctx.candidate.scheduledAt, tz)} at ${fmtTime(ctx.candidate.scheduledAt, tz)} is confirmed — ${ctx.attendance.eligibleCount} available.`,
      url: "/schedule",
    });
  }
}

async function processThresholdUnreachable(storage: IStorage, ctx: OccurrenceContext): Promise<void> {
  if (!ctx.attendance.thresholdUnreachable) return;

  const dm = ctx.members.find((m) => m.role === "dm");
  if (!dm) return;

  const root = occurrenceLedgerRoot(ctx.team.id, ctx.candidate);
  await send(storage, ctx, {
    userId: dm.userId,
    teamId: ctx.team.id,
    type: "threshold_unreachable",
    dedupeKey: `threshold_unreachable:${root}`,
    occurrenceKey: ctx.candidate.occurrenceKey,
    title: `${fmtDate(ctx.candidate.scheduledAt, ctx.timezone)} can't reach ${ctx.attendance.threshold} players`,
    body: `${ctx.attendance.unavailable.length} can't make it and the remaining members aren't enough. Consider rescheduling or canceling.`,
    url: "/schedule",
  });
}

async function processGameDay(storage: IStorage, ctx: OccurrenceContext): Promise<void> {
  if (ctx.daysUntil !== 0) return;
  if (!ctx.attendance.isEligible) return;

  const localHour = Number(formatInTimeZone(ctx.now, ctx.timezone, "H"));
  if (localHour < GAME_DAY_SEND_HOUR) return;

  const root = occurrenceLedgerRoot(ctx.team.id, ctx.candidate);

  for (const member of ctx.members) {
    if (!member.notifyGameDay) continue;
    const tz = await recipientTimezone(storage, member.userId, ctx.timezone);
    await send(storage, ctx, {
      userId: member.userId,
      teamId: ctx.team.id,
      type: "game_day",
      dedupeKey: `game_day:${root}:${member.userId}`,
      stage: "day0",
      occurrenceKey: ctx.candidate.occurrenceKey,
      title: "Game is on today!",
      body: `${ctx.team.name} plays today at ${fmtTime(ctx.candidate.scheduledAt, tz)} — ${ctx.attendance.eligibleCount} in.`,
      url: "/schedule",
    });
  }
}

async function buildOccurrenceContexts(
  storage: IStorage,
  team: Team,
  now: Date,
  sent: { count: number }
): Promise<OccurrenceContext[]> {
  const timezone = getTeamTimezone(team);
  const overrides = await storage.getSessionOverrides(team.id);
  const candidates = generateSessionCandidates(
    team,
    new Date(now.getTime() - DAY_MS), // small back-window so a rescheduled-earlier session is still seen
    new Date(now.getTime() + HORIZON_DAYS * DAY_MS),
    overrides
  );

  const members = await loadMembers(storage, team.id);
  if (members.length === 0) return [];

  const availabilityRows = await storage.getUserAvailability(
    team.id,
    new Date(now.getTime() - 2 * DAY_MS),
    new Date(now.getTime() + (HORIZON_DAYS + 2) * DAY_MS)
  );

  const contexts: OccurrenceContext[] = [];
  for (const candidate of candidates) {
    if (candidate.status === "canceled") continue; // edge case 5
    const daysUntil = daysUntilCandidate(candidate, now, team);
    if (daysUntil < 0 || daysUntil > HORIZON_DAYS) continue;
    // Session already over today? Skip once its end has passed.
    if (candidate.endsAt.getTime() < now.getTime()) continue;

    contexts.push({
      team,
      timezone,
      candidate,
      attendance: computeAttendance(candidate, members, availabilityRows, team),
      members,
      daysUntil,
      now,
      sent,
    });
  }
  return contexts;
}

/**
 * The scheduled sweep: hourly + on boot. Safe to run any number of times.
 */
export async function runReminderSweep(
  storage: IStorage,
  now: Date = new Date()
): Promise<SweepSummary> {
  const sent = { count: 0 };
  let teamsProcessed = 0;

  const teams = await storage.listTeamsWithRecurrence();
  for (const team of teams) {
    try {
      const contexts = await buildOccurrenceContexts(storage, team, now, sent);
      for (const ctx of contexts) {
        await processAvailabilityNudges(storage, ctx);
        await processGroupDigest(storage, ctx);
        await processConfirmation(storage, ctx);
        await processThresholdUnreachable(storage, ctx);
        await processGameDay(storage, ctx);
      }
      teamsProcessed++;
    } catch (error) {
      console.error(`Reminder sweep failed for team ${team.id}:`, error);
    }
  }

  return { teamsProcessed, notificationsSent: sent.count };
}

/**
 * Event-driven checks, run right after a member responds: the
 * "everyone's in" confirmation should land the moment the last answer
 * arrives, not at the next hourly tick — and a run of "can't make it"
 * answers should warn the DM immediately.
 */
export async function runEventChecksForTeam(
  storage: IStorage,
  teamId: string,
  now: Date = new Date()
): Promise<SweepSummary> {
  const sent = { count: 0 };
  const team = await storage.getTeam(teamId);
  if (!team || !team.recurrenceFrequency || !team.startTime) {
    return { teamsProcessed: 0, notificationsSent: 0 };
  }

  try {
    const contexts = await buildOccurrenceContexts(storage, team, now, sent);
    for (const ctx of contexts) {
      await processConfirmation(storage, ctx);
      await processThresholdUnreachable(storage, ctx);
    }
  } catch (error) {
    console.error(`Event checks failed for team ${teamId}:`, error);
  }

  return { teamsProcessed: 1, notificationsSent: sent.count };
}

/**
 * DM canceled or rescheduled an occurrence: tell the team now (edge cases
 * 5/6). Called from the session-override handler; the transition timestamp
 * in the dedupe key means each explicit DM action notifies exactly once,
 * while cancel → reinstate → cancel again still re-notifies.
 */
export async function notifyOccurrenceChanged(
  storage: IStorage,
  teamId: string,
  occurrenceKey: string,
  change: { kind: "canceled" | "rescheduled"; actorUserId: string; newTime?: Date; transitionAt: Date }
): Promise<void> {
  const team = await storage.getTeam(teamId);
  if (!team) return;
  const timezone = getTeamTimezone(team);
  const members = await loadMembers(storage, teamId);

  for (const member of members) {
    if (member.userId === change.actorUserId) continue; // the DM did it themselves
    if (!member.notifyGroupAwaiting) continue;

    const tz = await recipientTimezone(storage, member.userId, timezone);
    if (change.kind === "canceled") {
      await deliverNotification(storage, {
        userId: member.userId,
        teamId,
        type: "session_canceled",
        dedupeKey: `session_canceled:${teamId}:${occurrenceKey}:${change.transitionAt.getTime()}:${member.userId}`,
        occurrenceKey,
        title: "Session canceled",
        body: `The ${occurrenceKey} session for ${team.name} was canceled.`,
        url: "/schedule",
      });
    } else if (change.newTime) {
      await deliverNotification(storage, {
        userId: member.userId,
        teamId,
        type: "session_rescheduled",
        dedupeKey: `session_rescheduled:${teamId}:${occurrenceKey}:${change.newTime.getTime()}:${member.userId}`,
        occurrenceKey,
        title: "Session moved",
        body: `${team.name}'s ${occurrenceKey} session is now ${fmtDate(change.newTime, tz)} at ${fmtTime(change.newTime, tz)}.`,
        url: "/schedule",
      });
    }
  }
}

let sweepInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the hourly sweep + boot-time catch-up. Called from server/index.ts
 * (never from routes.ts, so the test process starts no timers).
 */
export function startReminderEngine(storage: IStorage): void {
  if (sweepInterval) return;
  if (process.env.DISABLE_REMINDER_ENGINE === "1") return;

  // Catch-up shortly after boot: the dedupe ledger makes this free when
  // nothing was missed (edge case 10)
  setTimeout(() => {
    runReminderSweep(storage).catch((err) => console.error("Reminder sweep failed:", err));
  }, 15_000);

  sweepInterval = setInterval(() => {
    runReminderSweep(storage).catch((err) => console.error("Reminder sweep failed:", err));
  }, 60 * 60 * 1000);
}
