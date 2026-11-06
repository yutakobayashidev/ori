import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LoginPage } from "./auth-page";

it("offers an OIDC redirect without collecting local credentials", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<LoginPage />);
  expect(container.querySelector("a")).toHaveAttribute("href", "/api/auth/login");
  expect(container.querySelector("a")).toHaveTextContent("Sign in with Pocket ID");
  expect(container.querySelectorAll("input, form")).toHaveLength(0);
});
