import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ConnectionManager } from "./connection-manager";
import type { Connection } from "./model";

const actions = vi.hoisted(() => ({
  load: vi.fn<typeof import("../mastodon/server-functions").loadMastodonInstances>(),
  authorize: vi.fn<typeof import("../mastodon/server-functions").startMastodonOAuth>(),
  disconnect: vi.fn<typeof import("../mastodon/server-functions").disconnectMastodonAccount>(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("../mastodon/server-functions", () => ({
  loadMastodonInstances: actions.load,
  startMastodonOAuth: actions.authorize,
  disconnectMastodonAccount: actions.disconnect,
}));

const account: Connection = {
  id: "mastodon-first",
  platform: "mastodon",
  origin: "https://mastodon.invalid",
  accountId: "1",
  displayName: "@first",
  status: "connected",
};
beforeEach(() => {
  vi.resetAllMocks();
  actions.load.mockResolvedValue({
    origins: ["https://mastodon.invalid", "https://second.invalid"],
  });
});

function show(
  connections: Connection[] = [account],
  onChanged = vi.fn<() => Promise<void> | void>(),
  hasTemporaryDecks = false,
) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ConnectionManager
        connections={connections}
        onChanged={onChanged}
        hasTemporaryDecks={hasTemporaryDecks}
      />
    </QueryClientProvider>,
  );
}

it("shows per-account status and warns about temporary decks without blocking actions", async () => {
  show(
    [account, { ...account, id: "expired", displayName: "@expired", status: "expired" }],
    vi.fn(),
    true,
  );
  expect(screen.getByText("Connected")).toBeVisible();
  expect(screen.getByText("Reconnect required")).toBeVisible();
  expect(screen.getByText(/Temporary decks will be lost/)).toBeVisible();
  expect(await screen.findByRole("button", { name: "Authorize with Mastodon" })).toBeEnabled();
});

it("uses the selected instance and reports a safe error when authorization fails", async () => {
  actions.authorize.mockRejectedValue(new Error("private server credential detail"));
  show();
  fireEvent.change(await screen.findByLabelText("Mastodon server"), {
    target: { value: "https://second.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Authorize with Mastodon" }));
  await waitFor(() =>
    expect(actions.authorize).toHaveBeenCalledWith({
      data: { origin: "https://second.invalid" },
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not start Mastodon authorization",
  );
  expect(screen.queryByText(/private server/)).toBeNull();
  expect(screen.getByRole("button", { name: "Authorize with Mastodon" })).toBeEnabled();
});

it("binds reconnect to the selected account rather than whichever instance is selected for addition", async () => {
  actions.authorize.mockRejectedValue(new Error("offline"));
  show();
  await screen.findByLabelText("Mastodon server");
  fireEvent.click(screen.getByRole("button", { name: "Reconnect @first" }));
  await waitFor(() =>
    expect(actions.authorize).toHaveBeenCalledWith({
      data: { origin: account.origin, connectionId: account.id },
    }),
  );
  expect(await screen.findByRole("alert")).toBeVisible();
});

it("refreshes the account list after successful disconnect", async () => {
  const onChanged = vi.fn<() => Promise<void> | void>().mockResolvedValue(undefined);
  actions.disconnect.mockResolvedValue({ disconnected: true });
  show([account], onChanged);
  fireEvent.click(screen.getByRole("button", { name: "Disconnect @first" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  expect(actions.disconnect).toHaveBeenCalledWith({
    data: { connectionId: account.id },
  });
});

it("keeps account controls available after a failed disconnect", async () => {
  actions.disconnect.mockRejectedValue(new Error("private token"));
  const onChanged = vi.fn<() => Promise<void> | void>();
  show([account], onChanged);
  fireEvent.click(screen.getByRole("button", { name: "Disconnect @first" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not disconnect the account");
  expect(onChanged).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Disconnect @first" })).toBeEnabled();
});

it("does not offer Mastodon reconnect or revoke for Twitter relay accounts", async () => {
  show([{ ...account, platform: "twitter", id: "twitter-first" }]);
  await screen.findByLabelText("Mastodon server");
  expect(screen.queryByRole("button", { name: "Reconnect @first" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Disconnect @first" })).toBeNull();
});
