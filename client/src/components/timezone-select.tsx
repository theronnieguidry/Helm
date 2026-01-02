import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)", offset: "UTC-5/-4" },
  { value: "America/Chicago", label: "Central Time (CT)", offset: "UTC-6/-5" },
  { value: "America/Denver", label: "Mountain Time (MT)", offset: "UTC-7/-6" },
  { value: "America/Phoenix", label: "Arizona (MST)", offset: "UTC-7" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", offset: "UTC-8/-7" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)", offset: "UTC-9/-8" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)", offset: "UTC-10" },
];

const WORLD_TIMEZONES = [
  { value: "Europe/London", label: "London (GMT/BST)", offset: "UTC+0/+1" },
  { value: "Europe/Paris", label: "Paris, Berlin, Rome", offset: "UTC+1/+2" },
  { value: "Europe/Helsinki", label: "Helsinki, Athens", offset: "UTC+2/+3" },
  { value: "Europe/Moscow", label: "Moscow", offset: "UTC+3" },
  { value: "Asia/Dubai", label: "Dubai", offset: "UTC+4" },
  { value: "Asia/Kolkata", label: "India (IST)", offset: "UTC+5:30" },
  { value: "Asia/Bangkok", label: "Bangkok, Jakarta", offset: "UTC+7" },
  { value: "Asia/Singapore", label: "Singapore, Hong Kong", offset: "UTC+8" },
  { value: "Asia/Tokyo", label: "Tokyo, Seoul", offset: "UTC+9" },
  { value: "Australia/Sydney", label: "Sydney, Melbourne", offset: "UTC+10/+11" },
  { value: "Pacific/Auckland", label: "New Zealand", offset: "UTC+12/+13" },
  { value: "America/Sao_Paulo", label: "Sao Paulo", offset: "UTC-3" },
  { value: "America/Mexico_City", label: "Mexico City", offset: "UTC-6/-5" },
  { value: "America/Toronto", label: "Toronto", offset: "UTC-5/-4" },
  { value: "America/Vancouver", label: "Vancouver", offset: "UTC-8/-7" },
];

interface TimezoneSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  "data-testid"?: string;
}

export function TimezoneSelect({ value, onValueChange, className, "data-testid": testId }: TimezoneSelectProps) {
  const allTimezones = [...US_TIMEZONES, ...WORLD_TIMEZONES];
  const selectedTz = allTimezones.find(tz => tz.value === value);
  
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className} data-testid={testId}>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Select timezone">
            {selectedTz ? selectedTz.label : value}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="text-primary font-semibold">United States</SelectLabel>
          {US_TIMEZONES.map((tz) => (
            <SelectItem key={tz.value} value={tz.value}>
              <div className="flex items-center justify-between w-full gap-4">
                <span>{tz.label}</span>
                <span className="text-xs text-muted-foreground">{tz.offset}</span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel className="text-muted-foreground">Other Timezones</SelectLabel>
          {WORLD_TIMEZONES.map((tz) => (
            <SelectItem key={tz.value} value={tz.value}>
              <div className="flex items-center justify-between w-full gap-4">
                <span>{tz.label}</span>
                <span className="text-xs text-muted-foreground">{tz.offset}</span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function formatTimeInTimezone(time: string, sourceTimezone: string, targetTimezone: string): string {
  if (!time || !sourceTimezone || !targetTimezone) return time;
  
  try {
    const today = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    
    const dateInSourceTz = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: targetTimezone
    });
    
    const sourceFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: sourceTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = sourceFormatter.formatToParts(dateInSourceTz);
    const getPartValue = (type: string) => parts.find(p => p.type === type)?.value || '0';
    
    const utcDate = new Date(Date.UTC(
      parseInt(getPartValue('year')),
      parseInt(getPartValue('month')) - 1,
      parseInt(getPartValue('day')),
      parseInt(getPartValue('hour')),
      parseInt(getPartValue('minute'))
    ));
    
    return formatter.format(utcDate);
  } catch {
    return time;
  }
}

export function getTimezoneAbbreviation(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || timezone;
  } catch {
    return timezone;
  }
}
