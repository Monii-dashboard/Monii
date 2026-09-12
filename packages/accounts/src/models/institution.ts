import { modelFor } from "@monii/postgres/model";
import { institutions } from "@monii/postgres/schema/financial";

export class Institution extends modelFor(institutions, ["id"] as const) {
  static archive(id: string, archivedAt = new Date()) {
    return this.update(id, { archivedAt, updatedAt: archivedAt });
  }
}
