// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
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
afterEach(() => rmSync(directory, { recursive: true, force: true }));
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
