import { ApolloServer } from "@apollo/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { typeDefs, resolvers } from "app/graphql/schema.js";
import * as userRepo from "app/repositories/user/user.js";
import type { User } from "app/schemas/user.js";
import type { GraphQLContext } from "app/types/context.js";
import { uuid } from "app/utils/tests/uuids.js";

// vi.hoisted ensures mockLogger is initialized before vi.mock factories run
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("app/utils/logs/logger.js", () => ({ logger: mockLogger }));
vi.mock("app/repositories/user/user.js");

// ---------------------------------------------------------------------------
// Test server setup
// ---------------------------------------------------------------------------

const server = new ApolloServer<GraphQLContext>({ typeDefs, resolvers });
await server.start();

afterAll(() => server.stop());

beforeEach(() => vi.clearAllMocks());

const mockSetCookie = vi.fn();
const mockClearCookie = vi.fn();

/**
 * Executes a GraphQL operation against the in-process server with a pre-built context.
 * No HTTP layer, no cookies — fast and deterministic.
 */
async function execute(
  query: string,
  variables?: Record<string, unknown>,
  user: User | null = null,
  cookies: Record<string, string | undefined> = {},
) {
  return server.executeOperation(
    { query, variables },
    {
      contextValue: {
        user,
        cookies,
        setCookie: mockSetCookie,
        clearCookie: mockClearCookie,
        ip: undefined,
        userAgent: undefined,
      } satisfies GraphQLContext,
    },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: uuid(),
    email: "user@example.com",
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Query: me
// ---------------------------------------------------------------------------

describe("Query.me", () => {
  it("returns null when unauthenticated", async () => {
    const res = await execute(`query { me { id email } }`);
    expect(res.body).toMatchObject({
      singleResult: { data: { me: null }, errors: undefined },
    });
  });

  it("returns the current user when authenticated", async () => {
    const user = makeUser();
    const res = await execute(`query { me { id email createdAt } }`, undefined, user);
    expect(res.body).toMatchObject({
      singleResult: {
        data: {
          me: {
            id: user.id,
            email: user.email,
            createdAt: user.created_at.toISOString(),
          },
        },
        errors: undefined,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Query: user
// ---------------------------------------------------------------------------

describe("Query.user", () => {
  it("returns UNAUTHENTICATED when not logged in", async () => {
    const res = await execute(`query { user(id: "${uuid()}") { id } }`);
    expect(res.body).toMatchObject({
      singleResult: {
        errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
      },
    });
  });

  it("returns BAD_USER_INPUT for an invalid UUID", async () => {
    const res = await execute(`query { user(id: "not-a-uuid") { id } }`, undefined, makeUser());
    expect(res.body).toMatchObject({
      singleResult: { errors: [{ extensions: { code: "BAD_USER_INPUT" } }] },
    });
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    const user = makeUser();
    vi.mocked(userRepo.findUserById).mockResolvedValueOnce(null);
    const res = await execute(`query { user(id: "${user.id}") { id } }`, undefined, user);
    expect(res.body).toMatchObject({
      singleResult: { errors: [{ extensions: { code: "NOT_FOUND" } }] },
    });
  });

  it("returns the user when found", async () => {
    const target = makeUser({ email: "target@example.com" });
    vi.mocked(userRepo.findUserById).mockResolvedValueOnce(target);
    const res = await execute(`query { user(id: "${target.id}") { id email } }`, undefined, target);
    expect(res.body).toMatchObject({
      singleResult: { data: { user: { id: target.id, email: target.email } } },
    });
  });
});

// ---------------------------------------------------------------------------
// Mutation: register
// ---------------------------------------------------------------------------

describe("Mutation.register", () => {
  it("returns BAD_USER_INPUT for an invalid email", async () => {
    const res = await execute(
      `mutation Register($input: RegisterInput!) { register(input: $input) { id } }`,
      { input: { email: "not-an-email", password: "password123" } },
    );
    expect(res.body).toMatchObject({
      singleResult: { errors: [{ extensions: { code: "BAD_USER_INPUT" } }] },
    });
  });

  it("returns BAD_USER_INPUT when password is too short", async () => {
    const res = await execute(
      `mutation Register($input: RegisterInput!) { register(input: $input) { id } }`,
      { input: { email: "new@example.com", password: "short" } },
    );
    expect(res.body).toMatchObject({
      singleResult: { errors: [{ extensions: { code: "BAD_USER_INPUT" } }] },
    });
  });

  it("returns BAD_USER_INPUT when email is already registered", async () => {
    vi.mocked(userRepo.createUserAndSession).mockRejectedValueOnce({ code: "23505" });
    const res = await execute(
      `mutation Register($input: RegisterInput!) { register(input: $input) { id } }`,
      { input: { email: "taken@example.com", password: "password123" } },
    );
    expect(res.body).toMatchObject({
      singleResult: { errors: [{ extensions: { code: "BAD_USER_INPUT" } }] },
    });
  });

  it("registers successfully and returns the user", async () => {
    const user = makeUser({ email: "new@example.com" });
    vi.mocked(userRepo.createUserAndSession).mockResolvedValueOnce({
      user,
      sessionToken: "raw-token",
    });
    const res = await execute(
      `mutation Register($input: RegisterInput!) { register(input: $input) { id email } }`,
      { input: { email: "new@example.com", password: "password123" } },
    );
    expect(res.body).toMatchObject({
      singleResult: { data: { register: { id: user.id, email: user.email } } },
    });
    expect(mockSetCookie).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Mutation: login
// ---------------------------------------------------------------------------

describe("Mutation.login", () => {
  it("returns UNAUTHENTICATED for unknown email", async () => {
    vi.mocked(userRepo.findUserByEmail).mockResolvedValueOnce(null);
    const res = await execute(
      `mutation Login($input: LoginInput!) { login(input: $input) { id } }`,
      { input: { email: "unknown@example.com", password: "password123" } },
    );
    expect(res.body).toMatchObject({
      singleResult: { errors: [{ extensions: { code: "UNAUTHENTICATED" } }] },
    });
  });

  it("returns UNAUTHENTICATED for wrong password", async () => {
    const user = makeUser();
    vi.mocked(userRepo.findUserByEmail).mockResolvedValueOnce({
      ...user,
      password_hash: "hash",
    });
    vi.mocked(userRepo.verifyPassword).mockResolvedValueOnce(false);
    const res = await execute(
      `mutation Login($input: LoginInput!) { login(input: $input) { id } }`,
      { input: { email: user.email, password: "wrong" } },
    );
    expect(res.body).toMatchObject({
      singleResult: { errors: [{ extensions: { code: "UNAUTHENTICATED" } }] },
    });
  });

  it("logs in successfully and returns the user", async () => {
    const user = makeUser();
    vi.mocked(userRepo.findUserByEmail).mockResolvedValueOnce({
      ...user,
      password_hash: "hash",
    });
    vi.mocked(userRepo.verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(userRepo.loginUser).mockResolvedValueOnce("raw-token");
    const res = await execute(
      `mutation Login($input: LoginInput!) { login(input: $input) { id email } }`,
      { input: { email: user.email, password: "password123" } },
    );
    expect(res.body).toMatchObject({
      singleResult: { data: { login: { id: user.id, email: user.email } } },
    });
    expect(mockSetCookie).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Mutation: logout
// ---------------------------------------------------------------------------

describe("Mutation.logout", () => {
  it("returns true and succeeds without an active session", async () => {
    const res = await execute(`mutation { logout }`);
    expect(res.body).toMatchObject({
      singleResult: { data: { logout: true } },
    });
    expect(mockClearCookie).toHaveBeenCalledOnce();
  });
});
