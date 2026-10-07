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
