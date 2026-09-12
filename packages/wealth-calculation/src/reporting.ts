export type WealthOperationalReport = Readonly<{
  event: string;
  fields?: Readonly<Record<string, unknown>>;
  level: "info" | "warn" | "error";
  message: string;
}>;

export type WealthReporter = Readonly<{
  report(record: WealthOperationalReport): void;
}>;
