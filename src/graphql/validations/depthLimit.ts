import { GraphQLError, Kind } from "graphql";
import type {
  ASTNode,
  SelectionSetNode,
  OperationDefinitionNode,
  ValidationContext,
} from "graphql";

function getDepth(node: ASTNode | SelectionSetNode, currentDepth = 0): number {
  if (node.kind === Kind.FIELD) {
    if (node.selectionSet) {
      return getDepth(node.selectionSet, currentDepth + 1);
    }
    return currentDepth;
  }
  if (node.kind === Kind.SELECTION_SET) {
    if (node.selections.length === 0) return currentDepth;
    return Math.max(...node.selections.map((s) => getDepth(s as ASTNode, currentDepth)));
  }
  if (
    (node.kind === Kind.INLINE_FRAGMENT || node.kind === Kind.FRAGMENT_SPREAD) &&
    "selectionSet" in node &&
    node.selectionSet
  ) {
    return getDepth(node.selectionSet, currentDepth);
  }
  return currentDepth;
}

/**
 * A GraphQL validation rule that rejects queries exceeding maxDepth field nesting.
 * Prevents deeply nested queries that could cause expensive database operations or DoS.
 *
 * @example
 * new ApolloServer({ validationRules: [depthLimit(5)] })
 */
export function depthLimit(maxDepth: number) {
  return (context: ValidationContext) => ({
    OperationDefinition(node: OperationDefinitionNode) {
      const depth = getDepth(node.selectionSet);
      if (depth > maxDepth) {
        context.reportError(
          new GraphQLError(`Query exceeds maximum depth of ${maxDepth}`, {
            extensions: { code: "BAD_USER_INPUT" },
          }),
        );
      }
    },
  });
}
