import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dices, 
  Plus, 
  Minus, 
  History,
  Share2,
  User
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Team, DiceRoll, DiceMode } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface DicePageProps {
  team: Team;
}

const POLYHEDRAL_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const;
type PolyhedralDie = typeof POLYHEDRAL_DICE[number];

const DIE_MAX: Record<PolyhedralDie, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};

export default function DicePage({ team }: DicePageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isPolyhedral = team.diceMode === "polyhedral";

  const [selectedDie, setSelectedDie] = useState<PolyhedralDie>("d20");
  const [diceCount, setDiceCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [poolSize, setPoolSize] = useState(5);
  const [difficulty, setDifficulty] = useState(6);
  const [shareRoll, setShareRoll] = useState(false);
  const [lastRoll, setLastRoll] = useState<{ 
    results: number[]; 
    total: number; 
    successes?: number;
    ones?: number;
    netSuccesses?: number;
    isBotch?: boolean;
  } | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  // Calculate WoD dice pool results with proper mechanics
  // Botch occurs when net successes (hits minus 1s) is zero or negative AND at least one 1 was rolled
  const calculateWoDResults = (results: number[], diff: number) => {
    const successes = results.filter(r => r >= diff).length;
    const ones = results.filter(r => r === 1).length;
    const rawNet = successes - ones;
    const netSuccesses = Math.max(0, rawNet);
    // Botch: when 1s cancel all successes (or there were none) and at least one 1 was rolled
    const isBotch = rawNet <= 0 && ones > 0;
    return { successes, ones, netSuccesses, isBotch };
  };

  const { data: rollHistory } = useQuery<DiceRoll[]>({
    queryKey: ["/api/teams", team.id, "dice-rolls"],
    enabled: !!team.id,
  });

  const rollMutation = useMutation({
    mutationFn: async (data: { diceType: string; count: number; modifier: number; isShared: boolean }) => {
      const response = await apiRequest("POST", `/api/teams/${team.id}/dice-rolls`, data);
      return response.json();
    },
    onSuccess: (roll) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team.id, "dice-rolls"] });
      
      if (team.diceMode === "d10_pool") {
        const wodResults = calculateWoDResults(roll.results, difficulty);
        setLastRoll({ 
          results: roll.results, 
          total: roll.total,
          successes: wodResults.successes,
          ones: wodResults.ones,
          netSuccesses: wodResults.netSuccesses,
          isBotch: wodResults.isBotch,
        });
      } else {
        setLastRoll({ 
          results: roll.results, 
          total: roll.total,
        });
      }
      setIsRolling(false);
    },
    onError: (error: Error) => {
      toast({ title: "Roll failed", description: error.message, variant: "destructive" });
      setIsRolling(false);
    },
  });

  const handleRoll = () => {
    setIsRolling(true);
    setLastRoll(null);
    
    setTimeout(() => {
      if (isPolyhedral) {
        rollMutation.mutate({
          diceType: selectedDie,
          count: diceCount,
          modifier,
          isShared: shareRoll,
        });
      } else {
        rollMutation.mutate({
          diceType: "d10_pool",
          count: poolSize,
          modifier: 0,
          isShared: shareRoll,
        });
      }
    }, 300);
  };

  const myRecentRolls = rollHistory
    ?.filter(r => r.userId === user?.id)
    .slice(0, 10);

  const sharedRolls = rollHistory
    ?.filter(r => r.isShared)
    .slice(0, 10);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-medium">Dice Roller</h1>
        <p className="text-muted-foreground">
          {isPolyhedral ? "Roll polyhedral dice for your game" : "Roll d10 dice pools"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dices className="h-5 w-5" />
                {isPolyhedral ? "Polyhedral Dice" : "d10 Dice Pool"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isPolyhedral ? (
                <>
                  <div className="space-y-2">
                    <Label>Select Die</Label>
                    <div className="flex flex-wrap gap-2">
                      {POLYHEDRAL_DICE.map((die) => (
                        <Button
                          key={die}
                          variant={selectedDie === die ? "default" : "outline"}
                          onClick={() => setSelectedDie(die)}
                          className="min-w-[60px]"
                          data-testid={`button-${die}`}
                        >
                          {die}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Number of Dice</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setDiceCount(Math.max(1, diceCount - 1))}
                          data-testid="button-dice-minus"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          value={diceCount}
                          onChange={(e) => setDiceCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                          className="text-center"
                          min={1}
                          max={20}
                          data-testid="input-dice-count"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setDiceCount(Math.min(20, diceCount + 1))}
                          data-testid="button-dice-plus"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Modifier</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setModifier(modifier - 1)}
                          data-testid="button-mod-minus"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          value={modifier}
                          onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
                          className="text-center"
                          data-testid="input-modifier"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setModifier(modifier + 1)}
                          data-testid="button-mod-plus"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="text-center p-4 rounded-md bg-muted/50">
                    <p className="text-lg font-medium">
                      Rolling {diceCount}{selectedDie}
                      {modifier !== 0 && (
                        <span className={modifier > 0 ? "text-green-500" : "text-red-500"}>
                          {modifier > 0 ? ` +${modifier}` : ` ${modifier}`}
                        </span>
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Pool Size (Number of d10s)</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPoolSize(Math.max(1, poolSize - 1))}
                        data-testid="button-pool-minus"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        value={poolSize}
                        onChange={(e) => setPoolSize(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                        className="text-center w-24"
                        min={1}
                        max={30}
                        data-testid="input-pool-size"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPoolSize(Math.min(30, poolSize + 1))}
                        data-testid="button-pool-plus"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Difficulty (Success on this number or higher)</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setDifficulty(Math.max(1, difficulty - 1))}
                        data-testid="button-diff-minus"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        value={difficulty}
                        onChange={(e) => setDifficulty(Math.max(1, Math.min(10, parseInt(e.target.value) || 6)))}
                        className="text-center w-24"
                        min={1}
                        max={10}
                        data-testid="input-difficulty"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setDifficulty(Math.min(10, difficulty + 1))}
                        data-testid="button-diff-plus"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="text-center p-4 rounded-md bg-muted/50">
                    <p className="text-lg font-medium">
                      Rolling {poolSize}d10 (Difficulty {difficulty}+)
                    </p>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="share"
                    checked={shareRoll}
                    onCheckedChange={setShareRoll}
                    data-testid="switch-share"
                  />
                  <Label htmlFor="share" className="flex items-center gap-1">
                    <Share2 className="h-4 w-4" />
                    Share with team
                  </Label>
                </div>
              </div>

              <Button 
                size="lg" 
                className="w-full" 
                onClick={handleRoll}
                disabled={rollMutation.isPending || isRolling}
                data-testid="button-roll"
              >
                <Dices className="h-5 w-5 mr-2" />
                {isRolling ? "Rolling..." : "Roll!"}
              </Button>
            </CardContent>
          </Card>

          <AnimatePresence mode="wait">
            {lastRoll && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="border-primary">
                  <CardHeader>
                    <CardTitle>Result</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3 mb-4 justify-center">
                      {lastRoll.results.map((result, index) => (
                        <motion.div
                          key={index}
                          initial={{ rotateY: 180, scale: 0.5 }}
                          animate={{ rotateY: 0, scale: 1 }}
                          transition={{ delay: index * 0.1, duration: 0.3 }}
                          className={`h-12 w-12 rounded-md flex items-center justify-center font-bold text-lg ${
                            isPolyhedral
                              ? result === DIE_MAX[selectedDie]
                                ? "bg-green-500/20 text-green-500 border border-green-500"
                                : result === 1
                                ? "bg-red-500/20 text-red-500 border border-red-500"
                                : "bg-muted"
                              : result >= difficulty
                              ? result === 10
                                ? "bg-green-500/20 text-green-500 border-2 border-green-500" // 10s are critical
                                : "bg-green-500/20 text-green-500 border border-green-500" // Regular success
                              : result === 1
                              ? "bg-red-500/20 text-red-500 border border-red-500" // 1s cancel successes
                              : "bg-muted text-muted-foreground" // Normal failure
                          }`}
                          data-testid={`result-die-${index}`}
                        >
                          {result}
                        </motion.div>
                      ))}
                    </div>
                    <div className="text-center">
                      {isPolyhedral ? (
                        <div>
                          <p className="text-4xl font-bold text-primary" data-testid="result-total">
                            {lastRoll.total}
                          </p>
                          {modifier !== 0 && (
                            <p className="text-sm text-muted-foreground">
                              ({lastRoll.results.reduce((a, b) => a + b, 0)} {modifier > 0 ? "+" : ""}{modifier})
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          {lastRoll.isBotch ? (
                            <>
                              <p className="text-4xl font-bold text-red-500" data-testid="result-botch">
                                BOTCH!
                              </p>
                              <p className="text-sm text-red-400">
                                No successes and {lastRoll.ones} {lastRoll.ones === 1 ? "one was" : "ones were"} rolled
                              </p>
                            </>
                          ) : (
                            <>
                              <p className={`text-4xl font-bold ${(lastRoll.netSuccesses ?? 0) > 0 ? "text-primary" : "text-muted-foreground"}`} data-testid="result-successes">
                                {lastRoll.netSuccesses} {lastRoll.netSuccesses === 1 ? "Success" : "Successes"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {lastRoll.successes} {lastRoll.successes === 1 ? "hit" : "hits"} - {lastRoll.ones} {lastRoll.ones === 1 ? "one" : "ones"} = {lastRoll.netSuccesses} net
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Your History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {myRecentRolls && myRecentRolls.length > 0 ? (
                  <div className="space-y-2">
                    {myRecentRolls.map((roll) => (
                      <div 
                        key={roll.id} 
                        className="p-3 rounded-md bg-muted/50 text-sm"
                        data-testid={`history-${roll.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">
                            {roll.count}{roll.diceType}
                            {roll.modifier !== 0 && (roll.modifier > 0 ? ` +${roll.modifier}` : ` ${roll.modifier}`)}
                          </span>
                          <span className="font-bold text-primary">{roll.total}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{(roll.results as number[]).join(", ")}</span>
                          <span>{formatDistanceToNow(new Date(roll.createdAt!), { addSuffix: true })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No rolls yet
                  </p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                Team Rolls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {sharedRolls && sharedRolls.length > 0 ? (
                  <div className="space-y-2">
                    {sharedRolls.map((roll) => (
                      <div 
                        key={roll.id} 
                        className="p-3 rounded-md bg-muted/50 text-sm"
                        data-testid={`shared-${roll.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            <span className="font-medium">
                              {roll.count}{roll.diceType}
                            </span>
                          </div>
                          <span className="font-bold text-primary">{roll.total}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(roll.createdAt!), { addSuffix: true })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No shared rolls yet
                  </p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
