import { describe, expect, it } from "vitest";
import type { Connection } from "#/features/connections/model";
import { prepareDeck } from "./webmcp-contracts";

const account = (id: string): Connection => ({
  id,
  platform: "twitter",
  origin: "https://relay.invalid",
  accountId: null,
  displayName: id,
  status: "connected",
});
const column = {
  title: "観点",
  connectionId: "main",
  source: { kind: "search", query: "AI" },
};
describe("deck tool input", () => {
  it("fills Twitter defaults and assigns independent deck and column IDs", () => {
    const deck = prepareDeck({ title: "調査", columns: [column, column] }, [account("main")]);
    expect(deck.columns[0]?.source).toEqual({
      platform: "twitter",
      kind: "search",
      query: "AI",
      product: "Latest",
      following: false,
    });
    expect(new Set([deck.id, ...deck.columns.map((column) => column.id)]).size).toBe(3);
  });
  it("keeps supplied identities and rejects duplicates", () => {
    const identified = { ...column, id: "existing" };
    expect(
      prepareDeck({ deckId: "research", title: "調査", columns: [identified] }, [account("main")]),
    ).toMatchObject({ id: "research", columns: [{ id: "existing" }] });
    expect(() =>
      prepareDeck({ title: "調査", columns: [identified, identified] }, [account("main")]),
    ).toThrow("Column IDs must be unique.");
  });
  it("rejects unavailable profiles before applying a definition", () => {
    expect(() => prepareDeck({ title: "調査", columns: [column] }, [account("work")])).toThrow(
      "Unavailable connection",
    );
  });
  it("accepts user and list columns bound to separate profiles", () => {
    const deck = prepareDeck(
      {
        title: "調査",
        columns: [
          { ...column, source: { kind: "user", target: "@alice" } },
          {
            ...column,
            connectionId: "work",
            source: { kind: "list", target: "123" },
          },
        ],
      },
      [account("main"), account("work")],
    );
    expect(deck.columns.map((column) => column.connectionId)).toEqual(["main", "work"]);
    expect(deck.columns.map((column) => column.source.kind)).toEqual(["user", "list"]);
  });
  it("rejects unsupported platforms, overlong queries and more than six columns", () => {
    expect(() =>
      prepareDeck(
        {
          title: "調査",
          columns: [
            {
              ...column,
              source: { kind: "search", platform: "nostr", query: "AI" },
            },
          ],
        },
        [account("main")],
      ),
    ).toThrow("Invalid input");
    expect(() =>
      prepareDeck(
        {
          title: "調査",
          columns: [
            {
              ...column,
              source: {
                kind: "search",
                query: "a".repeat(512),
                following: true,
              },
            },
          ],
        },
        [account("main")],
      ),
    ).toThrow("512 characters");
    expect(() =>
      prepareDeck({ title: "調査", columns: Array.from({ length: 7 }, () => column) }, [
        account("main"),
      ]),
    ).toThrow("Too big");
  });
});

it("builds a mixed-platform deck with explicit account bindings", () => {
  const deck = prepareDeck(
    {
      title: "Mixed",
      columns: [
        column,
        {
          title: "Mastodon tag",
          connectionId: "masto",
          source: { platform: "mastodon", kind: "hashtag", target: "WebMCP" },
        },
      ],
    },
    [account("main"), { ...account("masto"), platform: "mastodon" }],
  );
  expect(deck.columns.map((column) => [column.connectionId, column.source.platform])).toEqual([
    ["main", "twitter"],
    ["masto", "mastodon"],
  ]);
});
