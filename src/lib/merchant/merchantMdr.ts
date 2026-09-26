/** Merchant service fee, flat per transaction; paid by merchant, not customer. */

import {
  computeMerchantFlatServiceFee,
  formatMerchantServiceFeeGat,
  formatMerchantServiceFeeLabel,
  MERCHANT_SERVICE_FEE_GAT,
} from "../protocol/merchantServiceFee";

export type MerchantServiceFeeResult = {
  grossGat: number;
  grossIdr: number;
  serviceFeeGat: number;
  serviceFeeIdr: number;
  netGat: number;
  feeBps: number;
  rateLabel: string;
};

export function getIdrUsdRate(): number {
  const n = Number(import.meta.env.VITE_IDR_USD_RATE ?? 16_000);
  return Number.isFinite(n) && n > 0 ? n : 16_000;
}

export function gatToIdr(gatAmount: number, gatUsdPrice = 0): number {
  if (!Number.isFinite(gatAmount) || gatAmount <= 0) return 0;
  const usd = gatAmount * Math.max(gatUsdPrice, 0);
  return usd * getIdrUsdRate();
}

export function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)));
}

/** Service fee deducted from merchant receipt, customer pays gross only. */
export function computeMerchantServiceFee(input: {
  grossGat: number;
  gatUsdPrice?: number;
}): MerchantServiceFeeResult {
  const grossGat = Math.max(0, input.grossGat);
  const gatUsd = Math.max(input.gatUsdPrice ?? 0, 0);
  const grossIdr = gatToIdr(grossGat, gatUsd);
  const { feeGat, netGat } = computeMerchantFlatServiceFee(grossGat);
  const serviceFeeIdr = gatToIdr(feeGat, gatUsd);

  return {
    grossGat,
    grossIdr,
    serviceFeeGat: feeGat,
    serviceFeeIdr,
    netGat,
    feeBps: 0,
    rateLabel: formatMerchantServiceFeeLabel(),
  };
}

export { MERCHANT_SERVICE_FEE_GAT, formatMerchantServiceFeeGat, formatMerchantServiceFeeLabel };

/** @deprecated alias */
export const computeMerchantMdr = computeMerchantServiceFee;
export type MerchantMdrResult = MerchantServiceFeeResult;

export type MerchantInvoiceProfile = {
  merchantId: string;
  shopSymbol?: string | null;
  shopLocation?: string | null;
  invoicePrefix?: string | null;
};

export function createMerchantInvoiceId(profile: MerchantInvoiceProfile | string): string {
  const p: MerchantInvoiceProfile = typeof profile === "string"
    ? { merchantId: profile }
    : profile;

  const sym = (p.shopSymbol?.trim()
    || p.invoicePrefix?.split("-")[0]
    || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  const loc = (p.shopLocation?.trim()
    || (p.invoicePrefix?.includes("-") ? p.invoicePrefix.split("-").slice(1).join("-") : "")
    || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  const fallback = p.merchantId.replace(/[^A-Z0-9]/gi, "").slice(-4).toUpperCase() || "MCH";
  const prefix = sym || fallback;

  const d = new Date();
  const stamp = [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getFullYear()).slice(-2),
  ].join("");

  const seq = Math.random().toString(36).slice(2, 5).toUpperCase();
  if (loc) return `${prefix}-${loc}-${stamp}-${seq}`;
  return `INV-${prefix}-${stamp}-${seq}`;
}

export function formatMerchantInvoiceText(input: {
  invoiceId: string;
  merchantName: string;
  merchantId: string;
  grossGat: number;
  fee: MerchantServiceFeeResult;
  qrPayload: string;
  note?: string;
}): string {
  const lines = [
    "INVOICE GARUDA PRIME",
    `No: ${input.invoiceId}`,
    `Merchant: ${input.merchantName}`,
    `ID: ${input.merchantId}`,
    `Tagihan: ${input.grossGat} GAT (${formatIdr(input.fee.grossIdr)})`,
    `Total bayar: ${input.grossGat} GAT`,
    input.note?.trim() ? `Catatan: ${input.note.trim()}` : "",
    "",
    "Bayar via QR / kode:",
    input.qrPayload,
  ].filter(Boolean);
  return lines.join("\n");
}
