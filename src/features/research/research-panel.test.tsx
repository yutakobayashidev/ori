import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Connection } from "../connections/model";
import type { ResearchHistoryEntry, ResearchRun } from "./model";
import { ResearchPanel } from "./research-panel";

const navigation = vi.hoisted(() => ({
  search: {} as { run?: string; deck?: string; citation?: string },
  set: vi.fn<(patch: { run?: string; deck?: string; citation?: string }) => void>(),
}));
vi.mock("../navigation/use-url-state", async () => {
  const { useState } = await import("react");
  return {
    useUrlState: () => {
      const [search, update] = useState(navigation.search);
      return [
        search,
        (patch: typeof search) => {
          navigation.set(patch);
          update((previous) => ({ ...previous, ...patch }));
        },
      ];
    },
  };
});
const actions = vi.hoisted(() => ({
  status: vi.fn<(opts: { data: { id?: string } }) => Promise<typeof current>>(),
  start: vi.fn<typeof import("./server-functions").startResearch>(),
  cancel: vi.fn<typeof import("./server-functions").cancelResearch>(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("./server-functions", () => ({
  loadResearchStatus: actions.status,
  startResearch: actions.start,
  cancelResearch: actions.cancel,
}));

const connection: Connection = {
  id: "first",
  platform: "twitter",
  origin: "https://relay.invalid",
  accountId: null,
  displayName: "調査用アカウント",
  status: "connected",
};
const running: ResearchRun = {
  id: "run1",
  topic: "WebMCPの反応",
  status: "running",
  deckVersion: 1,
  startedAt: 1000,
  message: "投稿を調べています",
  citations: [],
  messages: [{ id: "u1", role: "user", text: "WebMCPの反応" }],
  deck: { id: "plan", title: "WebMCP調査", columns: [] },
};
let current: {
  configured: boolean;
  run: ResearchRun | null;
  history?: ResearchHistoryEntry[];
};
const clients: QueryClient[] = [];
class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn<() => void>();
  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
}

beforeEach(() => {
  navigation.search = {};
  vi.resetAllMocks();
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  current = { configured: true, run: null };
  actions.status.mockImplementation(async ({ data }: { data: { id?: string } }) => ({
    ...current,
    run: current.run?.id === data.id ? current.run : null,
  }));
  actions.start.mockImplementation(async () => {
    current = { configured: true, run: running };
    return running;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const client of clients.splice(0)) client.clear();
});

function show(connections = [connection], ready = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const onOpenDeck =
    vi.fn<(deck: import("../decks/model").Deck, activate?: boolean) => Promise<void> | void>();
  const onNavigateCitation = vi
    .fn<
      (url: string, citations: import("./model").ResearchCitation[], restore?: boolean) => boolean
    >()
    .mockReturnValue(true);
  const ui = (
    ready = true,
    contextDeck = { id: "manual", title: "手動デッキ", columns: [] },
    presentation = "desktop",
  ) => (
    <QueryClientProvider client={client}>
      <ResearchPanel
        ready={ready}
        contextDeck={contextDeck}
        connections={connections}
        onOpenDeck={onOpenDeck}
        onNavigateCitation={onNavigateCitation}
      >
        {(renderPanel) => <div key={presentation}>{renderPanel()}</div>}
      </ResearchPanel>
    </QueryClientProvider>
  );
  return { ...render(ui(ready)), client, ui, onOpenDeck, onNavigateCitation };
}

it("retains input, selected accounts, and the request ID across responsive view remounts after a failed start", async () => {
  actions.start.mockRejectedValue(new Error("internal credential detail"));
  const view = show([connection, { ...connection, id: "second", displayName: "second" }]);
  await waitFor(() => expect(screen.getByLabelText("Message")).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Connected accounts · 2" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "second · Twitter" }));
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "WebMCPの反応" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your draft has been kept");
  expect(screen.getByLabelText("Message")).toHaveValue("WebMCPの反応");
  expect(screen.queryByText(/internal credential/)).toBeNull();
  view.rerender(view.ui(true, undefined, "mobile"));
  expect(screen.getByRole("alert")).toHaveTextContent("Your draft has been kept");
  expect(screen.getByLabelText("Message")).toHaveValue("WebMCPの反応");
  fireEvent.click(screen.getByRole("button", { name: "Connected accounts · 1" }));
  expect(screen.getByRole("checkbox", { name: "second · Twitter" })).not.toBeChecked();
  expect(MockEventSource.instances).toHaveLength(1);
  expect(MockEventSource.instances[0]?.close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(actions.start).toHaveBeenCalledTimes(2));
  expect(actions.start.mock.calls[1]?.[0]).toEqual(actions.start.mock.calls[0]?.[0]);
});

it("opens each generated deck version only once for the run started in this browser", async () => {
  const view = show();
  await waitFor(() => expect(screen.getByLabelText("Message")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "WebMCPの反応" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledOnce());
  act(() => {
    view.client.setQueryData(["research-status", running.id], {
      ...current,
      run: { ...running },
    });
  });
  expect(view.onOpenDeck).toHaveBeenCalledOnce();
  view.rerender(view.ui());
  current = {
    configured: true,
    run: { ...running, deckVersion: 2, message: "追加の検索を実行中" },
  };
  act(() =>
    MockEventSource.instances.at(-1)?.onmessage?.({
      data: JSON.stringify(current),
    }),
  );
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledTimes(2), {
    timeout: 2500,
  });
  expect(screen.getByRole("log", { name: "Research conversation" })).toBeVisible();
});

it("restores the latest plan automatically on reload and permits manual activation", async () => {
  navigation.search = { run: running.id };
  current = { configured: true, run: running };
  const view = show();
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledWith(running.deck, true));
  fireEvent.click(await screen.findByRole("button", { name: "Open temporary deck" }));
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenLastCalledWith(running.deck, true));
});

it("reports cancellation failure and updates the run after a successful retry", async () => {
  navigation.search = { run: running.id };
  current = { configured: true, run: running };
  actions.cancel
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ...running, status: "cancelled" });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Stop research" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to stop research");
  fireEvent.click(screen.getByRole("button", { name: "Stop research" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Stop research" })).toBeNull());
  expect(actions.cancel).toHaveBeenCalledWith({ data: { id: running.id } });
});

it("limits account selection to six and shows the host report path on completion", async () => {
  navigation.search = { run: running.id };
  current = {
    configured: true,
    run: {
      ...running,
      status: "complete",
      reportPath: "/home/owner/reports/webmcp.md",
    },
  };
  show(
    Array.from({ length: 7 }, (_, i) => ({
      ...connection,
      id: `connection${i}`,
      displayName: `account${i}`,
    })),
  );
  await screen.findByText("/home/owner/reports/webmcp.md");
  fireEvent.click(screen.getByText("Connected accounts · 6"));
  expect(screen.getByRole("checkbox", { name: "account6 · Twitter" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "account0 · Twitter" }));
  expect(screen.getByRole("checkbox", { name: "account6 · Twitter" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

it("waits for the workspace before restoring a completed plan from the stream", async () => {
  navigation.search = { run: running.id };
  const view = show([connection], false);
  await screen.findByLabelText("Message");
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, status: "complete" },
      }),
    }),
  );
  await waitFor(() =>
    expect(view.client.getQueryData(["research-status", running.id])).toMatchObject({
      run: { status: "complete" },
    }),
  );
  expect(view.onOpenDeck).not.toHaveBeenCalled();
  view.rerender(view.ui(true));
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledWith(running.deck, true));
});

it("reconnects the stream without polling or cancelling the host job on unmount", async () => {
  navigation.search = { run: running.id };
  current = { configured: true, run: running };
  const view = show();
  await waitFor(() => expect(actions.status).toHaveBeenCalledOnce());
  const stream = MockEventSource.instances[0];
  expect(stream?.url).toBe("/api/research/events?run=run1");
  act(() => stream?.onerror?.());
  expect(screen.getByText(/Reconnecting to research updates/)).toBeVisible();
  act(() => stream?.onopen?.());
  expect(screen.queryByText(/Reconnecting to research updates/)).toBeNull();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
  });
  expect(actions.status).toHaveBeenCalledOnce();
  view.unmount();
  expect(stream?.close).toHaveBeenCalledOnce();
  expect(actions.cancel).not.toHaveBeenCalled();
});

