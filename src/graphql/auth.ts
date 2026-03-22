import { GraphQLError } from "graphql";

import type { User } from "app/schemas/user.js";
import type { GraphQLContext } from "app/types/context.js";

type AuthenticatedContext = GraphQLContext & { user: User };

/**
 * Asserts that the request is authenticated. Throws UNAUTHENTICATED if not.
 * Use at the top of any resolver that requires a logged-in user.
 *
 * @example
 * const ctx = assertAuth(context);
 * // ctx.user is guaranteed non-null after this point
 */
export function assertAuth(context: GraphQLContext): AuthenticatedContext {
  if (!context.user) {
    throw new GraphQLError("Authentication required", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return context as AuthenticatedContext;
}
