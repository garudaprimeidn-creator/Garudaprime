import type { ReferralProgramConfig } from "../platform/platformProgramsService.js";

/** Set to `false` when GAT public token launch is live. */
export const REFERRAL_LOCKED_UNTIL_TOKEN_LAUNCH = true;

export function isReferralProgramVisible(
  config?: Pick<ReferralProgramConfig, "enabled"> | null,
): boolean {
  return config?.enabled !== false;
}

/** Bind, share link, sponsor code, and rewards, active only after token launch. */
export function isReferralUsageEnabled(
  config?: Pick<ReferralProgramConfig, "enabled"> | null,
): boolean {
  if (REFERRAL_LOCKED_UNTIL_TOKEN_LAUNCH) return false;
  return isReferralProgramVisible(config);
}

/** @alias isReferralUsageEnabled */
export function isReferralProgramAvailable(
  config?: Pick<ReferralProgramConfig, "enabled"> | null,
): boolean {
  return isReferralUsageEnabled(config);
}

export function clearReferralSessionState(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("gp_pending_referral_code");
    sessionStorage.removeItem("gp_referral_guest_landing");
  } catch {
    /* ignore */
  }
}
