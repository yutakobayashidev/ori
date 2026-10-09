import {
  processMessageSends,
  recoverInterruptedMessageSends,
} from "../src/features/beeper/sends.server";
import { createBeeperAdapter } from "../src/features/beeper/adapter.server";
import { startBeeperListener } from "../src/features/beeper/listener.server";
import { createBeeperListenerStore } from "../src/features/beeper/repository.server";
import { deliverMcpEvents, getBeeperWatchChats } from "../src/features/mcp-events/events.server";
import { getDatabase } from "../src/features/storage/database.server";

const database = getDatabase();
const sendingAdapter = createBeeperAdapter();
recoverInterruptedMessageSends(database);
const stopListener = startBeeperListener({
  adapter: createBeeperAdapter(),
  store: createBeeperListenerStore(database),
  getChats: () =>
    getBeeperWatchChats(database).map(({ chatId, startedAt }) => ({
      chatId,
      startedAt: new Date(startedAt).toISOString(),
    })),
  onError: () =>
    console.error("Beeper reconciliation failed; retrying without advancing its checkpoint."),
});
let stopped = false;
const deliveryAbort = new AbortController();
let delivery: Promise<void> | undefined;
let sending: Promise<void> | undefined;
function tick() {
  if (!stopped && !sending) {
    sending = processMessageSends(database, sendingAdapter)
      .catch(() =>
        console.error("Beeper send reconciliation failed; persisted operations remain available."),
      )
      .finally(() => {
        sending = undefined;
      });
  }
  if (stopped || delivery) return;
  delivery = deliverMcpEvents(database, { signal: deliveryAbort.signal })
    .then(({ attempted, delivered }) => {
      if (attempted)
        console.log(JSON.stringify({ event: "mcp-event-delivery", attempted, delivered }));
    })
    .catch(() => console.error("MCP event delivery failed; persisted work will be retried."))
    .finally(() => {
      delivery = undefined;
    });
}
const interval = setInterval(tick, 5_000);
tick();
console.log("Beeper MCP Events worker ready; monitoring active subscriptions and pending sends.");
async function stop() {
  if (stopped) return;
  stopped = true;
  deliveryAbort.abort();
  clearInterval(interval);
  await stopListener();
  await delivery;
  await sending;
  database.$client.close();
}
process.once("SIGINT", () => {
  void stop();
});
process.once("SIGTERM", () => {
  void stop();
});
