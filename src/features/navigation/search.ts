import { z } from "zod";

const text = z.string().max(500).optional().catch(undefined);
const flag = z.literal(true).optional().catch(undefined);
const workspaceSearch = z.object({
  q: text,
  article: text,
  activity: text,
  conversation: text,
  view: z.enum(["now", "later", "waiting", "done", "all"]).optional().catch(undefined),
  accounts: flag,
  review: flag,
  entry: text,
  deck: text,
  run: z
    .union([z.uuid(), z.literal("new")])
    .optional()
    .catch(undefined),
  citation: text,
  vitalSection: z.enum(["Body", "Environment"]).optional().catch(undefined),
  vitalTab: text,
  vitalHistory: flag,
  vitalDetail: text,
  environmentTab: z.enum(["Overview", "Climate control"]).optional().catch(undefined),
  environmentRange: z.enum(["24H", "48H", "7D"]).optional().catch(undefined),
  environmentMetric: text,
  environmentDetail: text,
  returnTo: z.string().max(4096).optional().catch(undefined),
});
export type WorkspaceSearch = z.infer<typeof workspaceSearch>;
export function validateWorkspaceSearch(search: Record<string, unknown>): WorkspaceSearch {
  return workspaceSearch.parse(search);
}
