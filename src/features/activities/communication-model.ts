import { z } from "zod";

export type CommunicationValue =
  | string
  | number
  | boolean
  | null
  | CommunicationValue[]
  | { [key: string]: CommunicationValue };

export const getCommunicationLogsInput = z.strictObject({
  activityId: z.string().min(1).max(128).optional(),
  beforeId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type CommunicationLog = {
  id: number;
  kind: "mcp-write" | "mcp-event";
  direction: "incoming" | "outgoing";
  name: string;
  occurredAt: number;
  durationMs: number;
  outcome: "success" | "error";
  status: number | null;
  requestId: string | null;
  eventId: string | null;
  subscriptionId: string | null;
  attempt: number | null;
  activityIds: string[];
  request: CommunicationValue;
  response: CommunicationValue;
};
export type CommunicationLogPage = {
  ok: true;
  entries: CommunicationLog[];
  nextBeforeId: number | null;
};
