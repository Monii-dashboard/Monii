export type AccountIdentityEvidence = Readonly<{
  accountNumberFingerprint: string | null;
  ibanFingerprint: string | null;
  keyVersion: string;
  reportedNameFingerprint: string | null;
}>;
