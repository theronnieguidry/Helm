import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar, 
  BookOpen, 
  Users, 
  Dices, 
  Plus, 
  Clock, 
  MapPin,
  User,
  ScrollText,
  Copy,
  Check
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Team, Note, GameSession, TeamMember, Invite, NoteType } from "@shared/schema";
import { TEAM_TYPE_LABELS } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";

interface DashboardContentProps {
  team: Team;
}

const NOTE_TYPE_ICONS: Record<NoteType, typeof MapPin> = {
  location: MapPin,
  character: User,
  npc: Users,
  poi: MapPin,
  quest: ScrollText,
};

const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  location: "bg-blue-500/10 text-blue-500",
  character: "bg-green-500/10 text-green-500",
  npc: "bg-orange-500/10 text-orange-500",
  poi: "bg-purple-500/10 text-purple-500",
  quest: "bg-red-500/10 text-red-500",
};

export default function DashboardContent({ team }: DashboardContentProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);

  const { data: notes, isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ["/api/teams", team.id, "notes"],
    enabled: !!team.id,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<GameSession[]>({
    queryKey: ["/api/teams", team.id, "sessions"],
    enabled: !!team.id,
  });

  const { data: members, isLoading: membersLoading } = useQuery<(TeamMember & { user?: { firstName?: string; lastName?: string; profileImageUrl?: string } })[]>({
    queryKey: ["/api/teams", team.id, "members"],
    enabled: !!team.id,
  });

  const { data: invites } = useQuery<Invite[]>({
    queryKey: ["/api/teams", team.id, "invites"],
    enabled: !!team.id,
  });

  const currentInvite = invites?.[0];
  const isDM = members?.find(m => m.userId === user?.id)?.role === "dm";

  const upcomingSessions = sessions
    ?.filter(s => new Date(s.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 3);

  const recentNotes = notes
    ?.filter(n => !n.isPrivate || n.authorId === user?.id)
    .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())
    .slice(0, 6);

  const copyInviteCode = async () => {
    if (currentInvite?.code) {
      await navigator.clipboard.writeText(currentInvite.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const getScheduleDescription = () => {
    if (!team.recurrenceFrequency) return "No schedule set";
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (team.recurrenceFrequency === "weekly" || team.recurrenceFrequency === "biweekly") {
      const day = days[team.dayOfWeek || 0];
      const freq = team.recurrenceFrequency === "weekly" ? "Every" : "Every other";
      return `${freq} ${day} at ${team.startTime || "TBD"}`;
    }
    if (team.recurrenceFrequency === "monthly" && team.daysOfMonth) {
      const ordinal = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      };
      const daysList = team.daysOfMonth.map(ordinal).join(", ");
      return `Monthly on the ${daysList} at ${team.startTime || "TBD"}`;
    }
    return "Schedule configured";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium">{team.name}</h1>
          <p className="text-muted-foreground">
            {TEAM_TYPE_LABELS[team.teamType as keyof typeof TEAM_TYPE_LABELS]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/notes")} variant="outline" data-testid="button-view-notes">
            <BookOpen className="h-4 w-4 mr-2" />
            Notes
          </Button>
          {team.diceMode !== "disabled" && (
            <Button onClick={() => navigate("/dice")} variant="outline" data-testid="button-roll-dice">
              <Dices className="h-4 w-4 mr-2" />
              Roll Dice
            </Button>
          )}
          <Button onClick={() => navigate("/notes?create=true")} data-testid="button-create-note">
            <Plus className="h-4 w-4 mr-2" />
            New Note
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Schedule</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{getScheduleDescription()}</p>
            {team.timezone && (
              <p className="text-sm text-muted-foreground mt-1">{team.timezone}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <p className="text-3xl font-medium">{members?.length || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {members?.filter(m => m.role === "dm").length || 0} DM, {members?.filter(m => m.role === "member").length || 0} players
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {notesLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <p className="text-3xl font-medium">{notes?.length || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {notes?.filter(n => !n.isPrivate).length || 0} shared, {notes?.filter(n => n.isPrivate && n.authorId === user?.id).length || 0} private
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Upcoming Sessions</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/schedule")} data-testid="button-view-schedule">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : upcomingSessions && upcomingSessions.length > 0 ? (
              <div className="space-y-3">
                {upcomingSessions.map(session => (
                  <div 
                    key={session.id} 
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                    data-testid={`session-${session.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {format(new Date(session.scheduledAt), "EEEE, MMMM d")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(session.scheduledAt), "h:mm a")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(session.scheduledAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No upcoming sessions</p>
                {isDM && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => navigate("/schedule")}
                    data-testid="button-schedule-session"
                  >
                    Schedule Session
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Recent Notes</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/notes")} data-testid="button-view-all-notes">
              View All
            </Button>
          </CardHeader>
          <CardContent>
            {notesLoading ? (
              <div className="grid gap-2 grid-cols-2">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : recentNotes && recentNotes.length > 0 ? (
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                {recentNotes.map(note => {
                  const Icon = NOTE_TYPE_ICONS[note.noteType as NoteType];
                  return (
                    <button
                      key={note.id}
                      onClick={() => navigate(`/notes/${note.id}`)}
                      className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-left hover-elevate active-elevate-2 transition-all"
                      data-testid={`note-${note.id}`}
                    >
                      <div className={`h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0 ${NOTE_TYPE_COLORS[note.noteType as NoteType]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{note.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {note.noteType}
                          </Badge>
                          {note.isPrivate && (
                            <Badge variant="outline" className="text-xs">Private</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No notes yet</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => navigate("/notes?create=true")}
                  data-testid="button-create-first-note"
                >
                  Create First Note
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isDM && currentInvite && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Invite Members</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/members")} data-testid="button-manage-members">
              Manage
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 p-4 rounded-md bg-muted/50">
                <p className="text-sm text-muted-foreground mb-2">Invite Code</p>
                <div className="flex items-center gap-2">
                  <code className="text-lg font-mono font-medium">{currentInvite.code}</code>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={copyInviteCode}
                    data-testid="button-copy-invite"
                  >
                    {copiedCode ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Expires {formatDistanceToNow(new Date(currentInvite.expiresAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
