import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface MemberAvailability {
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  status: "full" | "partial" | "no_response";
  timeWindow?: string; // "7:00 PM - 11:00 PM EDT"
  isDM?: boolean;
}

interface TeamAvailabilityListProps {
  members: MemberAvailability[];
  compact?: boolean; // For HoverCard (smaller) vs Dialog (larger)
}

/**
 * Format a time string from "HH:MM" to "h:mm AM/PM"
 */
export function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}

/**
 * Format a time window with timezone abbreviation
 */
export function formatTimeWindow(
  startTime: string,
  endTime: string,
  timezoneAbbr: string
): string {
  return `${formatTimeDisplay(startTime)} - ${formatTimeDisplay(endTime)} ${timezoneAbbr}`;
}

function MemberRow({
  member,
  compact,
}: {
  member: MemberAvailability;
  compact?: boolean;
}) {
  const initials = member.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        compact ? "py-1" : "py-1.5"
      )}
    >
      {!compact && (
        <Avatar className="h-6 w-6">
          <AvatarImage src={member.profileImageUrl} alt={member.displayName} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {member.displayName}
          </span>
          {member.isDM && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
              DM
            </Badge>
          )}
        </div>
        {member.timeWindow && (
          <p
            className={cn(
              "text-muted-foreground",
              compact ? "text-[10px]" : "text-xs"
            )}
          >
            {member.timeWindow}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  color,
  children,
  compact,
}: {
  title: string;
  color: "green" | "yellow" | "muted";
  children: React.ReactNode;
  compact?: boolean;
}) {
  const colorClasses = {
    green: "text-green-600 dark:text-green-400",
    yellow: "text-yellow-600 dark:text-yellow-400",
    muted: "text-muted-foreground",
  };

  return (
    <div className={compact ? "mb-2" : "mb-3"}>
      <h4
        className={cn(
          "font-medium mb-1",
          compact ? "text-xs" : "text-sm",
          colorClasses[color]
        )}
      >
        {title}
      </h4>
      <div className={compact ? "space-y-0.5" : "space-y-1"}>{children}</div>
    </div>
  );
}

export default function TeamAvailabilityList({
  members,
  compact = false,
}: TeamAvailabilityListProps) {
  const fullMembers = members.filter((m) => m.status === "full");
  const partialMembers = members.filter((m) => m.status === "partial");
  const noResponseMembers = members.filter((m) => m.status === "no_response");

  const hasAnyMembers =
    fullMembers.length > 0 ||
    partialMembers.length > 0 ||
    noResponseMembers.length > 0;

  if (!hasAnyMembers) {
    return (
      <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
        No team members found
      </p>
    );
  }

  return (
    <div>
      {fullMembers.length > 0 && (
        <Section title="Available" color="green" compact={compact}>
          {fullMembers.map((m) => (
            <MemberRow key={m.userId} member={m} compact={compact} />
          ))}
        </Section>
      )}
      {partialMembers.length > 0 && (
        <Section title="Partial" color="yellow" compact={compact}>
          {partialMembers.map((m) => (
            <MemberRow key={m.userId} member={m} compact={compact} />
          ))}
        </Section>
      )}
      {noResponseMembers.length > 0 && (
        <Section title="No Response" color="muted" compact={compact}>
          {noResponseMembers.map((m) => (
            <MemberRow key={m.userId} member={m} compact={compact} />
          ))}
        </Section>
      )}
    </div>
  );
}