it("keeps newer stream state when the start response arrives late", async () => {
  navigation.search = { run: running.id };
  current = {
    configured: true,
    run: {
      ...running,
      status: "complete",
      threadId: "thread1",
      deck: undefined,
      deckVersion: 0,
    },
  };
  let finish!: (run: ResearchRun) => void;
  actions.start.mockImplementation(
    () =>
      new Promise<ResearchRun>((resolve) => {
        finish = resolve;
      }),
  );
  const view = show();
  await waitFor(() => expect(screen.getByLabelText("Message")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "WebMCP" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({ configured: true, run: running }),
    }),
  );
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledOnce());
  await act(async () =>
    finish({ ...running, status: "starting", deck: undefined, deckVersion: 0 }),
  );
  expect(view.client.getQueryData(["research-status", running.id])).toMatchObject({
    configured: true,
    run: running,
  });
  expect(view.onOpenDeck).toHaveBeenCalledOnce();
});

it("applies rapid versions in order while an earlier workspace save is pending", async () => {
  navigation.search = { run: running.id };
  current = { configured: true, run: running };
  const view = show();
  let finish!: () => void;
  view.onOpenDeck.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledOnce());
  const nextDeck = { id: "plan", title: "追加検索", columns: [] };
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, deckVersion: 2, deck: nextDeck },
      }),
    }),
  );
  await waitFor(() =>
    expect(view.client.getQueryData(["research-status", running.id])).toMatchObject({
      run: { deckVersion: 2 },
    }),
  );
  expect(view.onOpenDeck).toHaveBeenCalledOnce();
  await act(async () => finish());
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledTimes(2));
  expect(view.onOpenDeck).toHaveBeenLastCalledWith(nextDeck, false);
});

