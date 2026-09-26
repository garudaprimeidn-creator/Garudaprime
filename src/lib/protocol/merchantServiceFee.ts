/**
 * Garuda Prime merchant payment service fee, flat per transaction, paid by merchant.
 * Customer always pays the gross bill amount; merchant receives gross minus this fee.
 */
export const MERCHANT_SERVICE_FEE_GAT = 0.0002;

export type MerchantFlatServiceFee = {
  grossGat: number;
  feeGat: number;
  netGat: number;
};

export function computeMerchantFlatServiceFee(grossGat: number): MerchantFlatServiceFee {
  const gross = Math.max(0, grossGat);
  const feeGat = gross > 0 ? Math.min(MERCHANT_SERVICE_FEE_GAT, gross) : 0;
  return {
    grossGat: gross,
    feeGat,
    netGat: Math.max(0, gross - feeGat),
  };
}

export function formatMerchantServiceFeeGat(): string {
  return `${MERCHANT_SERVICE_FEE_GAT.toFixed(4)} GAT`;
}

export function formatMerchantServiceFeeLabel(): string {
  return `${formatMerchantServiceFeeGat()} / transaksi`;
}
