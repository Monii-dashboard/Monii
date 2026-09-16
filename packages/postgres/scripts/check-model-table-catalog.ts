import { createDatabase } from "../src/client";
import { verifyModelTablePolicyCatalog } from "../src/model-table-policy-catalog";
import { createModelTablePolicySnapshot } from "../src/model-table-policy";
import * as schema from "../src/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to check the PostgreSQL catalog");
}

const database = createDatabase(databaseUrl);
try {
  const errors = await verifyModelTablePolicyCatalog(
    database.db,
    createModelTablePolicySnapshot(schema),
  );
  if (errors.length > 0) {
    process.stderr.write(
      `PostgreSQL ModelTable policy drift detected:\n${errors.map((error) => `- ${error}`).join("\n")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("PostgreSQL ModelTable catalog is current.\n");
  }
} finally {
  await database.close();
}
