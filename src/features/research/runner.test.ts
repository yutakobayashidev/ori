// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Connection } from "../connections/model";
import { type AppDatabase, openDatabase } from "../storage/database.server";
import { createResearchTools } from "./agent-tools.server";
import type { CodexResearchInput } from "./codex-provider.server";
import { createResearchStore, type ResearchStore } from "./repository.server";
import { createResearchService } from "./runner.server";

const account: Connection = {
  id: "account",
  platform: "twitter",
  origin: "https://relay.invalid",
  accountId: null,
  displayName: "Main",
  status: "connected",
};
const input = () => ({
  requestId: randomUUID(),
  topic: "WebMCP",
  connectionIds: [account.id],
});
const deckInput = {
  title: "Research",
  columns: [
    {
      id: "column",
      title: "Discussion",
      connectionId: account.id,
      source: { platform: "twitter", kind: "search", query: "WebMCP" },
    },
  ],
};
class Turn {
  readonly done: Promise<void>;
  finish!: () => void;
  fail!: (error: Error) => void;
  constructor(readonly input: CodexResearchInput) {
    this.done = new Promise((resolve, reject) => {
      this.finish = resolve;
      this.fail = reject;
    });
    input.signal.addEventListener("abort", () => this.fail(new Error("Aborted")), { once: true });
    input.onThread(input.threadId ?? `thread-${input.runId}`);
  }
}
let directory: string;
let databases: AppDatabase[];
let store: ResearchStore;
let service: ReturnType<typeof createResearchService>;
let turns: Turn[];
let toolExecute: ReturnType<typeof vi.fn<ReturnType<typeof createResearchTools>["execute"]>>;
let fetchedText: string;
let launch: (input: CodexResearchInput) => Promise<void>;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "research-runner-"));
  databases = [];
  turns = [];
  fetchedText = "WebMCP discussion";
  launch = (params) => {
    const turn = new Turn(params);
    turns.push(turn);
    return turn.done;
  };
  service = restart();
});
afterEach(async () => {
  for (const turn of turns) turn.finish();
  await new Promise((resolve) => setTimeout(resolve, 10));
  for (const db of databases) db.$client.close();
  await rm(directory, { recursive: true, force: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function restart() {
  const db = openDatabase(join(directory, "research.db"));
  databases.push(db);
  store = createResearchStore(db);
  return createResearchService({
    store,
    config: () => ({ model: "selected-model", reportRoot: directory }),
    connections: async () => ({ connections: [account] }),
    execute: (params) => launch(params),
    tools: (connections, onDeck, _load, options) => {
      const tools = createResearchTools(
        connections,
        onDeck,
        async () => ({
          posts: [
            {
              key: "twitter:1",
              nativeId: "1",
              platform: "twitter",
              url: "https://x.com/a/status/1",
              text: fetchedText,
              author: { name: "Author", handle: "a" },
            },
          ],
        }),
        options,
      );
      toolExecute = vi.fn<ReturnType<typeof createResearchTools>["execute"]>((name, args) =>
        tools.execute(name, args),
      );
      return { ...tools, execute: toolExecute };
    },
  });
}
async function started(request = input()) {
  const run = service.start(request);
  await vi.waitFor(() => expect(turns.some((turn) => turn.input.runId === run.id)).toBe(true));
  const turn = [...turns].reverse().find((turn) => turn.input.runId === run.id);
  if (!turn) throw new Error("Turn not launched");
  return { run, turn, request };
}
async function completed(turn: Turn) {
  turn.finish();
  await vi.waitFor(() => expect(service.status(turn.input.runId).run?.status).toBe("complete"));
}

it("uses request IDs for new conversations and deduplicates accepted retries", async () => {
  const { run, request } = await started();
  expect(run.id).toBe(request.requestId);
  expect(service.start(request).id).toBe(run.id);
  expect(turns).toHaveLength(1);
  expect(() => service.start({ ...request, topic: "Changed" })).toThrow("content");
  expect(service.status().run).toBeNull();
});

it("isolates concurrent conversations and rejects overlapping turns only in the same conversation", async () => {
  const first = await started();
  const second = await started();
  expect(turns).toHaveLength(2);
  expect(() => service.start({ ...input(), runId: first.run.id })).toThrow("running");
  first.turn.input.onText("answer", "First answer");
  second.turn.input.onText("answer", "Second answer");
  expect(service.status(first.run.id).run?.messages.at(-1)?.text).toBe("First answer");
  expect(service.status(second.run.id).run?.messages.at(-1)?.text).toBe("Second answer");
  await service.cancel(first.run.id);
  expect(service.status(second.run.id).run?.status).toBe("running");
});

it("bridges tool calls into temporary decks, evidence and an optional report", async () => {
  const { run, turn } = await started();
  const result = await turn.input.tools.execute("open_temporary_deck", deckInput);
  expect(result).toMatchObject({ ok: true });
  const deck = service.status(run.id).run?.deck;
  expect(deck?.title).toBe("Research");
  await turn.input.tools.execute("fetch_column_posts", {
    columnId: deck?.columns[0]?.id,
  });
  expect(service.status(run.id).run?.citations[0]?.post.text).toBe("WebMCP discussion");
  expect(
    service
      .status(run.id)
      .run?.messages.some((message) => message.text === "open_temporary_deck Complete"),
  ).toBe(true);
  await writeFile(join(turn.input.cwd, "report.md"), "# Findings\nEvidence");
  await completed(turn);
  expect(service.status(run.id).run?.reportPath).toBe(join(turn.input.cwd, "report.md"));
});

it("records tool-domain failure without inventing successful activity", async () => {
  const { run, turn } = await started();
  expect(
    await turn.input.tools.execute("fetch_column_posts", {
      columnId: "missing",
    }),
  ).toMatchObject({ ok: false });
  expect(service.status(run.id).run?.messages.at(-1)?.text).toBe("fetch_column_posts Failed");
});

it("completes conversational turns without requiring a Markdown report", async () => {
  const { run, turn } = await started();
  turn.input.onText("answer", "Hello ");
  turn.input.onText("answer", "world");
  await completed(turn);
  expect(service.status(run.id).run?.messages.at(-1)?.text).toBe("Hello world");
  expect(service.status(run.id).run?.reportPath).toBeUndefined();
});

it.each(["empty", "symlink"])("rejects an invalid optional report (%s)", async (kind) => {
  const { run, turn } = await started();
  if (kind === "empty") await writeFile(join(turn.input.cwd, "report.md"), "");
  else await symlink(join(directory, "research.db"), join(turn.input.cwd, "report.md"));
  turn.finish();
  await vi.waitFor(() => expect(service.status(run.id).run?.status).toBe("failed"));
});

it("cancels the provider and ignores late text, thread and tool callbacks", async () => {
  const { run, turn } = await started();
  await service.cancel(run.id);
  const before = service.status(run.id).run;
  turn.input.onText("answer", "Too late");
  turn.input.onThread("late-thread");
  await expect(turn.input.tools.execute("open_temporary_deck", deckInput)).rejects.toThrow(
    "Inactive",
  );
  expect(turn.input.signal.aborted).toBe(true);
  expect(service.status(run.id).run).toEqual(before);
  expect(toolExecute).not.toHaveBeenCalled();
});

it("does not stop work when a browser disconnects and reconnects at the latest snapshot", async () => {
  const { run, turn } = await started();
  const first = vi.fn<Parameters<typeof service.subscribe>[1]>();
  const unsubscribe = service.subscribe(run.id, first);
  unsubscribe();
  turn.input.onText("answer", "Continued while disconnected");
  const reconnect = vi.fn<Parameters<typeof service.subscribe>[1]>();
  service.subscribe(run.id, reconnect);
  expect(turn.input.signal.aborted).toBe(false);
  expect(first).toHaveBeenCalledOnce();
  expect(reconnect.mock.calls[0]?.[0].run?.messages.at(-1)?.text).toBe(
    "Continued while disconnected",
  );
  await completed(turn);
});

it("isolates listener snapshots and detaches a failing subscriber", async () => {
  const { run, turn } = await started();
  const failing = vi.fn<Parameters<typeof service.subscribe>[1]>(() => {
    throw new Error("View closed");
  });
  service.subscribe(run.id, failing);
  service.subscribe(run.id, (snapshot) => {
    if (snapshot.run) snapshot.run.topic = "Mutated by viewer";
  });
  turn.input.onText("answer", "Still working");
  expect(failing).toHaveBeenCalledOnce();
  expect(service.status(run.id).run?.topic).toBe("WebMCP");
});

it("continues a specific persisted conversation with its thread and new deck context", async () => {
  const { run, turn } = await started();
  turn.input.onText("answer", "First response");
  await completed(turn);
  service = restart();
  const contextDeck = { id: "manual", title: "Current deck", columns: [] };
  const request = { ...input(), runId: run.id, contextDeck, topic: "Continue" };
  service.start(request);
  await vi.waitFor(() => expect(turns).toHaveLength(2));
  const next = turns[1];
  expect(next?.input.threadId).toBe(`thread-${run.id}`);
  expect(next?.input.prompt).toContain("Current deck");
  expect(
    service.status(run.id).run?.messages.some((message) => message.text === "First response"),
  ).toBe(true);
  expect(service.status().run).toBeNull();
});

it("keeps generated deck identity and updates exact citations across turns", async () => {
  const { run, turn } = await started();
  await turn.input.tools.execute("open_temporary_deck", deckInput);
  const deck = service.status(run.id).run?.deck;
  await turn.input.tools.execute("fetch_column_posts", {
    columnId: deck?.columns[0]?.id,
  });
  await completed(turn);
  fetchedText = "Updated evidence";
  service.start({ ...input(), runId: run.id });
  await vi.waitFor(() => expect(turns).toHaveLength(2));
  const next = turns[1];
  await next?.input.tools.execute("open_temporary_deck", deckInput);
  await next?.input.tools.execute("fetch_column_posts", {
    columnId: service.status(run.id).run?.deck?.columns[0]?.id,
  });
  expect(service.status(run.id).run?.deck?.id).toBe(deck?.id);
  expect(service.status(run.id).run?.deckVersion).toBe(2);
  expect(service.status(run.id).run?.citations).toHaveLength(1);
  expect(service.status(run.id).run?.citations[0]?.post.text).toBe("Updated evidence");
});

it("rejects unknown continuation IDs", () => {
  expect(() => service.start({ ...input(), runId: randomUUID() })).toThrow("could not be found");
});

it("never launches an unrecorded task after the initial save fails", () => {
  vi.spyOn(store, "save").mockImplementation(() => {
    throw new Error("Disk full");
  });
  expect(() => service.start(input())).toThrow("Disk full");
  expect(turns).toHaveLength(0);
});

it("aborts execution if saving a streamed message fails", async () => {
  const { run, turn } = await started();
  vi.spyOn(store, "save").mockImplementation(() => {
    throw new Error("Disk full");
  });
  turn.input.onText("answer", "Partial answer");
  expect(turn.input.signal.aborted).toBe(true);
  expect(service.status(run.id).run?.status).toBe("failed");
  expect(service.status(run.id).run?.error).toContain("Unable to save");
});

it("does not run a tool when recording its start fails", async () => {
  const { turn } = await started();
  vi.spyOn(store, "save").mockImplementation(() => {
    throw new Error("Disk full");
  });
  await expect(turn.input.tools.execute("open_temporary_deck", deckInput)).rejects.toThrow(
    "Inactive",
  );
  expect(toolExecute).not.toHaveBeenCalled();
});

it("marks persisted unfinished runs interrupted without selecting them globally", async () => {
  const { run } = await started();
  const restored = restart();
  expect(restored.status(run.id).run?.status).toBe("interrupted");
  expect(restored.status().run).toBeNull();
});

it("retains a failed startup conversation for retry even before a Codex thread exists", async () => {
  launch = async () => {
    throw new Error("Login required");
  };
  const first = service.start(input());
  await vi.waitFor(() => expect(service.status(first.id).run?.status).toBe("failed"));
  launch = (params) => {
    const turn = new Turn(params);
    turns.push(turn);
    return turn.done;
  };
  const next = service.start({ ...input(), runId: first.id });
  await vi.waitFor(() => expect(turns).toHaveLength(1));
  expect(next.id).toBe(first.id);
  expect(turns[0]?.input.threadId).toBeUndefined();
});

it("identifies Codex authentication failures without exposing the raw provider error", async () => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  launch = async () => {
    throw new Error("workspace routing discovery unauthorized (401)");
  };
  const run = service.start(input());
  await vi.waitFor(() => expect(service.status(run.id).run?.status).toBe("failed"));
  expect(service.status(run.id).run?.error).toBe(
    "Codex authentication failed. Make sure the server uses the CODEX_HOME of your signed-in Codex CLI.",
  );
});

it("bounds long-running work and aborts it at the time limit", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const run = service.start(input());
  await vi.waitFor(() => expect(turns).toHaveLength(1));
  await vi.advanceTimersByTimeAsync(15 * 60_000);
  expect(service.status(run.id).run?.status).toBe("failed");
  expect(turns[0]?.input.signal.aborted).toBe(true);
  vi.useRealTimers();
});
