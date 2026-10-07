import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ResearchPost } from "../platforms/types";
import { ResearchPostCard } from "./research-post-card";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("focuses and briefly highlights a cited card without revealing sensitive content", () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const post: ResearchPost = {
    key: "mastodon:1",
    platform: "mastodon",
    nativeId: "1",
    url: "https://social.invalid/@a/1",
    text: "Hidden content",
    author: { name: "Alice", handle: "a@social.invalid" },
    contentWarning: "Spoiler",
    sensitive: true,
  };
  const { rerender } = render(<ResearchPostCard post={post} />);
  const article = screen.getByRole("article");
  const scroll = vi.fn<() => void>();
  article.scrollIntoView = scroll;
  rerender(<ResearchPostCard post={post} citationRequest={1} citationSnapshot />);
  expect(article).toHaveFocus();
  expect(article).toHaveAttribute("data-citation-highlight", "true");
  expect(scroll).toHaveBeenCalledWith({
    block: "center",
    inline: "center",
    behavior: "instant",
  });
  expect(screen.getByText("Post saved during research")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show content" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
  rerender(<ResearchPostCard post={post} citationRequest={1} />);
  expect(scroll).toHaveBeenCalledTimes(2);
  expect(article).toHaveFocus();
  expect(screen.queryByText("Post saved during research")).not.toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(2500);
  });
  expect(article).not.toHaveAttribute("data-citation-highlight", "true");
  rerender(<ResearchPostCard post={post} citationRequest={2} />);
  expect(article).toHaveAttribute("data-citation-highlight", "true");
  rerender(<ResearchPostCard post={post} />);
  expect(article).not.toHaveAttribute("data-citation-highlight", "true");
});

it("waits for reveal before mounting CW content or sensitive media", () => {
  const post: ResearchPost = {
    key: "mastodon:1",
    platform: "mastodon",
    nativeId: "1",
    url: "https://social.invalid/@a/1",
    text: "Hidden content",
    html: "<p>Hidden <strong>content</strong></p>",
    author: { name: "Alice", handle: "a@social.invalid" },
    contentWarning: "Spoiler",
    sensitive: true,
    boostedBy: { name: "Bob", handle: "b@social.invalid" },
    media: [
      {
        type: "photo",
        url: "https://social.invalid/image.png",
        alt: "Hidden image",
      },
    ],
  };
  render(<ResearchPostCard post={post} />);
  expect(screen.getByText("Boosted by Bob")).toBeInTheDocument();
  expect(screen.queryByAltText("Hidden image")).not.toBeInTheDocument();
  expect(screen.queryByText("content")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show content" }));
  expect(screen.getByAltText("Hidden image")).toBeInTheDocument();
  expect(screen.getByText("content").tagName).toBe("STRONG");
  fireEvent.click(screen.getByRole("button", { name: "Hide content" }));
  expect(screen.queryByAltText("Hidden image")).not.toBeInTheDocument();
});
