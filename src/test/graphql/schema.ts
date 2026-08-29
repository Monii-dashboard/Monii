import "reflect-metadata";

import { setTimeout as sleep } from "node:timers/promises";
import { Arg, Ctx, Int, Mutation, Query, Resolver } from "type-graphql";

import { graphqlErrorCodes, createGraphqlError } from "../../server/graphql/errors";
import type { GraphqlContext } from "../../server/graphql/context";
import { createGraphqlSchema } from "../../server/graphql/schema";

export const testGraphqlState = {
  slowResolverAbortCount: 0,
};

@Resolver()
class TestGraphqlResolver {
  @Query(() => String)
  testEcho(@Arg("value", () => String) value: string): string {
    return value;
  }

  @Query(() => String)
  testFailure(
    @Arg("unexpected", () => Boolean) unexpected: boolean,
  ): never {
    if (unexpected) {
      throw new Error("private test failure");
    }

    throw createGraphqlError(
      graphqlErrorCodes.badUserInput,
      "Expected test failure.",
    );
  }

  @Query(() => String)
  async testSlow(
    @Arg("delayMs", () => Int) delayMs: number,
    @Ctx() context: GraphqlContext,
  ): Promise<string> {
    try {
      await sleep(delayMs, undefined, { signal: context.signal });
      return "finished";
    } catch (error) {
      if (context.signal.aborted) {
        testGraphqlState.slowResolverAbortCount += 1;
      }

      throw error;
    }
  }

  @Mutation(() => String)
  testReverse(@Arg("value", () => String) value: string): string {
    return [...value].reverse().join("");
  }
}

export const testGraphqlSchema = createGraphqlSchema({
  resolvers: [TestGraphqlResolver],
});
