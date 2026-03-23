import { GraphQLError } from "graphql";

import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "app/constants/session.js";
import { assertAuth } from "app/graphql/auth.js";
import { checkAuthRateLimit } from "app/middleware/rateLimiter/rateLimiter.js";
import * as userRepo from "app/repositories/user/user.js";
import type { User } from "app/schemas/user.js";
import { loginInputSchema, registerInputSchema } from "app/schemas/user.js";
import type { GraphQLContext } from "app/types/context.js";
import { logger } from "app/utils/logs/logger.js";
import { parseIdParam } from "app/utils/parsers/parseIdParam.js";
import { parsePagination } from "app/utils/parsers/parsePagination.js";

/** Rows returned by the DB include snake_case columns; map to GraphQL camelCase field names here. */
interface UserRow extends User {
  password_hash?: string;
}

export const userResolvers = {
  Query: {
    me(_parent: unknown, _args: unknown, context: GraphQLContext): User | null {
      return context.user;
    },

    async user(_parent: unknown, args: { id: string }, context: GraphQLContext): Promise<User> {
      const ctx = assertAuth(context);

      const id = parseIdParam(args.id);
      if (!id) {
        throw new GraphQLError("Invalid user ID", { extensions: { code: "BAD_USER_INPUT" } });
      }

      // Prevent IDOR: only allow fetching own record. Add role checks here for admin access.
      if (id !== ctx.user.id) {
        throw new GraphQLError("Not authorized", { extensions: { code: "FORBIDDEN" } });
      }

      const user = await userRepo.findUserById(id);
      if (!user) {
        throw new GraphQLError("User not found", { extensions: { code: "NOT_FOUND" } });
      }

      return user;
    },

    async users(
      _parent: unknown,
      args: { limit?: number; offset?: number },
      context: GraphQLContext,
    ): Promise<User[]> {
      assertAuth(context);

      const { limit, offset } = parsePagination(args.limit, args.offset);
      return userRepo.getUsers(limit, offset);
    },
  },

  Mutation: {
    async register(
      _parent: unknown,
      args: { input: { email: string; password: string } },
      context: GraphQLContext,
    ): Promise<User> {
      checkAuthRateLimit(context.ip);

      const parsed = registerInputSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new GraphQLError(parsed.error.issues[0]?.message ?? "Validation error", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      try {
        const { user, sessionToken } = await userRepo.createUserAndSession(
          parsed.data.email,
          parsed.data.password,
        );
        setSessionCookie(context, sessionToken);
        logger.info(
          { event: "register", userId: user.id, ip: context.ip, userAgent: context.userAgent },
          "User registered",
        );
        return user;
      } catch (err: unknown) {
        if ((err as { code?: string })?.code === "23505") {
          throw new GraphQLError("Email is already registered", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
        throw err;
      }
    },

    async login(
      _parent: unknown,
      args: { input: { email: string; password: string } },
      context: GraphQLContext,
    ): Promise<User> {
      checkAuthRateLimit(context.ip);

      const parsed = loginInputSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new GraphQLError(parsed.error.issues[0]?.message ?? "Validation error", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const { email, password } = parsed.data;
      const userWithHash = await userRepo.findUserByEmail(email);

      // Use a constant-time message to avoid email enumeration
      if (!userWithHash) {
        logger.warn(
          {
            event: "login_failed",
            reason: "user_not_found",
            ip: context.ip,
            userAgent: context.userAgent,
          },
          "Failed login attempt",
        );
        throw new GraphQLError("Invalid credentials", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      const valid = await userRepo.verifyPassword(password, userWithHash.password_hash);
      if (!valid) {
        logger.warn(
          {
            event: "login_failed",
            reason: "wrong_password",
            userId: userWithHash.id,
            ip: context.ip,
            userAgent: context.userAgent,
          },
          "Failed login attempt",
        );
        throw new GraphQLError("Invalid credentials", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      const sessionToken = await userRepo.loginUser(userWithHash.id);
      setSessionCookie(context, sessionToken);

      const { password_hash: _ph, ...user } = userWithHash;
      logger.info(
        { event: "login", userId: user.id, ip: context.ip, userAgent: context.userAgent },
        "User logged in",
      );
      return user;
    },

    async logout(_parent: unknown, _args: unknown, context: GraphQLContext): Promise<boolean> {
      const rawToken = context.cookies[SESSION_COOKIE_NAME];
      if (rawToken) {
        await userRepo.deleteSession(rawToken);
      }
      clearSessionCookie(context);
      logger.info(
        {
          event: "logout",
          userId: context.user?.id ?? null,
          ip: context.ip,
          userAgent: context.userAgent,
        },
        "User logged out",
      );
      return true;
    },
  },

  // Field resolvers: map DB snake_case columns to GraphQL camelCase field names
  User: {
    createdAt(parent: UserRow): string {
      return parent.created_at.toISOString();
    },
    updatedAt(parent: UserRow): string | null {
      return parent.updated_at ? parent.updated_at.toISOString() : null;
    },
  },
};

function setSessionCookie(context: GraphQLContext, token: string): void {
  context.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
  });
}

function clearSessionCookie(context: GraphQLContext): void {
  context.clearCookie(SESSION_COOKIE_NAME);
}
