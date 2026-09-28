import type { SearchProduct, SearchResult, TweetData } from "@yuta/bird";
import { buildSearchQuery, InputError, normalizeListTarget, normalizeUserTarget } from "./inputs";
import type {
  ListChoicesResult,
  ListPageInput,
  LoadError,
  LoadFailure,
  LoadResult,
  Post,
  SearchPageInput,
  UserPageInput,
} from "./types";

type UserLookupResult = {
  success: boolean;
  userId?: string;
  error?: string;
};

type BirdListsResult =
  | {
      success: true;
      lists?: Array<{
        id: string;
        name: string;
        description?: string;
        memberCount?: number;
        isPrivate?: boolean;
      }>;
    }
  | { success: false; error?: string };

export interface BirdReader {
  getLists(count?: number): Promise<BirdListsResult>;
  getUserIdByUsername(username: string): Promise<UserLookupResult>;
  getUserTweetsPaged(
    userId: string,
    limit: number,
    options: {
      cursor?: string;
      maxPages: number;
      pageDelayMs: number;
    },
  ): Promise<SearchResult>;
  getAllSearchResults(
    query: string,
    options: {
      product: SearchProduct;
      cursor?: string;
      maxPages: number;
    },
  ): Promise<SearchResult>;
  getAllListTimeline(
    listId: string,
    options: {
      cursor?: string;
      maxPages: number;
    },
  ): Promise<SearchResult>;
}

const failure = (code: LoadError["code"], message: string, retryable: boolean): LoadFailure => ({
  ok: false,
  error: { code, message, retryable },
});

type FailureSubject = "user" | "list";

const notFoundFailure: Record<FailureSubject, () => LoadFailure> = {
  user: () => failure("user-not-found", "User not found.", false),
  list: () => failure("list-not-found", "List not found.", false),
};

const unavailableFailure: Record<FailureSubject, () => LoadFailure> = {
  user: () => failure("user-unavailable", "Posts from this user are unavailable.", false),
  list: () => failure("list-unavailable", "This list is unavailable.", false),
};

function upstreamFailure(diagnostic: unknown = "", subject: FailureSubject = "user"): LoadFailure {
  const message =
    diagnostic instanceof Error
      ? diagnostic.message
      : typeof diagnostic === "string"
        ? diagnostic
        : "";
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return failure("timeout", "The request timed out.", true);
  }
  if (lower.includes("not found")) {
    return notFoundFailure[subject]();
  }
  if (lower.includes("suspended") || lower.includes("protected")) {
    return unavailableFailure[subject]();
  }
  // oxlint-disable-next-line no-console -- Server-side diagnostics use stderr, never the public response.
  console.error("Unexpected Bird failure:", diagnostic);
  return failure("upstream", "Could not load posts from X.", true);
}

function publicPost(tweet: TweetData): Post {
  const post = { ...tweet };
  delete post._raw;
  if (post.quotedTweet) {
    post.quotedTweet = publicPost(post.quotedTweet);
  }
  return post;
}

export async function loadListChoices(reader: BirdReader): Promise<ListChoicesResult> {
  try {
    const result = await reader.getLists(100);
    if (!result.success) {
      return upstreamFailure(result.error, "list");
    }
    return {
      ok: true,
      lists: (result.lists ?? []).map((list) => ({
        id: list.id,
        name: list.name,
        ...(list.description ? { description: list.description } : {}),
        ...(list.memberCount === undefined ? {} : { memberCount: list.memberCount }),
        ...(list.isPrivate === undefined ? {} : { isPrivate: list.isPrivate }),
      })),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return failure("timeout", "The request timed out.", true);
    }
    return upstreamFailure(error, "list");
  }
}

function resultPage(result: SearchResult, subject: FailureSubject = "user"): LoadResult {
  return result.success
    ? {
        ok: true,
        page: {
          tweets: result.tweets.map(publicPost),
          nextCursor: result.nextCursor,
        },
      }
    : upstreamFailure(result.error, subject);
}

export async function loadUserPage(
  reader: BirdReader,
  input: Omit<UserPageInput, "connectionId">,
): Promise<LoadResult> {
  try {
    const handle = normalizeUserTarget(input.target);
    const user = await reader.getUserIdByUsername(handle);
    if (!user.success || !user.userId) {
      return upstreamFailure(user.error);
    }
    return resultPage(
      await reader.getUserTweetsPaged(user.userId, 20, {
        cursor: input.cursor,
        maxPages: 1,
        pageDelayMs: 0,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return failure("timeout", "The request timed out.", true);
    }
    if (error instanceof InputError) {
      return failure("invalid-input", error.message, false);
    }
    return upstreamFailure(error);
  }
}

export async function loadListPage(
  reader: BirdReader,
  input: Omit<ListPageInput, "connectionId">,
): Promise<LoadResult> {
  try {
    const listId = normalizeListTarget(input.target);
    return resultPage(
      await reader.getAllListTimeline(listId, {
        cursor: input.cursor,
        maxPages: 1,
      }),
      "list",
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return failure("timeout", "The request timed out.", true);
    }
    if (error instanceof InputError) {
      return failure("invalid-input", error.message, false);
    }
    return upstreamFailure(error, "list");
  }
}

export async function searchPage(
  reader: BirdReader,
  input: Omit<SearchPageInput, "connectionId">,
): Promise<LoadResult> {
  try {
    return resultPage(
      await reader.getAllSearchResults(buildSearchQuery(input.query, input.following), {
        product: input.product,
        cursor: input.cursor,
        maxPages: 1,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return failure("timeout", "The request timed out.", true);
    }
    if (error instanceof InputError) {
      return failure("invalid-input", error.message, false);
    }
    return upstreamFailure(error);
  }
}
