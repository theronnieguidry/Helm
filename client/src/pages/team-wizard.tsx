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
import { Progress } from "@/components/ui/progress";
import { 
  Compass, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Copy,
  Clock,
  Calendar,
  Users,
  BookOpen,
  Dices,
  Heart,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  TEAM_TYPE_DICE_MODE,
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

const GROUP_TYPES = [
  { 
    value: "other" as TeamType, 
    label: "General Meetup", 
    description: "Book clubs, study groups, volunteer teams, and more",
    icon: Users
  },
  { 
    value: "dnd" as TeamType, 
    label: "Dungeons & Dragons", 
    description: "Fantasy adventures and epic quests",
    icon: Dices
  },
  { 
    value: "pathfinder_2e" as TeamType, 
    label: "Pathfinder 2e", 
    description: "Tactical fantasy roleplaying",
    icon: Dices
  },
  { 
    value: "vampire" as TeamType, 
    label: "Vampire: The Masquerade", 
    description: "Gothic horror and political intrigue",
    icon: Heart
  },
  { 
    value: "werewolf" as TeamType, 
    label: "Werewolf: The Forsaken", 
    description: "Primal horror and spiritual battles",
    icon: Sparkles
  },
];

export default function TeamWizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    teamType: "",
    teamName: "",
    recurrenceFrequency: "",
    dayOfWeek: 6,
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
        title: "Couldn't create your group",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const progress = (step / 5) * 100;

  const isGaming = data.teamType !== "other" && data.teamType !== "";

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

  const selectedGroupType = GROUP_TYPES.find(g => g.value === data.teamType);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Compass className="h-8 w-8 text-primary" />
            <span className="text-xl font-medium">Helm</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2">Step {step} of 5</p>
        </div>

        <Card className="shadow-md">
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle>What kind of group are you starting?</CardTitle>
                <CardDescription>
                  Choose the type that best fits your meetups.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {GROUP_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setData({ ...data, teamType: type.value })}
                      className={`w-full p-4 rounded-md border text-left transition-all hover-elevate ${
                        data.teamType === type.value 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      }`}
                      data-testid={`team-type-${type.value}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <type.icon className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">{type.label}</span>
                        </div>
                        {data.teamType === type.value && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 ml-8">
                        {type.description}
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
                <CardTitle>Give your group a name</CardTitle>
                <CardDescription>
                  Something memorable that your crew will recognize.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="teamName">Group Name</Label>
                  <Input
                    id="teamName"
                    placeholder={isGaming ? "e.g., The Dragon's Hoard" : "e.g., Friday Night Book Club"}
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
                <CardTitle>Set your default schedule</CardTitle>
                <CardDescription>
                  Pick a recurring time that works for your crew. You can always adjust when life happens.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>How often do you meet?</Label>
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
                      <SelectItem value="biweekly">Every two weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(data.recurrenceFrequency === "weekly" || data.recurrenceFrequency === "biweekly") && (
                  <div className="space-y-2">
                    <Label>Which day?</Label>
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
                    <Label>Which days of the month?</Label>
                    <p className="text-sm text-muted-foreground mb-2">Select one or more</p>
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
                    <Label htmlFor="startTime">What time?</Label>
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
                <CardTitle>Looking good!</CardTitle>
                <CardDescription>
                  Review your group details before we create it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-md bg-muted/50 space-y-3">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{data.teamName}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedGroupType?.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium capitalize">
                        {data.recurrenceFrequency === "biweekly" ? "Every two weeks" : data.recurrenceFrequency}
                      </p>
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
                <CardTitle>You're all set!</CardTitle>
                <CardDescription>
                  Your group is ready. Share this code with your people to invite them.
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
                      Expires in 7 days
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
                      Create Group
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
