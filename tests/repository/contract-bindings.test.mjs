import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(filename) : [filename];
  });
}

const contracts = filesBelow(path.join(root, "packages"))
  .filter((filename) => filename.endsWith(".contract.ts"));

test.each(contracts)("binds %s to an owner-local integration test", (contract) => {
  const binding = contract.replace(/\.contract\.ts$/, ".integration.test.ts");
  expect(existsSync(binding), `Missing integration binding ${binding}`).toBe(true);
  expect(readFileSync(binding, "utf8")).toContain(
    `./${path.basename(contract, ".ts")}`,
  );
});
