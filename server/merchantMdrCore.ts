/**
 * Merchant pay settlement, flat service fee per transaction (merchant-paid).
 */
import {
  computeMerchantFlatServiceFee,
  MERCHANT_SERVICE_FEE_GAT,
} from "../src/lib/protocol/merchantServiceFee.js";

export type MerchantServiceFeeSettlement = {
  grossGat: number;
  feeGat: number;
  netGat: number;
  feeBps: number;
};

/** Service fee from gross, customer pays gross; merchant receives net. */
export async function computeMerchantServiceFeeSettlement(
  grossGat: number,
): Promise<MerchantServiceFeeSettlement> {
  const { grossGat: gross, feeGat, netGat } = computeMerchantFlatServiceFee(grossGat);
  return {
    grossGat: gross,
    feeGat,
    netGat,
    feeBps: gross > 0 ? Math.round((feeGat / gross) * 10_000) : 0,
  };
}

export { MERCHANT_SERVICE_FEE_GAT };
