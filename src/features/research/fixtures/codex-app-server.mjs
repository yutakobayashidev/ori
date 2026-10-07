#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

if (process.argv.includes("mcp")) {
  process.stdout.write(`${JSON.stringify([{ name: "inherited_external" }])}\n`);
  process.exit(0);
}
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const reply = (id, result) => send({ id, result });
let config;
let threadId;
let resumed = false;
const pending = new Map();
let activeTurn;
const events = createInterface({ input: process.stdin });
events.on("line", async (line) => {
  const message = JSON.parse(line);
  const { id, method, params = {} } = message;
  if (!method) {
    pending.get(id)?.(message.result);
    pending.delete(id);
    return;
  }
  appendFileSync("rpc-methods.txt", `${method}\n`);
  if (method === "initialize") reply(id, { userAgent: "codex-cli/0.156.1" });
  else if (method === "thread/start" || method === "thread/resume") {
    config = params.config;
    resumed = method === "thread/resume";
    threadId = params.threadId ?? "fixture-thread";
    reply(id, {
      thread: { id: threadId, turns: [] },
      model: "fixture-model",
      modelProvider: "fixture",
      cwd: process.cwd(),
      approvalPolicy: "never",
      sandbox: "workspace-write",
      reasoningEffort: null,
    });
  } else if (method === "turn/start") {
    activeTurn = {
      id: "fixture-turn",
      items: [],
      status: "inProgress",
      error: null,
    };
    reply(id, { turn: activeTurn });
    send({ method: "turn/started", params: { threadId, turn: activeTurn } });
    try {
      const prefix = Object.keys(config)
        .find((key) => key.endsWith(".url"))
        ?.slice(0, -4);
      if (
        !prefix ||
        config["mcp_servers.inherited_external.enabled"] !== false ||
        config["features.hooks"] !== false ||
        config["shell_environment_policy.inherit"] !== "none"
      )
        throw new Error("Missing restrictions");
      const rpc = async (method, params) => {
        const response = await fetch(config[`${prefix}.url`], {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...config[`${prefix}.http_headers`],
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
        const text = await response.text();
        if (response.headers.get("content-type")?.includes("text/event-stream")) {
          const data = text.split("\n").find((line) => line.startsWith("data:"));
          if (!data) throw new Error("MCP response missing SSE data");
          return JSON.parse(data.slice(5).trim());
        }
        return JSON.parse(text);
      };
      const catalog = await rpc("tools/list", {});
      if (!catalog.result.tools.some((tool) => tool.name === "list_decks"))
        throw new Error("Tool missing");
      const result = await rpc("tools/call", {
        name: "list_decks",
        arguments: {},
      });
      if (!result.result.content[0].text.includes("fixture-deck"))
        throw new Error("Tool result missing");
      if (resumed) {
        const response = new Promise((resolve) => pending.set("dynamic-call", resolve));
        send({
          id: "dynamic-call",
          method: "item/tool/call",
          params: {
            threadId,
            turnId: activeTurn.id,
            callId: "dynamic-call",
            tool: "list_decks",
            arguments: {},
          },
        });
        if (!(await response).success) throw new Error("Resumed dynamic tool failed");
      }
      const waiting = params.input?.some((part) => part.text?.includes("wait"));
      const item = {
        id: "answer",
        type: "agentMessage",
        text: resumed ? "再開しました。" : "こんにちは世界。\nEnglish text\n末尾漢字",
        phase: "final_answer",
      };
      send({
        method: "item/started",
        params: {
          threadId,
          turnId: activeTurn.id,
          item: { ...item, text: "" },
        },
      });
      send({
        method: "item/agentMessage/delta",
        params: {
          threadId,
          turnId: activeTurn.id,
          itemId: item.id,
          delta: item.text,
        },
      });
      if (waiting) return;
      send({
        method: "item/completed",
        params: { threadId, turnId: activeTurn.id, item },
      });
      send({
        method: "turn/completed",
        params: {
          threadId,
          turn: { ...activeTurn, status: "completed", items: [item] },
        },
      });
    } catch (error) {
      send({
        method: "turn/completed",
        params: {
          threadId,
          turn: {
            ...activeTurn,
            status: "failed",
            error: { message: error.message },
          },
        },
      });
    }
  } else if (method === "turn/interrupt") {
    reply(id, {});
    send({
      method: "turn/completed",
      params: { threadId, turn: { ...activeTurn, status: "interrupted" } },
    });
  } else if (id !== undefined) reply(id, {});
});
