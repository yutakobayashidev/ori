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
  });
  expect(state).not.toHaveProperty("password");
  expect(state.q).toBeUndefined();
  expect(state.accounts).toBeUndefined();
  expect(state.view).toBeUndefined();
  expect(state.run).toBeUndefined();
  expect(state.article).toBeUndefined();
});
