import { createChat } from "@shadcn/helpers/ai-sdk";
import { fireEvent, render, screen } from "@testing-library/react";
import { readUIMessageStream } from "ai";
import { expect, it, vi } from "vitest";
import { ResearchMarkdown } from "./research-markdown";

it("renders structured GFM while keeping headings below the chat heading", () => {
  render(
    <ResearchMarkdown
      text={
        "# 比較結果\n\n- **高速**\n- ~~旧仕様~~\n\n| 項目 | 結果 |\n| --- | --- |\n| 対応 | あり |\n\n> 引用文\n\n```ts\nconst result = true\n```"
      }
    />,
  );
  expect(screen.getByRole("heading", { level: 3, name: "比較結果" })).toBeVisible();
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByRole("table")).toHaveTextContent("対応");
  expect(screen.getByRole("columnheader", { name: "結果" })).toBeVisible();
  expect(screen.getByText("引用文").closest("blockquote")).not.toBeNull();
  expect(screen.getByText("const result = true").closest("pre")).not.toBeNull();
});

it("blocks raw HTML and unsafe URLs without loading remote images", () => {
  const { container } = render(
    <ResearchMarkdown
      text={
        '<script>alert(1)</script>\n\n<img src="https://unsafe.invalid/pixel">\n\n[危険](javascript:alert%281%29)\n\n![画像の説明](https://example.com/pixel.png)'
      }
    />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("危険").getAttribute("href")).not.toMatch(/^javascript:/);
  expect(screen.getByRole("link", { name: "画像の説明" })).toHaveAttribute(
    "href",
    "https://example.com/pixel.png",
  );
});

it("intercepts only unmodified left clicks when citation navigation succeeds", () => {
  const navigate = vi.fn<(url: string) => boolean>().mockReturnValue(true);
  render(
    <ResearchMarkdown
      text={"[投稿](https://x.com/author/status/123)"}
      onNavigateCitation={navigate}
    />,
  );
  const link = screen.getByRole("link", { name: "投稿" });
  expect(link).toHaveAttribute("href", "https://x.com/author/status/123");
  expect(fireEvent.click(link)).toBe(false);
  expect(navigate).toHaveBeenCalledWith("https://x.com/author/status/123");
  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"])
    expect(fireEvent.click(link, { [modifier]: true })).toBe(true);
  expect(fireEvent.click(link, { button: 1 })).toBe(true);
  expect(navigate).toHaveBeenCalledOnce();
});

it("preserves ordinary external navigation when a citation cannot be found", () => {
  const navigate = vi.fn<(url: string) => boolean>().mockReturnValue(false);
  render(
    <ResearchMarkdown
      text={
        "[原文](https://example.com/post)\n\n[メール](mailto:hello@example.com)\n\n[参照](#reference)"
      }
      onNavigateCitation={navigate}
    />,
  );
  const link = screen.getByRole("link", { name: "原文" });
  expect(fireEvent.click(link)).toBe(true);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByRole("link", { name: "メール" })).toHaveAttribute(
    "href",
    "mailto:hello@example.com",
  );
  expect(screen.getByRole("link", { name: "参照" })).toHaveAttribute("href", "#reference");
});

it("animates live prose but renders completed history without animation wrappers", () => {
  const { container, rerender } = render(<ResearchMarkdown text="A live response" isAnimating />);
  expect(container.querySelector("[data-sd-animate]")).not.toBeNull();
  rerender(<ResearchMarkdown text="A completed response" />);
  expect(container.querySelector("[data-sd-animate]")).toBeNull();
  expect(screen.getByText("A completed response")).toBeVisible();
});

it("keeps fenced code free of streaming animation and supports incomplete Markdown", () => {
  const { container } = render(
    <ResearchMarkdown text={"```ts\nconst value = 1\n```\n\n**Still writing"} isAnimating />,
  );
  expect(container.querySelector("pre [data-sd-animate]")).toBeNull();
  expect(container.querySelector("strong")).toHaveTextContent("Still writing");
});

it("renders streamed Markdown and resolves the completed citation without losing Japanese trailing text", async () => {
  // Exercise incremental AI SDK message assembly without a model or network.
  const text =
    "**A useful source** [Read the post](https://x.com/author/status/123)\n\n日本語の末尾も保持します。";
  const chat = createChat().user("Find the source").assistant(text);
  const stream = await chat.transport({ delayMs: undefined }).sendMessages({
    trigger: "submit-message",
    chatId: "markdown-fixture",
    messageId: undefined,
    messages: chat.get(1),
    abortSignal: undefined,
  });
  const navigate = vi.fn<(url: string) => boolean>().mockReturnValue(true);
  const { container, rerender } = render(<ResearchMarkdown text="" />);
  let finalText = "";
  let partials = 0;
  for await (const message of readUIMessageStream({ stream })) {
    finalText = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
    if (finalText && finalText !== text) partials++;
    rerender(<ResearchMarkdown text={finalText} isAnimating onNavigateCitation={navigate} />);
    expect(container.querySelector("img, script")).toBeNull();
  }
  expect(partials).toBeGreaterThan(0);
  expect(finalText).toBe(text);
  rerender(<ResearchMarkdown text={finalText} onNavigateCitation={navigate} />);
  expect(container.querySelector("[data-sd-animate]")).toBeNull();
  expect(screen.getByText("日本語の末尾も保持します。")).toBeVisible();
  expect(fireEvent.click(screen.getByRole("link", { name: "Read the post" }))).toBe(false);
  expect(navigate).toHaveBeenCalledWith("https://x.com/author/status/123");
});
