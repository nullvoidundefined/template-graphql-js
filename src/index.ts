import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";

import { corsConfig } from "app/config/corsConfig.js";
import { isProduction } from "app/config/env.js";
import pool, { query } from "app/db/pool/pool.js";
import { createContext } from "app/graphql/context.js";
import { loggingPlugin } from "app/graphql/plugins/loggingPlugin.js";
import { typeDefs, resolvers } from "app/graphql/schema.js";
import { depthLimit } from "app/graphql/validations/depthLimit.js";
import { rateLimiter } from "app/middleware/rateLimiter/rateLimiter.js";
import { logger } from "app/utils/logs/logger.js";

function validateEnv(): void {
  if (!process.env.DATABASE_URL) {
    console.error("Fatal: DATABASE_URL is required");
    process.exit(1);
  }
  if (isProduction() && !process.env.CORS_ORIGIN) {
    console.error("Fatal: CORS_ORIGIN is required in production");
    process.exit(1);
  }
}

const app = express();
const httpServer = http.createServer(app);

// Add security-related HTTP headers to reduce common web vulnerabilities (XSS, clickjacking, etc.).
app.use(helmet());

// Allow browser frontends to call this API while controlling which origins are permitted.
app.use(corsConfig);

// Apply a rate limiter to protect against simple abuse and accidental client floods.
app.use(rateLimiter);

// Parse cookies so session tokens are available in context creation.
app.use(cookieParser());

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    // Drain the HTTP server gracefully before shutting down Apollo.
    ApolloServerPluginDrainHttpServer({ httpServer }),
    loggingPlugin,
  ],
  // Apollo Server 4 enables CSRF prevention by default (requires Content-Type: application/json).
  // Disable GraphQL introspection in production to reduce attack surface.
  introspection: !isProduction(),
  validationRules: [
    // Reject deeply nested queries that could trigger expensive DB operations.
    depthLimit(10),
  ],
  formatError: (formattedError) => {
    // Hide implementation details for unexpected server errors in production.
    if (isProduction() && formattedError.extensions?.["code"] === "INTERNAL_SERVER_ERROR") {
      return {
        message: "Internal server error",
        extensions: { code: "INTERNAL_SERVER_ERROR" },
      };
    }
    return formattedError;
  },
});

await server.start();

app.use(
  "/graphql",
  // Cap payload size to prevent unexpectedly large request bodies.
  express.json({ limit: "10kb" }),
  // Cast needed: expressMiddleware returns @apollo/server's bundled Express 4 RequestHandler,
  // which is incompatible with our @types/express v5 at the type level (functionally identical at runtime).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expressMiddleware(server, { context: createContext }) as any,
);

app.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
});

const PORT = process.env.PORT ?? 4000;

const entryPath = process.argv[1];
const isEntryModule =
  entryPath !== undefined &&
  path.resolve(entryPath) === path.resolve(fileURLToPath(import.meta.url));

if (isEntryModule) {
  validateEnv();

  query("SELECT NOW()")
    .then(() => logger.info("Connected to database"))
    .catch((err: unknown) => logger.error({ err }, "Database connection failed"));

  await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));
  logger.info({ port: PORT }, `Server running on http://localhost:${PORT}/graphql`);

  async function shutdown(signal: string) {
    logger.info({ signal }, "Shutting down gracefully");
    await server.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    logger.info("HTTP server closed");
    await pool.end();
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
