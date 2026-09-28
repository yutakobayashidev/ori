// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { executeCodexResearch } from "./codex-provider.server";

it("streams and resumes through the real SDK provider with a local MCP roundtrip", async () => {
  const directory = await mkdtemp(join(tmpdir(), "codex-provider-"));
  try {
    const execute = vi.fn<(name: string, input: unknown) => Promise<unknown>>(async () => ({
      ok: true,
      decks: [{ id: "fixture-deck" }],
    }));
    const onThread = vi.fn<(id: string) => void>();
    const output: string[] = [];
    const request = {
      config: {
        model: "fixture-model",
        reportRoot: directory,
        codexPath: fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url)),
      },
      cwd: directory,
      runId: "fixture-run",
      prompt: "Use list_decks",
      instructions: "Only use the supplied tool.",
      signal: new AbortController().signal,
      tools: {
        definitions: [
          {
            name: "list_decks",
            description: "Read decks",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
        execute,
      },
      onThread,
      onText: (_id: string, text: string) => {
        output.push(text);
      },
    };
    await executeCodexResearch(request);
    expect(output.join("")).toBe("こんにちは世界。\nEnglish text\n末尾漢字");
    expect(output.length).toBeGreaterThan(1);
    expect(execute).toHaveBeenCalledWith("list_decks", {});
    expect(onThread).toHaveBeenCalledWith("fixture-thread");
    output.length = 0;
    await executeCodexResearch({ ...request, threadId: "fixture-thread" });
    expect(output.join("")).toBe("再開しました。");
    expect(execute).toHaveBeenCalledTimes(3);
    const cancellation = new AbortController();
    await expect(
      executeCodexResearch({
        ...request,
        prompt: "wait",
        signal: cancellation.signal,
        onText: () => cancellation.abort(new Error("Explicit stop")),
      }),
    ).rejects.toThrow("Explicit stop");
    const methods = await readFile(join(directory, "rpc-methods.txt"), "utf8");
    expect(methods).toContain("thread/start");
    expect(methods).toContain("thread/resume");
    expect(methods).toContain("turn/interrupt");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
