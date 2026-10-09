import type { Connection } from "./model";

export function redditGatewayConnection(): Connection | undefined {
  const configured = process.env.RDT_GATEWAY_URL;
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search ||
      url.hash
    )
      return undefined;
    return {
      id: "reddit-public",
      platform: "reddit",
      origin: url.origin,
      accountId: null,
      displayName: `Reddit · ${url.host}`,
      status: "connected",
    };
  } catch {
    return undefined;
  }
}
