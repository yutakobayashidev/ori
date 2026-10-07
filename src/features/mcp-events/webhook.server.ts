import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export class CallbackEndpointError extends Error {
  readonly code = -32015;
  constructor(readonly reason: string) {
    super("Webhook callback could not be verified or reached.");
  }
}
export function signingKey(secret: string) {
  if (!secret.startsWith("whsec_")) throw new Error("Invalid webhook signing secret.");
  const encoded = secret.slice(6);
  const key = Buffer.from(encoded, "base64");
  if (key.length < 24 || key.length > 64 || key.toString("base64") !== encoded)
    throw new Error("Invalid webhook signing secret.");
  return key;
}
export function webhookHeaders(
  id: string,
  subscriptionId: string,
  body: string,
  secrets: string[],
  now: number,
) {
  const timestamp = String(Math.floor(now / 1000));
  return {
    "Content-Type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "X-MCP-Subscription-Id": subscriptionId,
    "webhook-signature": secrets
      .map(
        (secret) =>
          `v1,${createHmac("sha256", signingKey(secret)).update(`${id}.${timestamp}.${body}`).digest("base64")}`,
      )
      .join(" "),
  };
}
export function callbackUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CallbackEndpointError("invalid_url");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    throw new CallbackEndpointError("invalid_url");
  return url;
}
export function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Only global unicast; exclude transition, benchmark, documentation and special-purpose ranges.
  if (isIP(address) === 6) {
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    return (
      /^[23]/.test(normalized) &&
      !/^2001:(?:[01]?[0-9a-f]{0,2}:|db8:)/.test(normalized) &&
      !normalized.startsWith("2002:") &&
      !normalized.startsWith("3fff:")
    );
  }
  return false;
}
type WebhookResponse = { status: number; body: string };
export type WebhookSender = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<WebhookResponse>;
/** DNS is checked for every connection and the chosen address is pinned; TLS still verifies the hostname. */
export const sendWebhook: WebhookSender = async (value, body, headers) => {
  if (Buffer.byteLength(body, "utf8") > 262_144)
    throw new CallbackEndpointError("payload_too_large");
  const url = callbackUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new CallbackEndpointError("timeout")), 10_000);
        lookup(host, { all: true })
          .then(resolve, reject)
          .finally(() => clearTimeout(timer));
      });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new CallbackEndpointError("invalid_address");
  const destination = addresses[0];
  if (!destination) throw new CallbackEndpointError("invalid_address");
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers,
        agent: false,
        family: destination.family,
        signal: AbortSignal.timeout(10_000),
        lookup: (_hostname, _options, callback) =>
          callback(null, destination.address, destination.family),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 65536) req.destroy(new CallbackEndpointError("response_too_large"));
          else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 500,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        response.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
};
