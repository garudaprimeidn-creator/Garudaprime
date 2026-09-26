import { verifyMessage } from "viem";
import { adminAuth } from "./firebaseAdmin.js";
import { consumeWalletAuthNonce } from "./walletAuthNonce.js";
import { resolveUidFromWalletAddress } from "./walletIdentityCore.js";

export type WalletAuthBody = {
  address: string;
  message: string;
  signature: string;
  provider?: string;
};

export const walletUidFromAddress = (address: string) =>
  `wallet_${address.slice(2, 10).toLowerCase()}`;

export const verifyWalletAuthPayload = async (body: WalletAuthBody): Promise<string> => {
  const { address, message, signature } = body;
  if (!address?.startsWith("0x") || !message || !signature) {
    throw new Error("Missing required fields");
  }

  if (signature.startsWith("0xdemo_sig_")) {
    throw new Error("Invalid signature");
  } else if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) {
    throw new Error("Invalid signature");
  } else {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) throw new Error("Invalid signature");
  }

  if (!message.includes(address)) throw new Error("Invalid message");
  await consumeWalletAuthNonce(address, message);

  const linkedUid = await resolveUidFromWalletAddress(address);
  const uid = linkedUid ?? walletUidFromAddress(address);

  const auth = adminAuth();
  try {
    await auth.getUser(uid);
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : "";
    if (code !== "auth/user-not-found") throw err;
    await auth.createUser({ uid });
  }

  return auth.createCustomToken(uid);
};

export const walletAuthErrorStatus = (message: string): number => {
  if (
    message === "Missing required fields"
    || message === "Invalid signature"
    || message === "Invalid message"
    || message === "Invalid or expired nonce"
    || message === "Nonce already used"
    || message === "Message expired"
    || message === "Invalid origin"
  ) {
    return 400;
  }
  return 500;
};
