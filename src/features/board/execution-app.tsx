import { type CSSProperties, useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { Button } from "#/components/ui/button";
import { useActivities } from "#/features/activities/activity-state";
import type { ExecutionToolCall } from "#/features/execution/model";
import { loadExecutionApp, callExecutionAppTool } from "#/features/execution/server-functions";
import { executionAppToolInput } from "#/features/execution/app-model";
import { workspaceAppResource } from "#/features/mcp/app-resource";

const labels: Record<string, string> = {
  get_activity_context: "Task and reply draft",
  update_activity_progress: "Task progress updated",
};

export function ExecutionToolResult({ runId, call }: { runId: string; call: ExecutionToolCall }) {
  const ui = call.result?._meta?.ui as { resourceUri?: string } | undefined;
  const hasApp = call.status === "completed" && ui?.resourceUri === workspaceAppResource.uri;
  return (
    <section
      className="my-3 overflow-hidden rounded-xl border bg-background"
      aria-label={labels[call.name] ?? call.name}
    >
      <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        {labels[call.name] ?? call.name}
        {call.status === "running" && " · Working…"}
        {call.status === "failed" && " · Failed"}
      </p>
      {hasApp ? (
        <ExecutionApp runId={runId} toolCallId={call.id} />
      ) : (
        <div className="px-3 py-2 text-sm" role={call.status === "failed" ? "alert" : "status"}>
          {call.result?.content
            ?.filter((item) => item.type === "text" && typeof item.text === "string")
            .map((item, index) => (
              <p key={index} className="whitespace-pre-wrap break-words">
                {typeof item.text === "string" ? item.text : ""}
              </p>
            ))}
          {call.status === "running" && "Updating the workspace…"}
        </div>
      )}
    </section>
  );
}

function ExecutionApp({ runId, toolCallId }: { runId: string; toolCallId: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { refresh } = useActivities();
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(420);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    let bridge: AppBridge | undefined;
    const iframe = frame.current;
    if (!iframe?.contentWindow) return;
    const guestWindow = iframe.contentWindow;
    const guestFrame = iframe;
    async function connect() {
      const resource = await loadExecutionApp({ data: { id: runId, toolCallId } });
      if (!alive) return;
      if (!resource.ok) throw new Error(resource.error.message);
      if (resource.resourceUri !== workspaceAppResource.uri)
        throw new Error("Unsupported workspace app.");
      bridge = new AppBridge(
        null,
        { name: "Personal Workspace", version: "1.0.0" },
        { serverTools: {} },
        {
          hostContext: {
            theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
            displayMode: "inline",
            availableDisplayModes: ["inline"],
          },
        },
      );
      const current = bridge;
      current.oncalltool = async ({ name, arguments: args }) => {
        const parsed = executionAppToolInput.safeParse({
          id: runId,
          toolCallId,
          name,
          arguments: args ?? {},
        });
        if (!parsed.success)
          return {
            isError: true,
            content: [{ type: "text", text: "This action is unavailable in the task workspace." }],
          };
        const response = await callExecutionAppTool({ data: parsed.data });
        if (!response.ok)
          return { isError: true, content: [{ type: "text", text: response.error.message }] };
        void refresh();
        return { ...response.result, content: response.result.content ?? [] } as Awaited<
          ReturnType<NonNullable<AppBridge["oncalltool"]>>
        >;
      };
      current.onsizechange = ({ height }) => {
        if (alive && height) setHeight(Math.min(Math.max(height, 160), 720));
      };
      current.oninitialized = () => {
        void (async () => {
          await current.sendToolInput({ arguments: resource.arguments });
          await current.sendToolResult(
            resource.result as Parameters<AppBridge["sendToolResult"]>[0],
          );
          if (alive) setReady(true);
        })().catch((cause: unknown) => {
          if (alive)
            setError(
              cause instanceof Error ? cause.message : "Could not initialize the workspace app.",
            );
        });
      };
      await current.connect(new PostMessageTransport(guestWindow, guestWindow));
      if (!alive) return;
      // Only the bundled workspace app is loaded. An opaque sandbox origin and CSP
      // keep its access to the parent and network behind the authenticated bridge.
      const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
      guestFrame.srcdoc = resource.html.replace(/<head([^>]*)>/i, `<head$1>${policy}`);
    }
    void connect().catch((cause: unknown) => {
      if (alive)
        setError(cause instanceof Error ? cause.message : "Could not load the workspace app.");
    });
    return () => {
      alive = false;
      void bridge?.close();
    };
  }, [runId, toolCallId, refresh, attempt]);
  return (
    <>
      {!ready && !error && (
        <p role="status" className="p-3 text-sm text-muted-foreground">
          Opening workspace…
        </p>
      )}
      {error && (
        <div role="alert" className="p-3 text-sm">
          <p>{error}</p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => {
              setError("");
              setReady(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry app
          </Button>
        </div>
      )}
      <iframe
        ref={frame}
        title="Task and reply draft workspace"
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        className="h-[var(--app-height)] w-full border-0"
        style={{ "--app-height": `${ready ? height : 0}px` } as CSSProperties}
      />
    </>
  );
}
