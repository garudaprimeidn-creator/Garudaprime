import { isAddress } from "viem";
import type { PayQrChannel } from "../../app/appTypes";

export type ParsedPayQr = {
  kind: "pay";
  channel: PayQrChannel;
  merchantId?: string;
  merchantName?: string;
  recipientAddress?: string;
  amount?: string;
  token?: string;
  invoiceId?: string;
  invoiceNote?: string;
};

export type ParsedSendQr = {
  kind: "send";
  recipientAddress: string;
  amount?: string;
  token?: string;
};

export type ParsedQrPayload =
  | ParsedPayQr
  | ParsedSendQr
  | { kind: "unknown"; raw: string };

const parseQuery = (query?: string) => new URLSearchParams(query ?? "");

const normalizeAddress = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) return undefined;
  return trimmed;
};

const MERCHANT_ID_RE = /^GP-(?:MRT|USR)-[A-Z0-9-]+$/i;

const normalizeMerchantId = (raw: string | null | undefined): string | undefined => {
  const text = raw?.trim();
  if (!text) return undefined;
  const upper = text.toUpperCase();
  return MERCHANT_ID_RE.test(upper) ? upper : undefined;
};

const decodeParam = (value: string | null): string | undefined => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).trim() || undefined;
  } catch {
    return value.trim() || undefined;
  }
};

/** Strip scanner noise (BOM, zero-width chars, fullwidth colon). */
export function sanitizeQrText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\uFF1A/g, ":")
    .replace(/\r\n/g, "\n")
    .trim();
}

