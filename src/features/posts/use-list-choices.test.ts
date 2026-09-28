import { describe, expect, it, vi } from "vitest";
import { createListChoicesOptions, ListChoicesLoadError } from "./use-list-choices";

describe("createListChoicesOptions", () => {
  it("loads the authenticated list choices once without automatic retries", async () => {
    const loader = vi.fn<Parameters<typeof createListChoicesOptions>[1]>().mockResolvedValue({
      ok: true,
      lists: [{ id: "123", name: "My List" }],
    });
    const options = createListChoicesOptions("main", loader);

    await expect(options.queryFn()).resolves.toEqual([{ id: "123", name: "My List" }]);
    expect(loader).toHaveBeenCalledWith({ data: { connectionId: "main" } });
    expect(options.queryKey).toEqual(["list-choices", "main"]);
    expect(options.retry).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.refetchOnReconnect).toBe(false);
  });

  it("preserves a typed load failure for the picker", async () => {
    const error = {
      code: "upstream" as const,
      message: "取得できませんでした。",
      retryable: true,
    };
    const options = createListChoicesOptions(
      "main",
      vi.fn().mockResolvedValue({ ok: false, error }),
    );

    const request = options.queryFn();
    await expect(request).rejects.toBeInstanceOf(ListChoicesLoadError);
    await expect(request).rejects.toMatchObject({ detail: error });
  });
});
