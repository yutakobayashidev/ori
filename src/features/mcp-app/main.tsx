import { defineApp, type AppProps, type DefinedTool } from "chapplin";
import { init, useApp } from "chapplin/client/react";
import { useCallback, useEffect } from "react";
import { Button } from "#/components/ui/button";
import type { ActivityContext } from "#/features/activities/model";
import { Activities } from "./activities";
import { Research, type ResearchResult } from "./research";
import "#/styles.css";
import "./theme.css";

function WorkspaceApp({ output, hostContext }: AppProps) {
  const app = useApp();
  const callTool = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const result = await app.callServerTool({ name, arguments: args });
      if (!result.structuredContent)
        throw new Error("The workspace returned no result. Please retry.");
      return result.structuredContent as Record<string, unknown>;
    },
    [app],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = hostContext?.theme ?? "dark";
    document.documentElement.classList.toggle("dark", hostContext?.theme !== "light");
  }, [hostContext?.theme]);
  const result = output?.structuredContent;
  const context = output?._meta?.workspace as
    | {
        toolName: string;
        toolArguments: Record<string, unknown>;
      }
    | undefined;
  if (!result)
    return (
      <div
        role="status"
        aria-label="Loading workspace"
        className="m-4 h-24 animate-pulse rounded-xl bg-muted"
      />
    );
  if (result.ok !== true) {
    const failure = result.error as { message?: string } | undefined;
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {failure?.message ?? "The workspace could not complete this request."}
      </p>
    );
  }
  if (!context)
    return (
      <p role="alert" className="p-4">
        Refresh the workspace connection and try again.
      </p>
    );
  return (
    <main className="@container min-w-0">
      {hostContext?.availableDisplayModes?.includes("fullscreen") && (
        <div className="flex justify-end border-b p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void app.requestDisplayMode({
                mode: hostContext.displayMode === "fullscreen" ? "inline" : "fullscreen",
              })
            }
          >
            {hostContext.displayMode === "fullscreen" ? "Collapse" : "Expand"}
          </Button>
        </div>
      )}
      {context.toolName === "get_activity_context" ? (
        <Activities
          key={JSON.stringify(output)}
          initial={result as ActivityContext}
          callTool={callTool}
          toolArguments={context.toolArguments}
        />
      ) : (
        <Research
          key={JSON.stringify(output)}
          initial={result as ResearchResult}
          callTool={callTool}
          toolName={context.toolName}
          toolArguments={context.toolArguments}
        />
      )}
    </main>
  );
}

init(
  defineApp<DefinedTool>({
    config: { appInfo: { name: "personal-workspace", version: "1.0.0" } },
    ui: WorkspaceApp,
  }),
);
