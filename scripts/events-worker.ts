import { createBeeperAdapter } from "../src/features/beeper/adapter.server";
import { startBeeperListener } from "../src/features/beeper/listener.server";
import { createBeeperListenerStore } from "../src/features/beeper/repository.server";
import { deliverMcpEvents, getBeeperWatchChats } from "../src/features/mcp-events/events.server";
import { getDatabase } from "../src/features/storage/database.server";

const database = getDatabase();
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
function tick() {
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
console.log("Beeper MCP Events worker ready; monitoring only active subscriptions.");
async function stop() {
  if (stopped) return;
  stopped = true;
  deliveryAbort.abort();
  clearInterval(interval);
  await stopListener();
  await delivery;
  database.$client.close();
}
process.once("SIGINT", () => {
  void stop();
});
process.once("SIGTERM", () => {
  void stop();
});
