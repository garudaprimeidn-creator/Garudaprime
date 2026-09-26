/** Shared app types, keep free of AppContext imports to avoid circular deps. */

export type Tx = {
  id: number;
  type: string;
  amount: string;
  addr: string;
  counterpartyWallet?: string;
  time: string;
  usd: string;
  status: string;
  txHash?: string;
  /** Protocol / network fee (e.g. "0.0001 GAT") */
  networkFee?: string;
  /** Pay Hub receipt code for merchant payments */
  receiptCode?: string;
  /** Merchant ID for pay transactions */
  merchantId?: string;
  /** Merchant invoice number (INV-…) when billing via QR */
  invoiceId?: string;
};

export type PayQrChannel = "onchain" | "offchain";
export type ScanMode = "pay" | "send" | "receive";

export type PayScanPrefill = {
  merchantId?: string;
  merchantName?: string;
  amount?: string;
  channel?: PayQrChannel;
  recipientAddress?: string;
  /** Original scanned / pasted QR payload, shown as-is in pay sheet */
  qrPayload?: string;
  invoiceId?: string;
  invoiceNote?: string;
  shopSymbol?: string;
  shopLocation?: string;
};

export type SendTokenPrefill = {
  symbol?: string;
  contractAddress?: string;
  recipientAddress?: string;
  amount?: string;
};
