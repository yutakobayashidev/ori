import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";
import { beeperMessageText } from "./message-text.server";

const id = z.string().min(1).max(1024);
export const listBeeperChatsInput = z.object({
  cursor: z.string().max(4096).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
export const readBeeperChatInput = z.object({
  chatId: id,
  cursor: z.string().max(4096).optional(),
});
const messageSchema = z.object({
  id,
  chatID: id,
  accountID: id,
  timestamp: z.iso.datetime({ offset: true }),
  senderName: z.string().optional(),
  senderID: id.optional(),
  sortKey: z.string().optional(),
  linkedMessageID: id.optional(),
  sendStatus: z
    .object({
      status: z.enum(["SUCCESS", "PENDING", "FAIL_RETRIABLE", "FAIL_PERMANENT"]),
      timestamp: z.string(),
      reason: z.string().optional(),
      deliveredToUsers: z.array(z.string()).optional(),
    })
    .optional(),
  text: z.string().transform(beeperMessageText).optional(),
  type: z.string().optional(),
  isSender: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  editedTimestamp: z.string().optional(),
});
const chatSchema = z.object({
  id,
  accountID: id,
  title: z.string(),
  network: z.string(),
  type: z.string(),
  imgURL: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined)
    .optional(),
  isReadOnly: z.boolean().optional(),
  participants: z.object({
    items: z.array(
      z.object({
        id,
        fullName: z.string().optional(),
        imgURL: z
          .string()
          .nullish()
          .transform((value) => value ?? undefined)
          .optional(),
        isSelf: z.boolean().optional(),
      }),
    ),
    hasMore: z.boolean().optional(),
    total: z.number().optional(),
  }),
  capabilities: z
    .object({
      maxTextLength: z.number().optional(),
      reply: z.number().int().min(-2).max(2).optional(),
    })
    .optional(),
  merge: z.object({ chatIDs: z.array(id), defaultChatID: id.optional() }).optional(),
});
export type BeeperChat = z.infer<typeof chatSchema>;
export interface BeeperMessagingAdapter extends BeeperAdapter {
  readChat(this: void, chatId: string): Promise<BeeperChat>;
  retrieveMessage(this: void, chatId: string, messageId: string): Promise<BeeperMessage>;
  sendMessage(
    this: void,
    chatId: string,
    input: { text: string; replyToMessageID?: string },
  ): Promise<{ chatID: string; pendingMessageID: string }>;
  readMedia(this: void, sourceUri: string): Promise<Buffer>;
}
const pageFields = {
  hasMore: z.boolean(),
  oldestCursor: z.string().nullable(),
  newestCursor: z.string().nullable(),
};
const messagePageSchema = z.object({ items: z.array(messageSchema), ...pageFields });
const chatPageSchema = z.object({
  items: z.array(
    z.object({ id, accountID: id, title: z.string(), network: z.string(), type: z.string() }),
  ),
  ...pageFields,
});
export type BeeperMessage = z.infer<typeof messageSchema>;
export type BeeperMessagePage = z.infer<typeof messagePageSchema>;
export type BeeperWatchChat = { chatId: string; startedAt: string };
export interface BeeperAdapter {
  targetId: string;
  listChats(
    this: void,
    input: z.input<typeof listBeeperChatsInput>,
  ): Promise<z.infer<typeof chatPageSchema>>;
  readMessages(
    this: void,
    chatId: string,
    cursor?: string,
    direction?: "before" | "after",
  ): Promise<BeeperMessagePage>;
  watch(this: void, chatIds: string[], onChange: () => void, onClose: () => void): () => void;
}

export function createBeeperAdapter(
  options: { binary?: string; targetId?: string } = {},
): BeeperMessagingAdapter {
  const binary = options.binary ?? process.env.TWITTER_LITE_BEEPER_CLI ?? "beeper-cli";
  const targetId = (options.targetId ?? process.env.TWITTER_LITE_BEEPER_TARGET ?? "").trim();
  if (!targetId)
    throw new Error("Set TWITTER_LITE_BEEPER_TARGET to an authenticated Beeper target.");
  const flags = ["--target", targetId, "--read-only", "--json"];
  async function request(
    path: string,
    body?: { text: string; replyToMessageID?: string },
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      execFile(
        binary,
        body
          ? [
              "api",
              "post",
              path,
              "--target",
              targetId,
              "--json",
              "--yes",
              "--body",
              JSON.stringify(body),
              "--timeout",
              "20s",
            ]
          : ["api", "get", path, ...flags, "--timeout", "20s"],
        {
          timeout: 25_000,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
        },
        (error, stdout) => {
          // CLI stderr and error objects can contain credentials or private message bodies.
          if (error) return reject(new Error("Beeper read failed."));
          try {
            const envelope = z
              .object({ success: z.literal(true), data: z.unknown() })
              .parse(JSON.parse(stdout));
            resolve(envelope.data);
          } catch {
            reject(new Error("Beeper returned an invalid response."));
          }
        },
      );
    });
  }
  return {
    targetId,
    async readChat(chatId) {
      return chatSchema.parse(await request(`/v1/chats/${encodeURIComponent(id.parse(chatId))}`));
    },
    async retrieveMessage(chatId, messageId) {
      return messageSchema.parse(
        await request(
          `/v1/chats/${encodeURIComponent(id.parse(chatId))}/messages/${encodeURIComponent(id.parse(messageId))}`,
        ),
      );
    },
    async sendMessage(chatId, input) {
      const body = z
        .strictObject({ text: z.string().min(1).max(16000), replyToMessageID: id.optional() })
        .parse(input);
      return z
        .object({ chatID: id, pendingMessageID: id })
        .parse(await request(`/v1/chats/${encodeURIComponent(id.parse(chatId))}/messages`, body));
    },
    async readMedia(sourceUri) {
      if (!/^(mxc|localmxc|file):\/\//.test(sourceUri))
        throw new Error("Unsupported Beeper media reference.");
      return new Promise((resolve, reject) => {
        execFile(
          binary,
          [
            "media",
            "download",
            sourceUri,
            "--out",
            "-",
            "--target",
            targetId,
            "--quiet",
            "--read-only",
            "--timeout",
            "20s",
          ],
          { encoding: "buffer", timeout: 25_000, maxBuffer: 2 * 1024 * 1024 },
          (error, stdout) => {
            if (error) reject(new Error("Beeper media unavailable."));
            else resolve(stdout);
          },
        );
      });
    },
    async listChats(input) {
      const { cursor, limit } = listBeeperChatsInput.parse(input);
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor) {
        query.set("cursor", cursor);
        query.set("direction", "before");
      }
      return chatPageSchema.parse(await request(`/v1/chats?${query}`));
    },
    async readMessages(chatId, cursor, direction = "before") {
      id.parse(chatId);
      const query = new URLSearchParams();
      if (cursor) {
        query.set("cursor", cursor);
        query.set("direction", direction);
      }
      return messagePageSchema.parse(
        await request(`/v1/chats/${encodeURIComponent(chatId)}/messages?${query}`),
      );
    },
    watch(chatIds, onChange, onClose) {
      if (!chatIds.length) throw new Error("Beeper watch requires explicit chats.");
      const child = spawn(
        binary,
        [
          "watch",
          ...flags,
          "--include-type",
          "message.upserted",
          ...chatIds.flatMap((chatId) => ["--chat", id.parse(chatId)]),
        ],
        {
          stdio: ["ignore", "pipe", "ignore"],
          detached: true,
        },
      );
      const lines = createInterface({ input: child.stdout });
      // Watch is a wake-up signal only: authoritative messages come from HTTP reconciliation.
      lines.on("line", () => onChange());
      let closed = false;
      const close = () => {
        if (!closed) {
          closed = true;
          onClose();
        }
      };
      child.on("error", close);
      child.on("close", close);
      return () => {
        closed = true;
        lines.close();
        // The Nix CLI launcher forks through bubblewrap. Stop its process group, including Beeper.
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            /* Already exited. */
          }
        }
        child.stdout.destroy();
      };
    },
  };
}
