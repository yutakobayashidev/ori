import { and, eq } from "drizzle-orm";
import { enqueueBeeperMessageEvent } from "../mcp-events/events.server";
import { getDatabase, type AppDatabase } from "../storage/database.server";
import { beeperChatCheckpoints, beeperSeenMessages } from "../storage/schema";
import type { BeeperListenerStore } from "./listener.server";

export function createBeeperListenerStore(
  database: AppDatabase = getDatabase(),
): BeeperListenerStore {
  return {
    getCheckpoint(targetId, chatId) {
      return database
        .select()
        .from(beeperChatCheckpoints)
        .where(
          and(
            eq(beeperChatCheckpoints.targetId, targetId),
            eq(beeperChatCheckpoints.chatId, chatId),
          ),
        )
        .get();
    },
    commitPage({ targetId, chatId, checkpoint, messages }) {
      database.transaction((tx) => {
        for (const message of messages) {
          const inserted = tx
            .insert(beeperSeenMessages)
            .values({
              targetId,
              chatId,
              messageId: message.messageId,
              observedAt: message.observedAt,
            })
            .onConflictDoNothing()
            .run();
          if (inserted.changes) enqueueBeeperMessageEvent(message, tx);
        }
        tx.insert(beeperChatCheckpoints)
          .values({ targetId, chatId, ...checkpoint })
          .onConflictDoUpdate({
            target: [beeperChatCheckpoints.targetId, beeperChatCheckpoints.chatId],
            set: checkpoint,
          })
          .run();
      });
    },
  };
}
