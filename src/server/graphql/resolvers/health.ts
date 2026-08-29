import { Query, Resolver } from "type-graphql";

@Resolver()
export class HealthResolver {
  @Query(() => Boolean, {
    name: "_health",
    description: "Reports whether the GraphQL API can execute requests.",
  })
  health(): boolean {
    return true;
  }
}
