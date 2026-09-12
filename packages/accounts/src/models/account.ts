import { modelFor } from "@monii/postgres/model";
import { accounts } from "@monii/postgres/schema/financial";

export class Account extends modelFor(accounts, ["id"] as const) {
  static archive(id: string, archivedAt = new Date()) {
    return this.update(id, { archivedAt, updatedAt: archivedAt });
  }
}
