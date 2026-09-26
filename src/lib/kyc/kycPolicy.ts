import type { KycStatus } from "../firebase/firestoreService";

export const KYC_VERIFIED_TIER = 3;

export function isKycFullyVerified(tier: number, status: KycStatus | string | undefined): boolean {
  const normalized = (status ?? "none").toLowerCase();
  return tier >= KYC_VERIFIED_TIER && (normalized === "verified" || normalized === "approved");
}

export function isKycPendingReview(status: KycStatus | string | undefined): boolean {
  const normalized = (status ?? "none").toLowerCase();
  return normalized === "pending" || normalized === "processing";
}

export function isKycRejected(status: KycStatus | string | undefined): boolean {
  return (status ?? "none").toLowerCase() === "rejected";
}

export function resolveKycTierFromProfile(
  tier: number | undefined,
  status: KycStatus | string | undefined,
): number {
  if (isKycFullyVerified(tier ?? 0, status)) return KYC_VERIFIED_TIER;
  if (isKycPendingReview(status)) return Math.min(tier ?? 1, 2);
  if (isKycRejected(status)) return 0;
  return 0;
}