it("shows streamed conversation and sends follow-up input with the current deck and same run", async () => {
  navigation.search = { run: running.id };
  current = {
    configured: true,
    run: {
      ...running,
      status: "complete",
      threadId: "thread1",
      messages: [
        { id: "u1", role: "user", text: "WebMCPを調べて" },
        { id: "a1", role: "assistant", text: "検索結果を比較しました。" },
        { id: "t1", role: "tool", text: "検索カラムを追加しました" },
      ],
    },
  };
  const view = show();
  expect(await screen.findByText("検索結果を比較しました。")).toBeVisible();
  expect(screen.getByText("検索カラムを追加しました")).toBeVisible();
  expect(screen.getByText("You")).toBeVisible();
  const editedDeck = { id: "other", title: "切り替えたデッキ", columns: [] };
  view.rerender(view.ui(true, editedDeck));
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "このデッキを絞って" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(actions.start).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: running.id,
        contextDeck: editedDeck,
        topic: "このデッキを絞って",
      }),
    }),
  );
  await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue(""));
  const updatedDeck = { id: "plan", title: "絞り込み結果", columns: [] };
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, deck: updatedDeck, deckVersion: 2 },
      }),
    }),
  );
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenLastCalledWith(updatedDeck, true));
  const laterDeck = { ...updatedDeck, title: "追加の結果" };
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, deck: laterDeck, deckVersion: 3 },
      }),
    }),
  );
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenLastCalledWith(laterDeck, false));
});

