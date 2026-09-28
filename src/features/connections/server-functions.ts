import { createServerFn } from "@tanstack/react-start";

export const loadConnections = createServerFn({ method: "GET" }).handler(async () => {
  const { listConnections } = await import("./repository.server");
  return listConnections();
});
