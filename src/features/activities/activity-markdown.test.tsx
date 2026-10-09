import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ActivityMarkdown } from "./activity-markdown";

it("renders nested bullet and numbered steps as lists while preserving paragraphs", () => {
  const { container } = render(
    <ActivityMarkdown
      text={
        "確認する内容\n補足の一行\n\n- 資料を読む\n  - 日程を確認\n  - 予算を確認\n\n1. 返信する\n   1. 候補日を伝える"
      }
    />,
  );
  expect(container.querySelectorAll("ul ul")).toHaveLength(1);
  expect(container.querySelectorAll("ol ol")).toHaveLength(1);
  expect(screen.getByText("確認する内容 補足の一行").tagName).toBe("P");
  expect(screen.getByText("日程を確認")).toBeVisible();
});
