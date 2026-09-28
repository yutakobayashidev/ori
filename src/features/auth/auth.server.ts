import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { eq, lte } from "drizzle-orm";
import { type AppDatabase, getDatabase } from "../storage/database.server";
import { authSessions, authThrottle, workspaceOwner } from "../storage/schema";
import type { SafeOwner } from "./auth-client";

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, scryptOptions, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
const scryptOptions = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const throttleWindow = 15 * 60_000;

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const equal = (left: string, right: string) =>
  timingSafeEqual(Buffer.from(hash(left)), Buffer.from(hash(right)));
function safeOwner(owner: typeof workspaceOwner.$inferSelect): SafeOwner {
  return {
    id: owner.id,
    email: owner.email,
    name: owner.name,
    onboardingCompletedAt: owner.onboardingCompletedAt,
  };
}
export function readAuthState(database = getDatabase()) {
  return {
    needsSetup: !database.select({ id: workspaceOwner.id }).from(workspaceOwner).get(),
  };
}
/** Bootstrap secret is read only by the server or operator CLI, never sent to clients. */
export function getSetupToken() {
  const configured = process.env.WORKSPACE_SETUP_TOKEN;
  if (configured) {
    if (configured.length < 32)
      throw new AuthError(503, "The setup token must contain at least 32 characters.");
    return configured;
  }
  const dbPath = process.env.TWITTER_LITE_DB_PATH;
  if (!dbPath || !isAbsolute(dbPath))
    throw new AuthError(503, "Configure a workspace database or setup token.");
  const path = `${dbPath}.setup-token`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(path, randomBytes(32).toString("base64url"), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const token = readFileSync(path, "utf8").trim();
  if (token.length < 32) throw new AuthError(503, "The workspace setup token is invalid.");
  return token;
}
function consumeAttempt(database: AppDatabase) {
  database.transaction(
    (tx) => {
      const now = Date.now();
      const current = tx.select().from(authThrottle).get();
      if (current && current.resetAt > now) {
        if (current.attempts >= 10)
          throw new AuthError(429, "Too many attempts. Please try again in 15 minutes.");
        tx.update(authThrottle)
          .set({ attempts: current.attempts + 1 })
          .where(eq(authThrottle.id, 1))
          .run();
      } else {
        tx.insert(authThrottle)
          .values({ id: 1, attempts: 1, resetAt: now + throttleWindow })
          .onConflictDoUpdate({
            target: authThrottle.id,
            set: { attempts: 1, resetAt: now + throttleWindow },
          })
          .run();
      }
    },
    { behavior: "immediate" },
  );
}
function session(
  database: Pick<AppDatabase, "insert" | "delete">,
  owner: typeof workspaceOwner.$inferSelect,
) {
  const sessionToken = randomBytes(32).toString("base64url");
  database.delete(authSessions).where(lte(authSessions.expiresAt, Date.now())).run();
  database
    .insert(authSessions)
    .values({
      tokenHash: hash(sessionToken),
      ownerId: owner.id,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    })
    .run();
  database.delete(authThrottle).where(eq(authThrottle.id, 1)).run();
  return { sessionToken, owner: safeOwner(owner) };
}
function cleanName(name: string) {
  const cleaned = name.trim();
  if (!cleaned || cleaned.length > 80)
    throw new AuthError(400, "Enter a name of up to 80 characters.");
  return cleaned;
}
export async function createOwner(
  input: { email: string; password: string; name: string; setupToken: string },
  database = getDatabase(),
) {
  if (!readAuthState(database).needsSetup)
    throw new AuthError(409, "This workspace is already set up. Please sign in.");
  consumeAttempt(database);
  if (!equal(input.setupToken, getSetupToken()))
    throw new AuthError(401, "Invalid setup credentials.");
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AuthError(400, "Enter a valid email address.");
  if (input.password.length < 15 || input.password.length > 128)
    throw new AuthError(400, "Use a password between 15 and 128 characters.");
  const name = cleanName(input.name);
  const salt = randomBytes(16).toString("hex");
  const derived = (await derive(input.password, salt)) as Buffer;
  return database.transaction(
    (tx) => {
      if (tx.select().from(workspaceOwner).get())
        throw new AuthError(409, "This workspace is already set up. Please sign in.");
      const owner = {
        id: 1,
        email,
        name,
        passwordHash: `${salt}:${derived.toString("hex")}`,
        onboardingCompletedAt: null,
        createdAt: Date.now(),
      };
      tx.insert(workspaceOwner).values(owner).run();
      return session(tx, owner);
    },
    { behavior: "immediate" },
  );
}
export async function signIn(input: { email: string; password: string }, database = getDatabase()) {
  consumeAttempt(database);
  const owner = database.select().from(workspaceOwner).get();
  if (input.password.length > 128 || input.email.length > 254)
    throw new AuthError(401, "Invalid email or password.");
  const [salt = "", expected = ""] = owner?.passwordHash.split(":") ?? [
    "0".repeat(32),
    "0".repeat(128),
  ];
  const actual = (await derive(input.password, salt)) as Buffer;
  if (
    !owner ||
    !equal(input.email.trim().toLowerCase(), owner.email) ||
    !timingSafeEqual(actual, Buffer.from(expected, "hex"))
  )
    throw new AuthError(401, "Invalid email or password.");
  return session(database, owner);
}
export function getSession(token: string | undefined, database = getDatabase()): SafeOwner | null {
  if (!token || token.length > 128) return null;
  const found = database
    .select()
    .from(authSessions)
    .where(eq(authSessions.tokenHash, hash(token)))
    .get();
  if (!found) return null;
  if (found.expiresAt <= Date.now()) {
    database.delete(authSessions).where(eq(authSessions.tokenHash, found.tokenHash)).run();
    return null;
  }
  const owner = database
    .select()
    .from(workspaceOwner)
    .where(eq(workspaceOwner.id, found.ownerId))
    .get();
  return owner ? safeOwner(owner) : null;
}
export function signOut(token: string | undefined, database = getDatabase()) {
  if (token)
    database
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, hash(token)))
      .run();
}
export function completeOnboarding(
  token: string,
  input: { name: string },
  database = getDatabase(),
): SafeOwner {
  const owner = getSession(token, database);
  if (!owner) throw new AuthError(401, "Please sign in.");
  const update = {
    name: cleanName(input.name),
    onboardingCompletedAt: owner.onboardingCompletedAt ?? Date.now(),
  };
  database.update(workspaceOwner).set(update).where(eq(workspaceOwner.id, owner.id)).run();
  return { ...owner, ...update };
}
