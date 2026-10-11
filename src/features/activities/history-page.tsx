import { SidebarProvider } from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import { useUrlState } from "#/features/navigation/use-url-state";
import { useActivityStore } from "./activity-store";
import { HistoryPanel } from "./activity-history";

export function HistoryPage() {
  const [search, updateSearch] = useUrlState();
  const { activities } = useActivityStore();
  return (
    <TooltipProvider>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
        <WorkspaceNavigation />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background text-foreground">
          <header className="border-b px-6 py-5">
            <h1 className="text-xl font-semibold">History</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Activity changes, MCP writes and event deliveries.
            </p>
          </header>
          <div className="mx-auto w-full max-w-4xl p-6">
            <label className="grid gap-2 text-sm">
              Activity
              <select
                className="min-w-0 rounded-md border bg-background px-3 py-2"
                value={search.activity ?? ""}
                onChange={(event) => updateSearch({ activity: event.target.value || undefined })}
              >
                <option value="">All activities</option>
                {search.activity && !activities.some((item) => item.id === search.activity) && (
                  <option value={search.activity}>{search.activity}</option>
                )}
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    #{activity.number} {activity.effective.title}
                  </option>
                ))}
              </select>
            </label>
            <HistoryPanel
              activityId={search.activity}
              tab={search.auditTab ?? "changes"}
              onTabChange={(auditTab) => updateSearch({ auditTab })}
            />
          </div>
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}
