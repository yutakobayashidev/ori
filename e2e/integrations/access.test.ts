import { expect, test } from "../fixtures";

test("owner can open the app but missing or foreign identity is forbidden", async ({ request }) => {
  expect((await request.get("/")).status()).toBe(200);
  expect((await request.get("/", { headers: { "Tailscale-User-Login": "" } })).status()).toBe(403);
  expect(
    (
      await request.get("/", {
        headers: { "Tailscale-User-Login": "other@twitter-lite.invalid" },
      })
    ).status(),
  ).toBe(403);
});

test("mutations require exact Origin even with same-origin Fetch Metadata", async ({ request }) => {
  expect((await request.post("/")).status()).toBe(403);
  expect(
    (
      await request.post("/", {
        headers: {
          Origin: "https://other.invalid",
          "Sec-Fetch-Site": "same-origin",
        },
      })
    ).status(),
  ).toBe(403);
});

test("server functions also reject foreign identity and cross-site calls", async ({
  page,
  request,
}) => {
  const serverRequest = page.waitForRequest((request) => request.url().includes("/_serverFn/"));
  await page.goto("/deck");
  const url = (await serverRequest).url();
  expect(
    (
      await request.get(url, {
        headers: {
          "Tailscale-User-Login": "other@twitter-lite.invalid",
          "Sec-Fetch-Site": "same-origin",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(url, {
        headers: { "Sec-Fetch-Site": "cross-site" },
      })
    ).status(),
  ).toBe(403);
});
