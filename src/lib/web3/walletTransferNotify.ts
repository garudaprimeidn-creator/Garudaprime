import { auth as firebaseAuth } from "../firebase/config";

const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export async function notifyWalletTransferRecipient(input: {
  recipientAddress: string;
  senderAddress?: string;
  amount: number;
  symbol: "GAT" | "SDA";
  txHash: string;
}): Promise<void> {
  const base = API_BASE;
  if (!base) return;

  const user = firebaseAuth.currentUser;
  if (!user) return;

  const idToken = await user.getIdToken();
  await fetch(`${base}/wallet/transfer/notify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  }).catch(() => undefined);
}
