import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import type { Team } from "@shared/schema";

import LandingPage from "@/pages/landing";
import TeamWizard from "@/pages/team-wizard";
import DashboardContent from "@/pages/dashboard";
import NotesPage from "@/pages/notes";
import SessionReviewPage from "@/pages/session-review";
import DicePage from "@/pages/dice";
import SchedulePage from "@/pages/schedule";
import MembersPage from "@/pages/members";
import SettingsPage from "@/pages/settings";
import ProfileSettingsPage from "@/pages/profile-settings";
import JoinTeamPage from "@/pages/join-team";
import NotFound from "@/pages/not-found";

function AuthenticatedApp() {
  const [location, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  
  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    enabled: !!user,
  });

  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);

  useEffect(() => {
    if (teams && teams.length > 0 && !currentTeam) {
      const savedTeamId = localStorage.getItem("currentTeamId");
      const team = savedTeamId ? teams.find(t => t.id === savedTeamId) : teams[0];
      setCurrentTeam(team || teams[0]);
    }
  }, [teams, currentTeam]);

  const handleTeamSelect = (team: Team) => {
    setCurrentTeam(team);
    localStorage.setItem("currentTeamId", team.id);
  };

  const handleCreateTeam = () => {
    navigate("/create-team");
  };

  const handleTeamUpdate = (updatedTeam: Team) => {
    setCurrentTeam(updatedTeam);
  };

  if (authLoading || teamsLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!teams || teams.length === 0) {
    return <TeamWizard />;
  }

  if (!currentTeam) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar 
          teams={teams} 
          currentTeam={currentTeam}
          onTeamSelect={handleTeamSelect}
          onCreateTeam={handleCreateTeam}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-2 p-2 border-b bg-background sticky top-0 z-40">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/">
                <DashboardContent team={currentTeam} />
              </Route>
              <Route path="/notes">
                <NotesPage team={currentTeam} />
              </Route>
              <Route path="/notes/:id">
                <NotesPage team={currentTeam} />
              </Route>
              <Route path="/session-review/:noteId">
                <SessionReviewPage team={currentTeam} />
              </Route>
              <Route path="/dice">
                <DicePage team={currentTeam} />
              </Route>
              <Route path="/schedule">
                <SchedulePage team={currentTeam} />
              </Route>
              <Route path="/members">
                <MembersPage team={currentTeam} />
              </Route>
              <Route path="/settings">
                <SettingsPage team={currentTeam} onTeamUpdate={handleTeamUpdate} />
              </Route>
              <Route path="/profile">
                <ProfileSettingsPage />
              </Route>
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/join/:code" component={JoinTeamPage} />
      <Route path="/create-team" component={TeamWizard} />
      <Route>
        {user ? <AuthenticatedApp /> : <LandingPage />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="quest-keeper-theme">
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
