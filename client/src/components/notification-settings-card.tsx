/**
 * Notification settings (scheduling audit stage 3): per-device push toggle +
 * per-team notification preferences. Mounted for every member on the
 * Settings page.
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  enablePushNotifications,
  disablePushNotifications,
  hasActivePushSubscription,
  isPushSupported,
} from "@/lib/push";
import type { Team, TeamMember } from "@shared/schema";

interface NotificationSettingsCardProps {
  team: Team;
  currentMember?: TeamMember;
}

export default function NotificationSettingsCard({
  team,
  currentMember,
}: NotificationSettingsCardProps) {
  const { toast } = useToast();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    hasActivePushSubscription().then(setPushEnabled);
  }, []);

  const handlePushToggle = async (checked: boolean) => {
    setPushBusy(true);
    try {
      if (checked) {
        const result = await enablePushNotifications();
        if (result === "subscribed") {
          setPushEnabled(true);
          toast({ title: "Push notifications enabled on this device" });
        } else if (result === "denied") {
          toast({
            title: "Notifications blocked",
            description: "Allow notifications for this site in your browser settings.",
            variant: "destructive",
          });
        } else if (result === "unconfigured") {
          toast({
            title: "Push not configured",
            description: "The server has no push keys set up yet. In-app notifications still work.",
          });
        } else if (result === "unsupported") {
          toast({
            title: "Not supported here",
            description: "On iPhone, add Helm to your Home Screen first, then enable notifications.",
          });
        }
      } else {
        await disablePushNotifications();
        setPushEnabled(false);
        toast({ title: "Push notifications disabled on this device" });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const prefsMutation = useMutation({
    mutationFn: async (prefs: Record<string, boolean>) => {
      const res = await apiRequest(
        "PATCH",
        `/api/teams/${team.id}/members/me/notification-prefs`,
        prefs
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "members"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save preference", description: error.message, variant: "destructive" });
    },
  });

  const prefRows: {
    key: "notifyAvailabilityReminders" | "notifyGroupAwaiting" | "notifyGameDay";
    label: string;
    description: string;
  }[] = [
    {
      key: "notifyAvailabilityReminders",
      label: "Availability reminders",
      description: "Nudge me when the group needs my answer for an upcoming session",
    },
    {
      key: "notifyGroupAwaiting",
      label: "Group updates",
      description: "Who we're still waiting on, confirmations, cancellations",
    },
    {
      key: "notifyGameDay",
      label: "Game-day confirmations",
      description: '"Game is on today" on the day of a confirmed session',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>
          Session reminders always appear in the app; push brings them to this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="push-toggle">Push on this device</Label>
            <p className="text-sm text-muted-foreground">
              {isPushSupported()
                ? "Browser notifications, even when Helm is closed"
                : "Not supported in this browser (on iPhone: add Helm to your Home Screen first)"}
            </p>
          </div>
          <Switch
            id="push-toggle"
            checked={pushEnabled}
            onCheckedChange={handlePushToggle}
            disabled={pushBusy || !isPushSupported()}
            data-testid="switch-push-device"
          />
        </div>

        <div className="border-t pt-4 space-y-4">
          {prefRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor={`pref-${row.key}`}>{row.label}</Label>
                <p className="text-sm text-muted-foreground">{row.description}</p>
              </div>
              <Switch
                id={`pref-${row.key}`}
                checked={currentMember?.[row.key] ?? true}
                onCheckedChange={(checked) => prefsMutation.mutate({ [row.key]: checked })}
                disabled={prefsMutation.isPending || !currentMember}
                data-testid={`switch-${row.key}`}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
