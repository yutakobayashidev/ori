import { createServerFn } from "@tanstack/react-start";
import { codexUsageSchema, type CodexUsage } from "./model";

export const getCodexUsage = createServerFn({ method: "GET" }).handler(
  async (): Promise<CodexUsage> => {
    try {
      const { runtimeJson } = await import("#/features/execution/runtime-client.server");
      return codexUsageSchema.parse(await runtimeJson("/usage"));
    } catch {
      return { status: "unavailable", fetchedAt: null, windows: [] };
    }
  },
);
