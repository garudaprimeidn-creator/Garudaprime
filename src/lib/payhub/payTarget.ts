import type { PayScanPrefill } from "../../app/appTypes";
import { normalizeMerchantId } from "../merchant/merchantService";

/** Normalize + validate pay target from scan / paste, merchant ID is mandatory. */
export function normalizePayScanPrefill(
  raw: PayScanPrefill | null | undefined,
): PayScanPrefill | null {
  if (!raw) return null;

  const merchantId = normalizeMerchantId(raw.merchantId);
  if (!merchantId) return null;

  const recipientAddress = raw.recipientAddress?.trim();
  const vault = recipientAddress && /^0x[a-fA-F0-9]{40}$/i.test(recipientAddress)
    ? recipientAddress
    : undefined;

  return {
    merchantId,
    merchantName: raw.merchantName?.trim() || undefined,
    amount: raw.amount?.trim() || undefined,
    channel: raw.channel ?? "onchain",
    recipientAddress: vault,
    qrPayload: raw.qrPayload?.trim() || undefined,
    invoiceId: raw.invoiceId?.trim() || undefined,
    invoiceNote: raw.invoiceNote?.trim() || undefined,
  };
}

/** Immutable pay target for settlement, never fall back to platform default once locked. */
export type LockedPayTarget = PayScanPrefill & { merchantId: string };

export function lockPayTarget(
  raw: PayScanPrefill | null | undefined,
): LockedPayTarget | null {
  const normalized = normalizePayScanPrefill(raw);
  if (!normalized?.merchantId) return null;
  return normalized as LockedPayTarget;
}
