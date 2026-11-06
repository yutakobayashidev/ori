// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../storage/database.server";
import { authSessions, workspaceOwner } from "../storage/schema";
import {
  completeOnboarding,
  getSession,
  SESSION_MAX_AGE_SECONDS,
  signInWithOidc,
  signOut,
} from "./auth.server";

let database: ReturnType<typeof openDatabase>;
const identity = {
  issuer: "https://id.example.com",
  subject: "owner-subject",
  email: "owner@example.com",
  name: "Owner",
};
beforeEach(() => {
  database = openDatabase(":memory:");
  vi.stubEnv("WORKSPACE_OIDC_ISSUER", identity.issuer);
  vi.stubEnv("WORKSPACE_OIDC_OWNER_SUBJECT", identity.subject);
});
afterEach(() => {
  database.$client.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("OIDC owner sessions", () => {
  it("rejects a different issuer or subject, even with the owner's email", () => {
    for (const changed of [{ subject: "other-subject" }, { issuer: "https://other.example.com" }])
      expect(() => signInWithOidc({ ...identity, ...changed }, database)).toThrow("cannot access");
    expect(database.select().from(workspaceOwner).all()).toHaveLength(0);
  });
  it("fails closed without the configured owner", () => {
    vi.stubEnv("WORKSPACE_OIDC_OWNER_SUBJECT", "");
    expect(() => signInWithOidc(identity, database)).toThrow("not configured");
  });
  it("creates only the pinned owner and stores hashed session tokens", () => {
    const result = signInWithOidc(identity, database);
    expect(result.owner.email).toBe(identity.email);
    expect(result.owner).not.toHaveProperty("passwordHash");
    expect(database.select().from(authSessions).get()?.tokenHash).not.toEqual(result.sessionToken);
    expect(getSession(result.sessionToken, database)).toEqual(result.owner);
    signInWithOidc(identity, database);
    expect(database.select().from(workspaceOwner).all()).toHaveLength(1);
  });
  it("preserves the existing owner, onboarding, and prior sessions when signing in again", () => {
    const first = signInWithOidc(identity, database);
    const owner = completeOnboarding(first.sessionToken, { name: "My existing name" }, database);
    const next = signInWithOidc(
      { ...identity, email: "new@example.com", name: "New name" },
      database,
    );
    expect(next.owner).toEqual(owner);
    expect(getSession(first.sessionToken, database)).toEqual(owner);
    expect(getSession(next.sessionToken, database)).toEqual(owner);
  });
  it("revokes only the logged-out session and rejects invented sessions", () => {
    const first = signInWithOidc(identity, database);
    const second = signInWithOidc(identity, database);
    expect(getSession("invented", database)).toBeNull();
    signOut(first.sessionToken, database);
    expect(getSession(first.sessionToken, database)).toBeNull();
    expect(getSession(second.sessionToken, database)).not.toBeNull();
  });
  it("expires sessions and requires a valid session to finish onboarding", () => {
    const result = signInWithOidc(identity, database);
    expect(result.owner.onboardingCompletedAt).toBeNull();
    const owner = completeOnboarding(result.sessionToken, { name: "Yuta" }, database);
    expect(owner.name).toBe("Yuta");
    expect(owner.onboardingCompletedAt).toBeTypeOf("number");
    expect(() => completeOnboarding("invalid", { name: "Other" }, database)).toThrow(
      "Please sign in.",
    );
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + SESSION_MAX_AGE_SECONDS * 1000 + 1);
    expect(getSession(result.sessionToken, database)).toBeNull();
    expect(database.select().from(authSessions).all()).toHaveLength(0);
  });
});
