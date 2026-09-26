import { auth } from "../firebase/config";

const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export type BridgeMintPayload = {
  depositId: string;
  lockTxHash: string;
  recipient: string;
};

export type BridgeMintResult = {
  depositId: string;
  mintTxHash: string;
  status: "minted";
  amount?: string;
};

export const claimBridgeMint = async (payload: BridgeMintPayload): Promise<BridgeMintResult> => {
  if (!API_BASE) throw new Error("API not configured");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(`${API_BASE}/bridge/mint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json() as BridgeMintResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Bridge mint failed");
  return data;
};
