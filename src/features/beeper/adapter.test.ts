// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBeeperAdapter } from "./adapter.server";
let directory: string;
let binary: string;
let argumentsFile: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "beeper-adapter-"));
  binary = join(directory, "fake-cli");
  argumentsFile = join(directory, "args.json");
  writeFileSync(
    binary,
    `#!${process.execPath}\nconst fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(argumentsFile)}, JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify({success:true,data:{chatID:'chat',pendingMessageID:'pending'}}));\n`,
    { mode: 0o700 },
  );
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it.each([undefined, "", "   "])(
  "requires a configured target before starting Beeper: %s",
  (target) => {
    vi.stubEnv("TWITTER_LITE_BEEPER_TARGET", target);
    expect(() => createBeeperAdapter({ binary })).toThrow("Set TWITTER_LITE_BEEPER_TARGET");
    expect(existsSync(argumentsFile)).toBe(false);
  },
);
it("uses the configured authenticated target for Beeper requests", async () => {
  vi.stubEnv("TWITTER_LITE_BEEPER_TARGET", "configured-target");
  const adapter = createBeeperAdapter({ binary });
  await adapter.sendMessage("chat", { text: "Hi" });
  expect(adapter.targetId).toBe("configured-target");
  expect(JSON.parse(readFileSync(argumentsFile, "utf8"))).toContain("configured-target");
});
it("uses an explicit target instead of the environment target", () => {
  vi.stubEnv("TWITTER_LITE_BEEPER_TARGET", "configured-target");
  expect(createBeeperAdapter({ binary, targetId: "explicit-target" }).targetId).toBe(
    "explicit-target",
  );
});
it("rejects an empty explicit target instead of falling back to a configured target", () => {
  vi.stubEnv("TWITTER_LITE_BEEPER_TARGET", "configured-target");
  expect(() => createBeeperAdapter({ binary, targetId: " " })).toThrow(
    "Set TWITTER_LITE_BEEPER_TARGET",
  );
  expect(existsSync(argumentsFile)).toBe(false);
});
it("uses only the fixed message endpoint and explicit JSON body for sending", async () => {
  const adapter = createBeeperAdapter({ binary, targetId: "test" });
  expect(
    await adapter.sendMessage("chat/opaque", {
      text: "Hi\n$(not-a-command)",
      replyToMessageID: "quote",
    }),
  ).toEqual({ chatID: "chat", pendingMessageID: "pending" });
  expect(JSON.parse(readFileSync(argumentsFile, "utf8"))).toEqual([
    "api",
    "post",
    "/v1/chats/chat%2Fopaque/messages",
    "--target",
    "test",
    "--json",
    "--yes",
    "--body",
    JSON.stringify({ text: "Hi\n$(not-a-command)", replyToMessageID: "quote" }),
    "--timeout",
    "20s",
  ]);
});
it("keeps observation read-only and removes upstream internal diagnostics", async () => {
  writeFileSync(
    binary,
    `#!${process.execPath}\nconst fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(argumentsFile)}, JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify({success:true,data:{id:'message',chatID:'chat',accountID:'account',timestamp:'2026-10-09T00:00:00Z',senderID:'self',isSender:true,sendStatus:{status:'SUCCESS',timestamp:'2026-10-09T00:00:00Z',internalError:'private',message:'private'}}}));\n`,
    { mode: 0o700 },
  );
  const adapter = createBeeperAdapter({ binary, targetId: "test" });
  expect(await adapter.retrieveMessage("chat", "pending")).toMatchObject({
    senderID: "self",
    isSender: true,
    sendStatus: { status: "SUCCESS" },
  });
  expect(await adapter.retrieveMessage("chat", "pending")).not.toHaveProperty(
    "sendStatus.internalError",
  );
  expect(JSON.parse(readFileSync(argumentsFile, "utf8"))).toContain("--read-only");
});
it("does not expose subprocess errors or credentials", async () => {
  writeFileSync(
    binary,
    `#!${process.execPath}\nconsole.error('Bearer PRIVATE_TOKEN message-body'); process.exit(1);\n`,
    { mode: 0o700 },
  );
  const adapter = createBeeperAdapter({ binary, targetId: "test" });
  await expect(adapter.sendMessage("chat", { text: "Hi" })).rejects.toThrow("Beeper read failed.");
});
it("accepts absent chat avatars and numeric reply capabilities from Beeper", async () => {
  writeFileSync(
    binary,
    `#!${process.execPath}\nconsole.log(JSON.stringify({success:true,data:{id:'chat',accountID:'account',title:'Alice',network:'Discord',type:'single',imgURL:null,participants:{items:[{id:'alice',imgURL:null}]},capabilities:{reply:2}}}));\n`,
    { mode: 0o700 },
  );
  const adapter = createBeeperAdapter({ binary, targetId: "test" });
  expect(await adapter.readChat("chat")).toMatchObject({
    imgURL: undefined,
    participants: { items: [{ id: "alice", imgURL: undefined }] },
    capabilities: { reply: 2 },
  });
});

it("normalizes upstream rich-text bodies before exposing message reads", async () => {
  writeFileSync(
    binary,
    `#!${process.execPath}\nconsole.log(JSON.stringify({success:true,data:{id:'message',chatID:'chat',accountID:'account',timestamp:'2026-10-09T00:00:00Z',text:'<p>Hello<br>Sam &amp; team</p>'}}));\n`,
    { mode: 0o700 },
  );
  const adapter = createBeeperAdapter({ binary, targetId: "test" });
  expect(await adapter.retrieveMessage("chat", "message")).toMatchObject({
    text: "Hello\nSam & team",
  });
});
