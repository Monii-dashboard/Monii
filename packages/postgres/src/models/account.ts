import { accounts } from "../schema/financial";
import { modelFor } from "./model";

export class Account extends modelFor(accounts, ["id"] as const) {
  static archive(id: string, archivedAt = new Date()) {
    return this.update(id, { archivedAt, updatedAt: archivedAt });
  }
}
