import { z } from "zod";

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const FOLLOWS = /(?:^|\s)filter:follows(?:\s|$)/i;
const LIST_ID = /^\d{1,32}$/;
const connectionIdSchema = z.string().trim().min(1).max(256);

export class InputError extends Error {}

export const userPageInputSchema = z.object({
  connectionId: connectionIdSchema,
  target: z.string().trim().min(1).max(256),
  cursor: z.string().min(1).optional(),
});

export const listPageInputSchema = z.object({
  connectionId: connectionIdSchema,
  target: z.string().trim().min(1).max(256),
  cursor: z.string().min(1).optional(),
});

export const listChoicesInputSchema = z.object({
  connectionId: connectionIdSchema,
});

export const searchPageInputSchema = z.object({
  connectionId: connectionIdSchema,
  query: z.string().trim().min(1).max(512),
  product: z.enum(["Top", "Latest"]),
  following: z.boolean(),
  cursor: z.string().min(1).optional(),
});

function requireHandle(value: string): string {
  if (!HANDLE.test(value)) {
    throw new InputError("Handles can only contain letters, numbers, and underscores.");
  }
  return value;
}

export function normalizeUserTarget(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new InputError("Enter a handle or profile URL.");
  }
  if (value.startsWith("@")) {
    return requireHandle(value.slice(1));
  }
  if (!value.includes("://")) {
    return requireHandle(value);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InputError("Check the profile URL format.");
  }
  if (!["x.com", "twitter.com"].includes(url.hostname.toLowerCase())) {
    throw new InputError("Enter an x.com or twitter.com URL.");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) {
    throw new InputError("Enter a profile URL.");
  }
  return requireHandle(segments[0] ?? "");
}

function requireListId(value: string): string {
  if (!LIST_ID.test(value)) {
    throw new InputError("List IDs must contain only numbers.");
  }
  return value;
}

export function normalizeListTarget(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new InputError("Enter a list URL or ID.");
  }
  if (!value.includes("://")) {
    return requireListId(value);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InputError("Check the list URL format.");
  }
  if (!["x.com", "twitter.com"].includes(url.hostname.toLowerCase())) {
    throw new InputError("Enter an x.com or twitter.com URL.");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[0] !== "i" || segments[1] !== "lists") {
    throw new InputError("Enter a list URL.");
  }
  return requireListId(segments[2] ?? "");
}

export function buildSearchQuery(raw: string, following: boolean): string {
  const query = raw.trim();
  if (!query) {
    throw new InputError("Enter a search query.");
  }
  const finalQuery = following && !FOLLOWS.test(query) ? `${query} filter:follows` : query;
  if (finalQuery.length > 512) {
    throw new InputError("Search queries must be 512 characters or fewer.");
  }
  return finalQuery;
}
