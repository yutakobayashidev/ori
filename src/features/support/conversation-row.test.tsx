import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Activity } from "#/features/activities/model";
import { loadReplyAvatar } from "#/features/beeper/server-functions";
import { ConversationRow } from "./conversation-row";
vi.mock("#/features/beeper/server-functions", () => ({
  loadReplyAvatar: vi.fn<() => Promise<unknown>>(),
}));
function activity(id: string): Activity {
  const proposal = {
    id,
    kind: "reply" as const,
    title: "Confirm the meeting",
    nextAction: "Reply",
    sources: [],
    reply: { recipientName: "Kai Tanaka", sourceId: "source", context: "Meeting" },
  };
  return {
    id,
    number: 123,
    isUnread: false,
    proposal,
    effective: { ...proposal, section: "focus" },
    userState: "waiting",
    userOverrides: {},
  };
}
it("distinguishes group conversations with the same recipient even without images", async () => {
  vi.mocked(loadReplyAvatar)
    .mockResolvedValueOnce({ dataUrl: null, type: "group", title: "#pj-katasu" })
    .mockResolvedValueOnce({ dataUrl: null, type: "group", title: "#times-yuta" });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConversationRow group={[activity("one")]} selected={false} onSelect={() => {}} />
      <ConversationRow group={[activity("two")]} selected={true} onSelect={() => {}} />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "#pj-katasu: Reply to Kai Tanaka" }),
  ).toBeVisible();
  expect(
    await screen.findByRole("button", { name: "#times-yuta: Reply to Kai Tanaka" }),
  ).toHaveAttribute("aria-current", "true");
  expect(screen.getAllByText("Reply to Kai Tanaka")).toHaveLength(2);
});
