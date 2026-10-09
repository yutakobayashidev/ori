export const workspaceAppResource = {
  uri: "ui://personal-workspace/app-v1.html",
  name: "Personal Workspace",
  description:
    "Research decks, posts, activities and reply drafts using the workspace's shared UI.",
  mimeType: "text/html;profile=mcp-app",
  _meta: {
    ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
  },
};

const appTools = new Set([
  "get_activity_context",
  "update_activity_progress",
  "get_deck",
  "create_deck",
  "replace_deck",
  "fetch_posts",
  "fetch_column_posts",
]);

export function workspaceAppToolMeta(name: string) {
  if (name === "update_activity" || name === "get_beeper_asset")
    return { ui: { visibility: ["app"] }, "openai/widgetAccessible": true };
  if (!appTools.has(name)) return undefined;
  return {
    ui: { resourceUri: workspaceAppResource.uri },
    "openai/outputTemplate": workspaceAppResource.uri,
    "openai/widgetAccessible": true,
  };
}

export function workspaceAppResultMeta(name: string, args: Record<string, unknown>) {
  if (!appTools.has(name)) return undefined;
  const ui = { resourceUri: workspaceAppResource.uri };
  if (name === "update_activity_progress")
    return {
      ui,
      workspace: { toolName: "get_activity_context", toolArguments: { activityIds: [args.id] } },
    };
  return { ui, workspace: { toolName: name, toolArguments: args } };
}
