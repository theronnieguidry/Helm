import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Dices, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Copy,
  Clock,
  Calendar,
  Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  TEAM_TYPES, 
  TEAM_TYPE_LABELS, 
  TEAM_TYPE_DICE_MODE,
  RECURRENCE_FREQUENCIES,
  type TeamType,
  type RecurrenceFrequency 
} from "@shared/schema";

interface WizardData {
  teamType: TeamType | "";
  teamName: string;
  recurrenceFrequency: RecurrenceFrequency | "";
  dayOfWeek: number;
  daysOfMonth: number[];
  startTime: string;
  timezone: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function TeamWizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    teamType: "",
    teamName: "",
    recurrenceFrequency: "",
    dayOfWeek: 6, // Saturday
    daysOfMonth: [],
    startTime: "19:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const createTeamMutation = useMutation({
    mutationFn: async (teamData: WizardData) => {
      const response = await apiRequest("POST", "/api/teams", {
        name: teamData.teamName,
        teamType: teamData.teamType,
        diceMode: TEAM_TYPE_DICE_MODE[teamData.teamType as TeamType],
        recurrenceFrequency: teamData.recurrenceFrequency || null,
        dayOfWeek: teamData.recurrenceFrequency === "weekly" || teamData.recurrenceFrequency === "biweekly" 
          ? teamData.dayOfWeek 
          : null,
        daysOfMonth: teamData.recurrenceFrequency === "monthly" ? teamData.daysOfMonth : null,
        startTime: teamData.startTime,
        timezone: teamData.timezone,
      });
      return response.json();
    },
    onSuccess: (team) => {
      setCreatedTeamId(team.id);
      setInviteCode(team.invite?.code);
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setStep(5);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create team",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const progress = (step / 5) * 100;

  const isLabelCampaign = data.teamType !== "other" && data.teamType !== "";
  const nameLabel = isLabelCampaign ? "Campaign Name" : "Group Name";
  const scheduleTitle = isLabelCampaign ? "Default Game Schedule" : "Default Meetup Schedule";

  const canProceed = () => {
    switch (step) {
      case 1: return data.teamType !== "";
      case 2: return data.teamName.trim() !== "";
      case 3: return data.recurrenceFrequency !== "" && data.startTime !== "";
      case 4: return true;
      default: return true;
    }
  };

  const handleNext = () => {
    if (step === 4) {
      createTeamMutation.mutate(data);
    } else if (step < 5) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleFinish = () => {
    navigate("/");
  };

  const copyInviteCode = async () => {
    if (inviteCode) {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const toggleDayOfMonth = (day: number) => {
    setData(prev => ({
      ...prev,
      daysOfMonth: prev.daysOfMonth.includes(day)
        ? prev.daysOfMonth.filter(d => d !== day)
        : [...prev.daysOfMonth, day].sort((a, b) => a - b)
    }));
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Dices className="h-8 w-8 text-primary" />
            <span className="text-xl font-medium">Quest Keeper</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2">Step {step} of 5</p>
        </div>

        <Card className="shadow-md">
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle>What type of group?</CardTitle>
                <CardDescription>
                  Select the game system your group plays. This determines dice rolling options.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {TEAM_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setData({ ...data, teamType: type })}
                      className={`w-full p-4 rounded-md border text-left transition-all hover-elevate ${
                        data.teamType === type 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      }`}
                      data-testid={`team-type-${type}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{TEAM_TYPE_LABELS[type]}</span>
                        {data.teamType === type && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {type === "pathfinder_2e" || type === "dnd" 
                          ? "Polyhedral dice (d4, d6, d8, d10, d12, d20, d100)"
                          : type === "vampire" || type === "werewolf"
                          ? "d10 dice pool system"
                          : "Custom - dice disabled by default"}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle>{nameLabel}</CardTitle>
                <CardDescription>
                  Give your {isLabelCampaign ? "campaign" : "group"} a memorable name.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="teamName">{nameLabel}</Label>
                  <Input
                    id="teamName"
                    placeholder={isLabelCampaign ? "e.g., The Dragon's Hoard" : "e.g., Friday Night Games"}
                    value={data.teamName}
                    onChange={(e) => setData({ ...data, teamName: e.target.value })}
                    data-testid="input-team-name"
                  />
                </div>
              </CardContent>
            </>
          )}

          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle>{scheduleTitle}</CardTitle>
                <CardDescription>
                  Set up your regular meeting schedule. You can always override specific sessions later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select
                    value={data.recurrenceFrequency}
                    onValueChange={(value: RecurrenceFrequency) => 
                      setData({ ...data, recurrenceFrequency: value, daysOfMonth: [] })
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

                {(data.recurrenceFrequency === "weekly" || data.recurrenceFrequency === "biweekly") && (
                  <div className="space-y-2">
                    <Label>Day of Week</Label>
                    <Select
                      value={data.dayOfWeek.toString()}
                      onValueChange={(value) => setData({ ...data, dayOfWeek: parseInt(value) })}
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

                {data.recurrenceFrequency === "monthly" && (
                  <div className="space-y-2">
                    <Label>Days of Month</Label>
                    <p className="text-sm text-muted-foreground mb-2">Select one or more days</p>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <Button
                          key={day}
                          variant={data.daysOfMonth.includes(day) ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => toggleDayOfMonth(day)}
                          data-testid={`day-${day}`}
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
                        value={data.startTime}
                        onChange={(e) => setData({ ...data, startTime: e.target.value })}
                        className="pl-10"
                        data-testid="input-time"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Input
                      id="timezone"
                      value={data.timezone}
                      onChange={(e) => setData({ ...data, timezone: e.target.value })}
                      data-testid="input-timezone"
                    />
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {step === 4 && (
            <>
              <CardHeader>
                <CardTitle>Review & Create</CardTitle>
                <CardDescription>
                  Review your settings before creating the team.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-md bg-muted/50 space-y-3">
                  <div className="flex items-center gap-3">
                    <Dices className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{data.teamName}</p>
                      <p className="text-sm text-muted-foreground">
                        {TEAM_TYPE_LABELS[data.teamType as TeamType]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium capitalize">{data.recurrenceFrequency}</p>
                      <p className="text-sm text-muted-foreground">
                        {data.recurrenceFrequency === "monthly" 
                          ? `Days: ${data.daysOfMonth.join(", ")}`
                          : WEEKDAYS[data.dayOfWeek]} at {data.startTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm">{data.timezone}</p>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {step === 5 && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <CardTitle>Team Created!</CardTitle>
                <CardDescription>
                  Your team is ready. Share the invite code with your players.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {inviteCode && (
                  <div className="p-6 rounded-md bg-muted/50 text-center">
                    <p className="text-sm text-muted-foreground mb-2">Invite Code</p>
                    <div className="flex items-center justify-center gap-3">
                      <code className="text-3xl font-mono font-bold tracking-widest">{inviteCode}</code>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={copyInviteCode}
                        data-testid="button-copy-code"
                      >
                        {copiedCode ? (
                          <Check className="h-5 w-5 text-green-500" />
                        ) : (
                          <Copy className="h-5 w-5" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Code expires in 7 days
                    </p>
                  </div>
                )}
              </CardContent>
            </>
          )}

          <CardFooter className="flex justify-between gap-4">
            {step < 5 ? (
              <>
                <Button 
                  variant="ghost" 
                  onClick={handleBack}
                  disabled={step === 1}
                  data-testid="button-back"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button 
                  onClick={handleNext}
                  disabled={!canProceed() || createTeamMutation.isPending}
                  data-testid="button-next"
                >
                  {createTeamMutation.isPending ? (
                    "Creating..."
                  ) : step === 4 ? (
                    <>
                      Create Team
                      <Check className="h-4 w-4 ml-1" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button 
                className="w-full" 
                onClick={handleFinish}
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