it("selects newly loaded connected accounts until the user changes their selection", async () => {
  const view = show([]);
  await waitFor(() => expect(screen.getByLabelText("Message")).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Connected accounts · 0" }));
  await screen.findByText("Add a connected account first.");
  view.rerender(
    <QueryClientProvider client={view.client}>
      <ResearchPanel
        ready
        contextDeck={{ id: "manual", title: "手動", columns: [] }}
        connections={[connection]}
        onOpenDeck={view.onOpenDeck}
      />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "調べて" },
  });
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("starts a new chat while research continues without stopping the host job or changing the deck", async () => {
  navigation.search = { run: running.id };
  current = { configured: true, run: running };
  const view = show();
  await screen.findByText("WebMCPの反応");
  const oldStream = MockEventSource.instances[0];
  const opened = view.onOpenDeck.mock.calls.length;
  expect(screen.getByRole("button", { name: "New chat" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  await waitFor(() => expect(screen.queryByText("WebMCPの反応")).toBeNull());
  expect(navigation.set).toHaveBeenCalledWith({
    run: "new",
    citation: undefined,
  });
  expect(oldStream?.close).toHaveBeenCalledOnce();
  expect(actions.cancel).not.toHaveBeenCalled();
  expect(view.onOpenDeck).toHaveBeenCalledTimes(opened);
  expect(screen.getByText("手動デッキ")).toBeVisible();
  expect(screen.getByLabelText("Message")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "新しい話題" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(actions.start).toHaveBeenCalledOnce());
  expect(actions.start.mock.calls[0]?.[0].data).not.toHaveProperty("runId");
});

it("ignores snapshots from other conversations and late events after switching away", async () => {
  navigation.search = { run: running.id };
  current = { configured: true, run: running };
  const view = show();
  await screen.findByText("WebMCPの反応");
  const oldStream = MockEventSource.instances[0];
  const unrelated = {
    ...running,
    id: "other",
    messages: [{ id: "other-message", role: "user", text: "Unrelated conversation" }],
  };
  act(() =>
    oldStream?.onmessage?.({
      data: JSON.stringify({ configured: true, run: unrelated }),
    }),
  );
  expect(screen.queryByText("Unrelated conversation")).toBeNull();
  expect(view.client.getQueryData(["research-status", running.id])).toMatchObject({ run: running });
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  await waitFor(() => expect(screen.queryByText("WebMCPの反応")).toBeNull());
  act(() =>
    oldStream?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, message: "Late old event" },
      }),
    }),
  );
  await act(async () => {});
  expect(view.client.getQueryData(["research-status", "new"])).toMatchObject({
    run: null,
  });
  expect(screen.queryByText("Unrelated conversation")).toBeNull();
  expect(actions.cancel).not.toHaveBeenCalled();
});

it("renders assistant Markdown and forwards its citation with the current evidence", async () => {
  navigation.search = { run: running.id };
  const citations: ResearchRun["citations"] = [
    {
      column: {
        id: "source",
        title: "投稿元",
        connectionId: "first",
        source: { platform: "twitter", kind: "user", target: "author" },
      },
      post: {
        key: "twitter:123",
        platform: "twitter",
        nativeId: "123",
        url: "https://x.com/author/status/123",
        text: "調査に使った投稿",
        author: { name: "Author", handle: "author" },
      },
    },
  ];
  current = {
    configured: true,
    run: {
      ...running,
      citations,
      messages: [
        { id: "u1", role: "user", text: "# ユーザーの入力はそのまま" },
        {
          id: "a1",
          role: "assistant",
          text: "# 調査結果\n\n[根拠の投稿](https://x.com/author/status/123)",
        },
        { id: "t1", role: "tool", text: "**ツールの活動もそのまま**" },
      ],
    },
  };
  const view = show();
  expect(await screen.findByRole("heading", { level: 3, name: "調査結果" })).toBeVisible();
  expect(screen.getByText("# ユーザーの入力はそのまま")).toBeVisible();
  expect(screen.getByText("**ツールの活動もそのまま**")).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "根拠の投稿" }));
  expect(view.onNavigateCitation).toHaveBeenCalledWith(
    "https://x.com/author/status/123",
    citations,
  );
});

