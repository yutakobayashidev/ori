import { expect, it } from "vitest";
import { parseWorkspaceSearch, stringifyWorkspaceSearch } from "./search-codec";
import { validateWorkspaceSearch } from "./search";

it.each(["123", "true", "null", '"京都"', "京都 lang:ja", "a+b & c"])(
  "preserves the external search text %s through validation and URL canonicalization",
  (query) => {
    const parsed = parseWorkspaceSearch(
      `?browseQuery=${encodeURIComponent(query)}&product=Latest&following=true`,
    );
    const validated = validateWorkspaceSearch(parsed);
    expect(validated.browseQuery).toBe(query);
    expect(validated.following).toBe(true);
    expect(
      validateWorkspaceSearch(parseWorkspaceSearch(stringifyWorkspaceSearch(validated))),
    ).toEqual(validated);
  },
);

it("retains the existing JSON search codec for other workspace fields", () => {
  expect(parseWorkspaceSearch("?q=123&browseSource=%7B%22kind%22%3A%22search%22%7D")).toEqual({
    q: 123,
    browseSource: { kind: "search" },
  });
});

it("rejects external search terms beyond the supported query length", () => {
  expect(
    validateWorkspaceSearch(parseWorkspaceSearch(`?browseQuery=${"x".repeat(513)}`)).browseQuery,
  ).toBeUndefined();
});
