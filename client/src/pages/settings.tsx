import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Trash2,
  Dices,
  Calendar,
  Clock,
  Users,
  User,
  Scroll,
  Download,
  Sparkles,
} from "lucide-react";
import { ImportManagement } from "@/components/import-management";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useAutosave, type SaveStatus } from "@/hooks/use-autosave";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Team, TeamMember, RecurrenceFrequency, DiceMode, TeamType } from "@shared/schema";
import { TEAM_TYPE_LABELS, RECURRENCE_FREQUENCIES, DICE_MODES, GAME_TERMINOLOGY } from "@shared/schema";

interface SettingsPageProps {
  team: Team;
  onTeamUpdate: (team: Team) => void;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Character data type for the character form
interface CharacterData {
  characterName: string;
  characterType1: string;
  characterType2: string;
  characterDescription: string;
}

// Props for the extracted CharacterCard component
interface CharacterCardProps {
  characterData: CharacterData;
  setCharacterData: React.Dispatch<React.SetStateAction<CharacterData>>;
  isDM: boolean;
  terminology: typeof GAME_TERMINOLOGY[TeamType];
  saveStatus: SaveStatus;
}

// Save status display component
function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  return (
    <span className="text-sm text-muted-foreground" data-testid="save-status">
      {status === "pending" && "Unsaved changes..."}
      {status === "saving" && "Saving..."}
      {status === "saved" && "Saved"}
      {status === "error" && <span className="text-destructive">Save failed</span>}
    </span>
  );
}

