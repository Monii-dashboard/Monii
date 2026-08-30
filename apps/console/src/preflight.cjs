const path = require("node:path");

process.env.TSX_TSCONFIG_PATH = path.resolve(
  __dirname,
  "../../../tsconfig.base.json",
);

require("tsx/patch-repl");
