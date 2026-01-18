import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getTimezoneAbbreviation } from "@/components/timezone-select";
import type { SessionCandidate } from "@shared/recurrence";
import type { GameSession } from "@shared/schema";

interface SessionStatusControlProps {
  candidate?: SessionCandidate | null;
  session?: GameSession | null;
  userTimezone: string;
  onToggle: (params: {
    type: "override" | "manual";
    occurrenceKey?: string;
    sessionId?: string;
    newStatus: "scheduled" | "canceled";
  }) => void;
  isPending?: boolean;
}

function formatTimeInUserTimezone(date: Date, userTimezone: string): string {
  try {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: userTimezone,
    });
  } catch {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
}

export default function SessionStatusControl({
  candidate,
  session,
  userTimezone,
  onToggle,
  isPending = false,
}: SessionStatusControlProps) {
  // Determine which session type we're working with
  const isCandidate = !!candidate;
  const isManualSession = !!session;

  if (!isCandidate && !isManualSession) {
    return null;
  }

  // Get session details based on type
  const scheduledAt = isCandidate
    ? new Date(candidate!.scheduledAt)
    : new Date(session!.scheduledAt);

  const endsAt = isCandidate
    ? new Date(candidate!.endsAt)
    : new Date(new Date(session!.scheduledAt).getTime() + 3 * 60 * 60 * 1000); // Default 3 hours for manual

  const status = isCandidate ? candidate!.status : session!.status;
  const isCanceled = status === "canceled";

  const tzAbbr = getTimezoneAbbreviation(userTimezone);
  const startTimeStr = formatTimeInUserTimezone(scheduledAt, userTimezone);
  const endTimeStr = formatTimeInUserTimezone(endsAt, userTimezone);

  const handleToggle = (checked: boolean) => {
    const newStatus = checked ? "scheduled" : "canceled";

    if (isCandidate) {
      onToggle({
        type: "override",
        occurrenceKey: candidate!.occurrenceKey,
        newStatus,
      });
    } else if (isManualSession) {
      onToggle({
        type: "manual",
        sessionId: session!.id,
        newStatus,
      });
    }
  };

  return (
    <div className="space-y-3" data-testid="session-status-control">
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-1">
          Session Status
        </h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm",
                isCanceled && "line-through text-muted-foreground"
              )}
            >
              {startTimeStr} - {endTimeStr} {tzAbbr}
            </span>
            {isCanceled && (
              <Badge
                variant="outline"
                className="text-red-500 border-red-500/30"
              >
                Canceled
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label
          htmlFor="session-status-toggle"
          className="text-sm cursor-pointer"
        >
          {status === "scheduled" ? "Scheduled" : "Canceled"}
        </Label>
        <Switch
          id="session-status-toggle"
          checked={status === "scheduled"}
          onCheckedChange={handleToggle}
          disabled={isPending}
          data-testid="session-status-toggle"
        />
      </div>
    </div>
  );
}
