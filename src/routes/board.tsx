import { createFileRoute } from "@tanstack/react-router";
import { BoardPage } from "#/features/board/board-page";
export const Route = createFileRoute("/board")({ component: BoardPage });
