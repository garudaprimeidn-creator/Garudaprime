/** KYCPort assurance fields, @see https://www.kycport.com/docs */

export const KYCPORT_VERIFIED_STATUSES = new Set(["verified", "approved"]);
export const KYCPORT_PENDING_STATUSES = new Set(["pending", "submitted", "processing"]);
export const KYCPORT_REJECTED_STATUSES = new Set(["rejected"]);
export const KYCPORT_EXPIRED_STATUSES = new Set(["expired"]);
export const KYCPORT_UNVERIFIED_STATUSES = new Set(["unverified"]);

export type KycPortAssuranceStatus =
  | "verified"
  | "pending"
  | "rejected"
  | "expired"
  | "unverified"
  | "unknown";

export const normalizeKycPortAssuranceStatus = (raw: string | null | undefined): KycPortAssuranceStatus => {
  const s = String(raw ?? "unverified").trim().toLowerCase();
  if (KYCPORT_VERIFIED_STATUSES.has(s)) return "verified";
  if (KYCPORT_PENDING_STATUSES.has(s)) return "pending";
  if (KYCPORT_REJECTED_STATUSES.has(s)) return "rejected";
  if (KYCPORT_EXPIRED_STATUSES.has(s)) return "expired";
  if (KYCPORT_UNVERIFIED_STATUSES.has(s)) return "unverified";
  return "unknown";
};

export const isKycPortAssuranceVerified = (status: string | null | undefined) =>
  KYCPORT_VERIFIED_STATUSES.has(String(status ?? "").toLowerCase());

export const formatKycPortTier = (tier: number | null | undefined): string => {
  const n = typeof tier === "number" && Number.isFinite(tier) ? Math.max(0, Math.min(3, tier)) : 0;
  return `t${n}`;
};

export const kycPortStatusTone = (
  status: KycPortAssuranceStatus,
): "verified" | "pending" | "rejected" | "expired" | "muted" => {
  if (status === "verified") return "verified";
  if (status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  if (status === "expired") return "expired";
  return "muted";
};