it("opens a saved chat with its context deck and selected accounts, preserving local choices on updates", async () => {
  const contextDeck = { id: "past-deck", title: "以前のデッキ", columns: [] };
  const saved: ResearchRun = {
    ...running,
    id: "saved",
    status: "interrupted",
    threadId: "saved-thread",
    connectionIds: ["second"],
    contextDeck,
    deck: undefined,
    deckVersion: 0,
    messages: [
      {
        id: "past",
        role: "assistant",
        text: "保存した会話\n\n[前回の引用](https://x.com/author/status/123)",
      },
    ],
    citations: [
      {
        column: {
          id: "source",
          title: "投稿元",
          connectionId: "second",
          source: { platform: "twitter", kind: "user", target: "author" },
        },
        post: {
          key: "twitter:123",
          platform: "twitter",
          nativeId: "123",
          url: "https://x.com/author/status/123",
          text: "前回の投稿",
          author: { name: "Author", handle: "author" },
        },
      },
    ],
  };
  const history: ResearchHistoryEntry[] = [
    {
      id: saved.id,
      title: "以前の調査",
      status: saved.status,
      updatedAt: 1000,
    },
  ];
  current = { configured: true, run: null, history };
  current = { ...current, run: saved };
  actions.start.mockImplementation(async () => ({
    ...saved,
    status: "running",
  }));
  const view = show([connection, { ...connection, id: "second", displayName: "account2" }]);
  await screen.findByLabelText("Chat history");
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "別の下書き" },
  });
  fireEvent.change(screen.getByLabelText("Chat history"), {
    target: { value: saved.id },
  });
  expect(await screen.findByText("保存した会話")).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "前回の引用" }));
  expect(view.onNavigateCitation).toHaveBeenCalledWith(
    "https://x.com/author/status/123",
    saved.citations,
  );
  expect(actions.status).toHaveBeenCalledWith({ data: { id: saved.id } });
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledWith(contextDeck, true));
  expect(screen.getByLabelText("Message")).toHaveValue("");
  expect(screen.getByText("Interrupted · Ready to resume")).toBeVisible();
  fireEvent.click(screen.getByText("Connected accounts · 1"));
  expect(screen.getByRole("checkbox", { name: "調査用アカウント · Twitter" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "account2 · Twitter" })).toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "調査用アカウント · Twitter" }));
  act(() =>
    MockEventSource.instances.at(-1)?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...saved, message: "Refresh" },
        history,
      }),
    }),
  );
  await waitFor(() =>
    expect(view.client.getQueryData(["research-status", saved.id])).toMatchObject({
      run: { message: "Refresh" },
    }),
  );
  expect(screen.getByRole("checkbox", { name: "調査用アカウント · Twitter" })).toBeChecked();
  expect(view.onOpenDeck).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "続きを調べて" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(actions.start).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: saved.id,
        connectionIds: ["second", "first"],
      }),
    }),
  );
  expect(view.client.getQueryData(["research-status", saved.id])).toMatchObject({
    history,
  });
});

it("restores a context-only chat on reload and permits browsing history during a running turn", async () => {
  navigation.search = { run: running.id };
  const contextDeck = { id: "context", title: "前回の手動デッキ", columns: [] };
  current = {
    configured: true,
    run: { ...running, deck: undefined, contextDeck },
    history: [
      {
        id: running.id,
        title: running.topic,
        status: running.status,
        updatedAt: 1000,
      },
    ],
  };
  const view = show();
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledWith(contextDeck, true));
  expect(screen.getByLabelText("Chat history")).toBeEnabled();
});

it("keeps newer scoped stream state when the selected chat fetch arrives late", async () => {
  const saved = { ...running, id: "saved", status: "complete" as const };
  const history = [
    {
      id: saved.id,
      title: "Saved chat",
      status: saved.status,
      updatedAt: 1000,
    },
  ];
  current = { configured: true, run: null, history };
  let finish!: (snapshot: typeof current) => void;
  actions.status.mockImplementation(({ data }: { data: { id?: string } }) =>
    data.id === saved.id
      ? new Promise<typeof current>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(current),
  );
  const view = show();
  fireEvent.change(await screen.findByLabelText("Chat history"), {
    target: { value: saved.id },
  });
  await waitFor(() => expect(MockEventSource.instances).toHaveLength(2));
  expect(MockEventSource.instances[0]?.close).toHaveBeenCalledOnce();
  expect(MockEventSource.instances[1]?.url).toBe("/api/research/events?run=saved");
  const newer = {
    configured: true,
    run: { ...saved, deckVersion: 2, message: "Newer" },
    history,
  };
  act(() => MockEventSource.instances[1]?.onmessage?.({ data: JSON.stringify(newer) }));
  await waitFor(() =>
    expect(view.client.getQueryData(["research-status", saved.id])).toEqual(newer),
  );
  await act(async () => finish({ configured: true, run: saved, history }));
  expect(view.client.getQueryData(["research-status", saved.id])).toEqual(newer);
  expect(actions.cancel).not.toHaveBeenCalled();
});

