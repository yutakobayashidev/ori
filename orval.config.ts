import { defineConfig, defineTransformer } from "orval";

const selectedTag = "twitter-lite-e2e";
const selectedOperationIds = new Set([
  "getUserByScreenName",
  "getUserTweets",
  "getTweetDetail",
  "getSearchTimeline",
  "getListLatestTweetsTimeline",
]);

const selectE2eOperations = defineTransformer((document) => {
  const foundOperationIds = new Set<string>();

  for (const pathItem of Object.values(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const candidate of Object.values(pathItem)) {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate) ||
        !("operationId" in candidate)
      ) {
        continue;
      }

      const operation = candidate as {
        operationId?: string;
        tags?: string[];
      };

      if (operation.operationId && selectedOperationIds.has(operation.operationId)) {
        foundOperationIds.add(operation.operationId);
        operation.tags = [...(operation.tags ?? []), selectedTag];
      }
    }
  }

  const missingOperationIds = [...selectedOperationIds].filter(
    (operationId) => !foundOperationIds.has(operationId),
  );
  if (missingOperationIds.length > 0) {
    throw new Error(
      `twitter-openapi is missing selected operations: ${missingOperationIds.join(", ")}`,
    );
  }

  return document;
});

export default defineConfig({
  twitterOpenApi: {
    input: {
      target:
        "https://raw.githubusercontent.com/fa0311/twitter-openapi/590dae5c9f8575abc91d3774946bfe6f23960aba/dist/docs/openapi-3.0.yaml",
      filters: {
        mode: "include",
        tags: [selectedTag],
      },
      override: {
        transformer: selectE2eOperations,
      },
    },
    output: {
      clean: true,
      client: "fetch",
      mode: "single",
      target: "./e2e/generated/twitter-openapi/client.ts",
    },
  },
});
