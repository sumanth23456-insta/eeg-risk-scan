import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { signIn } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Restricted Access — NeuroRisk EEG" },
      {
        name: "description",
        content:
          "Enter the shared research credentials to access model training and analysis history.",
      },
      { property: "og:title", content: "Restricted Access — NeuroRisk EEG" },
      {
        property: "og:description",
        content: "Shared credentials are required for the restricted research areas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UnlockPage,
});

function UnlockPage() {
  const navigate = useNavigate();
  const submit = useServerFn(signIn);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(false);
    try {
      const res = await submit({
        data: {
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
        },
      });
      if (res.ok) await navigate({ to: "/training" });
      else setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-primary" />
              Restricted research area
            </CardTitle>
            <CardDescription>
              Model Training and Analysis History require the shared laboratory credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input id="username" name="username" autoComplete="username" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <ShieldAlert className="size-4" />
                  <AlertTitle>Access denied</AlertTitle>
                  <AlertDescription>Incorrect username or password.</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Verifying…" : "Unlock"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Shared credentials are a lightweight access gate, not per-user authentication. They
                do not protect patient data and no EEG data leaves this browser.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
