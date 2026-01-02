import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Settings as SettingsIcon,
  Save,
  Trash2,
  Dices,
  Calendar,
  Clock,
  Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Team, TeamMember, RecurrenceFrequency, DiceMode } from "@shared/schema";
import { TEAM_TYPE_LABELS, RECURRENCE_FREQUENCIES, DICE_MODES } from "@shared/schema";

interface SettingsPageProps {
  team: Team;
  onTeamUpdate: (team: Team) => void;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage({ team, onTeamUpdate }: SettingsPageProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: team.name,
    recurrenceFrequency: team.recurrenceFrequency || "",
    dayOfWeek: team.dayOfWeek ?? 6,
    daysOfMonth: team.daysOfMonth || [],
    startTime: team.startTime || "19:00",
    timezone: team.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    minAttendanceThreshold: team.minAttendanceThreshold || 2,
    diceMode: team.diceMode,
  });

  const { data: members } = useQuery<TeamMember[]>({
    queryKey: ["/api/teams", team.id, "members"],
    enabled: !!team.id,
  });

  const isDM = members?.find(m => m.userId === user?.id)?.role === "dm";

  const updateTeamMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("PATCH", `/api/teams/${team.id}`, {
        name: data.name,
        recurrenceFrequency: data.recurrenceFrequency || null,
        dayOfWeek: data.recurrenceFrequency === "weekly" || data.recurrenceFrequency === "biweekly" 
          ? data.dayOfWeek 
          : null,
        daysOfMonth: data.recurrenceFrequency === "monthly" ? data.daysOfMonth : null,
        startTime: data.startTime,
        timezone: data.timezone,
        minAttendanceThreshold: data.minAttendanceThreshold,
        diceMode: data.diceMode,
      });
      return response.json();
    },
    onSuccess: (updatedTeam) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      onTeamUpdate(updatedTeam);
      toast({ title: "Settings saved", description: "Your team settings have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/teams/${team.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team deleted" });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const toggleDayOfMonth = (day: number) => {
    setFormData(prev => ({
      ...prev,
      daysOfMonth: prev.daysOfMonth.includes(day)
        ? prev.daysOfMonth.filter(d => d !== day)
        : [...prev.daysOfMonth, day].sort((a, b) => a - b)
    }));
  };

  if (!isDM) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <SettingsIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-lg font-medium mb-2">Settings Restricted</h2>
            <p className="text-muted-foreground">
              Only Dungeon Masters can modify team settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-medium">Settings</h1>
        <p className="text-muted-foreground">
          Manage your team configuration
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dices className="h-5 w-5" />
              Team Details
            </CardTitle>
            <CardDescription>
              Basic information about your team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Team Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-team-name"
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <Label>Team Type</Label>
                <p className="text-sm text-muted-foreground">
                  {TEAM_TYPE_LABELS[team.teamType as keyof typeof TEAM_TYPE_LABELS]}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="diceMode">Dice Mode</Label>
              <Select
                value={formData.diceMode}
                onValueChange={(value: DiceMode) => setFormData({ ...formData, diceMode: value })}
              >
                <SelectTrigger data-testid="select-dice-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="polyhedral">Polyhedral (d4-d100)</SelectItem>
                  <SelectItem value="d10_pool">d10 Dice Pool</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Schedule Settings
            </CardTitle>
            <CardDescription>
              Configure your default game schedule
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={formData.recurrenceFrequency}
                onValueChange={(value: RecurrenceFrequency) => 
                  setFormData({ ...formData, recurrenceFrequency: value, daysOfMonth: [] })
                }
              >
                <SelectTrigger data-testid="select-frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(formData.recurrenceFrequency === "weekly" || formData.recurrenceFrequency === "biweekly") && (
              <div className="space-y-2">
                <Label>Day of Week</Label>
                <Select
                  value={formData.dayOfWeek.toString()}
                  onValueChange={(value) => setFormData({ ...formData, dayOfWeek: parseInt(value) })}
                >
                  <SelectTrigger data-testid="select-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((day, index) => (
                      <SelectItem key={day} value={index.toString()}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.recurrenceFrequency === "monthly" && (
              <div className="space-y-2">
                <Label>Days of Month</Label>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <Button
                      key={day}
                      variant={formData.daysOfMonth.includes(day) ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => toggleDayOfMonth(day)}
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="pl-10"
                    data-testid="input-time"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  data-testid="input-timezone"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Attendance Settings
            </CardTitle>
            <CardDescription>
              Configure attendance requirements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="threshold">Minimum Attendance Threshold</Label>
              <p className="text-sm text-muted-foreground mb-2">
                The minimum number of members that must be available for a session to proceed
              </p>
              <Input
                id="threshold"
                type="number"
                min={1}
                max={20}
                value={formData.minAttendanceThreshold}
                onChange={(e) => setFormData({ ...formData, minAttendanceThreshold: parseInt(e.target.value) || 2 })}
                className="w-24"
                data-testid="input-threshold"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-4">
          <Button
            variant="destructive"
            onClick={() => setIsDeleteOpen(true)}
            data-testid="button-delete-team"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Team
          </Button>
          <Button
            onClick={() => updateTeamMutation.mutate(formData)}
            disabled={updateTeamMutation.isPending}
            data-testid="button-save-settings"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateTeamMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{team.name}"? This action cannot be undone and will remove all team data including notes, sessions, and member data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTeamMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTeamMutation.isPending ? "Deleting..." : "Delete Team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
