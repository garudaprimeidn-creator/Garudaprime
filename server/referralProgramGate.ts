import {
  REFERRAL_LOCKED_UNTIL_TOKEN_LAUNCH,
  isReferralProgramAvailable,
  isReferralUsageEnabled,
} from "../src/lib/referral/referralProgramGate.js";
import { getReferralProgramConfig } from "./platformProgramsCore.js";

export { REFERRAL_LOCKED_UNTIL_TOKEN_LAUNCH, isReferralProgramAvailable, isReferralUsageEnabled };

export async function assertReferralUsageOpen(): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = await getReferralProgramConfig();
  if (!isReferralUsageEnabled(config)) {
    return {
      ok: false,
      error: "Referral code usage is locked until GAT token launch",
    };
  }
  return { ok: true };
}

/** @deprecated use assertReferralUsageOpen */
export const assertReferralProgramOpen = assertReferralUsageOpen;
