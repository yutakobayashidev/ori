import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Connection } from "../connections/model";
import { ColumnEditor } from "./column-editor";

const lists = vi.hoisted(() =>
  vi.fn<typeof import("../platforms/mastodon-server-functions").loadMastodonLists>(),
);
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("#/features/platforms/mastodon-server-functions", () => ({
  loadMastodonLists: lists,
}));
vi.mock("#/features/posts/use-list-choices", () => ({
  useListChoices: () => ({
    isPending: false,
    isError: false,
    data: [],
    refetch: vi.fn<() => void>(),
  }),
}));
const connections: Connection[] = [
  {
    id: "twitter",
    platform: "twitter",
    origin: "https://relay.invalid",
    accountId: null,
    displayName: "Twitter account",
    status: "connected",
  },
  {
    id: "mastodon-first",
    platform: "mastodon",
    origin: "https://mastodon.invalid",
    accountId: "1",
    displayName: "@first",
    status: "connected",
  },
  {
    id: "mastodon-second",
    platform: "mastodon",
    origin: "https://mastodon.invalid",
    accountId: "2",
    displayName: "@second",
    status: "connected",
  },
];

beforeEach(() => {
  lists.mockReset().mockImplementation(async ({ data }: { data: { connectionId: string } }) => ({
    lists: [
      {
        id: data.connectionId === "mastodon-first" ? "10" : "20",
        name: data.connectionId,
        isPrivate: true,
      },
    ],
  }));
});

function show() {
  const onSave = vi
    .fn<(column: import("./model").DeckColumn) => Promise<boolean>>()
    .mockResolvedValue(true);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ColumnEditor connections={connections} onSave={onSave} onCancel={vi.fn<() => void>()} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Column name"), {
    target: { value: "調査" },
  });
  return onSave;
}

it("creates a Mastodon search without Twitter ordering or following fields", async () => {
  const save = show();
  fireEvent.change(screen.getByLabelText("Connection profile"), {
    target: { value: "mastodon-first" },
  });
  expect(screen.queryByLabelText("Sort by")).toBeNull();
  expect(screen.queryByLabelText("Following only")).toBeNull();
  expect(screen.getByText(/Zero results/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Mastodon search query"), {
    target: { value: "WebMCP" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Add column" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "mastodon-first",
        source: { platform: "mastodon", kind: "search", query: "WebMCP" },
      }),
    ),
  );
});

it("creates hashtags and resets unsupported source kind when changing to Twitter", async () => {
  const save = show();
  fireEvent.change(screen.getByLabelText("Connection profile"), {
    target: { value: "mastodon-first" },
  });
  fireEvent.change(screen.getByLabelText("Column type"), {
    target: { value: "hashtag" },
  });
  fireEvent.change(screen.getByLabelText("Hashtag"), {
    target: { value: "WebMCP" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Add column" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { platform: "mastodon", kind: "hashtag", target: "WebMCP" },
      }),
    ),
  );
  fireEvent.change(screen.getByLabelText("Connection profile"), {
    target: { value: "twitter" },
  });
  expect(screen.getByLabelText("Column type")).toHaveValue("search");
  expect(screen.getByLabelText("Twitter search query")).toHaveValue("");
  expect(screen.queryByRole("option", { name: "Hashtag" })).toBeNull();
});

it("loads lists for each account and clears the selected list when the binding changes", async () => {
  show();
  fireEvent.change(screen.getByLabelText("Connection profile"), {
    target: { value: "mastodon-first" },
  });
  fireEvent.change(screen.getByLabelText("Column type"), {
    target: { value: "list" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "mastodon-first" }));
  expect(screen.getByLabelText("List")).toHaveValue("10");
  fireEvent.change(screen.getByLabelText("Connection profile"), {
    target: { value: "mastodon-second" },
  });
  expect(screen.getByLabelText("List")).toHaveValue("");
  fireEvent.click(await screen.findByRole("button", { name: "mastodon-second" }));
  expect(screen.getByLabelText("List")).toHaveValue("20");
  expect(lists).toHaveBeenCalledWith({
    data: { connectionId: "mastodon-second" },
  });
});

it("preserves title and Twitter search options after a rejected save", async () => {
  const save = show();
  save.mockResolvedValue(false);
  fireEvent.change(screen.getByLabelText("Twitter search query"), {
    target: { value: "from:owner WebMCP" },
  });
  fireEvent.change(screen.getByLabelText("Sort by"), {
    target: { value: "Top" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Following only" }));
  fireEvent.submit(screen.getByRole("form", { name: "Add column" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("Column name")).toHaveValue("調査");
  expect(screen.getByLabelText("Twitter search query")).toHaveValue("from:owner WebMCP");
  expect(screen.getByLabelText("Sort by")).toHaveValue("Top");
  expect(screen.getByRole("checkbox", { name: "Following only" })).toBeChecked();
  fireEvent.submit(screen.getByRole("form", { name: "Add column" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1]?.[0].source).toEqual(save.mock.calls[0]?.[0].source);
});
