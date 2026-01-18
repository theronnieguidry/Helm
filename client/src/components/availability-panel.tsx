import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import type { Team, UserAvailability } from "@shared/schema";
import { getTimezoneAbbreviation } from "@/components/timezone-select";

interface AvailabilityPanelProps {
  team: Team;
  selectedDate: Date;
  existingAvailability?: UserAvailability;
  onSave: (data: { startTime: string; endTime: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
  isPending?: boolean;
}

// Generate time options in 15-minute increments
function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const h = hour.toString().padStart(2, "0");
      const m = minute.toString().padStart(2, "0");
      options.push(`${h}:${m}`);
    }
  }
  return options;
}

function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}

const TIME_OPTIONS = generateTimeOptions();

export default function AvailabilityPanel({
  team,
  selectedDate,
  existingAvailability,
  onSave,
  onDelete,
  onClose,
  isPending,
}: AvailabilityPanelProps) {
  const teamTimezone = team.timezone || "America/New_York";
  const regularSessionTime = team.startTime || "19:00";

  // Default end time is 4 hours after start time
  const getDefaultEndTime = (startTime: string): string => {
    const [hours, minutes] = startTime.split(":").map(Number);
    const endHour = (hours + 4) % 24;
    return `${endHour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  const [mode, setMode] = useState<"regular" | "custom">(
    existingAvailability && existingAvailability.startTime !== regularSessionTime
      ? "custom"
      : "regular"
  );
  const [startTime, setStartTime] = useState(
    existingAvailability?.startTime || regularSessionTime
  );
  const [endTime, setEndTime] = useState(
    existingAvailability?.endTime || getDefaultEndTime(regularSessionTime)
  );

  const handleModeChange = (value: string) => {
    const newMode = value as "regular" | "custom";
    setMode(newMode);
    if (newMode === "regular") {
      setStartTime(regularSessionTime);
      setEndTime(getDefaultEndTime(regularSessionTime));
    }
  };

  const handleSave = () => {
    onSave({ startTime, endTime });
  };

  // PRD-009A: Only show time and timezone, not the weekday (to avoid confusion on non-regular days)
  const regularSessionLabel = `${formatTimeDisplay(regularSessionTime)} ${getTimezoneAbbreviation(teamTimezone)}`;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-lg">{format(selectedDate, "EEEE, MMMM d, yyyy")}</h3>
        <p className="text-sm text-muted-foreground">Set your availability for this day</p>
      </div>

      <div className="space-y-3">
        <Label>Availability Type</Label>
        <RadioGroup value={mode} onValueChange={handleModeChange}>
          <div className="flex items-start space-x-2">
            <RadioGroupItem value="regular" id="regular" />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="regular"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Available for regular session time
              </label>
              <p className="text-xs text-muted-foreground">
                {regularSessionLabel}
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <RadioGroupItem value="custom" id="custom" />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="custom"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Specify a custom time range
              </label>
            </div>
          </div>
        </RadioGroup>
      </div>

      {mode === "custom" && (
        <div className="space-y-3 pl-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger id="startTime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((time) => (
                    <SelectItem key={time} value={time}>
                      {formatTimeDisplay(time)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger id="endTime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((time) => (
                    <SelectItem key={time} value={time}>
                      {formatTimeDisplay(time)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <div>
          {existingAvailability && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : existingAvailability ? "Update" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
