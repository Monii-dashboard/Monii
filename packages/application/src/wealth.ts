export type DecimalAmount = string;

export type AccountKind = "cash" | "investment" | "unknown" | "unsupported";
export type AccountUsage = "private" | "professional" | "unknown";
export type WealthInclusion = "automatic" | "exclude" | "include";
export type SourceLifecycle = "active" | "deleted" | "disabled" | "unknown";
export type ValuationBasis = "balance" | "estimated_value";
export type SyncStatus = "failed" | "partial" | "running" | "succeeded";

export type ValueCandidate = Readonly<{
  amount: DecimalAmount;
  currency: string;
  observationId: string;
  retrievedAt: Date;
  sourceValidAt: Date | null;
}>;

export type AccountWealthState = Readonly<{
  accountId: string;
  balance: ValueCandidate | null;
  estimatedValue: ValueCandidate | null;
  identityConflict: boolean;
  inclusion: WealthInclusion;
  kind: AccountKind;
  latestObservationId: string | null;
  lifecycle: SourceLifecycle;
  likelyDuplicateGroupId: string | null;
  refreshUncertain: boolean;
  usage: AccountUsage;
}>;

export type SnapshotContributionDecision =
  | "contributing"
  | "excluded_operator"
  | "excluded_professional"
  | "excluded_source"
  | "missing_value"
  | "unknown_type"
  | "unsupported"
  | "unsupported_currency";

export type DuplicateAdjustmentRole =
  | "excluded_from_adjusted"
  | "none"
  | "representative";

export type SnapshotContribution = Readonly<{
  accountId: string;
  adjustedAmount: DecimalAmount | null;
  amount: DecimalAmount | null;
  basis: ValuationBasis | null;
  decision: SnapshotContributionDecision;
  duplicateRole: DuplicateAdjustmentRole;
  latestObservationId: string | null;
  reportedAmount: DecimalAmount | null;
  reportedCurrency: string | null;
  valueObservationId: string | null;
}>;

export type CalculatedWealthSnapshot = Readonly<{
  candidateAdjustedTotalAmount: DecimalAmount;
  contributingAccountCount: number;
  contributions: readonly SnapshotContribution[];
  isComplete: boolean;
  knownTotalAmount: DecimalAmount;
  likelyDuplicateGroupCount: number;
  missingAccountCount: number;
}>;

const DECIMAL_SCALE = 8;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,8}))?$/;

function toScaledInteger(amount: DecimalAmount): bigint {
  const match = DECIMAL_PATTERN.exec(amount);

  if (!match) throw new Error(`Invalid decimal amount: ${amount}`);

  const [, sign, integer = "0", fraction = ""] = match;
  const scaled = BigInt(`${integer}${fraction.padEnd(DECIMAL_SCALE, "0")}`);
  return sign === "-" ? -scaled : scaled;
}

function fromScaledInteger(value: bigint): DecimalAmount {
  const sign = value < 0 ? "-" : "";
  const absolute = value < 0 ? -value : value;
  const padded = absolute.toString().padStart(DECIMAL_SCALE + 1, "0");
  const integer = padded.slice(0, -DECIMAL_SCALE);
  const fraction = padded.slice(-DECIMAL_SCALE).replace(/0+$/, "");
  return `${sign}${integer}${fraction === "" ? "" : `.${fraction}`}`;
}

function emptyContribution(
  account: AccountWealthState,
  decision: SnapshotContributionDecision,
  candidate: ValueCandidate | null = null,
): SnapshotContribution {
  return {
    accountId: account.accountId,
    adjustedAmount: null,
    amount: null,
    basis: null,
    decision,
    duplicateRole: "none",
    latestObservationId: account.latestObservationId,
    reportedAmount: candidate?.amount ?? null,
    reportedCurrency: candidate?.currency ?? null,
    valueObservationId: null,
  };
}

function contribution(account: AccountWealthState): SnapshotContribution {
  if (account.lifecycle !== "active") {
    return emptyContribution(account, "excluded_source");
  }
  if (account.inclusion === "exclude") {
    return emptyContribution(account, "excluded_operator");
  }
  if (account.usage === "professional" && account.inclusion !== "include") {
    return emptyContribution(account, "excluded_professional");
  }
  if (account.kind === "unsupported") {
    return emptyContribution(account, "unsupported");
  }
  if (account.kind === "unknown") {
    return emptyContribution(account, "unknown_type");
  }

  const basis: ValuationBasis =
    account.kind === "cash" ? "balance" : "estimated_value";
  const candidate =
    basis === "balance" ? account.balance : account.estimatedValue;

  if (!candidate) return emptyContribution(account, "missing_value");
  if (candidate.currency !== "EUR") {
    return emptyContribution(account, "unsupported_currency", candidate);
  }

  toScaledInteger(candidate.amount);
  return {
    accountId: account.accountId,
    adjustedAmount: candidate.amount,
    amount: candidate.amount,
    basis,
    decision: "contributing",
    duplicateRole: "none",
    latestObservationId: account.latestObservationId,
    reportedAmount: candidate.amount,
    reportedCurrency: candidate.currency,
    valueObservationId: candidate.observationId,
  };
}

