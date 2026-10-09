import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { request } from "node:https";
import { BlockList } from "node:net";
import { eq } from "drizzle-orm";
import { getDatabase } from "../storage/database.server";
import { beeperMediaAssets } from "../storage/schema";
import { createBeeperAdapter, type BeeperMessagingAdapter } from "./adapter.server";
import { BeeperConversationError, getBeeperAssetInput } from "./conversation-model";

const maxBytes = 2 * 1024 * 1024;
const privateNetworks = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  privateNetworks.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const)
  privateNetworks.addSubnet(address, prefix, "ipv6");
const imageCache = new Map<string, { dataUrl: string; expires: number }>();

export function rememberBeeperAsset(
  targetId: string,
  sourceUri: string | undefined,
  database = getDatabase(),
) {
  if (sourceUri && isAbsolute(sourceUri)) sourceUri = pathToFileURL(sourceUri).href;
  if (
    !sourceUri ||
    sourceUri.length > 3 * 1024 * 1024 ||
    !/^(https|data|mxc|localmxc|file):/.test(sourceUri)
  )
    return undefined;
  const id = createHash("sha256")
    .update(JSON.stringify([targetId, sourceUri]))
    .digest("hex");
  database
    .insert(beeperMediaAssets)
    .values({ id, targetId, sourceUri, observedAt: Date.now() })
    .onConflictDoNothing()
    .run();
  return id;
}

async function readRemoteImage(sourceUri: string): Promise<Buffer> {
  const url = new URL(sourceUri);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443"))
    throw new Error("Unsupported image location.");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
  if (
    !addresses.length ||
    addresses.some((entry) =>
      privateNetworks.check(entry.address, entry.family === 6 ? "ipv6" : "ipv4"),
    )
  )
    throw new Error("Private image location.");
  const address = addresses[0];
  if (!address) throw new Error("No image host address.");
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        family: address.family,
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
        timeout: 15_000,
        headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          Number(response.headers["content-length"] ?? 0) > maxBytes
        ) {
          response.destroy();
          reject(new Error("Image unavailable."));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > maxBytes) response.destroy(new Error("Image too large."));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Image timed out.")));
    req.on("error", reject);
    req.end();
  });
}

function imageMime(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) return "image/gif";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  throw new Error("Unsupported image content.");
}

export async function getBeeperAsset(
  input: unknown,
  database = getDatabase(),
  adapter: BeeperMessagingAdapter = createBeeperAdapter(),
) {
  const parsed = getBeeperAssetInput.safeParse(input);
  if (!parsed.success) throw new BeeperConversationError("invalid-input", "Choose a known avatar.");
  const asset = database
    .select()
    .from(beeperMediaAssets)
    .where(eq(beeperMediaAssets.id, parsed.data.assetId))
    .get();
  if (!asset || asset.targetId !== adapter.targetId)
    throw new BeeperConversationError("not-found", "Avatar not found.");
  const cached = imageCache.get(asset.id);
  if (cached && cached.expires > Date.now()) return { ok: true as const, dataUrl: cached.dataUrl };
  try {
    let bytes: Buffer;
    let declaredMime: string | undefined;
    if (asset.sourceUri.startsWith("data:")) {
      const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
        asset.sourceUri,
      );
      if (!match?.[2]) throw new Error("Unsupported inline image.");
      declaredMime = match[1];
      bytes = Buffer.from(match[2], "base64");
    } else if (asset.sourceUri.startsWith("https:")) bytes = await readRemoteImage(asset.sourceUri);
    else bytes = await adapter.readMedia(asset.sourceUri);
    if (!bytes.length || bytes.length > maxBytes) throw new Error("Invalid image size.");
    const mime = imageMime(bytes);
    if (declaredMime && declaredMime !== mime) throw new Error("Image type mismatch.");
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    const oldest = imageCache.keys().next().value;
    if (imageCache.size >= 16 && oldest) imageCache.delete(oldest);
    imageCache.set(asset.id, { dataUrl, expires: Date.now() + 5 * 60_000 });
    return { ok: true as const, dataUrl };
  } catch {
    throw new BeeperConversationError("beeper-unavailable", "This avatar is unavailable.");
  }
}
