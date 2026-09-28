import { expect, it } from "vitest";
import { safeReturnTo } from "./return-to";

it("keeps the selected view through login", () => {
  expect(safeReturnTo("/inbox?q=agents&article=browser#read")).toBe(
    "/inbox?q=agents&article=browser#read",
  );
});
it.each([
  "https://outside.invalid",
  "//outside.invalid",
  "/\\outside.invalid",
  "/api/auth",
  "/login",
  "/inbox\n",
  undefined,
])("rejects an unsafe destination: %s", (value) => {
  expect(safeReturnTo(value)).toBe("/");
});
