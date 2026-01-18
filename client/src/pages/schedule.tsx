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
import type { Team, GameSession, Availability, TeamMember, AvailabilityStatus, User, UserAvailability, SessionOverride } from "@shared/schema";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import type { SessionCandidate, AvailabilityType } from "@shared/recurrence";
import { classifyAvailability, getSessionEndTime, formatDateKey } from "@shared/recurrence";
import { getTimezoneAbbreviation } from "@/components/timezone-select";
import AvailabilityPanel from "@/components/availability-panel";
import TeamAvailabilityList, { formatTimeWindow, type MemberAvailability } from "@/components/team-availability-list";
import SessionStatusControl from "@/components/session-status-control";
import { Separator } from "@/components/ui/separator";

interface SchedulePageProps {
  team: Team;
}

const AVAILABILITY_OPTIONS: { status: AvailabilityStatus; icon: typeof Check; label: string; color: string }[] = [
  { status: "available", icon: Check, label: "Available", color: "bg-green-500" },
  { status: "maybe", icon: HelpCircle, label: "Maybe", color: "bg-yellow-500" },
  { status: "busy", icon: X, label: "Busy", color: "bg-red-500" },
];

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

  const { data: availability } = useQuery<Availability[]>({
    queryKey: ["/api/teams", team.id, "availability"],
    enabled: !!team.id,
  });

  const { data: userProfile } = useQuery<User>({
    queryKey: ["/api/user/profile"],
  });

  const userTimezone = userProfile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const teamTimezone = team.timezone || "America/New_York";
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

  const updateAvailabilityMutation = useMutation({
    mutationFn: async ({ sessionId, status }: { sessionId: string; status: AvailabilityStatus }) => {
      const response = await apiRequest("POST", `/api/teams/${team.id}/sessions/${sessionId}/availability`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "availability"] });
      toast({ title: "Availability updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
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

  // User availability mutations (PRD-009)
  const createUserAvailabilityMutation = useMutation({
    mutationFn: async ({ date, startTime, endTime }: { date: Date; startTime: string; endTime: string }) => {
      const response = await apiRequest("POST", `/api/teams/${team.id}/user-availability`, {
        date: date.toISOString(),
        startTime,
        endTime,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "user-availability"] });
      setSelectedAvailabilityDate(null);
      toast({ title: "Availability saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save availability", description: error.message, variant: "destructive" });
    },
  });

  const updateUserAvailabilityMutation = useMutation({
    mutationFn: async ({ id, startTime, endTime }: { id: string; startTime: string; endTime: string }) => {
      const response = await apiRequest("PATCH", `/api/teams/${team.id}/user-availability/${id}`, {
        startTime,
        endTime,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "user-availability"] });
      setSelectedAvailabilityDate(null);
      toast({ title: "Availability updated" });
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

  const getSessionAvailability = (sessionId: string) => {
    return availability?.filter(a => a.sessionId === sessionId) || [];
  };

  const getMyAvailability = (sessionId: string) => {
    return availability?.find(a => a.sessionId === sessionId && a.userId === user?.id);
  };

  // Helper to get user availability for a specific day (PRD-009)
  const getUserAvailabilityForDay = (day: Date): UserAvailability | undefined => {
    return userAvailability?.find(ua => isSameDay(new Date(ua.date), day) && ua.userId === user?.id);
  };

  // Handle save availability
  const handleSaveAvailability = (data: { startTime: string; endTime: string }) => {
    if (!selectedAvailabilityDate) return;
    const existingAvail = getUserAvailabilityForDay(selectedAvailabilityDate);
    if (existingAvail) {
      updateUserAvailabilityMutation.mutate({ id: existingAvail.id, ...data });
    } else {
      createUserAvailabilityMutation.mutate({ date: selectedAvailabilityDate, ...data });
    }
  };

  // Handle delete availability
  const handleDeleteAvailability = () => {
    if (!selectedAvailabilityDate) return;
    const existingAvail = getUserAvailabilityForDay(selectedAvailabilityDate);
    if (existingAvail) {
      deleteUserAvailabilityMutation.mutate(existingAvail.id);
    }
  };

  // PRD-010A: Get DM user ID to exclude from attendance count
  const dmUserId = members?.find(m => m.role === "dm")?.userId;

  // PRD-010A: Get eligible attendees with Full/Partial classification for a session candidate
  const getEligibleAttendees = (candidate: SessionCandidate): { full: string[]; partial: string[]; total: number } => {
    const full: string[] = [];
    const partial: string[] = [];

    if (!userAvailability) return { full, partial, total: 0 };

    const sessionStart = new Date(candidate.scheduledAt);
    const sessionEnd = new Date(candidate.endsAt);
    const sessionStartTime = format(sessionStart, "HH:mm");
    const sessionEndTime = format(sessionEnd, "HH:mm");

    for (const ua of userAvailability) {
      // Skip DM availability in count
      if (ua.userId === dmUserId) continue;

      // Check if availability is on the same day
      if (!isSameDay(new Date(ua.date), sessionStart)) continue;

      const classification = classifyAvailability(
        ua.startTime,
        ua.endTime,
        sessionStartTime,
        sessionEndTime
      );

      if (classification === "full") {
        full.push(ua.userId);
      } else if (classification === "partial") {
        partial.push(ua.userId);
      }
    }

    return { full, partial, total: full.length + partial.length };
  };

  // PRD-010B: Check if DM has availability set for a given date
  const hasDmAvailabilityForDate = (date: Date): boolean => {
    if (!userAvailability || !dmUserId) return false;
    return userAvailability.some(
      ua => ua.userId === dmUserId && isSameDay(new Date(ua.date), date)
    );
  };

  // Get member availability for a session candidate (for the session availability modal)
  const getSessionMemberAvailability = (candidate: SessionCandidate): MemberAvailability[] => {
    if (!members) return [];

    const sessionStart = new Date(candidate.scheduledAt);
    const sessionEnd = new Date(candidate.endsAt);
    const sessionStartTime = format(sessionStart, "HH:mm");
    const sessionEndTime = format(sessionEnd, "HH:mm");
    const tzAbbr = getTimezoneAbbreviation(userTimezone);

    return members.map((member) => {
      const displayName = `${member.user?.firstName || ""} ${member.user?.lastName || ""}`.trim() || "Unknown";
      const ua = userAvailability?.find(
        (a) => a.userId === member.userId && isSameDay(new Date(a.date), sessionStart)
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

      const classification = classifyAvailability(
        ua.startTime,
        ua.endTime,
        sessionStartTime,
        sessionEndTime
      );

      return {
        userId: member.userId,
        displayName,
        profileImageUrl: member.user?.profileImageUrl,
        status: classification === "none" ? "no_response" as const : classification,
        timeWindow:
          classification !== "none"
            ? formatTimeWindow(ua.startTime, ua.endTime, tzAbbr)
            : undefined,
        isDM: member.role === "dm",
      };
    });
  };

  // Get member availability for a calendar date (for the calendar day hover)
  const getDayMemberAvailability = (day: Date): MemberAvailability[] => {
    if (!members) return [];

    const tzAbbr = getTimezoneAbbreviation(userTimezone);

    return members.map((member) => {
      const displayName = `${member.user?.firstName || ""} ${member.user?.lastName || ""}`.trim() || "Unknown";
      const ua = userAvailability?.find(
        (a) => a.userId === member.userId && isSameDay(new Date(a.date), day)
      );

      return {
        userId: member.userId,
        displayName,
        profileImageUrl: member.user?.profileImageUrl,
        status: ua ? "full" as const : "no_response" as const,
        timeWindow: ua ? formatTimeWindow(ua.startTime, ua.endTime, tzAbbr) : undefined,
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

  // PRD-014: Check if any team member has availability for a given day
  const hasTeamAvailabilityForDay = (day: Date): boolean => {
    if (!userAvailability) return false;
    return userAvailability.some(ua => isSameDay(new Date(ua.date), day));
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

      const eligible = getEligibleAttendees(c);
      const threshold = team.minAttendanceThreshold || 2;
      return isFuture && eligible.total >= threshold;
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
                  const isSelected = selectedAvailabilityDate && isSameDay(day, selectedAvailabilityDate);
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
                                  className="w-2 h-2 rounded-full bg-primary"
                                  title="You have availability set"
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
                    const eligible = getEligibleAttendees(candidate);
                    const threshold = team.minAttendanceThreshold || 2;
                    const hasPartials = eligible.partial.length > 0;

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
                                title={`${eligible.partial.length} member(s) have partial availability`}
                              >
                                Partial: {eligible.partial.length}
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
                            <span>{eligible.total} available ({eligible.full.length} full, {eligible.partial.length} partial)</span>
                            <span>Need {threshold}</span>
                          </div>
                          <Progress
                            value={(eligible.total / threshold) * 100}
                            className="h-1.5"
                          />
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
          {selectedSession && (
            <div className="space-y-6 py-4">
              <div>
                <Label className="mb-3 block">Your Availability</Label>
                <div className="flex gap-2">
                  {AVAILABILITY_OPTIONS.map(option => {
                    const myAvail = getMyAvailability(selectedSession.id);
                    const isSelected = myAvail?.status === option.status;
                    return (
                      <Button
                        key={option.status}
                        variant={isSelected ? "default" : "outline"}
                        className={isSelected ? option.color : ""}
                        onClick={() => updateAvailabilityMutation.mutate({
                          sessionId: selectedSession.id,
                          status: option.status,
                        })}
                        disabled={updateAvailabilityMutation.isPending}
                        data-testid={`avail-${option.status}`}
                      >
                        <option.icon className="h-4 w-4 mr-1" />
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Team Availability</Label>
                <div className="space-y-2">
                  {members?.map(member => {
                    const memberAvail = availability?.find(
                      a => a.sessionId === selectedSession.id && a.userId === member.userId
                    );
                    return (
                      <div 
                        key={member.id}
                        className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                      >
                        <span className="text-sm">
                          {member.user?.firstName} {member.user?.lastName}
                          {member.role === "dm" && (
                            <Badge variant="secondary" className="ml-2 text-xs">DM</Badge>
                          )}
                        </span>
                        {memberAvail ? (
                          <Badge 
                            variant="secondary"
                            className={`${
                              memberAvail.status === "available" ? "bg-green-500/10 text-green-500" :
                              memberAvail.status === "maybe" ? "bg-yellow-500/10 text-yellow-500" :
                              "bg-red-500/10 text-red-500"
                            }`}
                          >
                            {memberAvail.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not set</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedSession.notes && (
                <div>
                  <Label className="mb-2 block">Notes</Label>
                  <p className="text-sm text-muted-foreground">{selectedSession.notes}</p>
                </div>
              )}
            </div>
          )}
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
