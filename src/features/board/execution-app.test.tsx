import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ExecutionToolResult } from "./execution-app";
import { executionRun } from "#/features/execution/model";
import { workspaceAppResource } from "#/features/mcp/app-resource";

const mocks = vi.hoisted(() => ({
  load: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  call: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  connect: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  close: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  input: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  result: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  bridges: [] as Array<{
    oninitialized?: () => void;
    oncalltool?: (args: { name: string; arguments: Record<string, string> }) => Promise<unknown>;
  }>,
}));
vi.mock("#/features/execution/server-functions", () => ({
  loadExecutionApp: mocks.load,
  callExecutionAppTool: mocks.call,
}));
vi.mock("#/features/activities/activity-state", () => ({
  useActivities: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@modelcontextprotocol/ext-apps/app-bridge", () => ({
  AppBridge: class {
    constructor() {
      mocks.bridges.push(this);
    }
    oninitialized?: () => void;
    oncalltool?: (args: { name: string; arguments: Record<string, string> }) => Promise<unknown>;
    connect = mocks.connect;
    close = mocks.close;
    sendToolInput = mocks.input;
    sendToolResult = mocks.result;
  },
  PostMessageTransport: class {},
}));

const toolResult = {
  content: [{ type: "text", text: "Saved" }],
  structuredContent: { ok: true },
  _meta: { ui: { resourceUri: workspaceAppResource.uri } },
};
const call = {
  id: "call-one",
  name: "update_activity_progress",
  arguments: {
    id: "reply",
    requestId: "draft-write",
    expectedRevision: 1,
    draft: "Hello",
    reason: "Prepared a reply from the conversation.",
    evidence: [
      {
        kind: "beeper_message",
        targetId: "um790",
        accountId: "work",
        chatId: "chat",
        messageId: "message",
      },
    ],
  },
  status: "completed" as const,
  result: toolResult,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bridges.length = 0;
  mocks.load.mockResolvedValue({
    ok: true,
    html: "<html><head></head><body>Guest</body></html>",
    resourceUri: workspaceAppResource.uri,
    arguments: call.arguments,
    result: toolResult,
  });
});

it("restores a persisted tool result into an opaque sandbox and forwards only scoped UI requests", async () => {
  const run = executionRun.parse({
    id: "30000000-0000-4000-8000-000000000001",
    status: "review",
    messages: [],
    createdAt: 1,
    updatedAt: 2,
    toolCalls: [call],
  });
  const view = render(<ExecutionToolResult runId={run.id} call={run.toolCalls[0] ?? call} />);
  const iframe = screen.getByTitle("Task and reply draft workspace");
  await waitFor(() => expect(iframe.getAttribute("srcdoc")).toContain("connect-src 'none'"));
  expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-forms");
  expect(mocks.load).toHaveBeenCalledWith({
    data: { id: "30000000-0000-4000-8000-000000000001", toolCallId: "call-one" },
  });
  await act(async () => {
    mocks.bridges[0]?.oninitialized?.();
  });
  expect(mocks.input).toHaveBeenCalledWith({ arguments: call.arguments });
  expect(mocks.result).toHaveBeenCalledWith(toolResult);
  mocks.call.mockResolvedValue({ ok: true, result: toolResult });
  await act(async () => {
    await mocks.bridges[0]?.oncalltool?.({
      name: "update_activity",
      arguments: { id: "target", draftText: "Edited" },
    });
  });
  expect(mocks.call).toHaveBeenCalledWith({
    data: {
      id: "30000000-0000-4000-8000-000000000001",
      toolCallId: "call-one",
      name: "update_activity",
      arguments: { id: "target", draftText: "Edited" },
    },
  });
  expect(mocks.refresh).toHaveBeenCalledOnce();
  view.unmount();
  expect(mocks.close).toHaveBeenCalledOnce();
});

it("shows running and failed tools without mounting an app", () => {
  const view = render(
    <ExecutionToolResult
      runId="30000000-0000-4000-8000-000000000001"
      call={{ ...call, status: "running", result: undefined }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Updating the workspace");
  expect(mocks.load).not.toHaveBeenCalled();
  view.rerender(
    <ExecutionToolResult
      runId="30000000-0000-4000-8000-000000000001"
      call={{
        ...call,
        status: "failed",
        result: {
          content: [{ type: "text", text: "This task changed; read its current state." }],
          isError: true,
        },
      }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("This task changed");
});

it("does not load arbitrary tool-provided app resources", () => {
  render(
    <ExecutionToolResult
      runId="30000000-0000-4000-8000-000000000001"
      call={{
        ...call,
        result: { ...toolResult, _meta: { ui: { resourceUri: "https://untrusted.invalid/app" } } },
      }}
    />,
  );
  expect(screen.queryByTitle("Task and reply draft workspace")).toBeNull();
  expect(mocks.load).not.toHaveBeenCalled();
});

it("returns rejected app writes to the guest and leaves board data untouched", async () => {
  render(<ExecutionToolResult runId="30000000-0000-4000-8000-000000000001" call={call} />);
  await waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());
  mocks.call.mockResolvedValue({
    ok: false,
    error: { message: "This app cannot edit another task." },
  });
  const response = await mocks.bridges[0]?.oncalltool?.({
    name: "update_activity",
    arguments: { id: "other" },
  });
  expect(response).toEqual({
    isError: true,
    content: [{ type: "text", text: "This app cannot edit another task." }],
  });
  expect(mocks.refresh).not.toHaveBeenCalled();
});
