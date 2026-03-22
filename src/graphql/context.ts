import type { ContextFunction } from "@apollo/server";
import type { ExpressContextFunctionArgument } from "@apollo/server/express4";

import { SESSION_COOKIE_NAME } from "app/constants/session.js";
import * as userRepo from "app/repositories/user/user.js";
import type { GraphQLContext } from "app/types/context.js";

/**
 * Builds the GraphQL context for each request.
 * Reads the session cookie, validates it against the DB, and attaches the user (or null).
 * Called once per request by Apollo's expressMiddleware.
 *
 * Note: req/res are not forwarded to the context to avoid type conflicts between
 * @types/express v5 (project) and Apollo Server 4's bundled @types/express v4.
 * Cookie access is exposed via the cookies/setCookie/clearCookie helpers instead.
 */
export const createContext: ContextFunction<[ExpressContextFunctionArgument], GraphQLContext> =
  async ({ req, res }) => {
    let user: GraphQLContext["user"] = null;

    const rawToken = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE_NAME];
    if (rawToken) {
      try {
        user = await userRepo.getSessionWithUser(rawToken);
      } catch {
        // A bad or expired session should not crash the request — just treat as unauthenticated.
      }
    }

    return {
      user,
      cookies: req.cookies as Record<string, string | undefined>,
      setCookie: (name, value, options) => res.cookie(name, value, options ?? {}),
      clearCookie: (name) => res.clearCookie(name),
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    };
  };