// Extracted to module scope to prevent focus loss on re-render
function CharacterCard({
  characterData,
  setCharacterData,
  isDM,
  terminology,
  saveStatus,
}: CharacterCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          My Character
          <SaveStatusIndicator status={saveStatus} />
        </CardTitle>
        <CardDescription>
          {isDM
            ? `As the ${terminology.gmTitle}, you can optionally track your character or NPC here.`
            : "Set up your character information for this campaign."
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="characterName">Character Name</Label>
          <Input
            id="characterName"
            placeholder="Enter your character's name"
            value={characterData.characterName}
            onChange={(e) => setCharacterData({ ...characterData, characterName: e.target.value })}
            data-testid="input-character-name"
          />
        </div>

        {terminology.type1Label && (
          <div className="space-y-2">
            <Label htmlFor="characterType1">{terminology.type1Label}</Label>
            <Input
              id="characterType1"
              placeholder={terminology.type1Placeholder}
              value={characterData.characterType1}
              onChange={(e) => setCharacterData({ ...characterData, characterType1: e.target.value })}
              data-testid="input-character-type1"
            />
          </div>
        )}

        {terminology.type2Label && (
          <div className="space-y-2">
            <Label htmlFor="characterType2">{terminology.type2Label}</Label>
            <Input
              id="characterType2"
              placeholder={terminology.type2Placeholder}
              value={characterData.characterType2}
              onChange={(e) => setCharacterData({ ...characterData, characterType2: e.target.value })}
              data-testid="input-character-type2"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="characterDescription">Character Description (Optional)</Label>
          <Textarea
            id="characterDescription"
            placeholder="Describe your character's appearance, personality, or backstory..."
            value={characterData.characterDescription}
            onChange={(e) => setCharacterData({ ...characterData, characterDescription: e.target.value })}
            className="min-h-[100px]"
            data-testid="input-character-description"
          />
        </div>
      </CardContent>
    </Card>
  );
}

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
    defaultSessionDurationMinutes: team.defaultSessionDurationMinutes || 180,
    diceMode: team.diceMode,
  });

  // Character form state
  const [characterData, setCharacterData] = useState({
    characterName: "",
    characterType1: "",
    characterType2: "",
    characterDescription: "",
  });

  const { data: members } = useQuery<TeamMember[]>({
    queryKey: ["/api/teams", team.id, "members"],
    enabled: !!team.id,
  });

  const currentMember = members?.find(m => m.userId === user?.id);
  const isDM = currentMember?.role === "dm";
  
  // Check if this is a tabletop gaming group (has character fields)
  const isTabletopGroup = team.teamType !== "other";
  const terminology = GAME_TERMINOLOGY[team.teamType as TeamType];

  // Initialize character data from current member
  useEffect(() => {
    if (currentMember) {
      setCharacterData({
        characterName: currentMember.characterName || "",
        characterType1: currentMember.characterType1 || "",
        characterType2: currentMember.characterType2 || "",
        characterDescription: currentMember.characterDescription || "",
      });
    }
  }, [currentMember]);

  // PRD-032: Auto-save team settings
  const { status: teamSaveStatus } = useAutosave({
    data: formData,
    onSave: async (data) => {
      try {
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
          defaultSessionDurationMinutes: data.defaultSessionDurationMinutes,
          diceMode: data.diceMode,
        });
        const updatedTeam = await response.json();
        queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
        onTeamUpdate(updatedTeam);
      } catch (error) {
        toast({ title: "Failed to save", description: (error as Error).message, variant: "destructive" });
        throw error;
      }
    },
    debounceMs: 500,
    enabled: isDM,
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

  // PRD-032: Auto-save character data
  const { status: charSaveStatus } = useAutosave({
    data: characterData,
    onSave: async (data) => {
      if (!currentMember) return;
      try {
        await apiRequest("PATCH", `/api/teams/${team.id}/members/${currentMember.id}`, data);
        queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "members"] });
      } catch (error) {
        toast({ title: "Failed to save character", description: (error as Error).message, variant: "destructive" });
        throw error;
      }
    },
    debounceMs: 500,
    enabled: !!currentMember,
  });

  // PRD-028: Per-member AI Features toggle mutation
  const toggleMemberAIMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!currentMember) throw new Error("Not a team member");
      const response = await apiRequest("PATCH", `/api/teams/${team.id}/members/${currentMember.id}`, {
        aiEnabled: enabled,
        aiEnabledAt: enabled ? new Date().toISOString() : null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "members"] });
      toast({
        title: "AI Features Updated",
        description: "Your AI feature settings have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update AI settings", description: error.message, variant: "destructive" });
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

  // Non-DM view: show character settings only
  if (!isDM) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-medium">Settings</h1>
          <p className="text-muted-foreground">
            Manage your character and preferences
          </p>
        </div>

        <div className="space-y-6">
          {isTabletopGroup && (
            <CharacterCard
              characterData={characterData}
              setCharacterData={setCharacterData}
              isDM={isDM}
              terminology={terminology}
              saveStatus={charSaveStatus}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scroll className="h-5 w-5" />
                Group Settings
              </CardTitle>
              <CardDescription>
                Only the {terminology.gmTitle} can modify group settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>Group:</strong> {team.name}</p>
                <p><strong>Type:</strong> {TEAM_TYPE_LABELS[team.teamType as keyof typeof TEAM_TYPE_LABELS]}</p>
                {team.recurrenceFrequency && (
                  <p><strong>Schedule:</strong> {team.recurrenceFrequency} on {WEEKDAYS[team.dayOfWeek || 0]}s at {team.startTime}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* PRD-028: AI Features for all members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Features
              </CardTitle>
              <CardDescription>
                Enable AI-powered enhancements for your note-taking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="ai-toggle-member">Enable AI Features</Label>
                  <p className="text-sm text-muted-foreground">
                    Unlock intelligent features powered by Claude AI
                  </p>
                </div>
                <Switch
                  id="ai-toggle-member"
                  checked={currentMember?.aiEnabled ?? false}
                  onCheckedChange={(checked) => toggleMemberAIMutation.mutate(checked)}
                  disabled={toggleMemberAIMutation.isPending}
                  data-testid="switch-ai-features-member"
                />
              </div>
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-medium mb-2">AI features include:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• <strong>AI Cleanup</strong> — Enhanced entity detection with context-aware recognition</li>
                  <li>• <strong>Relationship Detection</strong> — Discover connections between NPCs, places, and factions</li>
                  <li>• <strong>Note Classification</strong> — Automatic note type suggestions</li>
                  <li>• <strong>Entity Enrichment</strong> — AI-generated descriptions for your world</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
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

            <div className="space-y-2">
              <Label htmlFor="sessionDuration">Session Duration</Label>
              <p className="text-sm text-muted-foreground mb-2">
                How long your typical session lasts (used for availability matching)
              </p>
              <Select
                value={formData.defaultSessionDurationMinutes.toString()}
                onValueChange={(value) => setFormData({ ...formData, defaultSessionDurationMinutes: parseInt(value) })}
              >
                <SelectTrigger className="w-[180px]" data-testid="select-session-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="300">5 hours</SelectItem>
                  <SelectItem value="360">6 hours</SelectItem>
                </SelectContent>
              </Select>
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

        {isTabletopGroup && (
          <CharacterCard
            characterData={characterData}
            setCharacterData={setCharacterData}
            isDM={isDM}
            terminology={terminology}
            saveStatus={charSaveStatus}
          />
        )}

        {/* PRD-015A: Import History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Import History
            </CardTitle>
            <CardDescription>
              Manage imported content from external sources
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportManagement
              teamId={team.id}
              isDM={isDM}
              currentUserId={user?.id || ""}
            />
          </CardContent>
        </Card>

        {/* PRD-028: AI Features for all members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Features
            </CardTitle>
            <CardDescription>
              Enable AI-powered enhancements for your note-taking
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="ai-toggle-dm">Enable AI Features</Label>
                <p className="text-sm text-muted-foreground">
                  Unlock intelligent features powered by Claude AI
                </p>
              </div>
              <Switch
                id="ai-toggle-dm"
                checked={currentMember?.aiEnabled ?? false}
                onCheckedChange={(checked) => toggleMemberAIMutation.mutate(checked)}
                disabled={toggleMemberAIMutation.isPending}
                data-testid="switch-ai-features"
              />
            </div>
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="font-medium mb-2">AI features include:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• <strong>AI Cleanup</strong> — Enhanced entity detection with context-aware recognition</li>
                <li>• <strong>Relationship Detection</strong> — Discover connections between NPCs, places, and factions</li>
                <li>• <strong>Note Classification</strong> — Automatic note type suggestions</li>
                <li>• <strong>Entity Enrichment</strong> — AI-generated descriptions for your world</li>
              </ul>
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
          <SaveStatusIndicator status={teamSaveStatus} />
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
