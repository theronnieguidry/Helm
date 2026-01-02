import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Users, 
  Shield,
  Copy,
  Check,
  RefreshCw,
  UserPlus,
  UserMinus,
  Crown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Team, TeamMember, Invite } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface MembersPageProps {
  team: Team;
}

export default function MembersPage({ team }: MembersPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  const { data: members, isLoading: membersLoading } = useQuery<(TeamMember & { user?: { firstName?: string; lastName?: string; profileImageUrl?: string; email?: string } })[]>({
    queryKey: ["/api/teams", team.id, "members"],
    enabled: !!team.id,
  });

  const { data: invites, isLoading: invitesLoading } = useQuery<Invite[]>({
    queryKey: ["/api/teams", team.id, "invites"],
    enabled: !!team.id,
  });

  const currentInvite = invites?.[0];
  const currentMember = members?.find(m => m.userId === user?.id);
  const isDM = currentMember?.role === "dm";

  const regenerateInviteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/teams/${team.id}/invites`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "invites"] });
      toast({ title: "Invite regenerated", description: "A new invite code has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to regenerate", description: error.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("DELETE", `/api/teams/${team.id}/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "members"] });
      setMemberToRemove(null);
      toast({ title: "Member removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  const copyInviteCode = async () => {
    if (currentInvite?.code) {
      await navigator.clipboard.writeText(currentInvite.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const copyInviteLink = async () => {
    if (currentInvite?.code) {
      const link = `${window.location.origin}/join/${currentInvite.code}`;
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  const dmMembers = members?.filter(m => m.role === "dm") || [];
  const playerMembers = members?.filter(m => m.role === "member") || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-medium">Members</h1>
          <p className="text-muted-foreground">
            Manage your team members and invites
          </p>
        </div>
        <Button onClick={() => setIsJoinOpen(true)} variant="outline" data-testid="button-join-team">
          <UserPlus className="h-4 w-4 mr-2" />
          Join Team
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Dungeon Masters ({dmMembers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : dmMembers.length > 0 ? (
                <div className="space-y-3">
                  {dmMembers.map(member => (
                    <div 
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                      data-testid={`member-${member.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.user?.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {getInitials(member.user?.firstName, member.user?.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {member.user?.firstName} {member.user?.lastName}
                            {member.userId === user?.id && (
                              <span className="text-muted-foreground ml-1">(you)</span>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.user?.email}</p>
                        </div>
                      </div>
                      <Badge className="bg-purple-500/10 text-purple-500">
                        <Shield className="h-3 w-3 mr-1" />
                        DM
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No DMs yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Players ({playerMembers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : playerMembers.length > 0 ? (
                <div className="space-y-3">
                  {playerMembers.map(member => (
                    <div 
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-md bg-muted/50 group"
                      data-testid={`member-${member.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.user?.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {getInitials(member.user?.firstName, member.user?.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {member.user?.firstName} {member.user?.lastName}
                            {member.userId === user?.id && (
                              <span className="text-muted-foreground ml-1">(you)</span>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.user?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Player</Badge>
                        {isDM && member.userId !== user?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setMemberToRemove(member)}
                            data-testid={`remove-member-${member.id}`}
                          >
                            <UserMinus className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No players yet</p>
                  <p className="text-sm">Share the invite code to add members</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {isDM && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Invite Members
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {invitesLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : currentInvite ? (
                  <>
                    <div>
                      <Label className="mb-2 block">Invite Code</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 p-3 rounded-md bg-muted font-mono text-lg font-bold tracking-widest text-center">
                          {currentInvite.code}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={copyInviteCode}
                          data-testid="button-copy-code"
                        >
                          {copiedCode ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="mb-2 block">Invite Link</Label>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={copyInviteLink}
                        data-testid="button-copy-link"
                      >
                        {copiedLink ? (
                          <>
                            <Check className="h-4 w-4 mr-2 text-green-500" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Link
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Expires {formatDistanceToNow(new Date(currentInvite.expiresAt), { addSuffix: true })}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => regenerateInviteMutation.mutate()}
                          disabled={regenerateInviteMutation.isPending}
                          data-testid="button-regenerate"
                        >
                          <RefreshCw className={`h-4 w-4 mr-1 ${regenerateInviteMutation.isPending ? "animate-spin" : ""}`} />
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground mb-3">No active invite</p>
                    <Button
                      onClick={() => regenerateInviteMutation.mutate()}
                      disabled={regenerateInviteMutation.isPending}
                      data-testid="button-create-invite"
                    >
                      Create Invite
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Team Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total Members</span>
                <span className="font-medium">{members?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Dungeon Masters</span>
                <span className="font-medium">{dmMembers.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Players</span>
                <span className="font-medium">{playerMembers.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Min. Attendance</span>
                <span className="font-medium">{team.minAttendanceThreshold || 2}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join a Team</DialogTitle>
            <DialogDescription>
              Enter the invite code to join another team
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="joinCode">Invite Code</Label>
            <Input
              id="joinCode"
              placeholder="XXXXXX"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono text-center text-lg tracking-widest mt-2"
              data-testid="input-join-code"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsJoinOpen(false)}>
              Cancel
            </Button>
            <Button 
              disabled={joinCode.length !== 6}
              onClick={() => {
                window.location.href = `/join/${joinCode}`;
              }}
              data-testid="button-submit-join"
            >
              Join Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.user?.firstName} {memberToRemove?.user?.lastName} from the team?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMemberMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
