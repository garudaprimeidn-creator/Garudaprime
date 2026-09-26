import { getAddress, isAddress } from "viem";

export type SendValidationErrorCode =
  | "send/invalid-amount"
  | "send/insufficient-balance"
  | "send/invalid-recipient"
  | "send/unsupported-token"
  | "send/no-wallet"
  | "send/self-transfer";

export class SendValidationError extends Error {
  readonly code: SendValidationErrorCode;

  constructor(code: SendValidationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SendValidationError";
  }
}

/** Parse user-entered send amount (supports comma decimal separator). */
export const parseSendAmount = (raw: string): number | null => {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

/** Normalize and validate a Sidra / EVM recipient (0x + 40 hex). */
export const resolveSendRecipient = (raw: string): `0x${string}` => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new SendValidationError("send/invalid-recipient", "Recipient address is required");
  }
  if (/\.sda$/i.test(trimmed)) {
    throw new SendValidationError(
      "send/invalid-recipient",
      "Sidra name (.sda) resolution is not available yet, use a full 0x address",
    );
  }
  if (!isAddress(trimmed, { strict: false })) {
    throw new SendValidationError(
      "send/invalid-recipient",
      "Invalid recipient address, use a full 0x address (42 characters)",
    );
  }
  return getAddress(trimmed);
};

export const assertSendAmountWithinBalance = (
  amount: number,
  balance: number,
  fee = 0,
): void => {
  const total = amount + fee;
  if (total > balance + 1e-12) {
    throw new SendValidationError("send/insufficient-balance", "Insufficient balance for amount and fees");
  }
};

export const assertNotSelfTransfer = (from: string, to: string): void => {
  if (from.toLowerCase() === to.toLowerCase()) {
    throw new SendValidationError("send/self-transfer", "Cannot send to your own wallet address");
  }
};
