import { institutions } from "../schema/financial";
import { modelFor } from "./model";

export class Institution extends modelFor(institutions, ["id"] as const) {
  static archive(id: string, archivedAt = new Date()) {
    return this.update(id, { archivedAt, updatedAt: archivedAt });
  }
}
