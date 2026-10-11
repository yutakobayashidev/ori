import { and, desc, lt, sql } from "drizzle-orm";
import { getDatabase, type AppDatabase } from "../storage/database.server";
import { communicationLogs } from "../storage/schema";
import {
  getCommunicationLogsInput,
  type CommunicationLog,
  type CommunicationLogPage,
  type CommunicationValue,
} from "./communication-model";

const secretKey = /secret|password|authorization|cookie|signature|token|api.?key|proof|challenge/i;

/** Log data, never transport headers or endpoint URLs carrying credentials. */
export function redactCommunication(value: unknown, secrets: string[] = []): CommunicationValue {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object") return redactCommunication(parsed, secrets);
    } catch {
      /* Plain text response. */
    }
    let text = value;
    for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[redacted]");
    text = text
      .replace(/whsec_[A-Za-z0-9+/=]+/g, "[redacted]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/https?:\/\/[^\s"<>]+/g, (url) => {
        try {
          const parsed = new URL(url);
          parsed.username = "";
          parsed.password = "";
          parsed.search = "";
          parsed.hash = "";
          return parsed.href;
        } catch {
          return "[redacted URL]";
        }
      });
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => redactCommunication(item, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? "[redacted]" : redactCommunication(item, secrets),
      ]),
    );
  return typeof value === "number" || typeof value === "boolean" ? value : null;
}

function sensitiveValues(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return sensitiveValues(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== "object") return [];
  const delivery = object(object(value).delivery);
  const callbackSecrets = typeof delivery.url === "string" ? [delivery.url] : [];
  return [
    ...callbackSecrets,
    ...Object.entries(value).flatMap(([key, item]) =>
      secretKey.test(key) && typeof item === "string" ? [item] : sensitiveValues(item),
    ),
  ];
}

function bounded(value: CommunicationValue): CommunicationValue {
  const text = JSON.stringify(value);
  return text.length > 65_536 ? { truncated: true, preview: text.slice(0, 65_536) } : value;
}

type LogInput = Omit<CommunicationLog, "id" | "request" | "response"> & {
  request: unknown;
  response: unknown;
};
export function saveCommunication(
  input: LogInput,
  database = getDatabase(),
  secrets: string[] = [],
) {
  const privateValues = [
    ...secrets,
    ...sensitiveValues(input.request),
    ...sensitiveValues(input.response),
  ];
  database
    .insert(communicationLogs)
    .values({
      ...input,
      request: bounded(redactCommunication(input.request, privateValues)),
      response: bounded(redactCommunication(input.response, privateValues)),
    })
    .run();
}

export function getCommunicationLogs(
  input: unknown = {},
  database = getDatabase(),
): CommunicationLogPage {
  const parsed = getCommunicationLogsInput.parse(input);
  const rows = database
    .select()
    .from(communicationLogs)
    .where(
      and(
        parsed.beforeId ? lt(communicationLogs.id, parsed.beforeId) : undefined,
        parsed.activityId
          ? sql`exists (select 1 from json_each(${communicationLogs.activityIds}) where value = ${parsed.activityId})`
          : undefined,
      ),
    )
    .orderBy(desc(communicationLogs.id))
    .limit(parsed.limit + 1)
    .all();
  const entries = rows.slice(0, parsed.limit);
  return {
    ok: true,
    entries,
    nextBeforeId: rows.length > parsed.limit ? (entries.at(-1)?.id ?? null) : null,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function logMcpExchange<T>(
  name: string,
  request: unknown,
  run: () => Promise<T> | T,
  kind: "mcp-write" | "mcp-event" = "mcp-write",
): Promise<T> {
  const start = Date.now();
  let result: unknown = null;
  let outcome: "success" | "error" = "success";
  try {
    const response = await run();
    result = response;
    if (object(response).ok === false) outcome = "error";
    return response;
  } catch (error) {
    outcome = "error";
    result = {
      error: {
        code: typeof object(error).code === "number" ? object(error).code : "execution-error",
      },
    };
    throw error;
  } finally {
    const args = object(request);
    const response = object(result);
    const activityIds = Array.isArray(response.activityIds)
      ? response.activityIds
      : Array.isArray(object(response.receipt).activityIds)
        ? (object(response.receipt).activityIds as unknown[])
        : typeof object(response.operation).activityId === "string"
          ? [object(response.operation).activityId]
          : Array.isArray(args.activities)
            ? args.activities.map((item) => object(item).id)
            : typeof args.activityId === "string"
              ? [args.activityId]
              : Array.isArray(object(args.arguments).activityIds)
                ? (object(args.arguments).activityIds as unknown[])
                : /activity/.test(name) && typeof args.id === "string"
                  ? [args.id]
                  : [];
    try {
      saveCommunication({
        kind,
        direction: "incoming",
        name,
        occurredAt: start,
        durationMs: Date.now() - start,
        outcome,
        status: null,
        requestId: typeof args.requestId === "string" ? args.requestId : null,
        eventId: null,
        subscriptionId:
          kind === "mcp-event" && typeof response.id === "string" ? response.id : null,
        attempt: null,
        activityIds: activityIds.filter((id): id is string => typeof id === "string"),
        request,
        response: result,
      });
    } catch {
      // The operation may already be committed or sent. Never turn success into a retry.
      process.stderr.write("Unable to persist MCP communication log.\n");
    }
  }
}

export async function logEventDelivery<T extends { status: number; body: string }>(
  input: {
    name: string;
    eventId: string;
    subscriptionId: string;
    attempt: number;
    body: string;
    secrets: string[];
  },
  run: () => Promise<T>,
  database: AppDatabase,
  validateResponse?: (response: T) => void,
): Promise<T> {
  const start = Date.now();
  let response: unknown = null;
  let status: number | null = null;
  let succeeded = false;
  try {
    const result = await run();
    status = result.status;
    response = result.body;
    validateResponse?.(result);
    succeeded = result.status >= 200 && result.status < 300;
    return result;
  } catch (error) {
    if (status === null) response = { error: "transport_error" };
    throw error;
  } finally {
    try {
      let body: unknown;
      try {
        body = JSON.parse(input.body);
      } catch {
        body = input.body;
      }
      const data = object(object(body).data);
      saveCommunication(
        {
          kind: "mcp-event",
          direction: "outgoing",
          name: input.name,
          occurredAt: start,
          durationMs: Date.now() - start,
          outcome: succeeded ? "success" : "error",
          status,
          requestId: typeof data.requestId === "string" ? data.requestId : null,
          eventId: input.eventId,
          subscriptionId: input.subscriptionId,
          attempt: input.attempt,
          activityIds: typeof data.activityId === "string" ? [data.activityId] : [],
          request: body,
          response,
        },
        database,
        input.secrets,
      );
    } catch {
      process.stderr.write("Unable to persist MCP event communication log.\n");
    }
  }
}
