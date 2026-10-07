import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LoginPage, SetupPage } from "./auth-page";

it.each([LoginPage, SetupPage])(
  "keeps credentials out of native GET submissions before hydration (%#)",
  (Page) => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<Page />);
    expect(container.querySelector("form")).toHaveAttribute("method", "post");
    expect(container.querySelector('button[type="submit"]')).toBeDisabled();
    for (const input of container.querySelectorAll("input")) expect(input).toBeDisabled();
  },
);
