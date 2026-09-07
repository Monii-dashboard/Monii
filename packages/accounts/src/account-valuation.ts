export type DecimalAmount = string;
export type AccountValuationMethod = "reported";
export type AccountValuationBasis = "balance" | "estimated_value";

export type AccountValuationCandidate = Readonly<{
  accountId: string;
  amount: DecimalAmount;
  basis: AccountValuationBasis;
  currency: string | null;
  effectiveAt: Date | null;
  recordedAt: Date;
  valuationCandidateId: string;
  valuationMethod: AccountValuationMethod;
}>;

const DECIMAL_SCALE = 8;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,8}))?$/;

export function decimalToScaledInteger(amount: DecimalAmount): bigint {
  const match = DECIMAL_PATTERN.exec(amount);
  if (!match) throw new Error(`Invalid decimal amount: ${amount}`);
  const [, sign, integer = "0", fraction = ""] = match;
  const scaled = BigInt(`${integer}${fraction.padEnd(DECIMAL_SCALE, "0")}`);
  return sign === "-" ? -scaled : scaled;
}

export function decimalFromScaledInteger(value: bigint): DecimalAmount {
  const sign = value < 0 ? "-" : "";
  const absolute = value < 0 ? -value : value;
  const padded = absolute.toString().padStart(DECIMAL_SCALE + 1, "0");
  const integer = padded.slice(0, -DECIMAL_SCALE);
  const fraction = padded.slice(-DECIMAL_SCALE).replace(/0+$/, "");
  return `${sign}${integer}${fraction === "" ? "" : `.${fraction}`}`;
}
