import { createFileRoute } from "@tanstack/react-router";
import { requireUnlocked } from "@/lib/gate.functions";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { completeTask, useTrialBridgeState } from "@/lib/trialbridge/store";

export const Route = createFileRoute("/training")({
  loader: () => requireUnlocked(),
  component: VisitsPage,
});

function VisitsPage() {
  const state = useTrialBridgeState();

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Study visit & task coordination</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Visit-level execution board for coordinators, investigators and monitors.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Task board</CardTitle>
          <CardDescription>
            Track visit scheduling, follow-up and completion status.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Participant</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>{task.label}</TableCell>
                  <TableCell>{task.participantId}</TableCell>
                  <TableCell>{task.siteId}</TableCell>
                  <TableCell>{task.dueOn}</TableCell>
                  <TableCell>{task.done ? "Complete" : "Open"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={task.done}
                      onClick={() => completeTask(task.id)}
                    >
                      Mark done
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