function candidateTime(account: AccountWealthState) {
  const candidate =
    account.kind === "cash" ? account.balance : account.estimatedValue;
  return candidate
    ? [
        (candidate.sourceValidAt ?? candidate.retrievedAt).getTime(),
        candidate.retrievedAt.getTime(),
      ]
    : [0, 0];
}

export function calculateWealthSnapshot(
  accounts: readonly AccountWealthState[],
): CalculatedWealthSnapshot {
  const contributions = accounts.map(contribution);
  const groupMap = new Map<string, number[]>();
  accounts.forEach((account, index) => {
    if (!account.likelyDuplicateGroupId) return;
    groupMap.set(account.likelyDuplicateGroupId, [
      ...(groupMap.get(account.likelyDuplicateGroupId) ?? []),
      index,
    ]);
  });

  for (const indexes of groupMap.values()) {
    const contributingIndexes = indexes.filter(
      (index) => contributions[index]?.decision === "contributing",
    );
    if (contributingIndexes.length < 2) continue;
    const representative = [...contributingIndexes].sort((left, right) => {
      const leftTime = candidateTime(accounts[left]!);
      const rightTime = candidateTime(accounts[right]!);
      return (
        rightTime[0]! - leftTime[0]! ||
        rightTime[1]! - leftTime[1]! ||
        accounts[left]!.accountId.localeCompare(accounts[right]!.accountId)
      );
    })[0]!;

    for (const index of contributingIndexes) {
      const existing = contributions[index]!;
      contributions[index] = {
        ...existing,
        adjustedAmount: index === representative ? existing.amount : null,
        duplicateRole:
          index === representative ? "representative" : "excluded_from_adjusted",
      };
    }
  }

  const contributing = contributions.filter(
    (item) => item.decision === "contributing",
  );
  const missing = contributions.filter((item) =>
    ["missing_value", "unknown_type", "unsupported_currency"].includes(
      item.decision,
    ),
  );
  const total = contributing.reduce(
    (sum, item) => sum + toScaledInteger(item.amount!),
    0n,
  );
  const adjustedTotal = contributing.reduce(
    (sum, item) =>
      sum + (item.adjustedAmount ? toScaledInteger(item.adjustedAmount) : 0n),
    0n,
  );
  const hasUncertainty = accounts.some(
    (account) => account.identityConflict || account.refreshUncertain,
  );

  return {
    candidateAdjustedTotalAmount: fromScaledInteger(adjustedTotal),
    contributingAccountCount: contributing.length,
    contributions,
    isComplete: missing.length === 0 && groupMap.size === 0 && !hasUncertainty,
    knownTotalAmount: fromScaledInteger(total),
    likelyDuplicateGroupCount: groupMap.size,
    missingAccountCount: missing.length,
  };
}

export type WealthHealth = "fresh" | "stale" | "sync_failed";

export type CurrentAccountWealth = Readonly<{
  accountId: string;
  adjustedAmount: DecimalAmount | null;
  amount: DecimalAmount | null;
  basis: ValuationBasis | null;
  decision: SnapshotContributionDecision;
  duplicateRole: DuplicateAdjustmentRole;
  health: WealthHealth | null;
  identityConflict: boolean;
  institutionId: string;
  institutionName: string;
  kind: AccountKind;
  name: string;
  reportedAmount: DecimalAmount | null;
  reportedCurrency: string | null;
  sourceValidAt: Date | null;
  valueRetrievedAt: Date | null;
}>;

export type CurrentInstitutionWealth = Readonly<{
  accounts: readonly CurrentAccountWealth[];
  institutionId: string;
  name: string;
}>;

export type StoredWealthSnapshot = Readonly<{
  accounts: readonly (Omit<CurrentAccountWealth, "health"> &
    Readonly<{ hasNewerFailedSync: boolean }>)[];
  candidateAdjustedTotalAmount: DecimalAmount;
  isComplete: boolean;
  knownTotalAmount: DecimalAmount;
  likelyDuplicateGroupCount: number;
  recordedAt: Date;
  snapshotId: string;
}>;

