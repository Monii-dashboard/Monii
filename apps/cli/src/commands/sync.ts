import { Command } from "@oclif/core";

export default class Sync extends Command {
  static description =
    "Synchronize configured Powens accounts and persist a wealth snapshot.";
  static examples = ["<%= config.bin %> sync", "<%= config.bin %> -- sync"];

  async run(): Promise<number> {
    await this.parse(Sync);
    const { sync } = await import("../operations/sync.js");
    const result = await sync();
    return result.status === "succeeded" ||
      result.status === "skipped_already_running"
      ? 0
      : 1;
  }
}
