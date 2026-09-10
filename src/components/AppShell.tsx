import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Activity, AlertTriangle, Lock, LogOut } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { getGateStatus, signOut } from "@/lib/gate.functions";
import { hydrateTrialBridge, useTrialBridgeState } from "@/lib/trialbridge/store";

const NAV = [
  { to: "/", label: "Coordinator Dashboard" },
  { to: "/patient", label: "Study Setup" },
  { to: "/upload", label: "Recruitment" },
  { to: "/analysis", label: "Eligibility AI" },
  { to: "/screening", label: "Consent" },
  { to: "/training", label: "Visits & Tasks" },
  { to: "/history", label: "Participant Portal" },
  { to: "/methodology", label: "Sites & Audit" },
] as const;

function GateControl() {
  const navigate = useNavigate();
  const router = useRouter();
  const [status, setStatus] = useState<{ unlocked: boolean; username: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    getGateStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!status) return null;

  if (!status.unlocked) {
    return (
      <Link
        to="/unlock"
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Lock className="size-3.5" /> Sign in
      </Link>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
      <span className="hidden sm:inline">Signed in as {status.username}</span>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          setStatus({ unlocked: false, username: null });
          await router.invalidate();
          await navigate({ to: "/", replace: true });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-accent hover:text-foreground"
      >
        <LogOut className="size-3.5" /> Sign out
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const state = useTrialBridgeState();

  useEffect(() => {
    hydrateTrialBridge();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Activity className="size-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">TrialBridge</span>
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                Clinical Research Operations
              </span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Badge variant="secondary" className="ml-auto">
            Role: {state.role}
          </Badge>
          <GateControl />
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-border bg-destructive/10 px-4 py-1.5 text-center text-[11px] text-foreground/80">
          <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          <span>
            AI-assisted trial screening only. Automated recommendations require human review before
            enrollment.
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t border-border px-4 py-8 text-center text-xs text-muted-foreground">
        TrialBridge MVP · Study setup, recruitment, consent, visit coordination, RBAC and GCP-style
        audit visibility
      </footer>
    </div>
  );
}
