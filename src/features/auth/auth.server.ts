import { createHash, randomBytes } from "node:crypto";
import { eq, lte } from "drizzle-orm";
import { getDatabase } from "../storage/database.server";
import { authSessions, workspaceOwner } from "../storage/schema";
import type { SafeOwner } from "./auth-client";

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

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
function safeOwner(owner: typeof workspaceOwner.$inferSelect): SafeOwner {
  return {
    id: owner.id,
    email: owner.email,
    name: owner.name,
    onboardingCompletedAt: owner.onboardingCompletedAt,
  };
}

/** Called only after the OIDC client has validated the ID token. Never accepts browser claims. */
export function signInWithOidc(
  identity: { issuer: string; subject: string; email?: string; name?: string },
  database = getDatabase(),
) {
  const issuer = process.env.WORKSPACE_OIDC_ISSUER;
  const subject = process.env.WORKSPACE_OIDC_OWNER_SUBJECT;
  if (!issuer || !subject) throw new AuthError(503, "Owner identity is not configured.");
  if (identity.issuer !== issuer || identity.subject !== subject)
    throw new AuthError(403, "This account cannot access this workspace.");
  return database.transaction(
    (tx) => {
      let owner = tx.select().from(workspaceOwner).get();
      if (!owner) {
        const email = identity.email?.trim();
        if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new AuthError(403, "The owner account must have an email address.");
        owner = {
          id: 1,
          email,
          name: cleanName(identity.name || email),
          onboardingCompletedAt: null,
          createdAt: Date.now(),
        };
        tx.insert(workspaceOwner).values(owner).run();
      }
      const sessionToken = randomBytes(32).toString("base64url");
      tx.delete(authSessions).where(lte(authSessions.expiresAt, Date.now())).run();
      tx.insert(authSessions)
        .values({
          tokenHash: hash(sessionToken),
          ownerId: owner.id,
          expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
        })
        .run();
      return { sessionToken, owner: safeOwner(owner) };
    },
    { behavior: "immediate" },
  );
}
function cleanName(name: string) {
  const cleaned = name.trim();
  if (!cleaned || cleaned.length > 80)
    throw new AuthError(400, "Enter a name of up to 80 characters.");
  return cleaned;
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
