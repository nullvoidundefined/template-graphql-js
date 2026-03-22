import { GraphQLError } from "graphql";
import type { FieldNode, ValidationContext } from "graphql";

/**
 * A GraphQL validation rule that rejects queries with too many field aliases.
 * Prevents alias-based batching attacks (e.g., 1,000 aliased password-check mutations in one request).
 *
 * @example
 * new ApolloServer({ validationRules: [aliasLimit(15)] })
 */
export function aliasLimit(maxAliases: number) {
  return (context: ValidationContext) => {
    let aliasCount = 0;
    return {
      Field(node: FieldNode) {
        if (node.alias) {
          aliasCount++;
          if (aliasCount > maxAliases) {
            context.reportError(
              new GraphQLError(`Query exceeds maximum alias count of ${maxAliases}`, {
                extensions: { code: "BAD_USER_INPUT" },
              }),
            );
          }
        }
      },
    };
  };
}
