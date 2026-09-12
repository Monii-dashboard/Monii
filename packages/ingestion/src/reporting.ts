export type FinancialOperationalReport = Readonly<{
  event: string;
  fields?: Readonly<Record<string, unknown>>;
  level: "info" | "warn" | "error";
  message: string;
}>;

export type SynchronizationReporter = Readonly<{
  report(record: FinancialOperationalReport): void;
}>;
