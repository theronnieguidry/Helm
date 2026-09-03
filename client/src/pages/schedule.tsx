import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Calendar,
  Clock,
  Users,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  HelpCircle,
  Globe,
  Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Team, GameSession, TeamMember, User, UserAvailability, SessionOverride } from "@shared/schema";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import type { SessionCandidate } from "@shared/recurrence";
import { getTeamTimezone, zonedDateKey } from "@shared/recurrence";
import { formatInTimeZone } from "date-fns-tz";
import {
  availabilityDateKey,
  candidateDateKey,
  classifyRowForCandidate,
  computeAttendance,
} from "@shared/scheduling";
import { getTimezoneAbbreviation } from "@/components/timezone-select";
import { ToastAction } from "@/components/ui/toast";
import { enablePushNotifications, getNotificationPermission } from "@/lib/push";
import AvailabilityPanel, { type AvailabilityResponse } from "@/components/availability-panel";
import TeamAvailabilityList, { formatTimeWindow, type MemberAvailability } from "@/components/team-availability-list";
import SessionStatusControl from "@/components/session-status-control";
import { Separator } from "@/components/ui/separator";

interface SchedulePageProps {
  team: Team;
}

function formatTimeInUserTimezone(date: Date, userTimezone: string): string {
  try {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: userTimezone,
    });
  } catch {
    return format(date, "h:mm a");
  }
}

function formatDateTimeInUserTimezone(date: Date, userTimezone: string, formatStr: string): string {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: userTimezone,
    };
    
    if (formatStr.includes("EEE")) {
      options.weekday = "short";
    }
    if (formatStr.includes("MMM")) {
      options.month = "short";
    }
    if (formatStr.includes("d")) {
      options.day = "numeric";
    }
    
    return date.toLocaleDateString("en-US", options);
  } catch {
    return format(date, formatStr);
  }
}

