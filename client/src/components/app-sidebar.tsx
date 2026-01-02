import { useLocation, Link } from "wouter";
import { 
  LayoutDashboard, 
  Calendar, 
  BookOpen, 
  Dices, 
  Users, 
  Settings,
  Plus,
  ChevronDown
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import type { Team, DiceMode } from "@shared/schema";

interface AppSidebarProps {
  teams: Team[];
  currentTeam: Team | null;
  onTeamSelect: (team: Team) => void;
  onCreateTeam: () => void;
}

export function AppSidebar({ teams, currentTeam, onTeamSelect, onCreateTeam }: AppSidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  const menuItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Schedule", url: "/schedule", icon: Calendar },
    { title: "Notes", url: "/notes", icon: BookOpen },
  ];

  const diceEnabled = currentTeam?.diceMode !== "disabled";
  if (diceEnabled) {
    menuItems.push({ title: "Dice", url: "/dice", icon: Dices });
  }

  menuItems.push(
    { title: "Members", url: "/members", icon: Users },
    { title: "Settings", url: "/settings", icon: Settings }
  );

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between gap-2 h-auto py-2 px-3"
              data-testid="button-team-selector"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Dices className="h-4 w-4 text-primary" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium truncate">
                    {currentTeam?.name || "Select Team"}
                  </p>
                  {currentTeam && (
                    <p className="text-xs text-muted-foreground truncate">
                      {currentTeam.teamType.replace("_", " ")}
                    </p>
                  )}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                onClick={() => onTeamSelect(team)}
                data-testid={`menu-item-team-${team.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
                    <Dices className="h-3 w-3 text-primary" />
                  </div>
                  <span className="truncate">{team.name}</span>
                </div>
              </DropdownMenuItem>
            ))}
            {teams.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={onCreateTeam} data-testid="menu-item-create-team">
              <Plus className="h-4 w-4 mr-2" />
              Create New Team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-2 h-auto py-2 px-3"
              data-testid="button-user-menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                <AvatarFallback>{getInitials(user?.firstName, user?.lastName)}</AvatarFallback>
              </Avatar>
              <div className="text-left min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[--radix-dropdown-menu-trigger-width]">
            <DropdownMenuItem onClick={() => logout()} data-testid="menu-item-logout">
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
