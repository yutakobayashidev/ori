import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { DeckColumn } from "#/features/decks/model";
import type { ResearchPost } from "#/features/platforms/types";
import { Research } from "./research";

const column: DeckColumn = {
  id: "column",
  title: "Search",
  connectionId: "connection",
  source: {
    platform: "twitter",
    kind: "search",
    query: "MCP",
    product: "Latest",
    following: false,
  },
};
function post(id: string): ResearchPost {
  return {
    key: id,
    nativeId: id,
    platform: "twitter",
    url: `https://social.invalid/post/${id}`,
    text: `Post ${id}`,
    author: { name: "Alice", handle: "alice" },
  };
}

it("loads saved deck columns into the shared research cards without edit controls", async () => {
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockResolvedValue({
      ok: true,
      column,
      connectionLabel: "Alice account",
      posts: [post("1")],
      nextCursor: null,
      hasMore: false,
    });
  render(
    <Research
      initial={{
        ok: true,
        deck: { id: "deck", title: "Research", columns: [column], revision: 1 },
      }}
      callTool={callTool}
      toolName="get_deck"
      toolArguments={{ deckId: "deck" }}
    />,
  );
  expect(await screen.findByText("Post 1")).toBeInTheDocument();
  expect(callTool).toHaveBeenCalledWith("fetch_column_posts", {
    deckId: "deck",
    columnId: "column",
  });
  expect(screen.getByRole("link", { name: /Open original post/ })).toHaveAttribute(
    "href",
    "https://social.invalid/post/1",
  );
  expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
});

it("appends subsequent pages without duplicates and refreshes from the first page", async () => {
  const args = { connectionId: column.connectionId, source: column.source, cursor: "old-start" };
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockResolvedValueOnce({
      ok: true,
      column,
      connectionLabel: "Alice account",
      posts: [post("1"), post("2")],
      nextCursor: null,
      hasMore: false,
    })
    .mockResolvedValueOnce({
      ok: true,
      column,
      connectionLabel: "Alice account",
      posts: [post("3")],
      nextCursor: null,
      hasMore: false,
    });
  render(
    <Research
      initial={{
        ok: true,
        column,
        connectionLabel: "Alice account",
        posts: [post("1")],
        nextCursor: "next",
        hasMore: true,
      }}
      callTool={callTool}
      toolName="fetch_posts"
      toolArguments={args}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reveal next page" }));
  expect(await screen.findByText("Post 2")).toBeInTheDocument();
  expect(screen.getAllByTestId("research-post")).toHaveLength(2);
  expect(callTool).toHaveBeenNthCalledWith(1, "fetch_posts", { ...args, cursor: "next" });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("Post 3")).toBeInTheDocument();
  expect(screen.queryByText("Post 1")).not.toBeInTheDocument();
  expect(callTool).toHaveBeenNthCalledWith(2, "fetch_posts", {
    connectionId: column.connectionId,
    source: column.source,
  });
});

it("retries failed pagination with the same cursor and preserves loaded posts", async () => {
  const args = { connectionId: column.connectionId, source: column.source };
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockRejectedValueOnce(new Error("Connection unavailable"))
    .mockResolvedValueOnce({
      ok: true,
      column,
      connectionLabel: "Alice account",
      posts: [post("2")],
      nextCursor: null,
      hasMore: false,
    });
  render(
    <Research
      initial={{
        ok: true,
        column,
        connectionLabel: "Alice account",
        posts: [post("1")],
        nextCursor: "next",
        hasMore: true,
      }}
      callTool={callTool}
      toolName="fetch_posts"
      toolArguments={args}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reveal next page" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection unavailable");
  expect(screen.getByText("Post 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getAllByTestId("research-post")).toHaveLength(2));
  expect(callTool).toHaveBeenNthCalledWith(2, "fetch_posts", { ...args, cursor: "next" });
});

it("renders column metadata directly from a fetch_column_posts result", () => {
  const callTool =
    vi.fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>();
  render(
    <Research
      initial={{
        ok: true,
        column,
        connectionLabel: "Alice account",
        posts: [post("1")],
        nextCursor: null,
        hasMore: false,
      }}
      callTool={callTool}
      toolName="fetch_column_posts"
      toolArguments={{ deckId: "deck", columnId: "column" }}
    />,
  );
  expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(screen.getByText("Post 1")).toBeInTheDocument();
  expect(screen.getByText("Alice account")).toBeInTheDocument();
  expect(callTool).not.toHaveBeenCalled();
});

it("uses normalized result metadata when source arguments omit schema defaults", () => {
  const callTool =
    vi.fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>();
  render(
    <Research
      initial={{
        ok: true,
        column,
        connectionLabel: "Alice account",
        posts: [post("1")],
        nextCursor: null,
        hasMore: false,
      }}
      callTool={callTool}
      toolName="fetch_posts"
      toolArguments={{
        connectionId: column.connectionId,
        source: { kind: "search", query: "MCP" },
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(screen.getByTestId("deck-source-label")).toHaveTextContent("Latest");
  expect(screen.getByTestId("deck-query")).toHaveTextContent("MCP");
  expect(screen.getByText("Alice account")).toBeInTheDocument();
  expect(screen.getByText("Post 1")).toBeInTheDocument();
  expect(callTool).not.toHaveBeenCalled();
});

vi.mock("#/components/feed-pagination", () => ({
  FeedPagination: ({ enabled, onLoadMore }: { enabled: boolean; onLoadMore: () => void }) => (
    <button disabled={!enabled} onClick={onLoadMore}>
      Reveal next page
    </button>
  ),
}));
