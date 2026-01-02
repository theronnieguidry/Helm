import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dices, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function JoinTeamPage() {
  const { code } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "joining">("loading");
  const [teamName, setTeamName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const joinMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/invites/${code}/join`);
      return response.json();
    },
    onSuccess: (data) => {
      setTeamName(data.teamName);
      setStatus("success");
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Joined team!", description: `You are now a member of ${data.teamName}` });
    },
    onError: (error: Error) => {
      setStatus("error");
      setErrorMessage(error.message);
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem("joinCode", code || "");
      window.location.href = "/api/login";
      return;
    }

    if (isAuthenticated && code && status === "loading") {
      setStatus("joining");
      joinMutation.mutate();
    }
  }, [authLoading, isAuthenticated, code, status]);

  if (authLoading || status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Checking invite...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "joining") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Joining team...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Dices className="h-8 w-8 text-primary" />
            <span className="text-xl font-medium">Quest Keeper</span>
          </div>
          {status === "success" ? (
            <>
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <CardTitle>Welcome to {teamName}!</CardTitle>
              <CardDescription>
                You've successfully joined the team.
              </CardDescription>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="h-8 w-8 text-red-500" />
              </div>
              <CardTitle>Unable to Join</CardTitle>
              <CardDescription>
                {errorMessage || "This invite code is invalid or has expired."}
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          <Button 
            className="w-full" 
            onClick={() => navigate("/")}
            data-testid="button-go-home"
          >
            {status === "success" ? "Go to Dashboard" : "Go Home"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
