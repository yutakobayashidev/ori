import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "#/features/auth/auth-page";
export const Route = createFileRoute("/login")({ component: LoginRoute });
function LoginRoute() {
  return <LoginPage returnTo={Route.useSearch().returnTo} />;
}
