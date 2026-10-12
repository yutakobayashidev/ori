import { expect, it } from "vitest";
import { validateWorkspaceSearch } from "./search";

it("discards malformed navigation state rather than breaking the page", () => {
  const state = validateWorkspaceSearch({
    q: ["a"],
    accounts: "yes",
    view: "unknown",
    run: "../private",
    article: { id: 1 },
    password: "secret",
    closedRuns: ["../private"],
  });
  expect(state).not.toHaveProperty("password");
  expect(state.q).toBeUndefined();
  expect(state.accounts).toBeUndefined();
  expect(state.view).toBeUndefined();
  expect(state.run).toBeUndefined();
  expect(state.article).toBeUndefined();
  expect(state.closedRuns).toBeUndefined();
});

it("preserves closed chat tabs when restoring a workspace URL", () => {
  const id = "d3d65e3f-84e0-44de-ae3f-662c97919ee7";
  expect(validateWorkspaceSearch({ run: "new", closedRuns: [id] })).toMatchObject({
    run: "new",
    closedRuns: [id],
  });
});

it.each([
  { platform: "twitter", kind: "search", query: "京都", product: "Top", following: true },
  { platform: "twitter", kind: "user", target: "alice" },
  { platform: "twitter", kind: "list", target: "123" },
  { platform: "mastodon", kind: "search", query: "京都" },
  { platform: "mastodon", kind: "user", target: "alice@social.invalid" },
  { platform: "mastodon", kind: "list", target: "123" },
  { platform: "mastodon", kind: "hashtag", target: "京都" },
  { platform: "reddit", kind: "search", query: "京都", sort: "new", time: "week" },
])("restores $platform $kind sources from a Browse URL", (browseSource) => {
  expect(validateWorkspaceSearch({ browseSource, browseConnection: "account-1" })).toMatchObject({
    browseSource,
    browseConnection: "account-1",
  });
});

it("normalizes a pasted Twitter profile URL when restoring Browse", () => {
  expect(
    validateWorkspaceSearch({
      browseSource: { platform: "twitter", kind: "user", target: "https://x.com/alice" },
    }).browseSource,
  ).toEqual({ platform: "twitter", kind: "user", target: "alice" });
});

it.each([
  null,
  "query",
  { platform: "twitter", kind: "search", query: "" },
  { platform: "reddit", kind: "user", target: "alice" },
])("ignores malformed Browse sources without discarding other navigation", (browseSource) => {
  const result = validateWorkspaceSearch({ browseSource, deck: "saved-deck" });
  expect(result.browseSource).toBeUndefined();
  expect(result.deck).toBe("saved-deck");
});

it("preserves the complete supported 512-character search in a Browse URL", () => {
  const browseSource = {
    platform: "twitter",
    kind: "search",
    query: "a".repeat(512),
    product: "Latest",
    following: false,
  };
  expect(validateWorkspaceSearch({ browseSource }).browseSource).toEqual(browseSource);
});

it("accepts Firefox keyword search preferences without changing the query", () => {
  expect(
    validateWorkspaceSearch({ browseQuery: "京都 lang:ja", product: "Latest", following: true }),
  ).toMatchObject({
    browseQuery: "京都 lang:ja",
    product: "Latest",
    following: true,
  });
});

it("ignores malformed external search preferences while retaining the query", () => {
  const state = validateWorkspaceSearch({
    browseQuery: "京都",
    product: "popular",
    following: "yes",
  });
  expect(state.browseQuery).toBe("京都");
  expect(state.product).toBeUndefined();
  expect(state.following).toBeUndefined();
});
