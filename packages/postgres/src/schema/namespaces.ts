import { pgSchema } from "drizzle-orm/pg-core";

export const financialSchema = pgSchema("financial");
export const ingestionSchema = pgSchema("ingestion");
export const reconciliationSchema = pgSchema("reconciliation");
export const wealthSchema = pgSchema("wealth");