it("reconstructs and activates the generated deck requested by a bookmarked research URL", async () => {
  const plan = {
    id: "bookmarked-plan",
    title: "Bookmarked research",
    columns: [],
  };
  const saved: ResearchRun = {
    ...running,
    id: "saved-run",
    status: "complete",
    deck: plan,
  };
  navigation.search = { run: saved.id, deck: plan.id };
  current = { ...current, run: saved };
  const view = show();
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledWith(plan, true));
  expect(actions.status).toHaveBeenCalledWith({ data: { id: saved.id } });
  expect(actions.start).not.toHaveBeenCalled();
});

it.each([true, false])(
  "waits for reconstruction before restoring a citation (deck in URL: %s)",
  async (withDeck) => {
    const citation = {
      column: {
        id: "source",
        title: "Source",
        connectionId: "first",
        source: {
          platform: "twitter" as const,
          kind: "user" as const,
          target: "author",
        },
      },
      post: {
        key: "twitter:123",
        platform: "twitter" as const,
        nativeId: "123",
        url: "https://x.com/author/status/123",
        text: "Cited post",
        author: { name: "Author", handle: "author" },
      },
    };
    const plan = {
      id: "bookmarked-plan",
      title: "Research",
      columns: [citation.column],
    };
    const saved: ResearchRun = {
      ...running,
      id: "saved-run",
      status: "complete",
      deck: plan,
      citations: [citation],
    };
    navigation.search = {
      run: saved.id,
      deck: withDeck ? plan.id : undefined,
      citation: citation.post.key,
    };
    current = { ...current, run: saved };
    let finishSync!: () => void;
    const reconstructed = new Promise<void>((resolve) => {
      finishSync = resolve;
    });
    const view = show();
    view.onOpenDeck.mockImplementation(() => reconstructed);
    await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledWith(plan, false));
    expect(view.onNavigateCitation).not.toHaveBeenCalled();
    await act(async () => {
      finishSync();
      await reconstructed;
    });
    await waitFor(() =>
      expect(view.onNavigateCitation).toHaveBeenCalledWith(
        citation.post.url,
        saved.citations,
        true,
      ),
    );
    expect(navigation.set).not.toHaveBeenCalled();
  },
);

it("animates only the latest live assistant response and leaves prior replies static", async () => {
  navigation.search = { run: running.id };
  current = {
    configured: true,
    run: {
      ...running,
      messages: [
        { id: "older", role: "assistant", text: "Earlier answer" },
        { id: "followup", role: "user", text: "Continue" },
        { id: "live", role: "assistant", text: "Latest answer" },
      ],
    },
  };
  const view = show();
  expect(await screen.findByText("Earlier answer")).toBeVisible();
  const replies = view.container.querySelectorAll('[data-testid="research-markdown"]');
  expect(replies).toHaveLength(2);
  expect(replies[0]?.querySelector("[data-sd-animate]")).toBeNull();
  expect(replies[1]?.querySelector("[data-sd-animate]")).not.toBeNull();
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        ...current,
        run: { ...current.run, status: "complete" },
      }),
    }),
  );
  await waitFor(() => expect(view.container.querySelector("[data-sd-animate]")).toBeNull());
});

it("submits with Enter while preserving Shift+Enter and IME composition", async () => {
  show();
  const input = await screen.findByLabelText("Message");
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: "Compare browser automation tools" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(actions.start).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(actions.start).toHaveBeenCalledTimes(1));
  expect(actions.start).toHaveBeenCalledWith({
    data: expect.objectContaining({ topic: "Compare browser automation tools" }),
  });
});
