import { auth } from "../firebase/config";

const API_BASE = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");

export type ValidatorApplyPayload = {
  walletAddress: string;
  email: string;
  orgName?: string;
  stakeSda?: string;
  message?: string;
};

export const applyValidatorWaitlist = async (payload: ValidatorApplyPayload) => {
  if (!API_BASE) throw new Error("API not configured");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(`${API_BASE}/validators/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json() as { id?: string; status?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Application failed");
  return data;
};
