import type { ApolloServerPlugin } from "@apollo/server";

import type { GraphQLContext } from "app/types/context.js";
import { logger } from "app/utils/logs/logger.js";

/**
 * Apollo Server plugin that logs each GraphQL operation with its name, duration, and error status.
 * Skips logging UNAUTHENTICATED and BAD_USER_INPUT errors at error level (those are expected client errors).
 */
export const loggingPlugin: ApolloServerPlugin<GraphQLContext> = {
  async requestDidStart({ request }) {
    const start = Date.now();
    const operationName = request.operationName ?? "anonymous";

    return {
      async willSendResponse({ response }) {
        const duration = Date.now() - start;
        const hasErrors =
          response.body.kind === "single" && (response.body.singleResult.errors?.length ?? 0) > 0;

        logger.info({ operationName, duration_ms: duration, hasErrors }, "GraphQL request");
      },

      async didEncounterErrors({ errors }) {
        for (const err of errors) {
          const code = err.extensions?.["code"];
          // These are expected client errors — log at warn, not error
          if (code === "UNAUTHENTICATED" || code === "BAD_USER_INPUT" || code === "NOT_FOUND") {
            logger.warn({ code, message: err.message }, "GraphQL client error");
          } else {
            logger.error({ err }, "GraphQL server error");
          }
        }
      },
    };
  },
};
