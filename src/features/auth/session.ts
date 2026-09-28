import { createIsomorphicFn } from "@tanstack/react-start";
import type { AuthState } from "./auth-client";

export const loadAuthState = createIsomorphicFn()
  .server(async (): Promise<AuthState> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { authState } = await import("./http.server");
    return authState(getRequest());
  })
  .client(async (): Promise<AuthState> => {
    const response = await fetch("/api/auth", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to check your session.");
    return response.json();
  });
