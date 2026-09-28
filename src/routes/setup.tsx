import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "#/features/auth/auth-page";
export const Route = createFileRoute("/setup")({ component: SetupPage });