export default function SchedulePage({ team }: SchedulePageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedSession, setSelectedSession] = useState<GameSession | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createData, setCreateData] = useState({
    date: "",
    time: team.startTime || "19:00",
    notes: "",
  });
  const [selectedAvailabilityDate, setSelectedAvailabilityDate] = useState<Date | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<SessionCandidate | null>(null);

  // PRD-010A: Fetch session candidates from recurrence instead of manually created sessions
  const candidatesStartDate = new Date();
  const candidatesEndDate = addMonths(candidatesStartDate, 2); // Look ahead 2 months

  const { data: candidatesData, isLoading: candidatesLoading } = useQuery<{ candidates: SessionCandidate[]; overrides: SessionOverride[] }>({
    queryKey: ["/api/teams", team.id, "session-candidates", format(candidatesStartDate, "yyyy-MM")],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/teams/${team.id}/session-candidates?startDate=${candidatesStartDate.toISOString()}&endDate=${candidatesEndDate.toISOString()}`
      );
      return res.json();
    },
    enabled: !!team.id && !!team.recurrenceFrequency,
  });

  // Keep old sessions query for manually created sessions
  const { data: sessions, isLoading: sessionsLoading } = useQuery<GameSession[]>({
    queryKey: ["/api/teams", team.id, "sessions"],
    enabled: !!team.id,
  });

  const { data: members } = useQuery<(TeamMember & { user?: { firstName?: string; lastName?: string; profileImageUrl?: string } })[]>({
    queryKey: ["/api/teams", team.id, "members"],
    enabled: !!team.id,
  });

  const { data: userProfile } = useQuery<User>({
    queryKey: ["/api/user/profile"],
  });

  const userTimezone = userProfile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const teamTimezone = getTeamTimezone(team);
  const timezonesMatch = userTimezone === teamTimezone;

  const isDM = members?.find(m => m.userId === user?.id)?.role === "dm";

  const createSessionMutation = useMutation({
    mutationFn: async (data: typeof createData) => {
      const scheduledAt = new Date(`${data.date}T${data.time}`);
      const response = await apiRequest("POST", `/api/teams/${team.id}/sessions`, {
        scheduledAt: scheduledAt.toISOString(),
        isOverride: true,
        notes: data.notes || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "sessions"] });
      setIsCreateOpen(false);
      setCreateData({ date: "", time: team.startTime || "19:00", notes: "" });
      toast({ title: "Session created", description: "The game session has been scheduled." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create session", description: error.message, variant: "destructive" });
    },
  });

  // PRD-010: Session status mutation (for manually created sessions)
  const updateSessionStatusMutation = useMutation({
    mutationFn: async ({ sessionId, status }: { sessionId: string; status: "scheduled" | "canceled" }) => {
      const response = await apiRequest("PATCH", `/api/teams/${team.id}/sessions/${sessionId}`, { status });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "sessions"] });
      toast({ title: variables.status === "canceled" ? "Session canceled" : "Session reinstated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update session", description: error.message, variant: "destructive" });
    },
  });

  // PRD-010A: Session override mutation (for auto-generated candidates)
  const updateSessionOverrideMutation = useMutation({
    mutationFn: async ({ occurrenceKey, status, scheduledAtOverride }: { occurrenceKey: string; status?: "scheduled" | "canceled"; scheduledAtOverride?: string }) => {
      const response = await apiRequest("POST", `/api/teams/${team.id}/session-overrides`, {
        occurrenceKey,
        status,
        scheduledAtOverride,
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "session-candidates"] });
      toast({ title: variables.status === "canceled" ? "Session canceled" : "Session updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update session", description: error.message, variant: "destructive" });
    },
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // User availability query (PRD-009, PRD-012: fetch 2 months ahead to match session candidates)
  const { data: userAvailability } = useQuery<UserAvailability[]>({
    queryKey: ["/api/teams", team.id, "user-availability", format(candidatesStartDate, "yyyy-MM")],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/teams/${team.id}/user-availability?startDate=${candidatesStartDate.toISOString()}&endDate=${candidatesEndDate.toISOString()}`
      );
      return res.json();
    },
    enabled: !!team.id,
  });

  // User availability mutations (PRD-009; stage 2: responses carry a status
  // and dates travel as plain calendar-date keys, normalized server-side)
  const createUserAvailabilityMutation = useMutation({
    mutationFn: async ({ dateKey, response }: { dateKey: string; response: AvailabilityResponse }) => {
      const res = await apiRequest("POST", `/api/teams/${team.id}/user-availability`, {
        date: dateKey,
        ...response,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "user-availability"] });
      setSelectedAvailabilityDate(null);
      // Stage 3: contextual permission ask — right after the member engages
      // with availability, never on page load
      if (getNotificationPermission() === "default") {
        toast({
          title: "Response saved",
          description: "Want a reminder when the group needs your answer?",
          action: (
            <ToastAction
              altText="Enable notifications"
              onClick={() => {
                enablePushNotifications().then((result) => {
                  if (result === "subscribed") {
                    toast({ title: "Notifications enabled on this device" });
                  }
                });
              }}
            >
              Enable
            </ToastAction>
          ),
        });
      } else {
        toast({ title: "Response saved" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save availability", description: error.message, variant: "destructive" });
    },
  });

  const updateUserAvailabilityMutation = useMutation({
    mutationFn: async ({ id, response }: { id: string; response: AvailabilityResponse }) => {
      const res = await apiRequest("PATCH", `/api/teams/${team.id}/user-availability/${id}`, response);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "user-availability"] });
      setSelectedAvailabilityDate(null);
      toast({ title: "Response updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update availability", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserAvailabilityMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/teams/${team.id}/user-availability/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "user-availability"] });
      setSelectedAvailabilityDate(null);
      toast({ title: "Availability deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete availability", description: error.message, variant: "destructive" });
    },
  });

  const getSessionsForDay = (day: Date) => {
    return sessions?.filter(s => isSameDay(new Date(s.scheduledAt), day)) || [];
  };

  // Availability rows match by calendar-date key (audit S5): robust across
  // browser timezones and both storage generations.
  const getMyResponseForDateKey = (dateKey: string): UserAvailability | undefined => {
    return userAvailability?.find(
      ua => ua.userId === user?.id && availabilityDateKey(ua) === dateKey
    );
  };

  // Helper to get user availability for a specific calendar day (PRD-009)
  const getUserAvailabilityForDay = (day: Date): UserAvailability | undefined => {
    return getMyResponseForDateKey(format(day, "yyyy-MM-dd"));
  };

  // Save/delete a response for an arbitrary calendar-date key (used by both
  // the calendar popover and the manual-session dialog)
  const saveResponseForDateKey = (dateKey: string, response: AvailabilityResponse) => {
    const existing = getMyResponseForDateKey(dateKey);
    if (existing) {
      updateUserAvailabilityMutation.mutate({ id: existing.id, response });
    } else {
      createUserAvailabilityMutation.mutate({ dateKey, response });
    }
  };

  const deleteResponseForDateKey = (dateKey: string) => {
    const existing = getMyResponseForDateKey(dateKey);
    if (existing) {
      deleteUserAvailabilityMutation.mutate(existing.id);
    }
  };

  // Handle save availability from the calendar popover
  const handleSaveAvailability = (data: AvailabilityResponse) => {
    if (!selectedAvailabilityDate) return;
    saveResponseForDateKey(format(selectedAvailabilityDate, "yyyy-MM-dd"), data);
  };

  // Handle delete availability
  const handleDeleteAvailability = () => {
    if (!selectedAvailabilityDate) return;
    deleteResponseForDateKey(format(selectedAvailabilityDate, "yyyy-MM-dd"));
  };

  // PRD-010A: Get DM user ID (excluded from attendance count)
  const dmUserId = members?.find(m => m.role === "dm")?.userId;

  // PRD-010A + audit S4: attendance math now comes from shared/scheduling.ts —
  // the same code the server-side reminder engine runs
  const getAttendance = (candidate: SessionCandidate) => {
    return computeAttendance(candidate, members ?? [], userAvailability ?? [], team);
  };

  // A manual session viewed through the candidate lens, so both session kinds
  // share one availability model (audit S13)
  const sessionToCandidate = (session: GameSession): SessionCandidate => {
    const scheduledAt = new Date(session.scheduledAt);
    const duration = team.defaultSessionDurationMinutes || 180;
    return {
      occurrenceKey: zonedDateKey(scheduledAt, teamTimezone),
      scheduledAt,
      endsAt: new Date(scheduledAt.getTime() + duration * 60 * 1000),
      isOverridden: true,
      status: session.status ?? "scheduled",
    };
  };

  // Wall-clock HH:MM of an instant in the TEAM timezone (windows are team-time)
  const sessionWallTime = (instant: Date): string =>
    formatInTimeZone(instant, teamTimezone, "HH:mm");

  // PRD-010B: Check if DM has availability set for a given date
  const hasDmAvailabilityForDate = (date: Date): boolean => {
    if (!userAvailability || !dmUserId) return false;
    const dateKey = format(date, "yyyy-MM-dd");
    return userAvailability.some(
      ua => ua.userId === dmUserId && availabilityDateKey(ua) === dateKey
    );
  };

  // Get member availability for a session candidate (for the session availability modal).
  // Windows are team-timezone times, so they're labeled with the TEAM zone.
  const getSessionMemberAvailability = (candidate: SessionCandidate): MemberAvailability[] => {
    if (!members) return [];

    const dateKey = candidateDateKey(candidate, team);
    const tzAbbr = getTimezoneAbbreviation(teamTimezone);

    return members.map((member) => {
      const displayName = `${member.user?.firstName || ""} ${member.user?.lastName || ""}`.trim() || "Unknown";
      const ua = userAvailability?.find(
        (a) => a.userId === member.userId && availabilityDateKey(a) === dateKey
      );

      if (!ua) {
        return {
          userId: member.userId,
          displayName,
          profileImageUrl: member.user?.profileImageUrl,
          status: "no_response" as const,
          isDM: member.role === "dm",
        };
      }

      const classification = classifyRowForCandidate(ua, candidate, team);

      if (classification === "unavailable") {
        return {
          userId: member.userId,
          displayName,
          profileImageUrl: member.user?.profileImageUrl,
          status: "unavailable" as const,
          isDM: member.role === "dm",
        };
      }

      return {
        userId: member.userId,
        displayName,
        profileImageUrl: member.user?.profileImageUrl,
        // A window that misses the session entirely reads as "can't make it",
        // with the window shown so the group sees when they ARE around
        status: classification === "none" ? ("unavailable" as const) : classification,
        timeWindow: ua.startTime && ua.endTime
          ? formatTimeWindow(ua.startTime, ua.endTime, tzAbbr)
          : undefined,
        isDM: member.role === "dm",
      };
    });
  };

  // Get member availability for a calendar date (for the calendar day hover).
  // No session window on a bare date — a time window shows as available.
  const getDayMemberAvailability = (day: Date): MemberAvailability[] => {
    if (!members) return [];

    const dateKey = format(day, "yyyy-MM-dd");
    const tzAbbr = getTimezoneAbbreviation(teamTimezone);

    return members.map((member) => {
      const displayName = `${member.user?.firstName || ""} ${member.user?.lastName || ""}`.trim() || "Unknown";
      const ua = userAvailability?.find(
        (a) => a.userId === member.userId && availabilityDateKey(a) === dateKey
      );

      const status = !ua
        ? ("no_response" as const)
        : ua.status === "unavailable"
        ? ("unavailable" as const)
        : ("full" as const);

      return {
        userId: member.userId,
        displayName,
        profileImageUrl: member.user?.profileImageUrl,
        status,
        timeWindow:
          ua && ua.status !== "unavailable" && ua.startTime && ua.endTime
            ? formatTimeWindow(ua.startTime, ua.endTime, tzAbbr)
            : undefined,
        isDM: member.role === "dm",
      };
    });
  };

  // PRD-013: Get session candidate for a specific day (recurrence-based)
  const getCandidateForDay = (day: Date): SessionCandidate | undefined => {
    return candidatesData?.candidates?.find(c =>
      isSameDay(new Date(c.scheduledAt), day)
    );
  };

  // PRD-013: Get manual session for a specific day
  const getManualSessionForDay = (day: Date): GameSession | undefined => {
    return sessions?.find(s =>
      isSameDay(new Date(s.scheduledAt), day) && s.isOverride
    );
  };

  // PRD-013: Handle session status toggle from calendar popover
  const handleToggleSessionStatus = (params: {
    type: "override" | "manual";
    occurrenceKey?: string;
    sessionId?: string;
    newStatus: "scheduled" | "canceled";
  }) => {
    if (params.type === "override" && params.occurrenceKey) {
      updateSessionOverrideMutation.mutate({
        occurrenceKey: params.occurrenceKey,
        status: params.newStatus,
      });
    } else if (params.type === "manual" && params.sessionId) {
      updateSessionStatusMutation.mutate({
        sessionId: params.sessionId,
        status: params.newStatus,
      });
    }
  };

  // PRD-014: Check if any team member has responded for a given day
  const hasTeamAvailabilityForDay = (day: Date): boolean => {
    if (!userAvailability) return false;
    const dateKey = format(day, "yyyy-MM-dd");
    return userAvailability.some(ua => availabilityDateKey(ua) === dateKey);
  };

  // PRD-010B: Filter and compute upcoming session candidates
  // - DM sees all sessions (scheduled AND canceled) when they have availability
  // - Members only see scheduled sessions that meet threshold
  const upcomingCandidates = candidatesData?.candidates
    ?.filter(c => {
      const isFuture = new Date(c.scheduledAt) > new Date();
      const isScheduled = c.status === "scheduled";

      // DM sees all sessions (scheduled AND canceled)
      if (isDM) {
        // Dev mode: DM must have availability set
        if (import.meta.env.DEV) {
          return isFuture && hasDmAvailabilityForDate(new Date(c.scheduledAt));
        }
        // Production: show all future sessions regardless of status
        return isFuture;
      }

      // Non-DM members: only scheduled sessions that meet threshold
      if (!isScheduled) return false;

      return isFuture && getAttendance(c).isEligible;
    })
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium">Schedule</h1>
          <p className="text-muted-foreground">
            Manage your game sessions and availability
          </p>
        </div>
        {isDM && (
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-session">
            <Plus className="h-4 w-4 mr-2" />
            Schedule Session
          </Button>
        )}
      </div>

      {!timezonesMatch && (
        <div className="mb-6 p-3 rounded-md bg-muted/50 border flex items-center gap-3">
          <Globe className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="text-sm">
            <span className="font-medium">Times shown in your timezone</span>
            <span className="text-muted-foreground"> ({getTimezoneAbbreviation(userTimezone)}). </span>
            <span className="text-muted-foreground">Group schedule is set in {getTimezoneAbbreviation(teamTimezone)}.</span>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {format(currentMonth, "MMMM yyyy")}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  data-testid="button-prev-month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  data-testid="button-next-month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Click a day to add your availability
              </p>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-24" />
                ))}
                {days.map(day => {
                  const daySessions = getSessionsForDay(day);
                  const hasSession = daySessions.length > 0;
                  const dayUserAvailability = getUserAvailabilityForDay(day);
                  const isSelected = !!selectedAvailabilityDate && isSameDay(day, selectedAvailabilityDate);
                  // PRD-013: Get recurrence candidate for the day
                  const dayCandidate = getCandidateForDay(day);
                  const hasCandidateSession = !!dayCandidate;
                  const isCandidateCanceled = dayCandidate?.status === "canceled";
                  return (
                    <Popover
                      key={day.toISOString()}
                      open={isSelected}
                      onOpenChange={(open) => {
                        if (!open) setSelectedAvailabilityDate(null);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <div
                          onClick={() => setSelectedAvailabilityDate(day)}
                          className={`h-24 p-1 rounded-md border cursor-pointer transition-colors ${
                            isToday(day)
                              ? "border-primary bg-primary/5"
                              : isSelected
                              ? "border-primary bg-primary/5"
                              : "border-transparent hover:bg-muted/50"
                          }`}
                          data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className={`text-sm ${
                              !isSameMonth(day, currentMonth) ? "text-muted-foreground/50" : ""
                            }`}>
                              {format(day, "d")}
                            </div>
                            <div className="flex items-center gap-1">
                              {dayUserAvailability && (
                                <div
                                  className={cn(
                                    "w-2 h-2 rounded-full",
                                    dayUserAvailability.status === "unavailable"
                                      ? "bg-red-500"
                                      : "bg-primary"
                                  )}
                                  title={
                                    dayUserAvailability.status === "unavailable"
                                      ? "You marked yourself unavailable"
                                      : "You have availability set"
                                  }
                                />
                              )}
                              {/* PRD-014: Only show info icon when team has availability */}
                              {hasTeamAvailabilityForDay(day) && (
                                <HoverCard openDelay={200}>
                                  <HoverCardTrigger asChild>
                                    <button
                                      type="button"
                                      className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label={`View team availability for ${format(day, "MMMM d")}`}
                                    >
                                      <Info className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                    </button>
                                  </HoverCardTrigger>
                                  <HoverCardContent align="start" className="w-72">
                                    <h4 className="font-medium mb-1">{format(day, "EEEE, MMM d")}</h4>
                                    <p className="text-xs text-muted-foreground mb-3">Team availability for this date</p>
                                    <TeamAvailabilityList
                                      members={getDayMemberAvailability(day)}
                                      compact
                                    />
                                  </HoverCardContent>
                                </HoverCard>
                              )}
                            </div>
                          </div>
                          {/* PRD-013: Show recurrence session indicator */}
                          {hasCandidateSession && (
                            <div className="mt-1">
                              <div
                                className={cn(
                                  "w-full text-xs p-1 rounded font-medium truncate",
                                  isCandidateCanceled
                                    ? "bg-red-500/10 text-red-500/70 line-through"
                                    : "bg-primary/10 text-primary"
                                )}
                                data-testid={`candidate-marker-${dayCandidate.occurrenceKey}`}
                              >
                                {formatTimeInUserTimezone(new Date(dayCandidate.scheduledAt), userTimezone)}
                                {isCandidateCanceled && " (canceled)"}
                              </div>
                            </div>
                          )}
                          {/* Manual sessions (one-off) */}
                          {hasSession && (
                            <div className="space-y-1 mt-1">
                              {daySessions.map(session => (
                                <button
                                  key={session.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSession(session);
                                  }}
                                  className="w-full text-xs p-1 rounded bg-primary/10 text-primary font-medium truncate hover:bg-primary/20 transition-colors"
                                  data-testid={`session-marker-${session.id}`}
                                >
                                  {formatTimeInUserTimezone(new Date(session.scheduledAt), userTimezone)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" align="start">
                        {/* PRD-013: Session status control for DMs */}
                        {isDM && (getCandidateForDay(day) || getManualSessionForDay(day)) && (
                          <>
                            <SessionStatusControl
                              candidate={getCandidateForDay(day)}
                              session={getManualSessionForDay(day)}
                              userTimezone={userTimezone}
                              onToggle={handleToggleSessionStatus}
                              isPending={
                                updateSessionOverrideMutation.isPending ||
                                updateSessionStatusMutation.isPending
                              }
                            />
                            <Separator className="my-4" />
                          </>
                        )}
                        <AvailabilityPanel
                          team={team}
                          selectedDate={day}
                          existingAvailability={dayUserAvailability}
                          onSave={handleSaveAvailability}
                          onDelete={dayUserAvailability ? handleDeleteAvailability : undefined}
                          onClose={() => setSelectedAvailabilityDate(null)}
                          isPending={
                            createUserAvailabilityMutation.isPending ||
                            updateUserAvailabilityMutation.isPending ||
                            deleteUserAvailabilityMutation.isPending
                          }
                        />
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Upcoming Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {candidatesLoading || sessionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : upcomingCandidates && upcomingCandidates.length > 0 ? (
                <div className="space-y-3">
                  {upcomingCandidates.map(candidate => {
                    const attendance = getAttendance(candidate);
                    const threshold = attendance.threshold;
                    const hasPartials = attendance.partial.length > 0;
                    const awaitingCount = attendance.noResponse.length;

                    const isCanceled = candidate.status === "canceled";

                    return (
                      <button
                        key={candidate.occurrenceKey}
                        type="button"
                        onClick={() => setSelectedCandidate(candidate)}
                        className={cn(
                          "w-full p-3 rounded-md transition-all text-left cursor-pointer",
                          isCanceled
                            ? "bg-muted/30 opacity-60"
                            : "bg-muted/50 hover-elevate hover:bg-muted/70"
                        )}
                        data-testid={`upcoming-candidate-${candidate.occurrenceKey}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className={cn(
                                "font-medium",
                                isCanceled && "line-through text-muted-foreground"
                              )}>
                                {formatDateTimeInUserTimezone(new Date(candidate.scheduledAt), userTimezone, "EEE, MMM d")}
                              </p>
                              {isCanceled && (
                                <Badge variant="outline" className="text-red-500 border-red-500/30">
                                  Canceled
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formatTimeInUserTimezone(new Date(candidate.scheduledAt), userTimezone)} {getTimezoneAbbreviation(userTimezone)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* PRD-010A: Partial availability indicator */}
                            {hasPartials && (
                              <Badge
                                variant="outline"
                                className="text-yellow-600 border-yellow-500/30"
                                title={`${attendance.partial.length} member(s) have partial availability`}
                              >
                                Partial: {attendance.partial.length}
                              </Badge>
                            )}
                            {/* PRD-010B: DM Session Status Toggle */}
                            {isDM && (
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Switch
                                  checked={candidate.status === "scheduled"}
                                  onCheckedChange={(checked) => {
                                    updateSessionOverrideMutation.mutate({
                                      occurrenceKey: candidate.occurrenceKey,
                                      status: checked ? "scheduled" : "canceled"
                                    });
                                  }}
                                  disabled={updateSessionOverrideMutation.isPending}
                                  data-testid={`candidate-toggle-${candidate.occurrenceKey}`}
                                />
                                <Label className="text-xs">
                                  {candidate.status === "scheduled" ? "Scheduled" : "Canceled"}
                                </Label>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{attendance.eligibleCount} available ({attendance.full.length} full, {attendance.partial.length} partial)</span>
                            <span>Need {threshold}</span>
                          </div>
                          <Progress
                            value={(attendance.eligibleCount / threshold) * 100}
                            className="h-1.5"
                          />
                          {/* Audit S1: silence and "no" are different — say whose answer is outstanding */}
                          {!isCanceled && awaitingCount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Awaiting {awaitingCount} response{awaitingCount === 1 ? "" : "s"}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : team.recurrenceFrequency ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No upcoming sessions meet threshold</p>
                  <p className="text-xs mt-1">Add availability to see sessions</p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No schedule configured</p>
                  <p className="text-xs mt-1">Set a regular schedule in Settings</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Regular Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              {team.recurrenceFrequency ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="capitalize">{team.recurrenceFrequency}</span>
                  </div>
                  {(team.recurrenceFrequency === "weekly" || team.recurrenceFrequency === "biweekly") && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][team.dayOfWeek || 0]}
                      </span>
                    </div>
                  )}
                  {team.startTime && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{team.startTime}</span>
                    </div>
                  )}
                  {teamTimezone && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{getTimezoneAbbreviation(teamTimezone)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No regular schedule set</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!selectedSession} onOpenChange={(open) => !open && setSelectedSession(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedSession && format(new Date(selectedSession.scheduledAt), "EEEE, MMMM d")}
            </DialogTitle>
            <DialogDescription>
              {selectedSession && format(new Date(selectedSession.scheduledAt), "h:mm a")}
            </DialogDescription>
          </DialogHeader>
          {selectedSession && (() => {
            // Stage 2 (audit S13): manual sessions now use the same date-based
            // response model as recurrence candidates — the legacy tri-state
            // table has no remaining writers.
            const pseudoCandidate = sessionToCandidate(selectedSession);
            const dateKey = candidateDateKey(pseudoCandidate, team);
            const myResponse = getMyResponseForDateKey(dateKey);
            const responsePending =
              createUserAvailabilityMutation.isPending ||
              updateUserAvailabilityMutation.isPending ||
              deleteUserAvailabilityMutation.isPending;
            return (
              <div className="space-y-6 py-4">
                <div>
                  <Label className="mb-3 block">Your Availability</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={myResponse?.status === "available" ? "default" : "outline"}
                      className={myResponse?.status === "available" ? "bg-green-500" : ""}
                      onClick={() =>
                        saveResponseForDateKey(dateKey, {
                          status: "available",
                          startTime: sessionWallTime(pseudoCandidate.scheduledAt),
                          endTime: sessionWallTime(pseudoCandidate.endsAt),
                        })
                      }
                      disabled={responsePending}
                      data-testid="avail-available"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Available
                    </Button>
                    <Button
                      variant={myResponse?.status === "unavailable" ? "default" : "outline"}
                      className={myResponse?.status === "unavailable" ? "bg-red-500" : ""}
                      onClick={() => saveResponseForDateKey(dateKey, { status: "unavailable" })}
                      disabled={responsePending}
                      data-testid="avail-busy"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Can't make it
                    </Button>
                    {myResponse && (
                      <Button
                        variant="ghost"
                        onClick={() => deleteResponseForDateKey(dateKey)}
                        disabled={responsePending}
                        data-testid="avail-clear"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="mb-3 block">Team Availability</Label>
                  <TeamAvailabilityList members={getSessionMemberAvailability(pseudoCandidate)} />
                </div>

                {selectedSession.notes && (
                  <div>
                    <Label className="mb-2 block">Notes</Label>
                    <p className="text-sm text-muted-foreground">{selectedSession.notes}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Session</DialogTitle>
            <DialogDescription>
              Create a one-time game session
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={createData.date}
                onChange={(e) => setCreateData({ ...createData, date: e.target.value })}
                data-testid="input-session-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={createData.time}
                onChange={(e) => setCreateData({ ...createData, time: e.target.value })}
                data-testid="input-session-time"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes for this session..."
                value={createData.notes}
                onChange={(e) => setCreateData({ ...createData, notes: e.target.value })}
                data-testid="textarea-session-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} data-testid="button-cancel-session">
              Cancel
            </Button>
            <Button 
              onClick={() => createSessionMutation.mutate(createData)}
              disabled={!createData.date || createSessionMutation.isPending}
              data-testid="button-save-session"
            >
              {createSessionMutation.isPending ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Candidate Availability Modal */}
      <Dialog open={!!selectedCandidate} onOpenChange={(open) => !open && setSelectedCandidate(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedCandidate && formatDateTimeInUserTimezone(new Date(selectedCandidate.scheduledAt), userTimezone, "EEEE, MMMM d")}
            </DialogTitle>
            <DialogDescription>
              {selectedCandidate && (
                <>
                  {formatTimeInUserTimezone(new Date(selectedCandidate.scheduledAt), userTimezone)}
                  {" - "}
                  {formatTimeInUserTimezone(new Date(selectedCandidate.endsAt), userTimezone)}
                  {" "}
                  {getTimezoneAbbreviation(userTimezone)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedCandidate && (
            <div className="py-4">
              <TeamAvailabilityList
                members={getSessionMemberAvailability(selectedCandidate)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
