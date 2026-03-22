export const userTypeDefs = /* GraphQL */ `
  type User {
    id: ID!
    email: String!
    createdAt: String!
    updatedAt: String
  }

  input RegisterInput {
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  type Query {
    """Returns the currently authenticated user, or null if not logged in."""
    me: User

    """Returns a user by ID. Requires authentication."""
    user(id: ID!): User!

    """Returns a paginated list of users. Requires authentication."""
    users(limit: Int, offset: Int): [User!]!
  }

  type Mutation {
    """Register a new user account. Sets an httpOnly session cookie on success."""
    register(input: RegisterInput!): User!

    """Login with email and password. Sets an httpOnly session cookie on success."""
    login(input: LoginInput!): User!

    """Logout the current user and clear the session cookie."""
    logout: Boolean!
  }
`;
