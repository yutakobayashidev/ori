import type { Page } from "@playwright/test";

/** Register before navigation: this stream starts in a client effect after hydration. */
export function waitForWorkspaceHydration(page: Page) {
  return page.waitForResponse((response) => {
    if (response.status() !== 200) return false;
    const path = new URL(response.url()).pathname;
    return (
      path === "/api/activities/events" ||
      (response.request().isNavigationRequest() &&
        ["/login", "/setup", "/onboarding"].includes(path))
    );
  });
}

export async function navigateHydrated(page: Page, url: string) {
  await Promise.all([waitForWorkspaceHydration(page), page.goto(url)]);
}
