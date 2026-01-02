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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  Globe
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Team, GameSession, Availability, TeamMember, AvailabilityStatus, User } from "@shared/schema";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import { getTimezoneAbbreviation } from "@/components/timezone-select";

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

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getSessionsForDay = (day: Date) => {
    return sessions?.filter(s => isSameDay(new Date(s.scheduledAt), day)) || [];
  };

  const getSessionAvailability = (sessionId: string) => {
    return availability?.filter(a => a.sessionId === sessionId) || [];
  };

  const getMyAvailability = (sessionId: string) => {
    return availability?.find(a => a.sessionId === sessionId && a.userId === user?.id);
  };

  const upcomingSessions = sessions
    ?.filter(s => new Date(s.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

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
                  return (
                    <div
                      key={day.toISOString()}
                      className={`h-24 p-1 rounded-md border ${
                        isToday(day) 
                          ? "border-primary bg-primary/5" 
                          : "border-transparent hover:bg-muted/50"
                      }`}
                      data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
                    >
                      <div className={`text-sm mb-1 ${
                        !isSameMonth(day, currentMonth) ? "text-muted-foreground/50" : ""
                      }`}>
                        {format(day, "d")}
                      </div>
                      {hasSession && (
                        <div className="space-y-1">
                          {daySessions.map(session => (
                            <button
                              key={session.id}
                              onClick={() => setSelectedSession(session)}
                              className="w-full text-xs p-1 rounded bg-primary/10 text-primary font-medium truncate hover:bg-primary/20 transition-colors"
                              data-testid={`session-marker-${session.id}`}
                            >
                              {formatTimeInUserTimezone(new Date(session.scheduledAt), userTimezone)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
              {sessionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : upcomingSessions && upcomingSessions.length > 0 ? (
                <div className="space-y-3">
                  {upcomingSessions.slice(0, 5).map(session => {
                    const sessionAvail = getSessionAvailability(session.id);
                    const availableCount = sessionAvail.filter(a => a.status === "available").length;
                    const threshold = team.minAttendanceThreshold || 2;
                    const myAvail = getMyAvailability(session.id);
                    
                    return (
                      <button
                        key={session.id}
                        onClick={() => setSelectedSession(session)}
                        className="w-full p-3 rounded-md bg-muted/50 text-left hover-elevate transition-all"
                        data-testid={`upcoming-session-${session.id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium">
                              {formatDateTimeInUserTimezone(new Date(session.scheduledAt), userTimezone, "EEE, MMM d")}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatTimeInUserTimezone(new Date(session.scheduledAt), userTimezone)} {getTimezoneAbbreviation(userTimezone)}
                            </p>
                          </div>
                          {myAvail && (
                            <Badge 
                              variant="secondary"
                              className={`${
                                myAvail.status === "available" ? "bg-green-500/10 text-green-500" :
                                myAvail.status === "maybe" ? "bg-yellow-500/10 text-yellow-500" :
                                "bg-red-500/10 text-red-500"
                              }`}
                            >
                              {myAvail.status}
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{availableCount} available</span>
                            <span>Need {threshold}</span>
                          </div>
                          <Progress 
                            value={(availableCount / threshold) * 100} 
                            className="h-1.5"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No upcoming sessions</p>
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
    </div>
  );
}
