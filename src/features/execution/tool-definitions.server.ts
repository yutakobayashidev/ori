import { createWorkspaceTools } from "../mcp/workspace-tools.server";

export function executionToolDefinitions() {
  return createWorkspaceTools().definitions.filter(
    ({ name }) => !["update_activity", "get_beeper_asset", "delete_deck"].includes(name),
  );
}
