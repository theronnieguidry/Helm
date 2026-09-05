/**
 * In-app notification center (scheduling audit stage 3).
 *
 * The zero-permission delivery path: everything the reminder engine sends
 * lands here, whether or not the member ever granted push permission. Polls
 * softly (60s) since availability convergence is the whole point.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data } = useQuery<{ items: Notification[]; unreadCount: number }>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const markReadMutation = useMutation({
    mutationFn: async (ids?: string[]) => {
      await apiRequest("POST", "/api/notifications/mark-read", ids ? { ids } : {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    // Closing the panel acknowledges what was shown
    if (!nextOpen && unreadCount > 0) {
      markReadMutation.mutate(undefined);
    }
  };

  const handleItemClick = (notification: Notification) => {
    setOpen(false);
    if (unreadCount > 0) markReadMutation.mutate(undefined);
    if (notification.url) navigate(notification.url);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"
          }
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[1.1rem] text-center font-medium"
              data-testid="notification-badge"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <h3 className="font-medium text-sm">Notifications</h3>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            Nothing yet — session reminders and updates will land here.
          </p>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="divide-y">
              {items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleItemClick(notification)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-accent transition-colors",
                    !notification.readAt && "bg-primary/5"
                  )}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex items-start gap-2">
                    {!notification.readAt && (
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{notification.title}</p>
                      <p className="text-xs text-muted-foreground">{notification.body}</p>
                      {notification.createdAt && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
