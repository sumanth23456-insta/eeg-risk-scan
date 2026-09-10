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
import { setRole, type TrialRole } from "@/lib/trialbridge/store";

export const Route = createFileRoute("/unlock")({
  component: UnlockPage,
});

const ROLES: TrialRole[] = ["Admin", "PI", "Coordinator", "Monitor", "Participant", "Sponsor"];

function UnlockPage() {
  const navigate = useNavigate();
  const submit = useServerFn(signIn);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [role, setLocalRole] = useState<TrialRole>("Coordinator");

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
      if (res.ok) {
        setRole(role);
        await navigate({ to: "/" });
      } else {
        setError(true);
      }
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
              Sign in & choose role
            </CardTitle>
            <CardDescription>
              Access trial operations views with an explicit role context.
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
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setLocalRole(e.target.value as TrialRole)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ROLES.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </div>
              {error ? (
                <Alert variant="destructive">
                  <ShieldAlert className="size-4" />
                  <AlertTitle>Access denied</AlertTitle>
                  <AlertDescription>Incorrect username or password.</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Verifying…" : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
