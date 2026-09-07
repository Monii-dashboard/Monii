export type AccountCategory = "cash" | "investment" | "unknown";
export type AccountPurpose = "business" | "personal" | "unknown";
export type AccountManagementMode = "external";
export type AccountSupportStatus =
  | "known_unsupported"
  | "supported"
  | "unrecognized";
export type ExternalAccountLifecycle =
  | "active"
  | "deleted"
  | "disabled"
  | "unknown";

export type CanonicalAccount = Readonly<{
  accountId: string;
  archivedAt: Date | null;
  category: AccountCategory;
  institutionId: string | null;
  managementMode: AccountManagementMode;
  name: string | null;
  purpose: AccountPurpose;
}>;
