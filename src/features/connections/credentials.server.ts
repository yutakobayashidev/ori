import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

const envelopeSchema = z
  .object({
    version: z.literal(1),
    keyId: z.string(),
    iv: z.string(),
    tag: z.string(),
    ciphertext: z.string(),
  })
  .strict();

function decodeBase64(value: string): Buffer {
  const result = Buffer.from(value, "base64");
  if (result.toString("base64") !== value) throw new Error("Invalid encoding");
  return result;
}

function loadKey() {
  const path = process.env.TWITTER_LITE_CREDENTIAL_KEY_FILE;
  if (!path) throw new Error("TWITTER_LITE_CREDENTIAL_KEY_FILE is required.");
  let encoded: string;
  try {
    encoded = readFileSync(path, "utf8").trim();
  } catch {
    throw new Error("Could not read TWITTER_LITE_CREDENTIAL_KEY_FILE.");
  }
  let key: Buffer;
  try {
    key = decodeBase64(encoded);
    if (key.length !== 32) throw new Error("Invalid key length");
  } catch {
    throw new Error(
      "TWITTER_LITE_CREDENTIAL_KEY_FILE must contain 32 random bytes encoded as base64.",
    );
  }
  return {
    key,
    keyId: createHash("sha256").update(key).digest("hex").slice(0, 32),
  };
}

function associatedData(context: string, keyId: string) {
  if (!context) throw new Error("A credential record and purpose are required.");
  return Buffer.from(JSON.stringify(["twitter-lite-credential", 1, keyId, context]));
}

/** Context must identify both record and purpose; persist the returned opaque JSON. */
export function encryptCredential(plaintext: string, context: string): string {
  const { key, keyId } = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(context, keyId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return JSON.stringify({
    version: 1,
    keyId,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

export function decryptCredential(serialized: string, context: string): string {
  const { key, keyId } = loadKey();
  try {
    const envelope = envelopeSchema.parse(JSON.parse(serialized));
    if (envelope.keyId !== keyId) throw new Error("Different key");
    const iv = decodeBase64(envelope.iv);
    const tag = decodeBase64(envelope.tag);
    if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(associatedData(context, keyId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(decodeBase64(envelope.ciphertext)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Credential could not be decrypted. Check the stored credential and encryption key.",
    );
  }
}
