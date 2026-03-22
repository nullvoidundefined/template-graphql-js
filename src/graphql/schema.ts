import { userResolvers } from "app/graphql/user/user.resolvers.js";
import { userTypeDefs } from "app/graphql/user/user.typedefs.js";

/**
 * Aggregated type definitions and resolvers for all GraphQL modules.
 * Pass these directly to ApolloServer: new ApolloServer({ typeDefs, resolvers }).
 * Add new schemas here as the API grows.
 */
export const typeDefs = [userTypeDefs];

export const resolvers = [userResolvers];
