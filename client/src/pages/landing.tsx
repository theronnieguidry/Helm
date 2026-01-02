import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dices, Calendar, BookOpen, Users, Shield, Sparkles } from "lucide-react";

export default function LandingPage() {
  const features = [
    {
      icon: Users,
      title: "Team Management",
      description: "Create multiple teams for different campaigns or gaming groups. Manage members and roles with ease."
    },
    {
      icon: Calendar,
      title: "Smart Scheduling",
      description: "Set up recurring game schedules with flexible weekly, biweekly, or monthly options. Track attendance automatically."
    },
    {
      icon: BookOpen,
      title: "Collaborative Notes",
      description: "Keep track of locations, characters, NPCs, and quests. Private or shared notes with wiki-style linking."
    },
    {
      icon: Dices,
      title: "Dice Roller",
      description: "Roll polyhedral dice for D&D and Pathfinder, or d10 pools for World of Darkness games."
    },
    {
      icon: Shield,
      title: "DM Tools",
      description: "Dungeon Masters get admin privileges to manage teams, override schedules, and control game settings."
    },
    {
      icon: Sparkles,
      title: "Game System Support",
      description: "Built-in support for Pathfinder 2e, D&D, Vampire: The Masquerade, Werewolf, and more."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4 px-4 mx-auto max-w-7xl">
          <div className="flex items-center gap-2">
            <Dices className="h-8 w-8 text-primary" />
            <span className="text-xl font-medium">Quest Keeper</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild data-testid="button-login">
              <a href="/api/login">Sign In</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 md:py-32">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="flex flex-col items-center text-center gap-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                For tabletop gaming groups
              </div>
              <h1 className="text-4xl md:text-6xl font-medium tracking-tight max-w-3xl">
                Coordinate Your Gaming Sessions with Ease
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
                Quest Keeper helps tabletop gaming groups schedule sessions, manage campaign notes, 
                roll dice, and stay organized. Perfect for Dungeon Masters and players alike.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" asChild data-testid="button-get-started">
                  <a href="/api/login">Get Started Free</a>
                </Button>
                <Button size="lg" variant="outline" data-testid="button-learn-more">
                  Learn More
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-medium mb-4">Everything Your Party Needs</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                From scheduling to note-taking to dice rolling, Quest Keeper has all the tools 
                to keep your gaming group coordinated and your adventures on track.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card key={feature.title} className="hover-elevate transition-all">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="rounded-md bg-primary/10 p-2">
                        <feature.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-medium">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="flex flex-col items-center text-center gap-6">
              <h2 className="text-3xl font-medium">Supported Game Systems</h2>
              <div className="flex flex-wrap justify-center gap-4">
                {["Pathfinder 2e", "Dungeons & Dragons", "Vampire: The Masquerade", "Werewolf: The Forsaken", "Custom Games"].map((game) => (
                  <div 
                    key={game} 
                    className="rounded-md border bg-card px-4 py-2 text-sm font-medium"
                  >
                    {game}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="flex flex-col items-center text-center gap-6">
              <h2 className="text-3xl font-medium">Ready to Begin Your Quest?</h2>
              <p className="max-w-xl opacity-90">
                Join thousands of gaming groups who use Quest Keeper to coordinate their adventures.
              </p>
              <Button size="lg" variant="secondary" asChild data-testid="button-start-free">
                <a href="/api/login">Start Free Today</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Dices className="h-5 w-5" />
              <span className="text-sm">Quest Keeper</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for tabletop gamers, by tabletop gamers.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
