export type OperationalReport = Readonly<{
  event: string;
  fields?: Readonly<Record<string, unknown>>;
  level: "info" | "warn" | "error";
  message: string;
}>;

export type OperationalReporter = Readonly<{
  report(record: OperationalReport): void;
}>;
