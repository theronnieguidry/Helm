import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Compass, Calendar, BookOpen, Users, Dices, Sparkles } from "lucide-react";

export default function LandingPage() {
  const features = [
    {
      icon: Users,
      title: "Gather Everyone in One Place",
      description: "Create a group, invite others with a simple link or code, and keep everything related to your meetups in one shared space."
    },
    {
      icon: Calendar,
      title: "Scheduling That Fits Your Rhythm",
      description: "Set a default schedule — weekly, biweekly, or monthly — and adjust when life happens. Coordinate times and send reminders."
    },
    {
      icon: BookOpen,
      title: "Notes That Actually Get Used",
      description: "Capture notes, ideas, plans, or lore in one place. Share with the whole group or keep them private."
    },
    {
      icon: Dices,
      title: "Dice Rolling (If You Need It)",
      description: "If your group plays tabletop games, Helm includes a built-in dice roller. Not a gaming group? No worries — the dice stay out of the way."
    }
  ];

  const groupTypes = [
    "Book Clubs",
    "Running Groups", 
    "Study Groups",
    "Volunteer Teams",
    "Gaming Groups",
    "Hobby Circles"
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4 px-4 mx-auto max-w-7xl">
          <div className="flex items-center gap-2">
            <Compass className="h-8 w-8 text-primary" />
            <span className="text-xl font-medium">Helm</span>
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
                Your Group Meetup Companion
              </div>
              <h1 className="text-4xl md:text-6xl font-medium tracking-tight max-w-3xl">
                Bring Your Group Together (Without the Chaos)
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
                Stop juggling calendars, chat threads, and reminders. Helm helps your group stay 
                organized and in sync — no matter what brings you together.
              </p>
              <div className="flex flex-col items-center gap-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" asChild data-testid="button-get-started">
                    <a href="/api/login">Create Your First Group</a>
                  </Button>
                  <Button size="lg" variant="outline" data-testid="button-learn-more">
                    Learn More
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Sign up with email or continue with Google, Apple, GitHub
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-medium mb-4">What You Can Do with Helm</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                From tabletop adventures to running clubs, study groups, hobby circles, or casual 
                get-togethers, Helm adapts to how your group works.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
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
            <div className="text-center mb-12">
              <h2 className="text-3xl font-medium mb-4">How Helm Works</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-4 max-w-4xl mx-auto">
              {[
                { step: "1", title: "Create your group", desc: "Choose the type and give it a name" },
                { step: "2", title: "Set your schedule", desc: "Pick a recurring day and time" },
                { step: "3", title: "Invite your people", desc: "Share a link or code to join" },
                { step: "4", title: "Stay in sync", desc: "Focus on the fun part" }
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-medium mx-auto mb-3">
                    {item.step}
                  </div>
                  <h3 className="font-medium mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="flex flex-col items-center text-center gap-6">
              <h2 className="text-3xl font-medium">Built for All Kinds of Groups</h2>
              <div className="flex flex-wrap justify-center gap-3">
                {groupTypes.map((group) => (
                  <div 
                    key={group} 
                    className="rounded-md border bg-card px-4 py-2 text-sm font-medium"
                  >
                    {group}
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground max-w-lg">
                No matter the reason, Helm helps people show up — organized and excited.
              </p>
            </div>
          </div>
        </section>

        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container px-4 mx-auto max-w-7xl">
            <div className="flex flex-col items-center text-center gap-6">
              <h2 className="text-3xl font-medium">Ready to Get Started?</h2>
              <p className="max-w-xl opacity-90">
                Helm is here to help your group stay organized, connected, and moving forward — 
                for every kind of meetup.
              </p>
              <Button size="lg" variant="secondary" asChild data-testid="button-start-free">
                <a href="/api/login">Get Started for Free</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Compass className="h-5 w-5" />
              <span className="text-sm">Helm</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your group meetup companion.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