export type CurrentWealthState = Readonly<{
  lastSuccessfulSyncAt: Date | null;
  latestSyncStatus: SyncStatus | null;
  snapshot: StoredWealthSnapshot | null;
}>;

export type CurrentWealth = Readonly<{
  candidateAdjustedTotalAmount: DecimalAmount;
  currency: "EUR";
  health: WealthHealth;
  institutions: readonly CurrentInstitutionWealth[];
  isComplete: boolean;
  knownTotalAmount: DecimalAmount;
  lastSuccessfulSyncAt: Date | null;
  latestSyncStatus: SyncStatus | null;
  likelyDuplicateGroupCount: number;
  possibleTotalMaximum: DecimalAmount;
  possibleTotalMinimum: DecimalAmount;
  recordedAt: Date | null;
}>;

const STALE_AFTER_MILLISECONDS = 48 * 60 * 60 * 1_000;

export function createCurrentWealth(
  state: CurrentWealthState,
  now: Date,
): CurrentWealth {
  const snapshot = state.snapshot;

  if (!snapshot) {
    return {
      candidateAdjustedTotalAmount: "0",
      currency: "EUR",
      health: state.latestSyncStatus === "failed" ? "sync_failed" : "fresh",
      institutions: [],
      isComplete: false,
      knownTotalAmount: "0",
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      latestSyncStatus: state.latestSyncStatus,
      likelyDuplicateGroupCount: 0,
      possibleTotalMaximum: "0",
      possibleTotalMinimum: "0",
      recordedAt: null,
    };
  }

  const accounts = snapshot.accounts.map((account): CurrentAccountWealth => {
    if (account.decision !== "contributing") return { ...account, health: null };
    const valueTime = account.sourceValidAt ?? account.valueRetrievedAt;
    const health: WealthHealth = account.hasNewerFailedSync
      ? "sync_failed"
      : valueTime && now.getTime() - valueTime.getTime() > STALE_AFTER_MILLISECONDS
        ? "stale"
        : "fresh";
    return { ...account, health };
  });
  const health: WealthHealth = accounts.some(
    (account) => account.health === "sync_failed",
  )
    ? "sync_failed"
    : accounts.some((account) => account.health === "stale")
      ? "stale"
      : "fresh";
  const institutionMap = new Map<string, CurrentInstitutionWealth>();
  for (const account of accounts) {
    const existing = institutionMap.get(account.institutionId);
    institutionMap.set(account.institutionId, {
      accounts: [...(existing?.accounts ?? []), account],
      institutionId: account.institutionId,
      name: account.institutionName,
    });
  }
  const known = toScaledInteger(snapshot.knownTotalAmount);
  const adjusted = toScaledInteger(snapshot.candidateAdjustedTotalAmount);

  return {
    candidateAdjustedTotalAmount: snapshot.candidateAdjustedTotalAmount,
    currency: "EUR",
    health,
    institutions: [...institutionMap.values()],
    isComplete: snapshot.isComplete,
    knownTotalAmount: snapshot.knownTotalAmount,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    latestSyncStatus: state.latestSyncStatus,
    likelyDuplicateGroupCount: snapshot.likelyDuplicateGroupCount,
    possibleTotalMaximum: fromScaledInteger(known > adjusted ? known : adjusted),
    possibleTotalMinimum: fromScaledInteger(known < adjusted ? known : adjusted),
    recordedAt: snapshot.recordedAt,
  };
}

export type WealthRepository = Readonly<{
  createSnapshot(input: Readonly<{
    syncRunId?: string;
    trigger: "inclusion_change" | "sync";
  }>): Promise<void>;
  loadCurrentWealthState(): Promise<CurrentWealthState>;
  setAccountInclusion(
    accountId: string,
    inclusion: WealthInclusion,
  ): Promise<boolean>;
}>;

export async function getCurrentWealth(
  repository: WealthRepository,
  now = new Date(),
): Promise<CurrentWealth> {
  return createCurrentWealth(await repository.loadCurrentWealthState(), now);
}

export async function setAccountWealthInclusion(
  repository: WealthRepository,
  accountId: string,
  inclusion: WealthInclusion,
): Promise<boolean> {
  const updated = await repository.setAccountInclusion(accountId, inclusion);
  if (updated) await repository.createSnapshot({ trigger: "inclusion_change" });
  return updated;
}
