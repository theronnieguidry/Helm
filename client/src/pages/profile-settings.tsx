import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { TimezoneSelect, getTimezoneAbbreviation } from "@/components/timezone-select";
import { User, Clock, Mail } from "lucide-react";
import { useState, useEffect } from "react";
import type { User as UserType } from "@shared/schema";

export default function ProfileSettings() {
  const { toast } = useToast();
  const [timezone, setTimezone] = useState<string>("");

  const { data: userProfile, isLoading } = useQuery<UserType>({
    queryKey: ["/api/user/profile"],
  });

  useEffect(() => {
    if (userProfile?.timezone) {
      setTimezone(userProfile.timezone);
    } else if (!timezone) {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
  }, [userProfile, timezone]);

  const updateTimezoneMutation = useMutation({
    mutationFn: async (newTimezone: string) => {
      const response = await apiRequest("PATCH", "/api/user/timezone", { timezone: newTimezone });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Timezone updated",
        description: "Your timezone preference has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update timezone",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveTimezone = () => {
    updateTimezoneMutation.mutate(timezone);
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  const hasTimezoneChanged = timezone !== (userProfile?.timezone || "");

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your account preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            Your basic profile information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage 
                src={userProfile?.profileImageUrl || undefined} 
                alt={userProfile?.firstName || "User"} 
              />
              <AvatarFallback className="text-lg">
                {getInitials(userProfile?.firstName, userProfile?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-medium">
                {userProfile?.firstName} {userProfile?.lastName}
              </p>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span className="text-sm">{userProfile?.email}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Timezone Preference
          </CardTitle>
          <CardDescription>
            Set your timezone so meetup times are displayed correctly for you. 
            When your group leader sets a session time, you'll see it converted to your local time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Your Timezone</Label>
            <TimezoneSelect
              value={timezone}
              onValueChange={setTimezone}
              data-testid="select-user-timezone"
            />
            {timezone && (
              <p className="text-sm text-muted-foreground">
                Current time: {new Date().toLocaleTimeString("en-US", { 
                  timeZone: timezone,
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true
                })} {getTimezoneAbbreviation(timezone)}
              </p>
            )}
          </div>
          <Button
            onClick={handleSaveTimezone}
            disabled={!hasTimezoneChanged || updateTimezoneMutation.isPending}
            data-testid="button-save-timezone"
          >
            {updateTimezoneMutation.isPending ? "Saving..." : "Save Timezone"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
