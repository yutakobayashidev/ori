import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "#/features/activities/history-page";
export const Route = createFileRoute("/history")({ component: HistoryPage });