/** Find garuda:pay / sidra:pay inside shared or labeled text. */
function extractEmbeddedPayScheme(text: string): string | undefined {
  const garuda = text.match(/garuda:pay(?::[^?\s"'<>]*)?(?:\?[^\s"'<>]*)?/i)?.[0];
  if (garuda) return garuda;

  const sidra = text.match(/sidra:pay:0x[a-fA-F0-9]{40}(?:\?[^\s"'<>]*)?/i)?.[0];
  if (sidra) return sidra;

  return text.match(/sidra:pay:0x[a-fA-F0-9]+(?:\?[^\s"'<>]*)?/i)?.[0];
}

/** Pull merchant ID from labels, query strings, or prose around a code. */
export function extractMerchantIdFromText(text: string): string | undefined {
  const fromLabel = text.match(
    /\b(?:merchant\s*id|id\s*merchant)\s*[:\-]?\s*(GP-(?:MRT|USR)-[A-Z0-9-]+)\b/i,
  );
  if (fromLabel?.[1]) return normalizeMerchantId(fromLabel[1]);

  const fromQuery = text.match(/[?&]merchantId=([^&\s"'<>]+)/i);
  if (fromQuery?.[1]) return normalizeMerchantId(decodeParam(fromQuery[1]));

  const bare = text.match(/\b(GP-(?:MRT|USR)-[A-Z0-9]{2,}(?:-[A-Z0-9]+)*)\b/i);
  if (bare?.[1]) return normalizeMerchantId(bare[1]);

  return undefined;
}

const parseGarudaPayPayload = (payload: string): ParsedPayQr | null => {
  const garudaPay = payload.match(/^garuda:pay(?::([^?]*))?(?:\?(.*))?$/i);
  if (!garudaPay) return null;
  const params = parseQuery(garudaPay[2]);
  const channelParam = params.get("channel")?.toLowerCase();
  const pathId = decodeParam(garudaPay[1]) ?? garudaPay[1]?.trim() ?? "";
  const queryId = decodeParam(params.get("merchantId"));
  const pathMerchantId = normalizeMerchantId(pathId);
  const merchantId = normalizeMerchantId(queryId)
    ?? pathMerchantId
    ?? extractMerchantIdFromText(payload);
  return {
    kind: "pay",
    channel: channelParam === "offchain" ? "offchain" : "onchain",
    merchantId,
    merchantName: decodeParam(params.get("name")),
    recipientAddress: normalizeAddress(params.get("vault") ?? "")
      ?? (pathMerchantId ? undefined : normalizeAddress(pathId)),
    amount: params.get("amount") ?? undefined,
    token: params.get("token") ?? "GAT",
    invoiceId: decodeParam(params.get("invoice")),
    invoiceNote: decodeParam(params.get("note")),
  };
};

const parseSidraPayPayload = (payload: string, context = payload): ParsedPayQr | null => {
  const sidraPay = payload.match(/^sidra:pay:(0x[a-fA-F0-9]{40})(?:\?(.*))?$/i)
    ?? payload.match(/^sidra:pay:(0x[a-fA-F0-9]+)(?:\?(.*))?$/i);
  if (!sidraPay) return null;
  const target = sidraPay[1].trim();
  const params = parseQuery(sidraPay[2]);
  const addr = normalizeAddress(target);
  const merchantId = normalizeMerchantId(decodeParam(params.get("merchantId")))
    ?? extractMerchantIdFromText(context);
  return {
    kind: "pay",
    channel: "onchain",
    recipientAddress: addr,
    merchantId,
    merchantName: decodeParam(params.get("name")),
    amount: params.get("amount") ?? undefined,
    token: params.get("token") ?? "GAT",
    invoiceId: decodeParam(params.get("invoice")),
    invoiceNote: decodeParam(params.get("note")),
  };
};

const parsePaySchemePayload = (payload: string, context?: string): ParsedPayQr | null => {
  const ctx = context ?? payload;
  return parseGarudaPayPayload(payload) ?? parseSidraPayPayload(payload, ctx);
};

const parsePayFromUrl = (text: string): ParsedPayQr | null => {
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    const merchantId = normalizeMerchantId(decodeParam(url.searchParams.get("merchantId")))
      ?? extractMerchantIdFromText(text);
    if (!merchantId) return null;
    return {
      kind: "pay",
      channel: "onchain",
      merchantId,
      merchantName: decodeParam(url.searchParams.get("name")),
      recipientAddress: normalizeAddress(url.searchParams.get("vault") ?? ""),
      amount: url.searchParams.get("amount") ?? undefined,
      token: url.searchParams.get("token") ?? "GAT",
      invoiceId: decodeParam(url.searchParams.get("invoice")),
      invoiceNote: decodeParam(url.searchParams.get("note")),
    };
  } catch {
    return null;
  }
};

/** Normalize pasted/scanned pay payload into merchant prefill fields. */
export function parsePayMerchantPrefill(raw: string): ParsedPayQr | null {
  const parsed = parseQrPayload(raw);
  if (parsed.kind !== "pay") return null;
  if (parsed.merchantId || parsed.recipientAddress) return parsed;
  const merchantId = extractMerchantIdFromText(sanitizeQrText(raw));
  if (!merchantId) return null;
  return { ...parsed, merchantId };
}

/** Parse scanned QR text into pay/send actions for Garuda Prime. */
export function parseQrPayload(raw: string): ParsedQrPayload {
  const text = sanitizeQrText(raw);
  if (!text) return { kind: "unknown", raw: text };

  const embedded = extractEmbeddedPayScheme(text);
  if (embedded) {
    const parsed = parsePaySchemePayload(embedded, text);
    if (parsed) return parsed;
  }

  const directPay = parsePaySchemePayload(text);
  if (directPay) return directPay;

  if (MERCHANT_ID_RE.test(text)) {
    return {
      kind: "pay",
      channel: "onchain",
      merchantId: text.toUpperCase(),
    };
  }

  const merchantId = extractMerchantIdFromText(text);
  if (merchantId) {
    return {
      kind: "pay",
      channel: "onchain",
      merchantId,
    };
  }

  const urlPay = parsePayFromUrl(text);
  if (urlPay) return urlPay;

  const garudaSend = text.match(/^garuda:send:(0x[a-fA-F0-9]{40})(?:\?(.*))?$/i);
  if (garudaSend) {
    const params = parseQuery(garudaSend[2]);
    return {
      kind: "send",
      recipientAddress: normalizeAddress(garudaSend[1]) ?? garudaSend[1],
      amount: params.get("amount") ?? undefined,
      token: params.get("token") ?? undefined,
    };
  }

  if (text.startsWith("ethereum:")) {
    const withoutScheme = text.slice("ethereum:".length);
    const [targetPart, queryPart] = withoutScheme.split("?");
    const target = targetPart.split("@")[0]?.trim() ?? "";
    const addr = normalizeAddress(target);
    if (addr) {
      const params = parseQuery(queryPart);
      const amount = params.get("amount") ?? params.get("value");
      return {
        kind: "send",
        recipientAddress: addr,
        amount: amount ?? undefined,
        token: params.get("token") ?? undefined,
      };
    }
  }

  const plainAddr = normalizeAddress(text);
  if (plainAddr) {
    return { kind: "send", recipientAddress: plainAddr };
  }

  const embeddedAddr = text.match(/0x[a-fA-F0-9]{40}/)?.[0];
  if (embeddedAddr) {
    const addr = normalizeAddress(embeddedAddr);
    if (addr) return { kind: "send", recipientAddress: addr };
  }

  return { kind: "unknown", raw: text };
}

/** Encode wallet address for receive QR, plain 0x address scans fastest. */
export function encodeReceiveQrPayload(walletAddress: string, _chainId?: number): string {
  const addr = normalizeAddress(walletAddress);
  if (!addr) return walletAddress.trim();
  return addr;
}
