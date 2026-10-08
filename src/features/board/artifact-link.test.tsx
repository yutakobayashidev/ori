import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ResearchMarkdown } from "#/features/research/research-markdown";
import { artifactLink } from "./artifact-link";

it("links generated files through authenticated downloads and leaves external references intact", () => {
  const run = { id: "run-one", artifacts: [{ path: "report.md", size: 100 }] };
  render(
    <ResearchMarkdown
      text="[Report](/tmp/work/run-one/report.md) [Relative](report.md) [Missing](missing.md) [Source](https://source.invalid/report.md) [Unsafe](javascript:alert%281%29)"
      resolveLink={(href) => artifactLink(run, href)}
    />,
  );
  expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute(
    "href",
    "/api/execution/artifacts?id=run-one&path=report.md",
  );
  expect(screen.getByRole("link", { name: "Relative" })).toHaveAttribute(
    "href",
    "/api/execution/artifacts?id=run-one&path=report.md",
  );
  expect(screen.queryByRole("link", { name: "Missing" })).toBeNull();
  expect(screen.getByRole("link", { name: "Source" })).toHaveAttribute(
    "href",
    "https://source.invalid/report.md",
  );
  expect(screen.getByText("Unsafe").getAttribute("href") ?? "").not.toMatch(/^javascript:/);
});
