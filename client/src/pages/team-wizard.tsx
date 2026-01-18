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
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Copy,
  Clock,
  Calendar,
  Users,
  Dices,
  BookOpen,
  GraduationCap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  TEAM_TYPE_DICE_MODE,
  type TeamType,
  type RecurrenceFrequency 
} from "@shared/schema";
import helmLogo from "@assets/b8bc77e2-60e2-4834-9e6b-e7ea3b744612_1767318501377.png";
import { TimezoneSelect, getTimezoneAbbreviation } from "@/components/timezone-select";

type GroupCategory = "tabletop" | "club" | "study" | "";

interface WizardData {
  groupCategory: GroupCategory;
  teamType: TeamType | "";
  teamName: string;
  recurrenceFrequency: RecurrenceFrequency | "";
  dayOfWeek: number;
  daysOfMonth: number[];
  startTime: string;
  timezone: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const GROUP_CATEGORIES = [
  { 
    value: "tabletop" as GroupCategory, 
    label: "Tabletop Gaming", 
    description: "D&D, Pathfinder, Vampire, and other tabletop RPGs",
    icon: Dices
  },
  { 
    value: "club" as GroupCategory, 
    label: "Book / Running / Hobby Club", 
    description: "Book clubs, running groups, hobby circles, and more",
    icon: BookOpen
  },
  { 
    value: "study" as GroupCategory, 
    label: "Study Group", 
    description: "Study sessions, tutoring, or academic meetups",
    icon: GraduationCap
  },
];

const GAME_SYSTEMS = [
  { 
    value: "dnd" as TeamType, 
    label: "Dungeons & Dragons", 
    description: "Fantasy adventures and epic quests"
  },
  { 
    value: "pathfinder_2e" as TeamType, 
    label: "Pathfinder 2e", 
    description: "Tactical fantasy roleplaying"
  },
  { 
    value: "vampire" as TeamType, 
    label: "Vampire: The Masquerade", 
    description: "Gothic horror and political intrigue"
  },
  { 
    value: "werewolf" as TeamType, 
    label: "Werewolf: The Forsaken", 
    description: "Primal horror and spiritual battles"
  },
];

export default function TeamWizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    groupCategory: "",
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

  const isTabletop = data.groupCategory === "tabletop";
  const totalSteps = isTabletop ? 6 : 5;

  const createTeamMutation = useMutation({
    mutationFn: async (teamData: WizardData) => {
      const finalTeamType = teamData.teamType || "other";
      const response = await apiRequest("POST", "/api/teams", {
        name: teamData.teamName,
        teamType: finalTeamType,
        diceMode: TEAM_TYPE_DICE_MODE[finalTeamType as TeamType],
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
      setStep(totalSteps);
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't create your group",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const progress = (step / totalSteps) * 100;

  const getStepContent = () => {
    if (isTabletop) {
      switch (step) {
        case 1: return "category";
        case 2: return "game";
        case 3: return "name";
        case 4: return "schedule";
        case 5: return "review";
        case 6: return "complete";
        default: return "category";
      }
    } else {
      switch (step) {
        case 1: return "category";
        case 2: return "name";
        case 3: return "schedule";
        case 4: return "review";
        case 5: return "complete";
        default: return "category";
      }
    }
  };

  const currentContent = getStepContent();

  const canProceed = () => {
    switch (currentContent) {
      case "category": return data.groupCategory !== "";
      case "game": return data.teamType !== "";
      case "name": return data.teamName.trim() !== "";
      case "schedule": return data.recurrenceFrequency !== "" && data.startTime !== "";
      case "review": return true;
      default: return true;
    }
  };

  const handleNext = () => {
    if (currentContent === "review") {
      createTeamMutation.mutate(data);
    } else if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleCategorySelect = (category: GroupCategory) => {
    if (category !== "tabletop") {
      setData({ ...data, groupCategory: category, teamType: "other" });
    } else {
      setData({ ...data, groupCategory: category, teamType: "" });
    }
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

  const getCategoryLabel = () => {
    const category = GROUP_CATEGORIES.find(c => c.value === data.groupCategory);
    return category?.label || "";
  };

  const getGameLabel = () => {
    const game = GAME_SYSTEMS.find(g => g.value === data.teamType);
    return game?.label || "";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={helmLogo} alt="Helm" className="h-8 w-8" />
            <span className="text-xl font-medium">Helm</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2">Step {step} of {totalSteps}</p>
        </div>

        <Card className="shadow-md">
          {currentContent === "category" && (
            <>
              <CardHeader>
                <CardTitle>What kind of group are you starting?</CardTitle>
                <CardDescription>
                  Choose the type that best fits your meetups.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {GROUP_CATEGORIES.map((category) => (
                    <button
                      key={category.value}
                      onClick={() => handleCategorySelect(category.value)}
                      className={`w-full p-4 rounded-md border text-left transition-all hover-elevate ${
                        data.groupCategory === category.value 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      }`}
                      data-testid={`category-${category.value}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <category.icon className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">{category.label}</span>
                        </div>
                        {data.groupCategory === category.value && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 ml-8">
                        {category.description}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </>
          )}

          {currentContent === "game" && (
            <>
              <CardHeader>
                <CardTitle>Which game system?</CardTitle>
                <CardDescription>
                  Select the game your group plays.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {GAME_SYSTEMS.map((game) => (
                    <button
                      key={game.value}
                      onClick={() => setData({ ...data, teamType: game.value })}
                      className={`w-full p-4 rounded-md border text-left transition-all hover-elevate ${
                        data.teamType === game.value 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      }`}
                      data-testid={`game-${game.value}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{game.label}</span>
                        {data.teamType === game.value && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {game.description}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </>
          )}

          {currentContent === "name" && (
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
                    placeholder={isTabletop ? "e.g., The Dragon's Hoard" : "e.g., Friday Night Book Club"}
                    value={data.teamName}
                    onChange={(e) => setData({ ...data, teamName: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && canProceed()) {
                        e.preventDefault();
                        handleNext();
                      }
                    }}
                    data-testid="input-team-name"
                  />
                </div>
              </CardContent>
            </>
          )}

          {currentContent === "schedule" && (
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

                <div className="space-y-4">
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
                    <Label htmlFor="timezone">Your timezone</Label>
                    <p className="text-sm text-muted-foreground">
                      This sets the group's default timezone. Members will see times converted to their own timezone.
                    </p>
                    <TimezoneSelect
                      value={data.timezone}
                      onValueChange={(value) => setData({ ...data, timezone: value })}
                      data-testid="select-timezone"
                    />
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {currentContent === "review" && (
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
                        {isTabletop ? getGameLabel() : getCategoryLabel()}
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
                    <p className="text-sm">{getTimezoneAbbreviation(data.timezone)} ({data.timezone})</p>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {currentContent === "complete" && (
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
            {currentContent !== "complete" ? (
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
                  ) : currentContent === "review" ? (
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
